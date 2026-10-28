import logging
import os
import uuid
from datetime import datetime, time

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q
from django.db.models.functions import TruncMonth
from django.http import Http404, HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.encoding import smart_str
from django.utils.http import content_disposition_header
from rest_framework import generics
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from audit.models import AuditLog
from config.liste_demandes import DemandePagination, appliquer_periode_importance_tri
from . import services
from .access import controler_acces
from .filigrane import appliquer_filigrane
from .models import DemandeConsultation
from .notifications import (
    notifier_nouvelle_demande, notifier_prolongee, notifier_rejetee, notifier_revoquee, notifier_validee,
)
from .permissions import CanAccessConsultations, CanRequestConsultation, IsConsultationManager
from .serializers import DemandeConsultationCreateSerializer, DemandeConsultationSerializer

logger = logging.getLogger(__name__)


def reference_depuis_slug(slug):
    """'C-00001-26' (URL) → 'C-00001/26' (référence). Le '/' est illisible
    dans un segment d'URL ; l'année est ce qui suit le dernier tiret."""
    base, _, annee = slug.rpartition('-')
    return f"{base}/{annee}"


def slug_depuis_reference(reference):
    return reference.replace('/', '-')


def queryset_pour(user):
    """Un traiteur voit tout ; tout autre compte ne voit que SES demandes."""
    qs = DemandeConsultation.objects.select_related(
        'employee', 'employee__direction', 'employee__departement', 'employee__service',
        'employee__poste', 'employee__type_contrat', 'employee__categorie',
        'demandeur', 'traite_par',
    ).prefetch_related('fichiers')
    return qs if user.can_manage_consultations else qs.filter(demandeur=user)


class ReferenceLookupMixin:
    lookup_url_kwarg = 'ref'

    def get_object(self):
        reference = reference_depuis_slug(self.kwargs[self.lookup_url_kwarg])
        obj = get_object_or_404(queryset_pour(self.request.user), reference=reference)
        self.check_object_permissions(self.request, obj)
        return obj


class DemandeConsultationListCreateView(generics.ListCreateAPIView):
    """GET : traiteurs = toutes les demandes, demandeurs = les leurs.
    POST : GESTIONNAIRE/CONSULTANT."""
    pagination_class = DemandePagination
    TRIS = {
        'created_at': 'created_at', 'date_validation': 'date_validation', 'date_echeance': 'date_echeance',
        'employee': 'employee__nom', 'statut': 'statut', 'importance': 'importance', 'type_demande': 'type_demande',
    }

    def get_permissions(self):
        if self.request.method == 'POST':
            return [CanRequestConsultation()]
        return [CanAccessConsultations()]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DemandeConsultationCreateSerializer
        return DemandeConsultationSerializer

    def get_queryset(self):
        user = self.request.user
        qs = queryset_pour(user)
        params = self.request.query_params
        qs = appliquer_periode_importance_tri(qs, params, self.TRIS, DemandeConsultation.Importance.values)

        q = params.get('q')
        if q:
            qs = qs.filter(
                Q(reference__icontains=q) | Q(description__icontains=q)
                | Q(employee__nom__icontains=q) | Q(employee__prenom__icontains=q)
                | Q(employee__matricule__icontains=q)
                | Q(demandeur__nom__icontains=q) | Q(demandeur__prenom__icontains=q)
            )
        type_demande = params.get('type_demande')
        if type_demande:
            qs = qs.filter(type_demande=type_demande)

        statut = params.get('statut')
        maintenant = timezone.now()
        if statut == DemandeConsultation.EXPIREE:
            qs = qs.filter(statut=DemandeConsultation.Statut.VALIDEE, date_echeance__lte=maintenant)
        elif statut == DemandeConsultation.Statut.VALIDEE:
            qs = qs.filter(statut=DemandeConsultation.Statut.VALIDEE, date_echeance__gt=maintenant)
        elif statut:
            qs = qs.filter(statut=statut)

        if params.get('pending') and user.can_manage_consultations:
            # Badge navbar traiteur : demandes pas encore prises en charge.
            qs = qs.filter(statut=DemandeConsultation.Statut.EN_COURS)
        return qs

    def perform_create(self, serializer):
        demande = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_CONSULTATION, target=demande,
            details={'type': demande.type_demande},
        )
        notifier_nouvelle_demande(demande)

    def create(self, request, *args, **kwargs):
        # Réponse en lecture complète (référence, statut...) plutôt que
        # l'écho des seuls champs d'écriture.
        response = super().create(request, *args, **kwargs)
        demande = DemandeConsultation.objects.get(pk=response.data['id'])
        response.data = DemandeConsultationSerializer(demande, context={'request': request}).data
        return response


