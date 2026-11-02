# backend/employees/sortie.py
"""Règles de la date de sortie d'un employé — seule source de vérité,
utilisée par le formulaire (serializer), l'archivage en masse et l'import."""
from datetime import date, datetime

from django.utils import timezone

MSG_OBLIGATOIRE = "La date de sortie est obligatoire pour archiver un employé."


def lire_date(valeur):
    """date | None depuis une date, un datetime (cellule Excel) ou une chaîne
    'AAAA-MM-JJ'. Vide → None ; illisible → ValueError."""
    if valeur in (None, ''):
        return None
    if isinstance(valeur, datetime):
        return valeur.date()
    if isinstance(valeur, date):
        return valeur
    return date.fromisoformat(str(valeur).strip()[:10])


def erreur_date_sortie(date_sortie, date_embauche=None):
    """Message d'erreur, ou None si la date est acceptable."""
    if date_sortie > timezone.localdate():
        return "La date de sortie ne peut pas être dans le futur."
    if date_embauche and date_sortie < date_embauche:
        return "La date de sortie précède la date de recrutement."
    return None


def desactiver_comptes_lies(employee_ids, request=None):
    """Sortie d'un employé (statut inactif/archivé/démobilisé) : son compte
    SOMIZ lié (User.employee) est désactivé et ses sessions révoquées
    (password_changed_at — voir accounts/cookie_auth.is_token_revoked), pour
    qu'un départ ne laisse jamais de compte actif (2026-10-31, securite.md
    point 55). Le SUPERADMIN est exempté (compte de secours). Tracé dans
    l'audit (MODIFY_USER). Renvoie le nombre de comptes désactivés."""
    from accounts.models import User
    from audit.models import AuditLog

    comptes = list(User.objects.filter(employee_id__in=list(employee_ids), is_active=True)
                   .exclude(role=User.Role.SUPERADMIN).select_related('employee'))
    maintenant = timezone.now()
    for compte in comptes:
        compte.is_active = False
        compte.password_changed_at = maintenant
        compte.save(update_fields=['is_active', 'password_changed_at'])
        acteur = getattr(request, 'user', None) if request else None
        AuditLog.objects.create(
            user=acteur if acteur and acteur.is_authenticated else None,
            username_snapshot=acteur.username if acteur and acteur.is_authenticated else 'système',
            action=AuditLog.Action.MODIFY_USER, target_model='User', target_id=str(compte.pk),
            target_label=compte.username,
            ip_address=AuditLog._get_ip(request) if request else None,
            details={'action': 'desactivation_sortie_employe', 'employee': compte.employee.matricule,
                     'statut_employe': compte.employee.statut},
        )
    return len(comptes)
