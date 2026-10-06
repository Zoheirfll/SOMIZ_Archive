"""Notifications émises par le workflow des attestations (lot 1 du système
de notifications — voir docs/fonctionnel/notifications.md).

Textes volontairement neutres : seule la référence NNNNN/AA apparaît, jamais
le nom de l'employé concerné.
"""
from django.contrib.auth import get_user_model

from notifications.models import Notification
from notifications.service import notify

from .models import DemandeAttestation


def _link(demande):
    # Référence NNNNN/AA encodée NNNNN-AA dans l'URL (voir ReferenceLookupMixin).
    return f"/attestations/{demande.reference.replace('/', '-')}"


def notifier_nouvelle_demande(demande):
    """Prévient les traiteurs (SUPERADMIN + ADMIN chargés des attestations),
    sauf l'auteur de la demande s'il en fait lui-même partie (SUPERADMIN)."""
    traiteurs = [
        u for u in get_user_model().objects.filter(is_active=True, role__in=['ADMIN', 'SUPERADMIN'])
        if u.can_manage_attestations and u.pk != demande.demandeur_id
    ]
    notify(
        traiteurs, Notification.Type.ATTESTATION_NOUVELLE,
        f"Nouvelle demande d'attestation {demande.reference}", _link(demande),
    )


def notifier_changement_statut(demande, auteur=None):
    """Prévient le demandeur quand sa demande passe à Prête ou Rejetée
    (Récupérée est l'enregistrement d'un retrait physique, pas d'alerte)."""
    if demande.demandeur_id is None or (auteur is not None and auteur.pk == demande.demandeur_id):
        return
    if demande.statut == DemandeAttestation.Statut.PRETE:
        notify(
            [demande.demandeur_id], Notification.Type.ATTESTATION_PRETE,
            f"Votre attestation {demande.reference} est prête à être récupérée",
            _link(demande),
        )
    elif demande.statut == DemandeAttestation.Statut.REJETEE:
        notify(
            [demande.demandeur_id], Notification.Type.ATTESTATION_REJETEE,
            f"Votre demande d'attestation {demande.reference} a été rejetée",
            _link(demande), Notification.Severity.WARNING,
        )