class DemandeConsultationDetailView(ReferenceLookupMixin, generics.RetrieveDestroyAPIView):
    """GET : traiteur ou demandeur (les autres reçoivent 404, l'existence de
    la demande n'est pas révélée). DELETE : demandeur, tant que 'En cours'."""
    serializer_class = DemandeConsultationSerializer
    permission_classes = [CanAccessConsultations]

    def perform_destroy(self, instance):
        user = self.request.user
        if instance.demandeur_id != user.id or instance.statut != DemandeConsultation.Statut.EN_COURS:
            raise PermissionDenied(
                "Une demande ne peut être annulée que par son auteur, tant qu'elle est « En cours de validation »."
            )
        AuditLog.log(
            self.request, AuditLog.Action.DELETE_CONSULTATION, target=instance,
            details={'type': instance.type_demande},
        )
        instance.delete()


def _liste_form(request, cle):
    """Valeurs multiples d'un champ de formulaire multipart (liste vide si
    la requête est du JSON ou si le champ est absent)."""
    data = request.data
    if hasattr(data, 'getlist'):
        return [v for v in data.getlist(cle) if v not in ('', None)]
    valeur = data.get(cle) or []
    return valeur if isinstance(valeur, list) else [valeur]


def _vrai(valeur):
    return str(valeur).strip().lower() in ('1', 'true', 'on', 'oui')


def _vrai_ou_none(data, cle):
    """None si le champ est absent (→ le souhait du demandeur s'applique),
    sinon sa valeur booléenne."""
    return _vrai(data.get(cle)) if cle in data else None


class _TraitementView(ReferenceLookupMixin, APIView):
    permission_classes = [IsConsultationManager]

    def _reponse(self, demande):
        demande = queryset_pour(self.request.user).get(pk=demande.pk)
        return Response(DemandeConsultationSerializer(demande, context={'request': self.request}).data)


class DemandeConsultationValiderView(_TraitementView):
    """POST multipart : duree_heures, telechargement_autorise, fichiers[],
    copier_fichiers[] (ids de EmployeeDocumentFile de l'employé)."""

    def post(self, request, ref):
        demande = self.get_object()
        ancien = demande.statut
        demande = services.valider(
            demande, request.user,
            duree_heures=request.data.get('duree_heures'),
            telechargement_autorise=_vrai_ou_none(request.data, 'telechargement_autorise'),
            impression_autorisee=_vrai_ou_none(request.data, 'impression_autorisee'),
            uploads=request.FILES.getlist('fichiers'),
            ids_copies=_liste_form(request, 'copier_fichiers'),
        )
        for fichier in demande._fichiers_livres:
            AuditLog.log(
                request, AuditLog.Action.UPLOAD_CONSULTATION, target=demande,
                details={'reference': demande.reference, 'fichier': fichier.file_name, 'origine': fichier.origine},
            )
        AuditLog.log(
            request, AuditLog.Action.STATUT_CONSULTATION, target=demande,
            details={
                'de': ancien, 'vers': demande.statut,
                'echeance': demande.date_echeance.isoformat(),
                'telechargement_autorise': demande.telechargement_autorise,
                'impression_autorisee': demande.impression_autorisee,
                # Souhaits du demandeur, pour voir ce que le traiteur a modifié.
                'souhaits': {
                    'duree_heures': demande.duree_souhaitee_heures,
                    'telechargement': demande.telechargement_souhaite,
                    'impression': demande.impression_souhaitee,
                },
            },
        )
        notifier_validee(demande, request.user)
        return self._reponse(demande)


