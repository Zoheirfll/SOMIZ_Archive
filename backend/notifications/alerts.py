"""Alertes de sécurité/conformité (lot 2 du système de notifications).

Règle de visibilité alignée sur le journal d'audit : un SUPERADMIN est
toujours alerté ; un ADMIN ordinaire l'est seulement pour les comptes qu'il
administre (ni autre ADMIN, ni SUPERADMIN — il ne les voit même pas dans /users).
"""
from django.contrib.auth import get_user_model

from .models import Notification
from .service import notify


def notifier_compte_verrouille(user):
    """Un compte vient d'être verrouillé par l'anti-brute-force (5 échecs)."""
    roles = ['SUPERADMIN']
    if user.role not in ('ADMIN', 'SUPERADMIN'):
        roles.append('ADMIN')
    destinataires = get_user_model().objects.filter(is_active=True, role__in=roles).exclude(pk=user.pk)
    notify(
        destinataires, Notification.Type.COMPTE_VERROUILLE,
        f"Le compte « {user.username} » a été verrouillé après des échecs de connexion répétés",
        '/users', Notification.Severity.CRITICAL,
    )


# ─── Lot 3 : employés / import / contrats ────────────────────────────────────
# Messages neutres : le matricule (déjà présent dans les URLs, voir
# employeeSlug.js) identifie la fiche, jamais le nom de l'employé.

def _admins(exclude=None):
    qs = get_user_model().objects.filter(is_active=True, role__in=['ADMIN', 'SUPERADMIN'])
    return qs.exclude(pk=exclude.pk) if exclude is not None else qs


def notifier_employe_modifie(employee, changed, auteur=None):
    """Archivage / changement de statut ou transfert organisationnel d'un
    employé. `changed` = dict tracé dans l'audit (clés : champs de transfert,
    'statut', 'motif_archivage'...). Destinataires : ADMIN/SUPERADMIN autres
    que l'auteur, plus les comptes CONSULTANT/GESTIONNAIRE dont le périmètre
    couvre l'employé (scoping appliqué)."""
    lien = f"/employees/{employee.matricule}"
    statut = changed.get('statut')
    if statut and employee.statut != employee.Statut.ACTIF:
        type_, texte = Notification.Type.EMPLOYE_ARCHIVE, f"La fiche {employee.matricule} a changé de statut ({statut['vers']})"
    elif any(k in changed for k in ('direction', 'departement', 'service', 'cellule', 'section', 'pole')):
        type_, texte = Notification.Type.EMPLOYE_TRANSFERE, f"La fiche {employee.matricule} a été transférée"
    else:
        return
    from .service import notify_role
    notify_role(['ADMIN', 'SUPERADMIN', 'CONSULTANT', 'GESTIONNAIRE'], type_, texte, lien,
                employee=employee, exclude=auteur)


def notifier_import_termine(nb_crees, nb_erreurs, auteur):
    """Prévient les autres administrateurs qu'un import d'employés vient de se terminer."""
    if not nb_crees:
        return
    texte = f"Import terminé : {nb_crees} employé(s) créé(s)"
    if nb_erreurs:
        texte += f", {nb_erreurs} ligne(s) en erreur"
    notify(_admins(exclude=auteur), Notification.Type.IMPORT_TERMINE, texte, '/employees')


def notifier_echeances_contrat(jours=30, today=None):
    """Prévient (une seule fois par contrat et par fenêtre de `jours` jours)
    que des contrats actifs d'employés actifs arrivent à échéance dans les
    `jours` prochains jours. Retourne le nombre de contrats notifiés.
    Idempotent : à lancer chaque jour par une tâche planifiée (voir
    `manage.py notifier_echeances_contrat`)."""
    from datetime import timedelta
    from django.utils import timezone
    from employees.models import Contrat, Employee
    from .service import notify_role

    today = today or timezone.localdate()
    depuis = timezone.now() - timedelta(days=jours)
    contrats = Contrat.objects.filter(
        statut=Contrat.Statut.ACTIF, employee__statut=Employee.Statut.ACTIF,
        date_fin__gte=today, date_fin__lte=today + timedelta(days=jours),
    ).select_related('employee')
    n = 0
    for c in contrats:
        lien = f"/contrats/{c.id}"
        if Notification.objects.filter(
            type=Notification.Type.CONTRAT_ECHEANCE, link=lien, created_at__gte=depuis,
        ).exists():
            continue
        reste = (c.date_fin - today).days
        notify_role(
            ['ADMIN', 'SUPERADMIN'], Notification.Type.CONTRAT_ECHEANCE,
            f"Le contrat {c.numero_contrat} arrive à échéance dans {reste} jour(s)",
            lien, Notification.Severity.WARNING if reste <= 7 else Notification.Severity.INFO,
            employee=c.employee,
        )
        n += 1
    return n


def notifier_consentements_en_attente(jours=7, now=None):
    """Alerte (une seule fois par compte, jamais renouvelée) quand un compte
    actif n'a toujours pas donné son consentement Loi 18-07 `jours` jours
    après sa création. Même règle de visibilité que le verrouillage : un
    ADMIN ordinaire n'est alerté que pour les comptes qu'il administre
    (ni ADMIN ni SUPERADMIN). Retourne le nombre de comptes signalés."""
    from datetime import timedelta
    from django.utils import timezone

    now = now or timezone.now()
    User = get_user_model()
    comptes = User.objects.filter(
        is_active=True, consent_loi1807_accepted_at__isnull=True,
        date_joined__lte=now - timedelta(days=jours),
    )
    n = 0
    for u in comptes:
        message = f"Le compte « {u.username} » n'a toujours pas donné son consentement (Loi 18-07)"
        # Dédoublonnage sans limite de temps : une alerte par compte.
        if Notification.objects.filter(
            type=Notification.Type.CONSENTEMENT_EN_ATTENTE, message=message,
        ).exists():
            continue
        roles = ['SUPERADMIN']
        if u.role not in ('ADMIN', 'SUPERADMIN'):
            roles.append('ADMIN')
        destinataires = User.objects.filter(is_active=True, role__in=roles).exclude(pk=u.pk)
        notify(destinataires, Notification.Type.CONSENTEMENT_EN_ATTENTE, message,
               '/users', Notification.Severity.WARNING)
        n += 1
    return n
