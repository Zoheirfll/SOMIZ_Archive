# apps/employees/grh_integration.py
"""
Synchronisation entrante depuis le GRH de l'entreprise : le GRH notifie
SOMIZ à la création/mise à jour d'un employé, qui apparaît alors
automatiquement dans /employees, sans saisie manuelle.

Appel serveur-à-serveur (pas de cookie JWT) — authentifié par signature
HMAC du corps brut de la requête, comparée en temps constant.
"""
import hashlib
import hmac
import logging

from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from audit.models import AuditLog
from employees.models import Categorie, Departement, Direction, Employee, Poste, Service, TypeContrat

logger = logging.getLogger(__name__)

REQUIRED_FIELDS = ['matricule', 'nom', 'prenom']
MATRICULE_MAX_LENGTH = 20


class GRHEmployeeSyncView(APIView):
    # Appel serveur-à-serveur authentifié par HMAC, pas un client anonyme
    # public — le throttle "anon" par défaut n'a pas de sens ici et
    # bloquerait un import en rafale légitime côté GRH. Un scope dédié
    # généreux (grh_sync) sert de filet de sécurité plutôt qu'une absence
    # totale de limite.
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'grh_sync'

    def post(self, request):
        signature = request.headers.get('X-GRH-Signature', '')
        expected = 'sha256=' + hmac.new(
            settings.GRH_WEBHOOK_SECRET.encode(), request.body, hashlib.sha256
        ).hexdigest()
        if not signature or not hmac.compare_digest(signature, expected):
            return Response({'detail': 'Signature invalide'}, status=401)

        data = request.data
        missing = [f for f in REQUIRED_FIELDS if not data.get(f)]
        if missing:
            return Response(
                {'detail': f"Champs obligatoires manquants : {', '.join(missing)}"},
                status=400,
            )

        # Résolution des référentiels — rejet (400) si un code/nom fourni ne
        # correspond à rien côté SOMIZ, plutôt que de créer un employé avec
        # un rattachement organisationnel silencieusement vide.
        referentiels, errors = self._resolve_referentiels(data)
        if errors:
            return Response({'detail': 'Référentiel(s) introuvable(s)', 'errors': errors}, status=400)

        matricule = data['matricule']
        if len(str(matricule)) > MATRICULE_MAX_LENGTH:
            return Response(
                {'detail': f"matricule dépasse {MATRICULE_MAX_LENGTH} caractères"}, status=400
            )

        try:
            employee, created = Employee.objects.update_or_create(
                matricule=matricule,
                defaults={
                    'nom': data['nom'],
                    'prenom': data['prenom'],
                    'date_naissance': data.get('date_naissance') or None,
                    'date_embauche': data.get('date_embauche') or None,
                    **referentiels,
                },
            )
        except Exception:
            logger.exception('GRH sync: échec update_or_create pour matricule=%s', matricule)
            return Response({'detail': 'Données invalides (format inattendu)'}, status=400)

        AuditLog.log(
            request,
            AuditLog.Action.CREATE_EMP if created else AuditLog.Action.MODIFY_EMP,
            target=employee,
            details={'matricule': matricule, 'source': 'GRH_SYNC'},
        )

        return Response(
            {'detail': 'Créé' if created else 'Mis à jour', 'id': str(employee.id)},
            status=201 if created else 200,
        )

    @staticmethod
    def _resolve_referentiels(data):
        """
        Mappe les codes/noms envoyés par le GRH vers les FK Employee.
        Un champ absent du payload est ignoré (pas d'erreur, pas de
        modification de ce rattachement) ; un champ présent mais qui ne
        matche rien en base est une erreur bloquante.
        """
        lookups = [
            ('direction_code', 'direction', Direction, 'code'),
            ('departement_code', 'departement', Departement, 'code'),
            ('service_code', 'service', Service, 'code'),
            ('poste_code', 'poste', Poste, 'code'),
            ('type_contrat', 'type_contrat', TypeContrat, 'nom'),
            ('categorie', 'categorie', Categorie, 'nom'),
        ]
        resolved = {}
        errors = {}
        for payload_key, field_name, model, lookup_field in lookups:
            value = data.get(payload_key)
            if not value:
                continue
            obj = model.objects.filter(**{lookup_field: value}).first()
            if obj is None:
                errors[payload_key] = f"Aucun {model._meta.verbose_name} avec {lookup_field}='{value}'"
            else:
                resolved[field_name] = obj
        return resolved, errors
