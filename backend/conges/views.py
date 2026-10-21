from datetime import date, datetime, time
from functools import wraps
from types import SimpleNamespace

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q
from django.db.models.functions import Coalesce, TruncMonth
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone as tz
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from attestations.pdf import LOGO_PAR_DEFAUT
from audit.models import AuditLog
from employees.models import Employee
from . import notifications, services, workflow
from .models import (
    CongeTemplateConfig, DemandeConge, MotifConge, MotifPiece, MouvementConge, ParametreConge,
    PieceJointeConge,
)
from .pdf import build_conge_pdf
from .permissions import CanAccessConges, CanRequestConge, IsCongeManager
from .serializers import (
    AnnulerSerializer, CongeScanSerializer, CongeTemplateConfigSerializer,
    DemandeCongeCreateSerializer, DemandeCongeSerializer,
    InterrompreSerializer, MotifCongeSerializer, MotifPieceSerializer, MouvementCongeSerializer,
    ObservationsSerializer, ParametreCongeSerializer, PieceJointeSerializer, PieceJointeUploadSerializer,
    RejeterSerializer, SoldeCorrectionSerializer, SoldeInitialSerializer, ValiderSerializer,
)

SELECT_RELATED = (
    'employee', 'employee__direction', 'employee__departement', 'employee__service',
    'employee__poste', 'employee__type_contrat', 'contrat', 'demandeur', 'traite_par',
    'motif', 'annulee_par', 'interrompue_par',
)


def _actives():
    return DemandeConge.objects.filter(is_active=True).select_related(*SELECT_RELATED)


def erreurs_metier(vue):
    """Convertit une CongeError (message français) en HTTP 400 {"error": …}."""
    @wraps(vue)
    def enveloppe(*args, **kwargs):
        try:
            return vue(*args, **kwargs)
        except services.CongeError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return enveloppe


class ReferenceLookupMixin:
    """Résout la demande par sa référence (`00001-26` dans l'URL pour `00001/26`).
    Ne voit que les demandes actives (soft-delete)."""
    lookup_url_kwarg = 'ref'

    def get_queryset(self):
        return _actives()

    def get_object(self):
        ref = self.kwargs[self.lookup_url_kwarg].replace('-', '/', 1)
        obj = get_object_or_404(self.get_queryset(), reference=ref)
        self.check_object_permissions(self.request, obj)
        return obj


def _reponse(demande, request):
    return Response(DemandeCongeSerializer(demande, context={'request': request}).data)


# ─── Demandes : liste, création, détail, annulation par le demandeur ───────

class DemandeCongeListCreateView(generics.ListCreateAPIView):
    def get_permissions(self):
        return [CanRequestConge()] if self.request.method == 'POST' else [CanAccessConges()]

    def get_serializer_class(self):
        return DemandeCongeCreateSerializer if self.request.method == 'POST' else DemandeCongeSerializer

    def get_queryset(self):
        qs = _actives()
        user, params = self.request.user, self.request.query_params
        if params.get('employee'):
            qs = qs.filter(employee__matricule=params['employee'])
        q = params.get('q')
        if q:
            qs = qs.filter(
                Q(reference__icontains=q) | Q(employee__nom__icontains=q) | Q(employee__prenom__icontains=q) |
                Q(employee__matricule__icontains=q) | Q(demandeur__nom__icontains=q) | Q(demandeur__prenom__icontains=q)
            )
        if user.can_manage_conges:
            if params.get('statut'):
                qs = qs.filter(statut=params['statut'])
            if params.get('pending'):
                qs = qs.filter(statut=DemandeConge.Statut.RECUE)  # badge traiteur : pas encore prises en charge
            return qs
        qs = qs.filter(demandeur=user)  # un demandeur ne voit que ses demandes
        if params.get('pending'):
            qs = qs.filter(statut=DemandeConge.Statut.PRETE)  # badge demandeur : titres prêts à récupérer
        return qs

    def perform_create(self, serializer):
        demande = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_CONGE, target=demande,
            details={
                'employee': str(demande.employee), 'date_depart': demande.date_depart.isoformat(),
                'date_retour': demande.date_retour.isoformat(), 'nb_jours': demande.nb_jours,
            },
        )
        notifications.notifier_nouvelle_demande(demande)


