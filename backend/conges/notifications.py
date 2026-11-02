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


def _traiteurs(demande):
    return [
        u for u in get_user_model().objects.filter(is_active=True, role__in=['ADMIN', 'SUPERADMIN'])
        if u.can_manage_conges and u.pk != demande.demandeur_id
    ]


def notifier_nouvelle_demande(demande):
    """Accord hiérarchique complet : prévient les traiteurs (SUPERADMIN + ADMIN
    chargés des congés, sauf l'auteur) qu'il reste à contrôler et enregistrer,
    et le demandeur que le congé est accordé."""
    notify(
        _traiteurs(demande), Notification.Type.CONGE_NOUVELLE,
        f"Congé {demande.reference} accordé par la hiérarchie : à contrôler et enregistrer", _link(demande),
    )
    _vers_le_demandeur(
        demande, None, Notification.Type.CONGE_NOUVELLE,
        f"Le congé {demande.reference} a été accordé par la hiérarchie",
    )


def notifier_sans_superieur(demande):
    """Aucun responsable désigné au-dessus de l'employé : la demande est
    bloquée ; les traiteurs doivent faire désigner le responsable."""
    notify(
        _traiteurs(demande), Notification.Type.CONGE_NOUVELLE,
        f"Congé {demande.reference} bloqué : aucun supérieur désigné pour {demande.employee} "
        "(à désigner dans l'organigramme)", _link(demande), Notification.Severity.WARNING,
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
            f"Demande de congé {demande.reference} en attente de votre validation", _link(demande),
        )


def notifier_validee(demande, auteur=None, corrections=None):
    """Enregistré par la DRH. Si le chargé des congés a corrigé la saisie, le
    demandeur en est informé (champs corrigés listés)."""
    message = f"Le congé {demande.reference} a été enregistré par la DRH (titre établi)"
    if corrections:
        message += " — informations corrigées : " + ", ".join(CHAMPS_LISIBLES.get(c, c) for c in corrections)
    _vers_le_demandeur(demande, auteur, Notification.Type.CONGE_PRETE, message)


CHAMPS_LISIBLES = {
    'type_conge': 'type de congé', 'motif': 'motif', 'nb_jours': 'nombre de jours',
    'date_depart': 'date de départ', 'date_retour': 'date de retour', 'adresse_conge': 'adresse',
    'observations': 'observations',
}


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