class DemandeConsultationRejeterView(_TraitementView):
    def post(self, request, ref):
        demande = self.get_object()
        ancien = demande.statut
        demande = services.rejeter(demande, request.user, request.data.get('motif_rejet'))
        AuditLog.log(
            request, AuditLog.Action.STATUT_CONSULTATION, target=demande,
            details={'de': ancien, 'vers': demande.statut, 'motif_rejet': demande.motif_rejet},
        )
        notifier_rejetee(demande, request.user)
        return self._reponse(demande)


class DemandeConsultationRevoquerView(_TraitementView):
    def post(self, request, ref):
        demande = self.get_object()
        ancien = demande.statut
        demande = services.revoquer(demande, request.user)
        AuditLog.log(
            request, AuditLog.Action.STATUT_CONSULTATION, target=demande,
            details={'de': ancien, 'vers': demande.statut},
        )
        notifier_revoquee(demande, request.user)
        return self._reponse(demande)


class ConsultationStatsView(APIView):
    """GET /api/consultations/stats/?date_debut=&date_fin= — traiteurs
    uniquement. Même forme que /api/attestations/stats/ pour que le frontend
    réutilise les mêmes graphiques ; le délai est en HEURES (une consultation
    se valide en heures, pas en jours)."""
    permission_classes = [IsConsultationManager]

    def get(self, request):
        qs = DemandeConsultation.objects.all()
        try:
            date_debut = request.query_params.get('date_debut')
            date_fin = request.query_params.get('date_fin')
            if date_debut:
                d = datetime.strptime(date_debut, '%Y-%m-%d').date()
                qs = qs.filter(created_at__gte=timezone.make_aware(datetime.combine(d, time.min)))
            if date_fin:
                d = datetime.strptime(date_fin, '%Y-%m-%d').date()
                qs = qs.filter(created_at__lte=timezone.make_aware(datetime.combine(d, time.max)))
        except ValueError:
            return Response({'error': "Dates invalides (format AAAA-MM-JJ)."}, status=400)

        par_demandeur = list(
            qs.values('demandeur_id', 'demandeur__nom', 'demandeur__prenom')
              .annotate(count=Count('id')).order_by('-count')
        )
        for row in par_demandeur:
            row['id'] = row.pop('demandeur_id')
            row['nom'] = f"{row.pop('demandeur__prenom')} {row.pop('demandeur__nom')}"

        par_employe = list(
            qs.exclude(employee__isnull=True)
              .values('employee_id', 'employee__nom', 'employee__prenom')
              .annotate(count=Count('id')).order_by('-count')
        )
        for row in par_employe:
            row['id'] = row.pop('employee_id')
            row['nom'] = f"{row.pop('employee__prenom')} {row.pop('employee__nom')}"

        # « Expirée » n'est pas stockée : on la sépare de « Validée » par la date.
        maintenant = timezone.now()
        Statut = DemandeConsultation.Statut
        comptes = {
            Statut.EN_COURS: qs.filter(statut=Statut.EN_COURS).count(),
            Statut.VALIDEE: qs.filter(statut=Statut.VALIDEE, date_echeance__gt=maintenant).count(),
            DemandeConsultation.EXPIREE: qs.filter(statut=Statut.VALIDEE, date_echeance__lte=maintenant).count(),
            Statut.REJETEE: qs.filter(statut=Statut.REJETEE).count(),
            Statut.REVOQUEE: qs.filter(statut=Statut.REVOQUEE).count(),
        }
        libelles = {
            Statut.EN_COURS: 'En cours de validation', Statut.VALIDEE: 'Validée',
            DemandeConsultation.EXPIREE: 'Expirée', Statut.REJETEE: 'Rejetée', Statut.REVOQUEE: 'Révoquée',
        }
        par_statut = [{'id': code, 'nom': libelles[code], 'count': n} for code, n in comptes.items() if n > 0]

        delai = qs.exclude(date_validation__isnull=True).annotate(
            duree=ExpressionWrapper(F('date_validation') - F('created_at'), output_field=DurationField()),
        ).aggregate(moyenne=Avg('duree'))['moyenne']

        demandees = {
            r['mois'].strftime('%Y-%m'): r['count']
            for r in qs.annotate(mois=TruncMonth('created_at')).values('mois').annotate(count=Count('id'))
        }
        validees = {
            r['mois'].strftime('%Y-%m'): r['count']
            for r in qs.exclude(date_validation__isnull=True)
                       .annotate(mois=TruncMonth('date_validation')).values('mois').annotate(count=Count('id'))
        }
        evolution = [
            {'mois': m, 'demandees': demandees.get(m, 0), 'validees': validees.get(m, 0)}
            for m in sorted(set(demandees) | set(validees))
        ]
        return Response({
            'total': qs.count(),
            'par_statut': par_statut,
            'par_demandeur': par_demandeur,
            'par_employe': par_employe,
            'evolution_mensuelle': evolution,
            'delai_moyen_heures': round(delai.total_seconds() / 3600, 1) if delai else None,
        })