class DemandeCongeDetailView(ReferenceLookupMixin, generics.RetrieveDestroyAPIView):
    """GET : traiteurs + demandeur (sa demande). DELETE : demandeur, statut `Reçue`
    uniquement, en soft-delete (rien n'a été débité à ce stade)."""
    serializer_class = DemandeCongeSerializer
    permission_classes = [CanAccessConges]

    def get_object(self):
        obj = super().get_object()
        user = self.request.user
        if not user.can_manage_conges and obj.demandeur_id != user.id:
            raise PermissionDenied("Cette demande ne vous appartient pas.")
        return obj

    def perform_destroy(self, instance):
        if instance.demandeur_id != self.request.user.id or instance.statut != DemandeConge.Statut.RECUE:
            raise PermissionDenied(
                "Une demande ne peut être annulée que par son auteur, tant qu'elle est au statut 'Reçue'."
            )
        AuditLog.log(
            self.request, AuditLog.Action.DELETE_CONGE, target=instance,
            details={'employee': str(instance.employee), 'reference': instance.reference},
        )
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])


# ─── Actions du traiteur sur un titre ──────────────────────────────────────

class _ActionTraiteurView(ReferenceLookupMixin, APIView):
    permission_classes = [IsCongeManager]


class ValiderView(_ActionTraiteurView):
    @erreurs_metier
    def post(self, request, ref):
        demande = self.get_object()
        serializer = ValiderSerializer(data=request.data, context={'demande': demande})
        serializer.is_valid(raise_exception=True)
        valide = workflow.valider_demande(demande, auteur=request.user, donnees=serializer.validated_data)
        AuditLog.log(
            request, AuditLog.Action.VALIDER_CONGE, target=valide,
            details={
                'type_conge': valide.type_conge, 'nb_jours': valide.nb_jours, 'exercice': valide.exercice,
                'motif': valide.motif.nom if valide.motif_id else None,
                'ventilation': valide.ventilation, 'categorie_exercice': valide.categorie_exercice,
                'signataire': valide.signataire_nom, 'interim': valide.signataire_interim,
            },
        )
        notifications.notifier_validee(valide, request.user)
        return _reponse(valide, request)


class RejeterView(_ActionTraiteurView):
    @erreurs_metier
    def post(self, request, ref):
        demande = self.get_object()
        serializer = RejeterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ancien = demande.statut
        rejete = workflow.rejeter_demande(demande, auteur=request.user, motif=serializer.validated_data['motif'])
        AuditLog.log(
            request, AuditLog.Action.REJETER_CONGE, target=rejete,
            details={'de': ancien, 'motif': rejete.motif_rejet},
        )
        notifications.notifier_rejetee(rejete, request.user)
        return _reponse(rejete, request)


class RecupereeView(_ActionTraiteurView):
    @erreurs_metier
    def post(self, request, ref):
        recuperee = workflow.marquer_recuperee(self.get_object(), auteur=request.user)
        AuditLog.log(request, AuditLog.Action.RECUPERER_CONGE, target=recuperee,
                     details={'reference': recuperee.reference})
        return _reponse(recuperee, request)


class AnnulerView(_ActionTraiteurView):
    @erreurs_metier
    def post(self, request, ref):
        demande = self.get_object()
        serializer = AnnulerSerializer(data=request.data, context={'demande': demande})
        serializer.is_valid(raise_exception=True)
        annulee = workflow.annuler_demande(demande, auteur=request.user, motif=serializer.validated_data['motif'])
        AuditLog.log(
            request, AuditLog.Action.ANNULER_CONGE, target=annulee,
            details={
                'motif': annulee.motif_annulation, 'type_conge': annulee.type_conge,
                'restitue': annulee.ventilation,
            },
        )
        notifications.notifier_annulee(annulee, request.user)
        return _reponse(annulee, request)


class InterrompreView(_ActionTraiteurView):
    @erreurs_metier
    def post(self, request, ref):
        demande = self.get_object()
        serializer = InterrompreSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        interrompue = workflow.interrompre_demande(
            demande, auteur=request.user, date_rappel=serializer.validated_data['date_rappel'],
            motif=serializer.validated_data['motif'],
        )
        AuditLog.log(
            request, AuditLog.Action.INTERROMPRE_CONGE, target=interrompue,
            details={
                'date_rappel': interrompue.date_rappel.isoformat(), 'motif': interrompue.motif_interruption,
                'jours_prevus': interrompue.nb_jours, 'jours_effectifs': interrompue.jours_effectifs,
                'jours_restitues': interrompue.nb_jours - interrompue.jours_effectifs,
            },
        )
        notifications.notifier_interrompue(interrompue, request.user)
        return _reponse(interrompue, request)


