"""
apps/accounts/permissions.py
Permissions DRF basées sur les rôles SOMIZ
"""

from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Réservé aux ADMIN uniquement — écriture, suppression, gestion."""
    message = "Action réservée aux administrateurs SOMIZ."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.is_admin
        )


class IsAdminOrConsultant(BasePermission):
    """Tout utilisateur authentifié et actif (lecture + écriture selon rôle)."""
    message = "Authentification requise."

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.is_active
        )
