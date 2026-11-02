from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import CanViewStatistiques, IsAdmin, IsAdminOrConsultant
from reporting.nominatif import retirer_nominatif
from audit.models import AuditLog
from reporting.export import reponse_xlsx
from reporting.models import ObjectifIndicateur, RapportMensuel
from reporting.objectifs import appliquer_objectifs
from reporting.rh import (
    activite, bilan, carriere, conges, contrats, demandes, demographie, documents, effectifs,
    mouvements, parite, qualite, synthese, unites,
)
from reporting.rh.commun import ParametreInvalide, lire_parametres
from reporting.rh.definitions import DEFINITIONS


def _statistiques(user):
    return user.can_view_statistiques


# page → (constructeur, droit supplémentaire au-delà d'IsAdmin). Congés et
# Demandes : ouvertes à leurs traiteurs même sans accès aux statistiques RH.
PAGES = {
    'synthese': (synthese.construire, _statistiques),
    'effectifs': (effectifs.construire, _statistiques),
    'parite': (parite.construire, _statistiques),
    'demographie': (demographie.construire, _statistiques),
    'mouvements': (mouvements.construire, _statistiques),
    'contrats': (contrats.construire, _statistiques),
    'carriere': (carriere.construire, _statistiques),
    'qualite': (qualite.construire, _statistiques),
    'unites': (unites.construire, _statistiques),
    'documents': (documents.construire, _statistiques),
    'activite': (activite.construire, _statistiques),
    'bilan': (bilan.construire, _statistiques),
    'conges': (conges.construire, lambda u: u.can_manage_conges),
    'demandes': (demandes.construire, lambda u: u.can_manage_attestations or u.can_manage_consultations),
}


class RapportRHView(APIView):
    """GET /api/reporting/rh/<page>/?date_debut=&date_fin=&echeance_jours=&horizon=[&fmt=xlsx]
    Une page du menu Statistiques. SUPERADMIN, ou ADMIN/CONSULTANT portant
    `acces_statistiques` (CONSULTANT : sans données nominatives, voir
    reporting/nominatif.py) ; Congés et Demandes réservées à leur traiteur."""
    permission_classes = [IsAdminOrConsultant]

    def get(self, request, page):
        entree = PAGES.get(page)
        if entree is None:
            return Response({'error': 'Page de reporting inconnue.'}, status=404)
        construire, autorise = entree
        if not autorise(request.user):
            return Response({'error': "Vous n'avez pas accès à ce rapport."}, status=403)
        try:
            params = lire_parametres(request.query_params)
        except ParametreInvalide as exc:
            return Response({'error': f'Paramètre invalide : {exc}.'}, status=400)
        data = appliquer_objectifs(construire(params, request.user))
        if not request.user.is_admin:
            data = retirer_nominatif(data)
        data['periode'] = params.as_dict()
        if request.query_params.get('fmt') == 'xlsx':
            return reponse_xlsx(request, page, data)
        data.pop('exports', None)
        return Response(data)


class ObjectifSerializer(serializers.ModelSerializer):
    libelle = serializers.SerializerMethodField()
    modifie_par_nom = serializers.CharField(source='modifie_par.full_name', read_only=True, default=None)

    class Meta:
        model = ObjectifIndicateur
        fields = ['code', 'libelle', 'cible', 'sens', 'modifie_par_nom', 'modifie_le']
        read_only_fields = ['modifie_le']

    def get_libelle(self, obj):
        return DEFINITIONS.get(obj.code, (obj.code,))[0]

    def validate_code(self, value):
        if value not in DEFINITIONS:
            raise serializers.ValidationError('Indicateur inconnu.')
        return value


class ObjectifsView(APIView):
    """GET : objectifs DRH + liste des indicateurs disponibles.
    PUT {code, cible, sens} : crée ou remplace l'objectif d'un indicateur."""
    permission_classes = [CanViewStatistiques]

    def get_permissions(self):
        # Lecture : tout compte autorisé aux statistiques ; modification : ADMIN.
        if self.request.method == 'GET':
            return [CanViewStatistiques()]
        return [IsAdmin(), CanViewStatistiques()]

    def get(self, request):
        return Response({
            'objectifs': ObjectifSerializer(ObjectifIndicateur.objects.select_related('modifie_par'), many=True).data,
            'indicateurs': [{'code': c, 'libelle': l} for c, (l, _d) in sorted(DEFINITIONS.items(), key=lambda x: x[1][0])],
        })

    def put(self, request):
        instance = ObjectifIndicateur.objects.filter(code=request.data.get('code')).first()
        avant = {'cible': instance.cible, 'sens': instance.sens} if instance else None
        serializer = ObjectifSerializer(instance, data=request.data)
        serializer.is_valid(raise_exception=True)
        objectif = serializer.save(modifie_par=request.user)
        AuditLog.log(request, AuditLog.Action.MODIFY_OBJECTIF, details={
            'operation': 'modification' if avant else 'creation', 'code': objectif.code,
            'avant': avant, 'apres': {'cible': objectif.cible, 'sens': objectif.sens},
        })
        return Response(serializer.data)


class ObjectifDetailView(APIView):
    permission_classes = [IsAdmin, CanViewStatistiques]

    def delete(self, request, code):
        objectif = get_object_or_404(ObjectifIndicateur, code=code)
        AuditLog.log(request, AuditLog.Action.MODIFY_OBJECTIF, details={
            'operation': 'suppression', 'code': code,
            'avant': {'cible': objectif.cible, 'sens': objectif.sens}, 'apres': None,
        })
        objectif.delete()
        return Response(status=204)


class RapportsMensuelsView(APIView):
    # Rapport agrégé (aucun nom) : ouvert aux consultants autorisés.
    permission_classes = [CanViewStatistiques]

    def get(self, request):
        return Response([{'id': r.id, 'mois': r.mois.isoformat(), 'cree_le': r.cree_le}
                         for r in RapportMensuel.objects.all()[:24]])


class RapportMensuelFichierView(APIView):
    """Téléchargement d'un rapport mensuel — par l'API uniquement, tracé."""
    permission_classes = [CanViewStatistiques]

    def get(self, request, pk):
        rapport = get_object_or_404(RapportMensuel, pk=pk)
        AuditLog.log(request, AuditLog.Action.EXPORT,
                     details={'type': 'rapport_mensuel', 'mois': rapport.mois.isoformat()})
        return FileResponse(rapport.fichier.open('rb'), as_attachment=True,
                            filename=f'rapport_mensuel_{rapport.mois:%Y-%m}.pdf', content_type='application/pdf')