class ObservationsView(ReferenceLookupMixin, generics.UpdateAPIView):
    permission_classes = [IsCongeManager]
    serializer_class = ObservationsSerializer
    http_method_names = ['patch']

    def perform_update(self, serializer):
        avant = serializer.instance.observations
        demande = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_CONGE, target=demande,
            details={'observations': {'avant': avant, 'apres': demande.observations}},
        )


class ScanView(ReferenceLookupMixin, generics.UpdateAPIView):
    """Scan du titre signé : optionnel, jamais bloquant. Traiteur uniquement."""
    permission_classes = [IsCongeManager]
    serializer_class = CongeScanSerializer
    http_method_names = ['post', 'patch']

    def post(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    def perform_update(self, serializer):
        demande = serializer.save()
        AuditLog.log(self.request, AuditLog.Action.SCAN_CONGE, target=demande,
                     details={'reference': demande.reference})


# ─── Pièces jointes (facultatives) ──────────────────────────────────────────

class _PieceAccesMixin(ReferenceLookupMixin):
    """Traiteur : toutes les demandes. Demandeur : les siennes uniquement."""
    permission_classes = [CanAccessConges]

    def get_object(self):
        demande = super().get_object()
        user = self.request.user
        if not user.can_manage_conges and demande.demandeur_id != user.id:
            raise PermissionDenied("Cette demande ne vous appartient pas.")
        return demande


class PiecesJointesView(_PieceAccesMixin, APIView):
    """GET : liste. POST (multipart) : ajout — le demandeur tant que la demande
    est `Reçue`, le traiteur tant qu'elle n'est ni rejetée ni annulée."""

    def get(self, request, ref):
        demande = self.get_object()
        return Response(PieceJointeSerializer(demande.pieces_jointes.all(), many=True).data)

    def post(self, request, ref):
        demande = self.get_object()
        user = request.user
        fermes = (DemandeConge.Statut.REJETEE, DemandeConge.Statut.ANNULEE)
        if demande.statut in fermes or (not user.can_manage_conges and demande.statut != DemandeConge.Statut.RECUE):
            raise PermissionDenied("Des pièces ne peuvent plus être ajoutées à cette demande.")
        serializer = PieceJointeUploadSerializer(data=request.data, context={'demande': demande})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        fichier = data['fichier']
        piece = PieceJointeConge.objects.create(
            demande=demande, piece=data.get('piece'), libelle=data['libelle'], fichier=fichier,
            nom_fichier=fichier.name[:255], taille=fichier.size, mime_type=data['mime_type'], uploaded_by=user,
        )
        AuditLog.log(
            request, AuditLog.Action.PIECE_CONGE, target=demande,
            details={'operation': 'ajout', 'piece': piece.libelle, 'fichier': piece.nom_fichier,
                     'taille': piece.taille},
        )
        return Response(PieceJointeSerializer(piece).data, status=status.HTTP_201_CREATED)


class PieceJointeFichierView(_PieceAccesMixin, APIView):
    """GET : contenu du fichier, servi par l'API (jamais d'URL directe), tracé."""

    def get(self, request, ref, pk):
        demande = self.get_object()
        piece = get_object_or_404(PieceJointeConge, pk=pk, demande=demande)
        AuditLog.log(
            request, AuditLog.Action.PIECE_CONGE, target=demande,
            details={'operation': 'consultation', 'piece': piece.libelle, 'fichier': piece.nom_fichier},
        )
        with piece.fichier.open('rb') as f:
            contenu = f.read()
        response = HttpResponse(contenu, content_type=piece.mime_type or 'application/octet-stream')
        nom = piece.nom_fichier.replace('"', '')
        response['Content-Disposition'] = f'inline; filename="{nom}"'
        response['X-Content-Type-Options'] = 'nosniff'
        return response


# ─── Soldes ─────────────────────────────────────────────────────────────────

class _SoldeBaseView(APIView):
    def get_employee(self, matricule):
        return get_object_or_404(Employee, matricule=matricule)


class SoldeView(_SoldeBaseView):
    """GET soldes/<matricule>/ — traiteur : tout (avec l'historique des
    mouvements) ; demandeur : le solde d'un employé de son périmètre, sans
    l'historique ; les autres : 403."""
    permission_classes = [CanAccessConges]

    def get(self, request, matricule):
        employee = self.get_employee(matricule)
        user = request.user
        if not user.can_manage_conges and not user.can_access_employee(employee):
            raise PermissionDenied("Cet employé n'est pas dans votre périmètre.")
        etat = services.etat_soldes(employee)
        if etat is None:
            return Response({'initialise': False, 'solde': None, 'mouvements': []})
        mouvements = []
        if user.can_manage_conges:
            mouvements = MouvementCongeSerializer(
                MouvementConge.objects.filter(employee=employee).select_related('auteur', 'demande')[:200], many=True,
            ).data
        return Response({'initialise': True, 'solde': etat, 'mouvements': mouvements})


def _separer_saisie_solde(validated_data):
    valeurs = dict(validated_data)
    motif = valeurs.pop('motif', '')
    exercices = valeurs.pop('exercices', {})
    compteurs = {c: valeurs.get(c, 0) for c in services.COMPTEURS}
    return exercices, compteurs, motif


class SoldeInitialView(_SoldeBaseView):
    permission_classes = [IsCongeManager]

    @erreurs_metier
    def post(self, request, matricule):
        employee = self.get_employee(matricule)
        serializer = SoldeInitialSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exercices, compteurs, motif = _separer_saisie_solde(serializer.validated_data)
        services.initialiser_solde(employee, exercices=exercices, compteurs=compteurs,
                                   auteur=request.user, motif=motif)
        AuditLog.log(request, AuditLog.Action.INITIAL_SOLDE_CONGE, target=employee,
                     details={'exercices': exercices, **compteurs, 'motif': motif})
        return Response(services.etat_soldes(employee), status=status.HTTP_201_CREATED)


class SoldeCorrectionView(_SoldeBaseView):
    permission_classes = [IsCongeManager]

    @erreurs_metier
    def post(self, request, matricule):
        employee = self.get_employee(matricule)
        serializer = SoldeCorrectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exercices, compteurs, motif = _separer_saisie_solde(serializer.validated_data)
        services.corriger_solde(employee, exercices=exercices, compteurs=compteurs,
                                auteur=request.user, motif=motif)
        AuditLog.log(request, AuditLog.Action.CORRIGER_SOLDE_CONGE, target=employee,
                     details={'corrections': {'exercices': exercices, **compteurs}, 'motif': motif})
        return Response(services.etat_soldes(employee))


# ─── Motifs, pièces attendues et paramètres ────────────────────────────────

class _LectureOuverteMixin:
    """Lecture pour tout utilisateur de l'app (le demandeur choisit le motif),
    écriture réservée au traiteur."""

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [CanAccessConges()]
        return [IsCongeManager()]


class MotifCongeListCreateView(_LectureOuverteMixin, generics.ListCreateAPIView):
    serializer_class = MotifCongeSerializer
    queryset = MotifConge.objects.prefetch_related('pieces')
    pagination_class = None


class MotifCongeDetailView(_LectureOuverteMixin, generics.RetrieveUpdateDestroyAPIView):
    """DELETE = désactivation (is_active=False) : un motif déjà utilisé n'est jamais supprimé."""
    serializer_class = MotifCongeSerializer
    queryset = MotifConge.objects.prefetch_related('pieces')

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=['is_active'])


