from datetime import date, datetime, time
from types import SimpleNamespace

from django.db.models import Count, F, Avg, ExpressionWrapper, DurationField, Q
from django.db.models.functions import Coalesce, TruncMonth
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone as tz
from rest_framework import generics, serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import AuditLog
from .models import DemandeAttestation, AttestationTemplateConfig
from .pdf import build_attestation_pdf, LOGO_PAR_DEFAUT
from .permissions import CanAccessAttestations, CanRequestAttestation, IsAttestationManager
from .serializers import (
    DemandeAttestationSerializer, DemandeAttestationCreateSerializer,
    DemandeAttestationStatutSerializer,
    AttestationTemplateConfigSerializer,
)


class ReferenceLookupMixin:
    """Résout l'objet par sa référence plutôt que par son UUID, pour des
    URLs lisibles côté frontend (/attestations/00001-26 au lieu d'un
    UUID). La référence contient un '/' (format NNNNN/AA) — illisible
    tel quel dans un segment d'URL, donc encodée en '-' côté client
    (`00001-26`) et reconvertie ici avant la recherche en base."""
    lookup_url_kwarg = 'ref'

    def get_object(self):
        ref = self.kwargs[self.lookup_url_kwarg].replace('-', '/', 1)
        obj = get_object_or_404(self.filter_queryset(self.get_queryset()), reference=ref)
        self.check_object_permissions(self.request, obj)
        return obj


class DemandeAttestationListCreateView(generics.ListCreateAPIView):
    """GET /api/attestations/demandes/ — SUPERADMIN et ADMIN chargé des
    attestations (User.can_manage_attestations) voient toutes les demandes,
    un GESTIONNAIRE ne voit que les siennes.
    POST /api/attestations/demandes/ — GESTIONNAIRE/SUPERADMIN."""

    def get_permissions(self):
        if self.request.method == 'POST':
            return [CanRequestAttestation()]
        return [CanAccessAttestations()]

    def get_serializer_class(self):
        return DemandeAttestationCreateSerializer if self.request.method == 'POST' else DemandeAttestationSerializer

    def get_queryset(self):
        qs = DemandeAttestation.objects.select_related(
            'employee', 'employee__direction', 'employee__departement', 'employee__service',
            'employee__poste', 'employee__type_contrat', 'employee__categorie',
            'contrat', 'demandeur', 'traite_par',
        )
        user = self.request.user

        employee_id = self.request.query_params.get('employee')
        if employee_id:
            # Onglet "Attestations" de la fiche employé (EmployeeDetail.jsx)
            # — historique des demandes pour CET employé précis, toujours
            # combiné avec le filtrage demandeur/admin ci-dessous (un
            # GESTIONNAIRE ne voit ici que ses propres demandes pour cet
            # employé, jamais celles d'un collègue). URL lisible : matricule
            # plutôt qu'UUID, même principe que ReferenceLookupMixin.
            qs = qs.filter(employee__matricule=employee_id)

        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(
                Q(reference__icontains=q) |
                Q(employee__nom__icontains=q) | Q(employee__prenom__icontains=q) |
                Q(employee__matricule__icontains=q) |
                Q(demandeur__nom__icontains=q) | Q(demandeur__prenom__icontains=q)
            )

        if user.can_manage_attestations:
            statut = self.request.query_params.get('statut')
            if statut:
                qs = qs.filter(statut=statut)
            if self.request.query_params.get('pending'):
                # Badge navbar (côté traiteur) : uniquement les demandes pas
                # encore prises en charge — dès qu'un ADMIN chargé passe une
                # demande à "Prête" (ou plus loin), elle a été traitée, le
                # badge ne doit plus la compter même si le document n'est
                # pas encore récupéré par le gestionnaire.
                qs = qs.filter(statut=DemandeAttestation.Statut.RECUE)
            return qs
        qs = qs.filter(demandeur=user)
        if self.request.query_params.get('pending'):
            # Badge navbar (côté demandeur) : demandes prêtes à récupérer,
            # symétrique du badge ADMIN ci-dessus — le badge disparaît dès
            # qu'un ADMIN enregistre la récupération (statut Récupérée),
            # jamais avant, puisque seul un ADMIN peut changer le statut.
            qs = qs.filter(statut=DemandeAttestation.Statut.PRETE)
        return qs

    def perform_create(self, serializer):
        demande = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_ATTESTATION, target=demande,
            details={'employee': str(demande.employee), 'motif': demande.motif.nom},
        )


