import dataclasses

from django.db import transaction
from django.db.models import Q
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from audit.models import AuditLog
from consultations.views import reference_depuis_slug

from . import exports, services
from .models import MouvementArchive, ReceptionDocument
from .permissions import CanManageRegistres
from .reference import generate_reference
from .serializers import MouvementArchiveSerializer, ReceptionDocumentSerializer

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


PAGE_SIZE_DEFAUT, PAGE_SIZE_MAX = 50, 200


def _entier_positif(request, nom, defaut, maximum=None):
    brut = request.query_params.get(nom)
    if brut in (None, ''):
        return defaut
    try:
        valeur = int(brut)
    except ValueError:
        raise ValidationError({nom: "Valeur invalide."})
    if valeur < 1:
        raise ValidationError({nom: "Valeur invalide."})
    return min(valeur, maximum) if maximum else valeur


def paginer(elements, request):
    """Découpe une séquence déjà filtrée et triée (liste ou queryset) selon
    `page` et `page_size` (50 par défaut, 200 au maximum). Une page hors
    plage renvoie une liste vide plutôt qu'une erreur. L'export, lui, ne
    pagine jamais : un registre imprimé doit contenir toutes les lignes."""
    page_size = _entier_positif(request, 'page_size', PAGE_SIZE_DEFAUT, PAGE_SIZE_MAX)
    page = _entier_positif(request, 'page', 1)
    count = len(elements) if isinstance(elements, list) else elements.count()
    debut = (page - 1) * page_size
    return {
        'count': count, 'page': page, 'page_size': page_size,
        'num_pages': max(1, -(-count // page_size)),
        'items': elements[debut:debut + page_size],
    }


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
    """GET : registre 01 d'une année (mouvements physiques de dossiers).
    POST : nouveau mouvement."""
    permission_classes = [CanManageRegistres]

    def get(self, request):
        annee = annee_depuis(request)
        lignes = services.registre_mouvements(
            request.user, annee,
            q=request.query_params.get('q', '').strip(),
            statut=request.query_params.get('statut', ''),
        )
        bloc = paginer(lignes, request)
        items = bloc.pop('items')
        return Response({'annee': annee, **bloc, 'results': [dataclasses.asdict(ligne) for ligne in items]})

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


CHAMPS_RECEPTION = [
    'type_document', 'nombre', 'expediteur', 'date_reception', 'date_classement', 'observation',
]


def receptions_filtrees(request, annee):
    """Registre 02 d'une année, avec les filtres `q` et `statut=a_classer`
    de la query string (partagé par la liste et l'export)."""
    qs = ReceptionDocument.objects.select_related('saisi_par').filter(date_reception__year=annee)
    q = request.query_params.get('q', '').strip()
    if q:
        qs = qs.filter(
            Q(reference__icontains=q) | Q(type_document__icontains=q)
            | Q(expediteur__icontains=q) | Q(observation__icontains=q)
        )
    if request.query_params.get('statut') == 'a_classer':
        qs = qs.filter(is_active=True, date_classement__isnull=True)
    return qs


class ReceptionsView(APIView):
    """GET : registre 02 d'une année. POST : nouvelle réception."""
    permission_classes = [CanManageRegistres]

    def get(self, request):
        annee = annee_depuis(request)
        bloc = paginer(receptions_filtrees(request, annee), request)
        items = bloc.pop('items')
        data = ReceptionDocumentSerializer(items, many=True, context={'request': request}).data
        return Response({'annee': annee, **bloc, 'results': data})

    @transaction.atomic
    def post(self, request):
        serializer = ReceptionDocumentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        reception = serializer.save(reference=generate_reference('R'), saisi_par=request.user)
        AuditLog.log(
            request, AuditLog.Action.CREATE_RECEPTION, target=reception,
            details={'expediteur': reception.expediteur, 'nombre': reception.nombre},
        )
        return Response(ReceptionDocumentSerializer(reception, context={'request': request}).data, status=201)


class ReceptionDetailView(RegistreObjetMixin, generics.RetrieveUpdateAPIView):
    modele = ReceptionDocument
    serializer_class = ReceptionDocumentSerializer
    http_method_names = ['get', 'patch', 'head', 'options']  # jamais de DELETE

    def perform_update(self, serializer):
        if not serializer.instance.is_active:
            raise ValidationError(MSG_LIGNE_ANNULEE)
        avant = instantane(serializer.instance, CHAMPS_RECEPTION)
        reception = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_RECEPTION, target=reception,
            details={'changes': diff(avant, instantane(reception, CHAMPS_RECEPTION))},
        )


class ReceptionClasserView(RegistreObjetMixin, APIView):
    modele = ReceptionDocument

    def post(self, request, ref):
        reception = self.get_object()
        if not reception.is_active:
            raise ValidationError(MSG_LIGNE_ANNULEE)
        if reception.date_classement:
            raise ValidationError("Le classement est déjà enregistré.")
        brut = request.data.get('date_classement')
        if brut:
            serializer = ReceptionDocumentSerializer(
                reception, data={'date_classement': brut}, partial=True, context={'request': request},
            )
            serializer.is_valid(raise_exception=True)
            date_classement = serializer.validated_data['date_classement']
        else:
            date_classement = timezone.localdate()
            if date_classement < reception.date_reception:
                raise ValidationError("La date de classement ne peut pas précéder la date de réception.")
        reception.date_classement = date_classement
        reception.save(update_fields=['date_classement', 'updated_at'])
        AuditLog.log(
            request, AuditLog.Action.CLASSER_RECEPTION, target=reception,
            details={'date_classement': date_classement.isoformat()},
        )
        return Response(ReceptionDocumentSerializer(reception, context={'request': request}).data)


class ReceptionAnnulerView(RegistreObjetMixin, APIView):
    modele = ReceptionDocument

    def post(self, request, ref):
        reception = self.get_object()
        annuler_ligne(request, reception, AuditLog.Action.CANCEL_RECEPTION)
        return Response(ReceptionDocumentSerializer(reception, context={'request': request}).data)


ENTETES_MOUVEMENTS = [
    'Référence', 'Date de départ', 'Bénéficiaire (qui emporte le dossier)',
    'Employé concerné (dossier)', 'Matricule',
    'Fonction', 'Service', 'N° contrat', 'Type de documents', 'Nombre de documents',
    'Date de retour', 'Observation', 'Saisi par',
]
ENTETES_RECEPTIONS = [
    'Référence', 'Type de document', 'Nombre', 'Expéditeur', 'Date de réception',
    'Date de classement', 'Observation', 'Saisi par',
]
COLONNES_DATE_MOUVEMENTS = (1, 10)
COLONNES_DATE_RECEPTIONS = (4, 5)
FORMATS_EXPORT = {
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'pdf': 'application/pdf',
}


def _reference_export(reference, annulee):
    return f"{reference} (annulée)" if annulee else reference


def _lignes_export_mouvements(request, annee):
    lignes = services.registre_mouvements(
        request.user, annee, q=request.query_params.get('q', '').strip(),
        statut=request.query_params.get('statut', ''),
    )
    return [[
        _reference_export(l.reference, l.annulee), l.date_depart, l.beneficiaire,
        l.employe, l.matricule, l.fonction, l.service, l.numero_contrat, l.type_documents,
        l.nombre_documents, l.date_retour, l.observation, l.saisi_par,
    ] for l in lignes]


def _lignes_export_receptions(request, annee):
    return [[
        _reference_export(r.reference, not r.is_active), r.type_document, r.nombre,
        r.expediteur, r.date_reception, r.date_classement, r.observation,
        f"{r.saisi_par.nom} {r.saisi_par.prenom}".strip() if r.saisi_par_id else '',
    ] for r in receptions_filtrees(request, annee)]


REGISTRES_EXPORTABLES = {
    'mouvements': (
        "Registre de mouvement des dossiers", ENTETES_MOUVEMENTS,
        _lignes_export_mouvements, COLONNES_DATE_MOUVEMENTS,
    ),
    'receptions': (
        "Registre de réception et de classement", ENTETES_RECEPTIONS,
        _lignes_export_receptions, COLONNES_DATE_RECEPTIONS,
    ),
}


class RegistreExportView(APIView):
    """GET /api/registres/<registre>/export/?format=xlsx|pdf — réservé aux
    gestionnaires des registres ; chaque export/impression est tracé."""
    permission_classes = [CanManageRegistres]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'registre_export'

    def get(self, request, registre):
        if registre not in REGISTRES_EXPORTABLES:
            raise Http404
        # `fmt` et non `format` : DRF réserve ?format= à la négociation de
        # contenu (URL_FORMAT_OVERRIDE) et répond 404 avant d'atteindre la vue
        # pour tout format sans moteur de rendu associé.
        format_demande = request.query_params.get('fmt', '')
        if format_demande not in FORMATS_EXPORT:
            raise ValidationError({'fmt': "Format invalide (xlsx ou pdf)."})
        annee = annee_depuis(request)
        titre, entetes, fabrique, colonnes_date = REGISTRES_EXPORTABLES[registre]
        rows = fabrique(request, annee)
        titre_annee = f"{titre} — {annee}"
        if format_demande == 'xlsx':
            contenu = exports.construire_xlsx(titre_annee, entetes, rows, colonnes_date=colonnes_date)
            action = AuditLog.Action.EXPORT_REGISTRE
        else:
            contenu = exports.construire_pdf(titre_annee, entetes, rows)
            action = AuditLog.Action.PRINT_REGISTRE
        AuditLog.log(request, action, details={
            'registre': registre, 'annee': annee, 'format': format_demande,
            'filtres': dict(request.query_params), 'nb_lignes': len(rows),
        })
        reponse = HttpResponse(contenu, content_type=FORMATS_EXPORT[format_demande])
        reponse['Content-Disposition'] = f'attachment; filename="registre-{registre}-{annee}.{format_demande}"'
        reponse['Cache-Control'] = 'no-store'
        reponse['X-Content-Type-Options'] = 'nosniff'
        return reponse
