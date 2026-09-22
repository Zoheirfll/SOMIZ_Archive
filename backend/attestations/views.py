from datetime import datetime, time

from django.db.models import Count, F, Avg, ExpressionWrapper, DurationField, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone as tz
from rest_framework import generics, serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin, IsAdminOrConsultant
from audit.models import AuditLog
from .models import DemandeAttestation, AttestationTemplateConfig
from .pdf import build_attestation_pdf
from .permissions import CanRequestAttestation
from .serializers import (
    DemandeAttestationSerializer, DemandeAttestationCreateSerializer,
    DemandeAttestationStatutSerializer, AttestationTemplateConfigSerializer,
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
    """GET /api/attestations/demandes/ — ADMIN/SUPERADMIN voient toutes les
    demandes, un GESTIONNAIRE ne voit que les siennes.
    POST /api/attestations/demandes/ — GESTIONNAIRE/ADMIN/SUPERADMIN."""

    def get_permissions(self):
        if self.request.method == 'POST':
            return [CanRequestAttestation()]
        return [IsAdminOrConsultant()]

    def get_serializer_class(self):
        return DemandeAttestationCreateSerializer if self.request.method == 'POST' else DemandeAttestationSerializer

    def get_queryset(self):
        qs = DemandeAttestation.objects.select_related(
            'employee', 'contrat', 'demandeur', 'traite_par'
        )
        user = self.request.user

        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(
                Q(reference__icontains=q) |
                Q(employee__nom__icontains=q) | Q(employee__prenom__icontains=q) |
                Q(employee__matricule__icontains=q) |
                Q(demandeur__nom__icontains=q) | Q(demandeur__prenom__icontains=q)
            )

        if user.is_admin:
            statut = self.request.query_params.get('statut')
            if statut:
                qs = qs.filter(statut=statut)
            if self.request.query_params.get('pending'):
                # Badge navbar : uniquement les demandes pas encore prises
                # en charge — dès qu'un ADMIN passe une demande à
                # "Imprimée" (ou plus loin), elle a été traitée, le badge
                # ne doit plus la compter même si le document n'est pas
                # encore récupéré par le gestionnaire.
                qs = qs.filter(statut=DemandeAttestation.Statut.RECUE)
            return qs
        return qs.filter(demandeur=user)

    def perform_create(self, serializer):
        demande = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_ATTESTATION, target=demande,
            details={'employee': str(demande.employee), 'motif': demande.motif},
        )


class DemandeAttestationDetailView(ReferenceLookupMixin, generics.RetrieveDestroyAPIView):
    """GET accessible ADMIN + demandeur (sa propre demande).
    DELETE réservé au demandeur, uniquement au statut RECUE."""
    serializer_class = DemandeAttestationSerializer
    permission_classes = [IsAdminOrConsultant]
    queryset = DemandeAttestation.objects.select_related('employee', 'contrat', 'demandeur', 'traite_par')

    def get_object(self):
        obj = super().get_object()
        user = self.request.user
        if not user.is_admin and obj.demandeur_id != user.id:
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
            details={'employee': str(instance.employee), 'motif': instance.motif},
        )
        instance.delete()


class DemandeAttestationStatutView(ReferenceLookupMixin, generics.UpdateAPIView):
    """PATCH /api/attestations/demandes/<ref>/statut/ — ADMIN/SUPERADMIN uniquement."""
    permission_classes = [IsAdmin]
    serializer_class = DemandeAttestationStatutSerializer
    queryset = DemandeAttestation.objects.all()
    http_method_names = ['patch']

    def patch(self, request, *args, **kwargs):
        instance = self.get_object()
        ancien_statut = instance.statut
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        demande = serializer.save(traite_par=request.user)
        AuditLog.log(
            request, AuditLog.Action.STATUT_ATTESTATION, target=demande,
            details={
                'de': ancien_statut, 'vers': demande.statut,
                'motif_rejet': demande.motif_rejet or None,
            },
        )
        return Response(DemandeAttestationSerializer(demande).data)


class DemandeAttestationScanView(ReferenceLookupMixin, generics.UpdateAPIView):
    """POST/PATCH /api/attestations/demandes/<ref>/scan/ — ADMIN uniquement,
    jamais bloquant sur le statut (aide-mémoire optionnel, voir spec)."""
    permission_classes = [IsAdmin]
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
    """GET/PUT /api/attestations/config/ — singleton, ADMIN only."""
    permission_classes = [IsAdmin]
    serializer_class = AttestationTemplateConfigSerializer

    def get_object(self):
        obj, _ = AttestationTemplateConfig.objects.get_or_create(pk=1)
        return obj


class AttestationApercuView(ReferenceLookupMixin, generics.RetrieveAPIView):
    """GET /api/attestations/demandes/<ref>/apercu/ — ADMIN only, renvoie le
    PDF de l'attestation (reproduit le modèle papier, voir
    attestations/pdf.py), affichable et imprimable tel quel."""
    permission_classes = [IsAdmin]
    queryset = DemandeAttestation.objects.select_related('employee', 'contrat', 'employee__poste')

    def get(self, request, *args, **kwargs):
        from employees.models import Contrat, EmployeeChampValeur

        demande = self.get_object()
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
            demande, config, tz.localdate(),
            lieu_naissance=lieu_naissance, contrat_numero=contrat_numero,
        )
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="attestation_{demande.reference.replace("/", "-")}.pdf"'
        )
        return response


class AttestationStatsView(APIView):
    """GET /api/attestations/stats/?date_debut=&date_fin= — ADMIN only."""
    permission_classes = [IsAdmin]

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
            row['demandeur_nom'] = f"{row.pop('demandeur__prenom')} {row.pop('demandeur__nom')}"

        par_employe = list(
            qs.values('employee_id', 'employee__nom', 'employee__prenom', 'employee__matricule')
              .annotate(count=Count('id')).order_by('-count')
        )
        for row in par_employe:
            row['employee_nom'] = f"{row.pop('employee__prenom')} {row.pop('employee__nom')}"

        par_statut = dict(
            qs.values('statut').annotate(count=Count('id')).values_list('statut', 'count')
        )

        duree = qs.filter(statut=DemandeAttestation.Statut.RECUPEREE).annotate(
            duree=ExpressionWrapper(F('updated_at') - F('created_at'), output_field=DurationField())
        ).aggregate(moyenne=Avg('duree'))['moyenne']

        return Response({
            'par_gestionnaire': par_gestionnaire,
            'par_employe': par_employe,
            'par_statut': par_statut,
            'delai_moyen_jours': round(duree.total_seconds() / 86400, 1) if duree else None,
        })