class DemandeAttestationDetailView(ReferenceLookupMixin, generics.RetrieveDestroyAPIView):
    """GET accessible aux traiteurs (SUPERADMIN/ADMIN chargé) + au demandeur
    (sa propre demande). DELETE réservé au demandeur, uniquement au statut
    RECUE."""
    serializer_class = DemandeAttestationSerializer
    permission_classes = [CanAccessAttestations]
    queryset = DemandeAttestation.objects.select_related(
        'employee', 'employee__direction', 'employee__departement', 'employee__service',
        'employee__poste', 'employee__type_contrat', 'employee__categorie',
        'contrat', 'demandeur', 'traite_par',
    )

    def get_object(self):
        obj = super().get_object()
        user = self.request.user
        if not user.can_manage_attestations and obj.demandeur_id != user.id:
            raise PermissionDenied("Cette demande ne vous appartient pas.")
        return obj

    def perform_destroy(self, instance):
        user = self.request.user
        if instance.demandeur_id != user.id or instance.statut != DemandeAttestation.Statut.RECUE:
            raise PermissionDenied(
                "Une demande ne peut être annulée que par son auteur, tant qu'elle est au statut 'Reçue'."
            )
        AuditLog.log(
            self.request, AuditLog.Action.DELETE_ATTESTATION, target=instance,
            details={'employee': str(instance.employee), 'motif': instance.motif.nom},
        )
        instance.delete()


class DemandeAttestationStatutView(ReferenceLookupMixin, generics.UpdateAPIView):
    """PATCH /api/attestations/demandes/<ref>/statut/ — SUPERADMIN et ADMIN chargé uniquement."""
    permission_classes = [IsAttestationManager]
    serializer_class = DemandeAttestationStatutSerializer
    queryset = DemandeAttestation.objects.all()
    http_method_names = ['patch']

    def patch(self, request, *args, **kwargs):
        instance = self.get_object()
        ancien_statut = instance.statut
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        extra = {'traite_par': request.user}
        nouveau_statut = serializer.validated_data.get('statut')
        # Horodatage du stepper (voir AttestationDetail.jsx) — Reçue utilise
        # déjà created_at, pas besoin de le dupliquer ici.
        if nouveau_statut == DemandeAttestation.Statut.PRETE:
            extra['date_prete'] = tz.now()
        elif nouveau_statut == DemandeAttestation.Statut.RECUPEREE:
            extra['date_recuperee'] = tz.now()
        demande = serializer.save(**extra)
        AuditLog.log(
            request, AuditLog.Action.STATUT_ATTESTATION, target=demande,
            details={
                'de': ancien_statut, 'vers': demande.statut,
                'motif_rejet': demande.motif_rejet or None,
            },
        )
        return Response(DemandeAttestationSerializer(demande).data)


