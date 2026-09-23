from rest_framework.permissions import BasePermission


class CanAccessAttestations(BasePermission):
    """Tout accès à l'app attestations (liste, détail, apercu, statut...) :
    SUPERADMIN toujours, ADMIN uniquement si `charge_attestation` (voir
    User.can_manage_attestations), GESTIONNAIRE pour ses propres demandes
    (le filtrage sur ses seules demandes reste fait dans get_queryset/
    get_object, cette permission ne fait que couper l'accès aux comptes qui
    n'ont clairement rien à faire ici — CONSULTANT, ADMIN non chargé)."""
    message = "Vous n'avez pas accès aux demandes d'attestation de travail."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and
            user.consent_loi1807_accepted_at and
            (user.can_manage_attestations or user.is_gestionnaire)
        )


class IsAttestationManager(BasePermission):
    """Traitement des demandes (changement de statut, scan, aperçu PDF,
    configuration du modèle, reporting) : SUPERADMIN toujours, ADMIN
    uniquement si `charge_attestation` — voir User.can_manage_attestations.
    Un ADMIN non chargé n'a plus aucun accès à ces routes, comme un
    GESTIONNAIRE (qui reste demandeur, jamais traiteur)."""
    message = "Seuls les comptes chargés des attestations peuvent traiter cette demande."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and
            user.consent_loi1807_accepted_at and
            user.can_manage_attestations
        )


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
