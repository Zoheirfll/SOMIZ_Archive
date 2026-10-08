from rest_framework.permissions import BasePermission


def _compte_valide(user):
    return bool(
        user and user.is_authenticated and user.is_active
        and user.consent_loi1807_accepted_at
    )


class CanAccessConsultations(BasePermission):
    """Liste/détail : traiteurs (User.can_manage_consultations) et
    demandeurs (GESTIONNAIRE/CONSULTANT, qui ne voient que leurs demandes —
    filtrées par queryset_pour). Coupe tout le reste, dont un ADMIN sans
    charge_consultation."""
    message = "Vous n'avez pas accès aux demandes de consultation."

    def has_permission(self, request, view):
        user = request.user
        return _compte_valide(user) and (
            user.can_manage_consultations or user.role in ('GESTIONNAIRE', 'CONSULTANT')
        )


class IsConsultationManager(BasePermission):
    """Traitement (valider, rejeter, révoquer, prolonger) : SUPERADMIN, ou
    ADMIN chargé des consultations."""
    message = "Seuls les comptes chargés des consultations peuvent traiter cette demande."

    def has_permission(self, request, view):
        user = request.user
        return _compte_valide(user) and user.can_manage_consultations


class CanRequestConsultation(BasePermission):
    """Création/annulation : GESTIONNAIRE et CONSULTANT uniquement. Un
    traiteur ne crée pas de demande (séparation demandeur/validateur)."""
    message = "Seuls les comptes Gestionnaire et Consultant peuvent demander une consultation."

    def has_permission(self, request, view):
        user = request.user
        return _compte_valide(user) and user.role in ('GESTIONNAIRE', 'CONSULTANT')