class DemandeAttestationBulkStatutView(APIView):
    """POST /api/attestations/demandes/bulk-statut/ — SUPERADMIN/ADMIN chargé
    uniquement. Body: {"ids": [...], "statut": "prete"|"recuperee"}.
    Applique la même transition à plusieurs demandes en une fois (liste
    /attestations, sélection en masse) — chaque id est traité
    indépendamment via DemandeAttestationStatutSerializer (mêmes règles de
    transition séquentielle que le changement unitaire) pour qu'une
    demande déjà à un autre statut ne bloque pas le reste du lot."""
    permission_classes = [IsAttestationManager]

    def post(self, request):
        ids = request.data.get('ids') or []
        statut = request.data.get('statut')
        if not isinstance(ids, list) or not ids:
            return Response({'error': "Aucune demande sélectionnée."}, status=400)
        if statut not in (DemandeAttestation.Statut.PRETE, DemandeAttestation.Statut.RECUPEREE):
            return Response({'error': "Statut invalide pour une action en masse."}, status=400)

        updated = []
        errors = []
        for demande in DemandeAttestation.objects.filter(id__in=ids):
            ancien_statut = demande.statut
            serializer = DemandeAttestationStatutSerializer(
                demande, data={'statut': statut}, partial=True,
            )
            if not serializer.is_valid():
                errors.append({'id': str(demande.id), 'reference': demande.reference,
                                'erreur': next(iter(serializer.errors.values()))[0] if serializer.errors else "Transition invalide."})
                continue
            extra = {'traite_par': request.user}
            if statut == DemandeAttestation.Statut.PRETE:
                extra['date_prete'] = tz.now()
            else:
                extra['date_recuperee'] = tz.now()
            demande = serializer.save(**extra)
            AuditLog.log(
                request, AuditLog.Action.STATUT_ATTESTATION, target=demande,
                details={'de': ancien_statut, 'vers': demande.statut},
            )
            updated.append(demande.reference)

        return Response({'updated': updated, 'errors': errors})


class DemandeAttestationScanView(ReferenceLookupMixin, generics.UpdateAPIView):
    """POST/PATCH /api/attestations/demandes/<ref>/scan/ — ADMIN chargé (ou SUPERADMIN) uniquement,
    jamais bloquant sur le statut (aide-mémoire optionnel, voir spec)."""
    permission_classes = [IsAttestationManager]
    queryset = DemandeAttestation.objects.all()
    http_method_names = ['post', 'patch']

    class _ScanSerializer(serializers.ModelSerializer):
        class Meta:
            model = DemandeAttestation
            fields = ['scan_document']

    serializer_class = _ScanSerializer

    def post(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)


class AttestationTemplateConfigView(generics.RetrieveUpdateAPIView):
    """GET/PUT /api/attestations/config/ — singleton, SUPERADMIN/ADMIN chargé only."""
    permission_classes = [IsAttestationManager]
    serializer_class = AttestationTemplateConfigSerializer

    def get_object(self):
        obj, _ = AttestationTemplateConfig.objects.get_or_create(pk=1)
        return obj


class AttestationTemplateConfigApercuView(APIView):
    """POST /api/attestations/config/apercu/ — SUPERADMIN/ADMIN chargé only.

    Génère un PDF d'aperçu à partir des valeurs du formulaire de
    configuration EN COURS D'ÉDITION dans /parametres (pas encore
    enregistrées, body = mêmes champs que AttestationTemplateConfigSerializer),
    avec un employé/une demande fictifs — pour voir l'effet d'un changement
    (police, gras, libellé) sans avoir à cliquer "Enregistrer" ni dépendre
    d'une vraie demande existante. Rien n'est persisté : l'instance chargée
    est mutée en mémoire seulement, jamais sauvegardée. Le logo reste celui
    déjà enregistré (fichier binaire, pas dans le body JSON du formulaire)."""
    permission_classes = [IsAttestationManager]

    def post(self, request):
        config, _ = AttestationTemplateConfig.objects.get_or_create(pk=1)
        serializer = AttestationTemplateConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            if field != 'logo':
                setattr(config, field, value)

        demande_exemple = SimpleNamespace(
            reference="00000/00",
            employee=SimpleNamespace(
                matricule="000000",
                nom="EXEMPLE",
                prenom="Ali",
                date_naissance=date(1985, 6, 15),
                date_embauche=date(2015, 1, 1),
                poste_id=1,
                poste=SimpleNamespace(nom="Agent Administratif"),
            ),
            motif=SimpleNamespace(nom="Exemple de motif"),
        )
        pdf = build_attestation_pdf(
            demande_exemple, config, date.today(),
            lieu_naissance="Arzew", contrat_numero="0000/00",
            mention="(mode test — données fictives, non enregistrées)",
        )
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = 'inline; filename="apercu_attestation.pdf"'
        return response


