from rest_framework.permissions import BasePermission


class CanManageRegistres(BasePermission):
    """Registres de mouvement et de réception : SUPERADMIN, ou ADMIN portant
    `charge_registre` (User.can_manage_registres, attribuable par un SUPERADMIN
    uniquement). Tout autre compte — dont un chargé des consultations sans ce
    drapeau — est refusé."""
    message = "Vous n'avez pas accès aux registres."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active
            and user.consent_loi1807_accepted_at
            and user.can_manage_registres
        )
