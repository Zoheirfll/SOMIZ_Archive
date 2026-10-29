"""API de gestion des intérims de responsables (2026-10-29).

GET  /api/interims/                    unités gérables + intérims visibles
GET  /api/interims/candidats/          comptes proposables pour une unité
POST /api/interims/                    désigner un intérimaire
POST /api/interims/<id>/decider/       valider / refuser (supérieur direct, SUPERADMIN)
POST /api/interims/<id>/terminer/      fin anticipée
Le droit s'évalue toujours serveur (accounts.interims.role_sur_unite) ; l'écran
ne fait que le refléter.
"""
from django.db.models import Q
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from .interims import (
    InterimError, candidats, decider, interims_visibles, modeles_unites, peut_gerer_interim,
    proposer, resoudre_unite, role_sur_unite, superieur_direct, terminer, unites_dirigees_par,
)
from .models import Interim, User
from .permissions import IsAdminOrConsultant


class _EntreeInterim(serializers.Serializer):
    unite_type = serializers.ChoiceField(choices=['direction', 'departement', 'service', 'cellule', 'section'])
    unite_id = serializers.UUIDField()
    interimaire = serializers.UUIDField()
    date_debut = serializers.DateField()
    date_fin = serializers.DateField()


def _nom(user):
    return user.full_name if user else None


def _representer(interim, user):
    try:
        unite = resoudre_unite(interim.unite_type, interim.unite_id)
        role = role_sur_unite(user, interim.unite_type, unite)
    except InterimError:
        role = None
    clos = interim.statut in (Interim.Statut.REFUSE, Interim.Statut.TERMINE)
    return {
        'id': str(interim.id), 'unite_type': interim.unite_type, 'unite_id': str(interim.unite_id),
        'unite_nom': interim.unite_nom, 'titulaire_nom': interim.titulaire_nom,
        'interimaire_id': str(interim.interimaire_id), 'interimaire_nom': _nom(interim.interimaire),
        'date_debut': interim.date_debut, 'date_fin': interim.date_fin, 'statut': interim.statut,
        'actif': interim.est_actif, 'propose_par_nom': _nom(interim.propose_par),
        'decide_par_nom': _nom(interim.decide_par), 'motif': interim.motif,
        'peut_decider': interim.statut == Interim.Statut.EN_ATTENTE and role in ('superadmin', 'superieur'),
        'peut_terminer': (not clos) and role is not None,
    }


def _sous_unites(type_unite, unite):
    """[(type, Q)] des unités placées sous `unite` (département ou direction)."""
    if type_unite == 'departement':
        return [(t, Q(departement_id=unite.pk)) for t in ('service', 'cellule', 'section')]
    if type_unite == 'direction':
        return [
            ('departement', Q(direction_id=unite.pk)),
            ('service', Q(departement__direction_id=unite.pk)),
            ('cellule', Q(direction_id=unite.pk) | Q(departement__direction_id=unite.pk)),
            ('section', Q(direction_id=unite.pk) | Q(departement__direction_id=unite.pk)),
        ]
    return []


def _unites_gerables(user):
    """Unités sur lesquelles `user` peut désigner : les siennes (comme titulaire),
    celles dont il est le supérieur direct, et — SUPERADMIN — toutes."""
    modeles = modeles_unites()
    vues, resultat = set(), []

    def ajouter(type_unite, unite):
        if (type_unite, unite.pk) in vues or unite.responsable_id is None:
            return
        role = role_sur_unite(user, type_unite, unite)
        if role is None:
            return
        vues.add((type_unite, unite.pk))
        resultat.append({
            'type': type_unite, 'id': str(unite.pk), 'nom': unite.nom, 'role': role,
            'titulaire_nom': f"{unite.responsable.prenom} {unite.responsable.nom}",
            # Le titulaire d'une unité qui a un supérieur direct le fait valider.
            'validation_requise': superieur_direct(type_unite, unite) is not None,
        })

    if user.role == User.Role.SUPERADMIN:
        for type_unite, modele in modeles.items():
            for unite in modele.objects.filter(is_active=True, responsable__isnull=False).select_related('responsable'):
                ajouter(type_unite, unite)
        return resultat
    for type_unite, unite in unites_dirigees_par(user):
        ajouter(type_unite, unite)
        # Un chef de département / un directeur est le supérieur des unités en
        # dessous ; `ajouter` ne retient que celles où il l'est réellement.
        for type_sous, filtre in _sous_unites(type_unite, unite):
            for sous in modeles[type_sous].objects.filter(
                    filtre, is_active=True, responsable__isnull=False).select_related('responsable'):
                ajouter(type_sous, sous)
    return resultat


class InterimListCreateView(APIView):
    permission_classes = [IsAdminOrConsultant]

    def get(self, request):
        interims = interims_visibles(request.user).select_related('interimaire', 'propose_par', 'decide_par')
        return Response({
            'peut_gerer': peut_gerer_interim(request.user),
            'unites': _unites_gerables(request.user),
            'interims': [_representer(i, request.user) for i in interims],
        })

    def post(self, request):
        entree = _EntreeInterim(data=request.data)
        entree.is_valid(raise_exception=True)
        d = entree.validated_data
        try:
            interim = proposer(request, d['unite_type'], d['unite_id'], d['interimaire'], d['date_debut'], d['date_fin'])
        except InterimError as exc:
            return Response({'error': str(exc)}, status=400)
        return Response(_representer(interim, request.user), status=201)


class InterimCandidatsView(APIView):
    permission_classes = [IsAdminOrConsultant]

    def get(self, request):
        try:
            unite_type = request.query_params.get('unite_type', '')
            unite = resoudre_unite(unite_type, request.query_params.get('unite_id'))
        except InterimError as exc:
            return Response({'error': str(exc)}, status=400)
        role = role_sur_unite(request.user, unite_type, unite)
        if role is None:
            return Response({'error': "Vous ne gérez pas cette unité."}, status=403)
        if role == 'superadmin':
            comptes = User.objects.filter(is_active=True, role__in=['GESTIONNAIRE', 'CONSULTANT']).order_by('nom', 'prenom')
            if unite.responsable_id:
                comptes = comptes.exclude(employee_id=unite.responsable_id)
        else:
            comptes = candidats(unite_type, unite)
        return Response([
            {'id': str(c.pk), 'nom': c.full_name, 'username': c.username} for c in comptes[:300]
        ])


class _ActionInterimView(APIView):
    permission_classes = [IsAdminOrConsultant]

    def _interim(self, pk):
        from django.shortcuts import get_object_or_404
        interim = get_object_or_404(Interim.objects.select_related('interimaire', 'propose_par', 'decide_par'), pk=pk)
        # 404 pour qui n'est pas concerné : pas de fuite d'existence.
        if not interims_visibles(self.request.user).filter(pk=interim.pk).exists():
            from django.http import Http404
            raise Http404
        return interim


class InterimDeciderView(_ActionInterimView):
    def post(self, request, pk):
        interim = self._interim(pk)
        try:
            interim = decider(request, interim, accepter=bool(request.data.get('accepter')),
                              motif=request.data.get('motif', ''))
        except InterimError as exc:
            return Response({'error': str(exc)}, status=400)
        return Response(_representer(interim, request.user))


class InterimTerminerView(_ActionInterimView):
    def post(self, request, pk):
        interim = self._interim(pk)
        try:
            interim = terminer(request, interim)
        except InterimError as exc:
            return Response({'error': str(exc)}, status=400)
        return Response(_representer(interim, request.user))