class DefaultAttestationLogoView(APIView):
    """GET /api/attestations/config/logo-defaut/ — SUPERADMIN/ADMIN chargé
    only. Sert le logo embarqué (attestations/assets/logo_somiz.png) utilisé
    par build_attestation_pdf() tant qu'aucun logo n'a été téléversé
    (AttestationTemplateConfig.logo vide) — sans cet endpoint, le panneau
    /parametres affichait "Aucun logo" alors que le PDF généré en montrait
    bien un, aucune trace de ce fichier de secours n'étant exposée côté API."""
    permission_classes = [IsAttestationManager]

    def get(self, request):
        return HttpResponse(LOGO_PAR_DEFAUT.read_bytes(), content_type='image/png')


class AttestationApercuView(ReferenceLookupMixin, generics.RetrieveAPIView):
    """GET /api/attestations/demandes/<ref>/apercu/ — SUPERADMIN/ADMIN chargé only, renvoie le
    PDF de l'attestation (reproduit le modèle papier, voir
    attestations/pdf.py), affichable et imprimable tel quel."""
    permission_classes = [IsAttestationManager]
    queryset = DemandeAttestation.objects.select_related('employee', 'contrat', 'employee__poste')

    def get(self, request, *args, **kwargs):
        from employees.models import Contrat, EmployeeChampValeur

        demande = self.get_object()
        today = tz.localdate()

        # La date imprimée sur le document ("Arzew le :"/"Édité le :") se
        # fige à la première génération — entre l'impression et la
        # signature effective, un jour ou deux peuvent s'écouler (ex.
        # imprimé le 23, signé le 24). Rouvrir l'aperçu un autre jour ne
        # doit pas silencieusement afficher une date différente de celle
        # déjà imprimée : sans confirmation explicite (?confirmer_date=1),
        # on renvoie 409 plutôt que le PDF, avec l'ancienne et la nouvelle
        # date pour que le frontend affiche une modale d'avertissement.
        if demande.date_document and demande.date_document != today:
            if request.query_params.get('confirmer_date') != '1':
                return Response(
                    {
                        'needs_confirmation': True,
                        'date_document': demande.date_document.isoformat(),
                        'date_nouvelle': today.isoformat(),
                    },
                    status=409,
                )
            demande.date_document = today
            demande.save(update_fields=['date_document'])
        elif not demande.date_document:
            demande.date_document = today
            demande.save(update_fields=['date_document'])

        config, _ = AttestationTemplateConfig.objects.get_or_create(pk=1)
        lieu_naissance = EmployeeChampValeur.objects.filter(
            employee=demande.employee, champ__nom__icontains='lieu de naissance',
        ).values_list('valeur', flat=True).first() or ''

        # Le N° de contrat figure toujours sur le document papier : si la
        # demande ne vise pas un contrat précis, reprendre le plus récent
        # de l'employé plutôt que de laisser la ligne vide.
        if demande.contrat_id:
            contrat_numero = demande.contrat.numero_contrat
        else:
            contrat_numero = Contrat.objects.filter(
                employee=demande.employee
            ).order_by('-date_debut', '-id').values_list(
                'numero_contrat', flat=True
            ).first() or ''

        pdf = build_attestation_pdf(
            demande, config, demande.date_document,
            lieu_naissance=lieu_naissance, contrat_numero=contrat_numero,
            mention="(mode test)" if config.mode_test else '',
        )
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="attestation_{demande.reference.replace("/", "-")}.pdf"'
        )
        return response