class DemandeConsultationProlongerView(_TraitementView):
    def post(self, request, ref):
        demande = self.get_object()
        demande = services.prolonger(demande, request.user, request.data.get('duree_heures'))
        AuditLog.log(
            request, AuditLog.Action.PROLONG_CONSULTATION, target=demande,
            details={
                'reference': demande.reference,
                'ancienne_echeance': demande._ancienne_echeance.isoformat(),
                'nouvelle_echeance': demande.date_echeance.isoformat(),
                'nb_prolongations': demande.nb_prolongations,
            },
        )
        notifier_prolongee(demande, request.user)
        return self._reponse(demande)


def _texte_erreur(exc):
    """Message lisible d'une ValidationError DRF (dict, liste ou texte)."""
    detail = exc.detail
    if isinstance(detail, dict):
        detail = [m for v in detail.values() for m in (v if isinstance(v, list) else [v])]
    elif not isinstance(detail, list):
        detail = [detail]
    return ' '.join(str(m) for m in detail)


class DemandeConsultationBulkView(APIView):
    """POST /api/consultations/demandes/bulk/ — traiteurs uniquement.
    Body : {"ids": [...], "action": "rejeter" | "revoquer", "motif_rejet": "..."}.

    Même principe que le changement de statut en masse des attestations :
    chaque demande est traitée indépendamment par `services` (mêmes règles que
    l'action unitaire), une demande en erreur ne bloque pas le reste du lot.
    La VALIDATION n'est pas groupable : chaque demande exige son propre scan."""
    permission_classes = [IsConsultationManager]
    MAX_IDS = 100

    def post(self, request):
        ids = request.data.get('ids') or []
        action = request.data.get('action')
        if not isinstance(ids, list) or not ids:
            return Response({'error': "Aucune demande sélectionnée."}, status=400)
        if len(ids) > self.MAX_IDS:
            return Response({'error': f"Maximum {self.MAX_IDS} demandes par action."}, status=400)
        if action not in ('rejeter', 'revoquer'):
            return Response({'error': "Action invalide pour un traitement en masse."}, status=400)
        try:
            ids = [str(uuid.UUID(str(i))) for i in ids]
        except ValueError:
            return Response({'error': "Identifiant de demande invalide."}, status=400)

        updated, errors = [], []
        for demande in DemandeConsultation.objects.filter(id__in=ids):
            ancien = demande.statut
            try:
                if action == 'rejeter':
                    demande = services.rejeter(demande, request.user, request.data.get('motif_rejet'))
                else:
                    demande = services.revoquer(demande, request.user)
            except ValidationError as exc:
                errors.append({'reference': demande.reference, 'error': _texte_erreur(exc)})
                continue
            AuditLog.log(
                request, AuditLog.Action.STATUT_CONSULTATION, target=demande,
                details={'de': ancien, 'vers': demande.statut, 'groupe': True,
                         'motif_rejet': demande.motif_rejet or None},
            )
            if action == 'rejeter':
                notifier_rejetee(demande, request.user)
            else:
                notifier_revoquee(demande, request.user)
            updated.append(demande.reference)
        return Response({'updated': updated, 'errors': errors})


