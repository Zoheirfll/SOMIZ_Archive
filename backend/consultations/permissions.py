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
            user.can_manage_consultations or user.can_request_consultations
        )


class IsConsultationManager(BasePermission):
    """Traitement (valider, rejeter, révoquer, prolonger) : SUPERADMIN, ou
    ADMIN chargé des consultations."""
    message = "Seuls les comptes chargés des consultations peuvent traiter cette demande."

    def has_permission(self, request, view):
        user = request.user
        return _compte_valide(user) and user.can_manage_consultations


class CanRequestConsultation(BasePermission):
    """Création/annulation : SUPERADMIN, ou GESTIONNAIRE/CONSULTANT dont
    `peut_demander_consultation` est coché (User.can_request_consultations,
    comme pour les attestations, voir CanRequestAttestation). Un ADMIN ordinaire,
    même chargé des consultations, reste uniquement traiteur : séparation
    demandeur/validateur."""
    message = "Vous n'avez pas le droit de demander une consultation d'archives."

    def has_permission(self, request, view):
        user = request.user
        return _compte_valide(user) and user.can_request_consultations
