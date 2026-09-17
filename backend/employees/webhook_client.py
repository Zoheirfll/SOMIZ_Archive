# apps/employees/webhook_client.py
"""
Synchronisation sortante vers plateforme-sps : SOMIZ notifie plateforme-sps
(webhook signé HMAC, symétrique de employees/grh_integration.py qui reçoit
la synchronisation entrante du GRH) à chaque création/mise à jour/archivage
d'un `Employee`, pour que celui-ci apparaisse automatiquement côté SPS sans
ressaisie manuelle.

Opt-in : si PLATEFORME_SPS_WEBHOOK_URL ou PLATEFORME_SPS_WEBHOOK_SECRET est
vide (non configuré), `envoyer_webhook_employe` ne fait rien. Ne lève jamais
d'exception — un échec d'envoi (réseau, timeout, réponse non-2xx) est
seulement loggé en warning, pour ne jamais faire échouer l'opération
(création/modification d'employé ou de contrat) qui a déclenché l'envoi.
"""
import hashlib
import hmac
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

TIMEOUT_SECONDES = 3
TAILLE_MAX_REPONSE_LOGGEE = 500


def _direction_payload(direction):
    if direction is None:
        return None
    return {
        'somiz_id': str(direction.id),
        'nom': direction.nom,
    }


def _pole_payload(pole):
    if pole is None:
        return None
    return {
        'somiz_id': str(pole.id),
        'nom': pole.nom,
        'direction': _direction_payload(pole.direction),
    }


def _departement_payload(departement):
    if departement is None:
        return None
    return {
        'somiz_id': str(departement.id),
        'nom': departement.nom,
        'direction': _direction_payload(departement.direction),
        'pole': _pole_payload(departement.pole),
    }


def _service_payload(service):
    if service is None:
        return None
    return {
        'somiz_id': str(service.id),
        'nom': service.nom,
        'departement': _departement_payload(service.departement),
    }


def _cellule_payload(cellule):
    if cellule is None:
        return None
    return {
        'somiz_id': str(cellule.id),
        'nom': cellule.nom,
        'direction': _direction_payload(cellule.direction),
        'departement': _departement_payload(cellule.departement),
    }


def _section_payload(section):
    if section is None:
        return None
    return {
        'somiz_id': str(section.id),
        'nom': section.nom,
        'direction': _direction_payload(section.direction),
        'departement': _departement_payload(section.departement),
    }


def _date_iso(valeur):
    """
    Normalise une date en chaîne ISO (YYYY-MM-DD) pour le payload. `valeur`
    est presque toujours un `datetime.date` (champs validés par un
    formulaire/serializer) — mais `GRHEmployeeSyncView.post` (employees/
    grh_integration.py) assigne parfois directement une chaîne brute reçue
    du GRH sans passer par `full_clean()`, auquel cas l'attribut Python de
    l'instance reste une str (Django ne convertit qu'à l'écriture SQL, pas
    sur l'instance en mémoire) — donc ce signal, qui s'exécute juste après
    ce save() avec la même instance, peut voir une str. On la renvoie telle
    quelle plutôt que de planter sur `.isoformat()`.
    """
    if valeur is None:
        return None
    if isinstance(valeur, str):
        return valeur
    return valeur.isoformat()


def _numero_contrat_actuel(employee):
    """Le n° du contrat le plus récent (même ordre que
    Employee.sync_statut_from_dernier_contrat : plus grand numero_contrat),
    ou "" si l'employé n'a aucun contrat."""
    dernier = employee.contrats.order_by('-numero_contrat').first()
    return dernier.numero_contrat if dernier else ''


def _construire_payload_employe(employee):
    return {
        'somiz_id': str(employee.id),
        'matricule': employee.matricule,
        'nom': employee.nom,
        'prenom': employee.prenom,
        'numero_contrat': _numero_contrat_actuel(employee),
        'date_naissance': _date_iso(employee.date_naissance),
        'date_recrutement': _date_iso(employee.date_embauche),
        'statut': employee.statut,
        'fonction': employee.poste.nom if employee.poste_id else '',
        'type_contrat': employee.type_contrat.nom if employee.type_contrat_id else '',
        'categorie': employee.categorie.nom if employee.categorie_id else '',
        # SOMIZ ne possède pas ces champs (lieu de naissance : aucune colonne ;
        # téléphone : uniquement via le système de champs personnalisés
        # dynamique, hors périmètre de cette synchro) — envoyés vides plutôt
        # que devinés.
        'lieu_naissance': '',
        'telephone': '',
        'nin': employee.nin,
        'nss': employee.numero_secu_sociale,
        'rib': employee.rib,
        'direction': _direction_payload(employee.direction),
        'pole': _pole_payload(employee.departement.pole) if employee.departement_id and employee.departement.pole_id else None,
        'departement': _departement_payload(employee.departement),
        'service': _service_payload(employee.service),
        'cellule': _cellule_payload(employee.cellule),
        'section': _section_payload(employee.section),
    }


def envoyer_webhook_employe(employee, event):
    """
    Notifie plateforme-sps d'un événement sur un employé (event :
    'employee.created', 'employee.updated' ou 'employee.archived').
    Ne fait rien si l'intégration n'est pas configurée ; n'échoue jamais.
    """
    url = settings.PLATEFORME_SPS_WEBHOOK_URL
    secret = settings.PLATEFORME_SPS_WEBHOOK_SECRET
    if not url or not secret:
        return

    payload = {
        'event': event,
        'employee': _construire_payload_employe(employee),
    }
    body_bytes = json.dumps(payload).encode()
    signature = hmac.new(secret.encode(), body_bytes, hashlib.sha256).hexdigest()

    request = urllib.request.Request(
        url,
        data=body_bytes,
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'X-Somiz-Signature': f'sha256={signature}',
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDES) as response:
            if not (200 <= response.status < 300):
                corps = response.read(TAILLE_MAX_REPONSE_LOGGEE)
                logger.warning(
                    "Webhook plateforme-sps (%s) : réponse %s pour matricule=%s — %s",
                    event, response.status, employee.matricule, corps,
                )
    except urllib.error.HTTPError as exc:
        corps = exc.read(TAILLE_MAX_REPONSE_LOGGEE)
        logger.warning(
            "Webhook plateforme-sps (%s) : échec HTTP %s pour matricule=%s — %s",
            event, exc.code, employee.matricule, corps,
        )
    except Exception as exc:
        logger.warning(
            "Webhook plateforme-sps (%s) : échec d'envoi pour matricule=%s — %s",
            event, employee.matricule, exc,
        )
