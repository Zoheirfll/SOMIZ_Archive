import dataclasses

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import AuditLog
from consultations.views import reference_depuis_slug

from . import services
from .models import MouvementArchive
from .permissions import CanManageRegistres
from .reference import generate_reference
from .serializers import MouvementArchiveSerializer

ANNEE_MIN, ANNEE_MAX = 2000, 2100
MSG_LIGNE_ANNULEE = "Une ligne annulée n'est plus modifiable."

CHAMPS_MOUVEMENT = [
    'employee_id', 'nom_libre', 'beneficiaire', 'fonction', 'service', 'numero_contrat',
    'type_documents', 'nombre_documents', 'date_depart', 'date_retour', 'observation',
]


def annee_depuis(request):
    """Année demandée (défaut : année courante), bornée pour éviter une
    requête absurde."""
    brut = request.query_params.get('annee')
    if brut in (None, ''):
        return timezone.localdate().year
    try:
        annee = int(brut)
    except ValueError:
        raise ValidationError({'annee': "Année invalide."})
    if not ANNEE_MIN <= annee <= ANNEE_MAX:
        raise ValidationError({'annee': "Année invalide."})
    return annee


def _jsonable(valeur):
    if hasattr(valeur, 'isoformat'):
        return valeur.isoformat()
    return str(valeur) if valeur is not None and not isinstance(valeur, (str, int, bool)) else valeur


def instantane(obj, champs):
    """Valeurs sérialisables JSON des champs suivis, pour le diff d'audit."""
    return {c: _jsonable(getattr(obj, c)) for c in champs}


def diff(avant, apres):
    """{champ: {'avant', 'apres'}} pour les seuls champs modifiés."""
    return {c: {'avant': avant[c], 'apres': apres[c]} for c in avant if avant[c] != apres[c]}


class RegistreObjetMixin:
    """Résolution par slug de référence (M-00001-26) ; 404 si inconnu."""
    permission_classes = [CanManageRegistres]
    modele = None
    lookup_url_kwarg = 'ref'

    def get_object(self):
        reference = reference_depuis_slug(self.kwargs[self.lookup_url_kwarg])
        return get_object_or_404(self.modele.objects.select_related('saisi_par'), reference=reference)


def annuler_ligne(request, obj, action):
    """Annulation commune aux deux registres : motif obligatoire, auditée."""
    try:
        services.annuler(obj, request.data.get('motif'))
    except ValueError as exc:
        raise ValidationError(str(exc))
    AuditLog.log(request, action, target=obj, details={'motif': obj.motif_annulation})


class MouvementsView(APIView):
    """GET : registre 01 d'une année (lignes manuelles + consultations).
    POST : nouvelle ligne manuelle."""
    permission_classes = [CanManageRegistres]

    def get(self, request):
        annee = annee_depuis(request)
        lignes = services.registre_mouvements(
            request.user, annee,
            q=request.query_params.get('q', '').strip(),
            statut=request.query_params.get('statut', ''),
        )
        return Response({'annee': annee, 'results': [dataclasses.asdict(ligne) for ligne in lignes]})

    @transaction.atomic
    def post(self, request):
        serializer = MouvementArchiveSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        mouvement = serializer.save(reference=generate_reference('M'), saisi_par=request.user)
        AuditLog.log(
            request, AuditLog.Action.CREATE_MOUVEMENT, target=mouvement,
            details={'nombre_documents': mouvement.nombre_documents},
        )
        return Response(MouvementArchiveSerializer(mouvement, context={'request': request}).data, status=201)


class MouvementDetailView(RegistreObjetMixin, generics.RetrieveUpdateAPIView):
    modele = MouvementArchive
    serializer_class = MouvementArchiveSerializer
    http_method_names = ['get', 'patch', 'head', 'options']  # jamais de DELETE

    def perform_update(self, serializer):
        if not serializer.instance.is_active:
            raise ValidationError(MSG_LIGNE_ANNULEE)
        avant = instantane(serializer.instance, CHAMPS_MOUVEMENT)
        mouvement = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_MOUVEMENT, target=mouvement,
            details={'changes': diff(avant, instantane(mouvement, CHAMPS_MOUVEMENT))},
        )


class MouvementRetourView(RegistreObjetMixin, APIView):
    modele = MouvementArchive

    def post(self, request, ref):
        mouvement = self.get_object()
        if not mouvement.is_active:
            raise ValidationError(MSG_LIGNE_ANNULEE)
        if mouvement.date_retour:
            raise ValidationError("Le retour est déjà enregistré.")
        brut = request.data.get('date_retour')
        if brut:
            serializer = MouvementArchiveSerializer(
                mouvement, data={'date_retour': brut}, partial=True, context={'request': request},
            )
            serializer.is_valid(raise_exception=True)
            date_retour = serializer.validated_data['date_retour']
        else:
            date_retour = timezone.localdate()
            if date_retour < mouvement.date_depart:
                raise ValidationError("La date de retour ne peut pas précéder la date de départ.")
        mouvement.date_retour = date_retour
        mouvement.save(update_fields=['date_retour', 'updated_at'])
        AuditLog.log(
            request, AuditLog.Action.RETOUR_MOUVEMENT, target=mouvement,
            details={'date_retour': date_retour.isoformat()},
        )
        return Response(MouvementArchiveSerializer(mouvement, context={'request': request}).data)


class MouvementAnnulerView(RegistreObjetMixin, APIView):
    modele = MouvementArchive

    def post(self, request, ref):
        mouvement = self.get_object()
        annuler_ligne(request, mouvement, AuditLog.Action.CANCEL_MOUVEMENT)
        return Response(MouvementArchiveSerializer(mouvement, context={'request': request}).data)
