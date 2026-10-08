"""
Tests — AdminResetPasswordView : périmètre de visibilité des comptes.

Un ADMIN ordinaire ne doit ni voir ni modifier un SUPERADMIN ni un autre ADMIN
(UserListCreateView / UserUpdateView.get_queryset : 404). La réinitialisation
de mot de passe doit suivre la même règle, sinon elle permettrait de prendre
le contrôle d'un compte plus privilégié.

Test d'intégration sur la vraie route /api/admin-users/<id>/reset-password/.
"""

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
pytestmark = pytest.mark.django_db

OLD_PASSWORD = "OldPass123!xyz"
PAYLOAD = {"nouveau_mot_de_passe": "NewPass123!xyz", "confirmation": "NewPass123!xyz"}


def _client(user):
    client = APIClient()
    access = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


def _make(username, role):
    return User.objects.create_user(
        username=username, password=OLD_PASSWORD, nom="N", prenom="P", role=role,
        consent_loi1807_accepted_at=timezone.now(),
    )


def _url(pk):
    return f"/api/admin-users/{pk}/reset-password/"


class TestAdminResetPasswordScope:
    def test_admin_cannot_reset_superadmin_password(self, admin_user):
        superadmin = _make("super_test", "SUPERADMIN")
        resp = _client(admin_user).post(_url(superadmin.pk), PAYLOAD)
        superadmin.refresh_from_db()
        assert superadmin.check_password(OLD_PASSWORD), (
            "Le mot de passe d'un SUPERADMIN a été modifié par un ADMIN ordinaire."
        )
        assert resp.status_code == 404

    def test_admin_cannot_reset_other_admin_password(self, admin_user):
        other_admin = _make("autre_admin_test", "ADMIN")
        resp = _client(admin_user).post(_url(other_admin.pk), PAYLOAD)
        other_admin.refresh_from_db()
        assert other_admin.check_password(OLD_PASSWORD), (
            "Le mot de passe d'un autre ADMIN a été modifié par un ADMIN ordinaire."
        )
        assert resp.status_code == 404

    def test_admin_can_still_reset_consultant_password(self, admin_user, consultant_user):
        resp = _client(admin_user).post(_url(consultant_user.pk), PAYLOAD)
        assert resp.status_code == 200
        consultant_user.refresh_from_db()
        assert consultant_user.check_password(PAYLOAD["nouveau_mot_de_passe"])

    def test_superadmin_can_reset_admin_password(self, admin_user):
        superadmin = _make("super_test", "SUPERADMIN")
        resp = _client(superadmin).post(_url(admin_user.pk), PAYLOAD)
        assert resp.status_code == 200
        admin_user.refresh_from_db()
        assert admin_user.check_password(PAYLOAD["nouveau_mot_de_passe"])


class TestAdminResetPasswordCas:
    def test_consultant_and_gestionnaire_forbidden(self, consultant_user, gestionnaire_user):
        cible = _make("cible_test", "CONSULTANT")
        for acteur in (consultant_user, gestionnaire_user):
            resp = _client(acteur).post(_url(cible.pk), PAYLOAD)
            assert resp.status_code == 403
        cible.refresh_from_db()
        assert cible.check_password(OLD_PASSWORD)

    def test_unauthenticated_rejected(self):
        cible = _make("cible_test", "CONSULTANT")
        resp = APIClient().post(_url(cible.pk), PAYLOAD)
        assert resp.status_code in (401, 403)
        cible.refresh_from_db()
        assert cible.check_password(OLD_PASSWORD)

    def test_unknown_pk_returns_404(self, admin_user):
        import uuid
        resp = _client(admin_user).post(_url(uuid.uuid4()), PAYLOAD)
        assert resp.status_code == 404

    def test_admin_can_reset_own_password(self, admin_user):
        resp = _client(admin_user).post(_url(admin_user.pk), PAYLOAD)
        assert resp.status_code == 200
        admin_user.refresh_from_db()
        assert admin_user.check_password(PAYLOAD["nouveau_mot_de_passe"])


class TestAdminResetPasswordAudit:
    def test_success_is_logged_with_roles(self, admin_user, consultant_user):
        from audit.models import AuditLog
        _client(admin_user).post(_url(consultant_user.pk), PAYLOAD)
        log = AuditLog.objects.get(details__action="admin_reset_password")
        assert log.action == AuditLog.Action.MODIFY_EMP
        assert log.details["target_role"] == "CONSULTANT"
        assert log.details["actor_role"] == "ADMIN"

    def test_denied_attempt_is_logged_but_not_counted_as_reset(self, admin_user):
        from audit.models import AuditLog
        superadmin = _make("super_test", "SUPERADMIN")
        resp = _client(admin_user).post(_url(superadmin.pk), PAYLOAD)
        assert resp.status_code == 404
        log = AuditLog.objects.get(details__action="admin_reset_password_denied")
        assert log.action == AuditLog.Action.MODIFY_USER
        assert log.details["actor_role"] == "ADMIN"
        assert not AuditLog.objects.filter(details__action="admin_reset_password").exists()


class TestAdminResetPasswordRevokesSessions:
    """Un reset admin invalide les JWT déjà émis pour le compte ciblé."""

    def test_old_access_token_rejected_after_reset(self, admin_user):
        import time
        cible = _make("cible_test", "CONSULTANT")
        old = _client(cible)
        assert old.get("/api/auth/me/").status_code == 200  # session valide avant
        time.sleep(1.1)  # iat est en secondes entières
        assert _client(admin_user).post(_url(cible.pk), PAYLOAD).status_code == 200
        assert old.get("/api/auth/me/").status_code == 401

    def test_old_refresh_token_rejected_after_reset(self, admin_user):
        import time
        cible = _make("cible_test", "CONSULTANT")
        refresh = str(RefreshToken.for_user(cible))
        time.sleep(1.1)
        _client(admin_user).post(_url(cible.pk), PAYLOAD)
        client = APIClient()
        client.cookies["refresh_token"] = refresh
        assert client.post("/api/auth/refresh/").status_code == 401

    def test_token_issued_after_reset_still_valid(self, admin_user):
        import time
        cible = _make("cible_test", "CONSULTANT")
        time.sleep(1.1)
        _client(admin_user).post(_url(cible.pk), PAYLOAD)
        cible.refresh_from_db()
        new = _client(cible)
        assert new.get("/api/auth/me/").status_code == 200
