"""Notifications du workflow des congés (voir docs/fonctionnel/notifications.md).
Textes neutres : seule la référence NNNNN/AA apparaît, jamais le nom de l'employé."""
from django.contrib.auth import get_user_model

from notifications.models import Notification
from notifications.service import notify


def _link(demande):
    return f"/conges/{demande.reference.replace('/', '-')}"


def _vers_le_demandeur(demande, auteur, type_notif, message, severite=None):
    if demande.demandeur_id is None or (auteur is not None and auteur.pk == demande.demandeur_id):
        return
    args = [[demande.demandeur_id], type_notif, message, _link(demande)]
    if severite is not None:
        args.append(severite)
    notify(*args)


def notifier_nouvelle_demande(demande):
    """Prévient les traiteurs (SUPERADMIN + ADMIN chargés des congés), sauf l'auteur."""
    traiteurs = [
        u for u in get_user_model().objects.filter(is_active=True, role__in=['ADMIN', 'SUPERADMIN'])
        if u.can_manage_conges and u.pk != demande.demandeur_id
    ]
    notify(
        traiteurs, Notification.Type.CONGE_NOUVELLE,
        f"Nouvelle demande de congé {demande.reference}", _link(demande),
    )


def notifier_visa_requis(demande, auteur=None):
    """Prévient les responsables de la chaîne dont le visa est attendu (dès la
    création : un niveau supérieur peut viser sans attendre le niveau inférieur)."""
    from . import visas as visas_service
    comptes = []
    for v in demande.visas.all():
        if v.decision != 'en_attente':
            continue
        # Le titulaire et, s'il y en a un en cours, l'intérimaire de l'unité.
        candidats = ([v.compte_id] if v.compte_id else []) + [c.pk for c in visas_service.interimaires_actifs(v)]
        comptes += [c for c in candidats if auteur is None or c != auteur.pk]
    if comptes:
        notify(
            comptes, Notification.Type.CONGE_NOUVELLE,
            f"Demande de congé {demande.reference} en attente de votre visa", _link(demande),
        )


def notifier_validee(demande, auteur=None):
    _vers_le_demandeur(
        demande, auteur, Notification.Type.CONGE_PRETE,
        f"Votre titre de congé {demande.reference} est prêt à être récupéré",
    )


def notifier_rejetee(demande, auteur=None):
    _vers_le_demandeur(
        demande, auteur, Notification.Type.CONGE_REJETEE,
        f"Votre demande de congé {demande.reference} a été rejetée",
        Notification.Severity.WARNING,
    )


def notifier_annulee(demande, auteur=None):
    _vers_le_demandeur(
        demande, auteur, Notification.Type.CONGE_ANNULEE,
        f"Le titre de congé {demande.reference} a été annulé",
        Notification.Severity.WARNING,
    )


def notifier_interrompue(demande, auteur=None):
    _vers_le_demandeur(
        demande, auteur, Notification.Type.CONGE_INTERROMPUE,
        f"Le congé {demande.reference} a été interrompu",
        Notification.Severity.WARNING,
    )
