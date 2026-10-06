"""Point d'entrée unique pour créer des notifications.

Toute source d'événement (attestations, sécurité, employés...) appelle
`notify()` / `notify_role()` — jamais `Notification.objects.create()` en
direct. Garanties : envoi après commit, scoping appliqué à la diffusion,
et une panne ici ne fait jamais échouer l'action métier.
"""
import logging

from django.contrib.auth import get_user_model
from django.db import transaction

from .models import Notification

logger = logging.getLogger(__name__)


def _create(recipient_ids, type, message, link, severity):
    try:
        Notification.objects.bulk_create([
            Notification(recipient_id=uid, type=type, message=message[:255],
                         link=link, severity=severity)
            for uid in recipient_ids
        ])
    except Exception:
        logger.exception("Échec de création de notification (type=%s)", type)


def notify(recipients, type, message, link='', severity=Notification.Severity.INFO):
    """Notifie une liste de comptes (instances User ou ids). Les doublons
    sont ignorés. Création différée à `transaction.on_commit()` : une
    transaction annulée ne laisse pas de notification fantôme."""
    ids = list(dict.fromkeys(getattr(r, 'pk', r) for r in recipients))
    if not ids:
        return
    transaction.on_commit(lambda: _create(ids, type, message, link, severity))


def notify_role(roles, type, message, link='', severity=Notification.Severity.INFO,
                employee=None, exclude=None):
    """Notifie tous les comptes actifs des rôles donnés.

    Si `employee` est fourni, seuls les comptes pour qui
    `can_access_employee(employee)` est vrai sont notifiés (scoping
    CONSULTANT/GESTIONNAIRE). `exclude` : compte à ignorer (typiquement
    l'auteur de l'action, inutile de le notifier de ce qu'il vient de faire).
    """
    try:
        users = get_user_model().objects.filter(is_active=True, role__in=roles)
        if exclude is not None:
            users = users.exclude(pk=getattr(exclude, 'pk', exclude))
        if employee is not None:
            users = [u for u in users if u.can_access_employee(employee)]
    except Exception:
        logger.exception("Échec de résolution des destinataires (type=%s)", type)
        return
    notify(users, type, message, link, severity)
