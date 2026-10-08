import logging
import os

from django.db.models import Q
from django.http import Http404, HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.encoding import smart_str
from rest_framework import generics
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from audit.models import AuditLog
from . import services
from .access import controler_acces
from .filigrane import appliquer_filigrane
from .models import DemandeConsultation
from .notifications import notifier_nouvelle_demande, notifier_rejetee, notifier_revoquee, notifier_validee
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
            telechargement_autorise=_vrai(request.data.get('telechargement_autorise', False)),
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


class _FichierLivreView(APIView):
    """Base commune de `voir` et `telecharger`. Throttle `consultation`
    (30/min), flux authentifié, jamais de lien vers media/."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'consultation'
    disposition = 'inline'
    action_audit = AuditLog.Action.VIEW_CONSULTATION

    def _charger(self, request, ref, fichier_id):
        demande = DemandeConsultation.objects.select_related('demandeur').filter(
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

        nom_sur = smart_str(nom).replace('"', '')
        reponse['Content-Disposition'] = f'{self.disposition}; filename="{nom_sur}"'
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


class ConsultationFichierTelechargerView(_FichierLivreView):
    disposition = 'attachment'
    action_audit = AuditLog.Action.DL_CONSULTATION

    def _autoriser_action(self, request, demande):
        if not request.user.can_manage_consultations and not demande.telechargement_autorise:
            raise PermissionDenied("Le téléchargement n'est pas autorisé pour cette consultation.")
