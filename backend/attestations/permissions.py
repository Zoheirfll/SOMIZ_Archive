from rest_framework.permissions import BasePermission


class CanRequestAttestation(BasePermission):
    """GESTIONNAIRE, ADMIN et SUPERADMIN peuvent créer/annuler une demande
    d'attestation — jamais CONSULTANT. Bloque aussi tout compte n'ayant pas
    consenti au traitement Loi 18-07, même règle que IsAdmin/
    IsAdminOrConsultant (accounts/permissions.py)."""
    message = "Seuls les comptes Gestionnaire et Administrateur peuvent demander une attestation."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and
            user.consent_loi1807_accepted_at and
            user.role in ('GESTIONNAIRE', 'ADMIN', 'SUPERADMIN')
        )
