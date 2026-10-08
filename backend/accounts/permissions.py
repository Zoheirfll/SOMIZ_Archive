"""
apps/accounts/permissions.py
Permissions DRF basées sur les rôles SOMIZ
"""

from django.db.models import Q
from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Réservé aux ADMIN uniquement — écriture, suppression, gestion.
    Bloque aussi tout ADMIN qui n'a pas encore consenti au traitement de
    ses données personnelles (Loi 18-07) — voir HasConsented ci-dessous.
    Presque toutes les vues métier fixent permission_classes explicitement
    (IsAdmin/IsAdminOrConsultant), ce qui écrase entièrement
    DEFAULT_PERMISSION_CLASSES : le contrôle de consentement doit donc être
    intégré ici plutôt que compté sur le défaut global pour s'appliquer
    partout."""
    message = "Action réservée aux administrateurs SOMIZ."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.is_admin and
            bool(request.user.consent_loi1807_accepted_at)
        )


class IsAdminOrConsultant(BasePermission):
    """Tout utilisateur authentifié et actif (lecture + écriture selon rôle).
    Bloque aussi tout utilisateur qui n'a pas encore consenti au traitement
    de ses données personnelles (Loi 18-07) — voir HasConsented ci-dessous
    et la note sur IsAdmin."""
    message = "Authentification requise."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.is_active and
            bool(request.user.consent_loi1807_accepted_at)
        )


class HasConsented(BasePermission):
    """Bloque toute requête tant que l'utilisateur n'a pas donné son
    consentement au traitement de ses données personnelles (Loi 18-07,
    Algérie). Un consentement unique à vie par compte — voir
    accounts.models.User.consent_loi1807_accepted_at."""
    message = "Consentement au traitement des données personnelles requis (Loi 18-07)."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.consent_loi1807_accepted_at)


def visible_accounts(queryset, requester):
    """
    Restreint un queryset de comptes à ceux que `requester` a le droit de
    voir/gérer : un ADMIN ordinaire ne voit ni les SUPERADMIN ni les autres
    ADMIN (hors lui-même) — ils sont absents du queryset, donc 404 et non 403
    pour ne pas révéler leur existence. Un SUPERADMIN voit tout.
    Point d'entrée UNIQUE de ce filtre : toute vue qui liste ou retrouve des
    comptes (liste, modification, reset de mot de passe...) doit l'utiliser.
    """
    if requester.is_superadmin:
        return queryset
    return queryset.exclude(role='SUPERADMIN').exclude(
        Q(role='ADMIN') & ~Q(pk=requester.pk)
    )