class MotifPieceListCreateView(generics.ListCreateAPIView):
    """Pièces attendues d'un motif : `POST motifs/<pk>/pieces/`."""
    permission_classes = [IsCongeManager]
    serializer_class = MotifPieceSerializer
    pagination_class = None

    def get_queryset(self):
        return MotifPiece.objects.filter(motif_id=self.kwargs['pk'])

    def create(self, request, *args, **kwargs):
        motif = get_object_or_404(MotifConge, pk=self.kwargs['pk'])
        serializer = self.get_serializer(data={**request.data, 'motif': motif.pk})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MotifPieceDetailView(generics.UpdateAPIView, generics.DestroyAPIView):
    """PATCH (libellé, réactivation) ; DELETE = désactivation, jamais de suppression."""
    permission_classes = [IsCongeManager]
    serializer_class = MotifPieceSerializer
    queryset = MotifPiece.objects.all()
    http_method_names = ['patch', 'delete']

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=['is_active'])


class ParametreCongeView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsCongeManager]
    serializer_class = ParametreCongeSerializer

    def get_object(self):
        return ParametreConge.get()


# ─── Titre PDF, configuration, statistiques ─────────────────────────────────

class CongeApercuView(ReferenceLookupMixin, generics.RetrieveAPIView):
    """GET demandes/<ref>/apercu/ — PDF du titre, traiteur uniquement, une fois
    la demande validée. La date imprimée (`date_document`) est figée au premier
    aperçu ; une réouverture un autre jour renvoie 409 tant que
    `?confirmer_date=1` est absent (même principe que l'attestation)."""
    permission_classes = [IsCongeManager]

    def get(self, request, *args, **kwargs):
        from employees.models import Contrat

        demande = self.get_object()
        if demande.statut in (DemandeConge.Statut.RECUE, DemandeConge.Statut.REJETEE):
            return Response(
                {'error': "Le titre n'est généré qu'après validation de la demande."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        today = tz.localdate()
        if demande.date_document and demande.date_document != today:
            if request.query_params.get('confirmer_date') != '1':
                return Response(
                    {'needs_confirmation': True, 'date_document': demande.date_document.isoformat(),
                     'date_nouvelle': today.isoformat()},
                    status=409,
                )
            demande.date_document = today
            demande.save(update_fields=['date_document'])
        elif not demande.date_document:
            demande.date_document = today
            demande.save(update_fields=['date_document'])

        config, _ = CongeTemplateConfig.objects.get_or_create(pk=1)
        if demande.contrat_id:
            contrat_numero = demande.contrat.numero_contrat
        else:
            contrat_numero = Contrat.objects.filter(employee=demande.employee).order_by(
                '-date_debut', '-id',
            ).values_list('numero_contrat', flat=True).first() or ''

        pdf = build_conge_pdf(
            demande, config, demande.date_document, contrat_numero=contrat_numero,
            mention="(mode test)" if config.mode_test else '',
        )
        AuditLog.log(
            request, AuditLog.Action.APERCU_CONGE, target=demande,
            details={'reference': demande.reference, 'date_document': demande.date_document.isoformat()},
        )
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="titre_conge_{demande.reference.replace("/", "-")}.pdf"'
        )
        return response


class CongeTemplateConfigView(generics.RetrieveUpdateAPIView):
    """GET/PUT/PATCH config/ — singleton, traiteur uniquement. Le logo s'envoie
    en PATCH multipart séparé (le PUT des champs texte l'exclut côté frontend)."""
    permission_classes = [IsCongeManager]
    serializer_class = CongeTemplateConfigSerializer

    def get_object(self):
        obj, _ = CongeTemplateConfig.objects.get_or_create(pk=1)
        return obj


class CongeTemplateConfigApercuView(APIView):
    """POST config/apercu/ — PDF d'aperçu à partir des valeurs du formulaire NON
    enregistrées, avec un titre fictif. Rien n'est persisté (instance mutée en
    mémoire seulement). Traiteur uniquement."""
    permission_classes = [IsCongeManager]

    def post(self, request):
        config, _ = CongeTemplateConfig.objects.get_or_create(pk=1)
        serializer = CongeTemplateConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for champ, valeur in serializer.validated_data.items():
            if champ != 'logo':
                setattr(config, champ, valeur)
        interim = config.signataire_interim and bool(config.signataire_interim_nom.strip())
        exemple = SimpleNamespace(
            reference="00000/00", statut='prete', type_conge='CP',
            categorie_exercice='RELIQUAT', nb_jours=13,
            employee=SimpleNamespace(
                matricule="000000", nom="EXEMPLE", prenom="Ali", date_embauche=date(2015, 1, 1),
                poste_id=1, poste=SimpleNamespace(nom="Agent Administratif"),
                direction=SimpleNamespace(nom="DIRECTION"), departement=SimpleNamespace(nom="DEPT"),
                service=SimpleNamespace(nom="SERVICE"),
            ),
            date_depart=date(2026, 11, 1), date_retour=date(2026, 11, 14), adresse_conge="ALGERIE",
            exercice="2025/2026", date_etablissement=date.today(),
            signataire_nom=config.signataire_interim_nom.strip() if interim else config.signataire_nom,
            signataire_titre=config.signataire_titre, signataire_interim=interim,
        )
        pdf = build_conge_pdf(
            exemple, config, date.today(), contrat_numero="0000/00",
            mention="(mode test — données fictives, non enregistrées)",
        )
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = 'inline; filename="apercu_titre_conge.pdf"'
        return response


class DefaultCongeLogoView(APIView):
    """GET config/logo-defaut/ — logo embarqué utilisé tant qu'aucun logo n'est
    téléversé (même fichier que les attestations)."""
    permission_classes = [IsCongeManager]

    def get(self, request):
        return HttpResponse(LOGO_PAR_DEFAUT.read_bytes(), content_type='image/png')


class CongeStatsView(APIView):
    """GET stats/?date_debut=&date_fin= — traiteur uniquement. Mêmes clés que
    /api/attestations/stats/ (consommées par StatDonutChart/StatAreaChart).
    Exclut les demandes supprimées par leur demandeur."""
    permission_classes = [IsCongeManager]

    def get(self, request):
        qs = DemandeConge.objects.filter(is_active=True)
        date_debut = request.query_params.get('date_debut')
        date_fin = request.query_params.get('date_fin')
        if date_debut:
            d = datetime.strptime(date_debut, '%Y-%m-%d').date()
            qs = qs.filter(created_at__gte=tz.make_aware(datetime.combine(d, time.min)))
        if date_fin:
            d = datetime.strptime(date_fin, '%Y-%m-%d').date()
            qs = qs.filter(created_at__lte=tz.make_aware(datetime.combine(d, time.max)))

        par_gestionnaire = list(
            qs.values('demandeur_id', 'demandeur__nom', 'demandeur__prenom').annotate(count=Count('id')).order_by('-count')
        )
        for ligne in par_gestionnaire:
            ligne['id'] = ligne.pop('demandeur_id')
            ligne['nom'] = f"{ligne.pop('demandeur__prenom')} {ligne.pop('demandeur__nom')}"

        par_employe = list(
            qs.values('employee_id', 'employee__nom', 'employee__prenom', 'employee__matricule')
              .annotate(count=Count('id')).order_by('-count')
        )
        for ligne in par_employe:
            ligne['id'] = ligne.pop('employee_id')
            ligne['nom'] = f"{ligne.pop('employee__prenom')} {ligne.pop('employee__nom')}"

        comptes = dict(qs.values('statut').annotate(count=Count('id')).values_list('statut', 'count'))
        libelles = dict(DemandeConge.Statut.choices)
        par_statut = [
            {'id': code, 'nom': libelles[code], 'count': comptes[code]}
            for code in libelles if comptes.get(code, 0) > 0
        ]

        duree = qs.filter(statut=DemandeConge.Statut.RECUPEREE).annotate(
            duree=ExpressionWrapper(
                Coalesce(F('date_recuperee'), F('updated_at')) - F('created_at'), output_field=DurationField(),
            )
        ).aggregate(moyenne=Avg('duree'))['moyenne']

        recues = {
            r['mois'].strftime('%Y-%m'): r['count']
            for r in qs.annotate(mois=TruncMonth('created_at')).values('mois').annotate(count=Count('id'))
        }
        recuperees = {
            r['mois'].strftime('%Y-%m'): r['count']
            for r in qs.filter(statut=DemandeConge.Statut.RECUPEREE)
                       .annotate(mois=TruncMonth(Coalesce(F('date_recuperee'), F('updated_at'))))
                       .values('mois').annotate(count=Count('id'))
        }
        evolution = [
            {'mois': m, 'recues': recues.get(m, 0), 'recuperees': recuperees.get(m, 0)}
            for m in sorted(set(recues) | set(recuperees))
        ]
        return Response({
            'total': qs.count(), 'par_gestionnaire': par_gestionnaire, 'par_employe': par_employe,
            'par_statut': par_statut, 'evolution_mensuelle': evolution,
            'delai_moyen_jours': round(duree.total_seconds() / 86400, 1) if duree else None,
        })