class _FichierLivreView(APIView):
    """Base commune de `voir` et `telecharger`. Throttle `consultation`
    (30/min), flux authentifié, jamais de lien vers media/."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'consultation'
    disposition = 'inline'
    action_audit = AuditLog.Action.VIEW_CONSULTATION

    def _charger(self, request, ref, fichier_id):
        demande = DemandeConsultation.objects.select_related('demandeur', 'employee').filter(
            reference=reference_depuis_slug(ref),
        ).first()
        if demande is None:
            raise Http404
        fichier = demande.fichiers.filter(pk=fichier_id).first()
        if fichier is None:
            raise Http404
        controler_acces(request.user, demande, fichier)
        return demande, fichier

    def _autoriser_action(self, request, demande):
        """Surcharge dans `telecharger`."""

    def get(self, request, ref, fichier_id):
        demande, fichier = self._charger(request, ref, fichier_id)
        self._autoriser_action(request, demande)
        if not fichier.file or not os.path.exists(fichier.file.path):
            return Response({'error': 'Fichier introuvable.'}, status=404)

        nom = fichier.file_name
        if request.user.can_manage_consultations:
            # Le traiteur contrôle l'original qu'il a envoyé.
            def flux(chemin, taille_bloc=8192):
                with open(chemin, 'rb') as fh:
                    while bloc := fh.read(taille_bloc):
                        yield bloc

            reponse = StreamingHttpResponse(flux(fichier.file.path), content_type=fichier.mime_type)
            reponse['Content-Length'] = os.path.getsize(fichier.file.path)
        else:
            texte = (
                f"{request.user.full_name} — {demande.reference} — "
                f"{timezone.localtime():%d/%m/%Y %H:%M}"
            )
            try:
                with open(fichier.file.path, 'rb') as fh:
                    contenu, mime = appliquer_filigrane(fh.read(), fichier.mime_type, texte)
            except Exception:
                # Échec fermé : on ne sert JAMAIS l'original non filigrané.
                logger.exception("Filigrane impossible (fichier %s)", fichier.id)
                return Response(
                    {'error': "Le fichier livré est illisible. Contactez le traiteur de votre demande."},
                    status=422,
                )
            if mime != fichier.mime_type:
                nom = os.path.splitext(nom)[0] + '.png'
            reponse = HttpResponse(contenu, content_type=mime)

        reponse['Content-Disposition'] = content_disposition_header(
            self.disposition == 'attachment', smart_str(nom),
        )
        reponse['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
        reponse['Pragma'] = 'no-cache'
        reponse['X-Frame-Options'] = 'SAMEORIGIN'
        reponse['X-Content-Type-Options'] = 'nosniff'
        reponse['Content-Security-Policy'] = "default-src 'self'"
        AuditLog.log(
            request, self.action_audit, target=demande,
            details={
                'reference': demande.reference, 'fichier': fichier.file_name,
                'traiteur': bool(request.user.can_manage_consultations),
            },
        )
        return reponse


class ConsultationFichierVoirView(_FichierLivreView):
    pass


class ConsultationFichierImprimerView(_FichierLivreView):
    """POST .../fichiers/<id>/imprimer/ — appelé par le navigateur AVANT
    d'ouvrir la boîte d'impression. Le serveur ne peut pas empêcher une
    impression une fois le document affiché ; il refuse en revanche d'en
    donner le feu vert (droit non accordé, consultation expirée...) et trace
    chaque impression dans l'audit — l'impression reste ainsi attribuable."""
    http_method_names = ['post', 'options']
    action_audit = AuditLog.Action.PRINT_CONSULTATION

    def post(self, request, ref, fichier_id):
        demande, fichier = self._charger(request, ref, fichier_id)
        if not request.user.can_manage_consultations and not demande.impression_autorisee:
            raise PermissionDenied("L'impression n'est pas autorisée pour cette consultation.")
        AuditLog.log(
            request, self.action_audit, target=demande,
            details={
                'reference': demande.reference, 'fichier': fichier.file_name,
                'traiteur': bool(request.user.can_manage_consultations),
            },
        )
        return Response(status=204)


class ConsultationFichierTelechargerView(_FichierLivreView):
    disposition = 'attachment'
    action_audit = AuditLog.Action.DL_CONSULTATION

    def _autoriser_action(self, request, demande):
        if not request.user.can_manage_consultations and not demande.telechargement_autorise:
            raise PermissionDenied("Le téléchargement n'est pas autorisé pour cette consultation.")
