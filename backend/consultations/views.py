from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.exceptions import PermissionDenied

from audit.models import AuditLog
from .models import DemandeConsultation
from .notifications import notifier_nouvelle_demande
from .permissions import CanAccessConsultations, CanRequestConsultation
from .serializers import DemandeConsultationCreateSerializer, DemandeConsultationSerializer


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
        'employee', 'demandeur', 'traite_par',
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

        q = params.get('q')
        if q:
            qs = qs.filter(
                Q(reference__icontains=q) | Q(description__icontains=q)
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
