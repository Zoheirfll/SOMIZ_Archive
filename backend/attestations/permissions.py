from rest_framework.permissions import BasePermission


class CanRequestAttestation(BasePermission):
    """GESTIONNAIRE et SUPERADMIN peuvent créer/annuler une demande
    d'attestation — jamais CONSULTANT, ni un ADMIN ordinaire (qui reste
    uniquement traiteur : lui laisser créer ses propres demandes casserait
    la séparation demandeur/traiteur utile à l'audit — un ADMIN pourrait
    sinon être à la fois auteur et validateur de la même demande). Bloque
    aussi tout compte n'ayant pas consenti au traitement Loi 18-07, même
    règle que IsAdmin/IsAdminOrConsultant (accounts/permissions.py)."""
    message = "Seuls les comptes Gestionnaire et Super-administrateur peuvent demander une attestation."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and
            user.consent_loi1807_accepted_at and
            user.role in ('GESTIONNAIRE', 'SUPERADMIN')
        )