class AttestationStatsView(APIView):
    """GET /api/attestations/stats/?date_debut=&date_fin= — SUPERADMIN/ADMIN chargé only."""
    permission_classes = [IsAttestationManager]

    def get(self, request):
        qs = DemandeAttestation.objects.all()
        date_debut = request.query_params.get('date_debut')
        date_fin = request.query_params.get('date_fin')
        if date_debut:
            d = datetime.strptime(date_debut, '%Y-%m-%d').date()
            qs = qs.filter(created_at__gte=tz.make_aware(datetime.combine(d, time.min)))
        if date_fin:
            d = datetime.strptime(date_fin, '%Y-%m-%d').date()
            qs = qs.filter(created_at__lte=tz.make_aware(datetime.combine(d, time.max)))

        par_gestionnaire = list(
            qs.values('demandeur_id', 'demandeur__nom', 'demandeur__prenom')
              .annotate(count=Count('id')).order_by('-count')
        )
        for row in par_gestionnaire:
            row['id'] = row.pop('demandeur_id')
            row['nom'] = f"{row.pop('demandeur__prenom')} {row.pop('demandeur__nom')}"

        par_employe = list(
            qs.values('employee_id', 'employee__nom', 'employee__prenom', 'employee__matricule')
              .annotate(count=Count('id')).order_by('-count')
        )
        for row in par_employe:
            row['id'] = row.pop('employee_id')
            row['nom'] = f"{row.pop('employee__prenom')} {row.pop('employee__nom')}"

        counts_par_statut = dict(
            qs.values('statut').annotate(count=Count('id')).values_list('statut', 'count')
        )
        labels_statut = dict(DemandeAttestation.Statut.choices)
        par_statut = [
            {'id': code, 'nom': labels_statut[code], 'count': counts_par_statut.get(code, 0)}
            for code in labels_statut
            if counts_par_statut.get(code, 0) > 0
        ]

        # date_recuperee (renseignée par DemandeAttestationStatutView.patch)
        # est plus précise que updated_at — mais reste absente pour les
        # demandes déjà récupérées avant l'ajout de ce champ, d'où le
        # repli sur updated_at pour ne pas fausser la moyenne à zéro.
        duree = qs.filter(statut=DemandeAttestation.Statut.RECUPEREE).annotate(
            duree=ExpressionWrapper(
                Coalesce(F('date_recuperee'), F('updated_at')) - F('created_at'),
                output_field=DurationField(),
            )
        ).aggregate(moyenne=Avg('duree'))['moyenne']

        # Évolution mensuelle : demandes reçues (créées) vs récupérées ce
        # mois-là — même principe que audit.stats._evolution_mensuelle,
        # mais sur un mois calendaire plutôt qu'une plage arbitraire, pour
        # rester lisible même sur "Tout" (pas de plage de dates fournie).
        recues_par_mois = {
            row['mois'].strftime('%Y-%m'): row['count']
            for row in qs.annotate(mois=TruncMonth('created_at'))
                         .values('mois').annotate(count=Count('id')).order_by('mois')
        }
        recuperees_par_mois = {
            row['mois'].strftime('%Y-%m'): row['count']
            for row in qs.filter(statut=DemandeAttestation.Statut.RECUPEREE)
                         .annotate(mois=TruncMonth(Coalesce(F('date_recuperee'), F('updated_at'))))
                         .values('mois').annotate(count=Count('id')).order_by('mois')
        }
        tous_les_mois = sorted(set(recues_par_mois) | set(recuperees_par_mois))
        evolution_mensuelle = [
            {
                'mois': mois,
                'recues': recues_par_mois.get(mois, 0),
                'recuperees': recuperees_par_mois.get(mois, 0),
            }
            for mois in tous_les_mois
        ]

        return Response({
            'total': qs.count(),
            'par_gestionnaire': par_gestionnaire,
            'par_employe': par_employe,
            'par_statut': par_statut,
            'evolution_mensuelle': evolution_mensuelle,
            'delai_moyen_jours': round(duree.total_seconds() / 86400, 1) if duree else None,
        })
