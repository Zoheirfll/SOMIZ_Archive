"""Notifications du workflow des consultations. Textes volontairement
neutres : seule la référence C-NNNNN/AA apparaît (jamais la description ni
le nom d'un employé)."""
from django.contrib.auth import get_user_model

from notifications.models import Notification
from notifications.service import notify


def _link(demande):
    return f"/consultations/{demande.reference.replace('/', '-')}"


def traiteurs_actifs():
    return [
        u for u in get_user_model().objects.filter(is_active=True, role__in=['ADMIN', 'SUPERADMIN'])
        if u.can_manage_consultations
    ]


def notifier_nouvelle_demande(demande):
    notify(
        [u for u in traiteurs_actifs() if u.pk != demande.demandeur_id],
        Notification.Type.CONSULTATION_NOUVELLE,
        f"Nouvelle demande de consultation {demande.reference}", _link(demande),
    )


def _vers_demandeur(demande, auteur, type_notif, message, severity=Notification.Severity.INFO):
    if auteur is not None and auteur.pk == demande.demandeur_id:
        return
    notify([demande.demandeur_id], type_notif, message, _link(demande), severity)


def notifier_validee(demande, auteur=None):
    _vers_demandeur(
        demande, auteur, Notification.Type.CONSULTATION_VALIDEE,
        f"Votre demande de consultation {demande.reference} est validée",
    )


def notifier_rejetee(demande, auteur=None):
    _vers_demandeur(
        demande, auteur, Notification.Type.CONSULTATION_REJETEE,
        f"Votre demande de consultation {demande.reference} a été rejetée",
        Notification.Severity.WARNING,
    )


def notifier_revoquee(demande, auteur=None):
    _vers_demandeur(
        demande, auteur, Notification.Type.CONSULTATION_REVOQUEE,
        f"La consultation {demande.reference} a été révoquée",
        Notification.Severity.WARNING,
    )


def notifier_prolongee(demande, auteur=None):
    _vers_demandeur(
        demande, auteur, Notification.Type.CONSULTATION_PROLONGEE,
        f"La consultation {demande.reference} a été prolongée",
    )


def notifier_echeance(demande, libelle_seuil):
    """Rappel avant échéance, au demandeur et au traiteur de la demande."""
    destinataires = [demande.demandeur_id]
    if demande.traite_par_id:
        destinataires.append(demande.traite_par_id)
    notify(
        destinataires, Notification.Type.CONSULTATION_ECHEANCE,
        f"La consultation {demande.reference} expire dans moins de {libelle_seuil}",
        _link(demande), Notification.Severity.WARNING,
    )
