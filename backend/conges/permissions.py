from rest_framework.permissions import BasePermission


class _ConsentedActiveUser(BasePermission):
    """Base : utilisateur authentifié, actif, ayant consenti (Loi 18-07)."""

    def _ok(self, user):
        return bool(user and user.is_authenticated and user.is_active and user.consent_loi1807_accepted_at)


class CanAccessConges(_ConsentedActiveUser):
    """Accès à l'app : traiteur (SUPERADMIN / ADMIN chargé) ou demandeur autorisé.
    Le filtrage sur ses seules demandes reste fait dans get_queryset/get_object."""
    message = "Vous n'avez pas accès aux demandes de congé."

    def has_permission(self, request, view):
        user = request.user
        return self._ok(user) and (user.can_manage_conges or user.can_request_conges)


class IsCongeManager(_ConsentedActiveUser):
    """Traitement (valider, rejeter, annuler, interrompre, soldes, motifs,
    paramètres, configuration, aperçu PDF, reporting) : SUPERADMIN, ou ADMIN
    portant `charge_conge`."""
    message = "Seuls les comptes chargés des congés peuvent effectuer cette opération."

    def has_permission(self, request, view):
        user = request.user
        return self._ok(user) and user.can_manage_conges


class CanRequestConge(_ConsentedActiveUser):
    """Création / annulation par le demandeur : SUPERADMIN, ou GESTIONNAIRE/
    CONSULTANT avec `peut_demander_conge` — jamais un ADMIN ordinaire
    (séparation demandeur/traiteur utile à l'audit)."""
    message = "Vous n'avez pas le droit de demander un congé."

    def has_permission(self, request, view):
        user = request.user
        return self._ok(user) and user.can_request_conges
