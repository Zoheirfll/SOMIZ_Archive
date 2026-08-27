"""
Tests — accounts/views.py
Couvre : LoginView, LogoutView, UserMeView, ChangePasswordView, AdminResetPasswordView
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

User = get_user_model()
pytestmark = pytest.mark.django_db


def get_tokens(user):
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def auth_client(user):
    client = APIClient()
    access, _ = get_tokens(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


LOGIN_URL = "/api/auth/login/"
LOGOUT_URL = "/api/auth/logout/"
ME_URL = "/api/auth/me/"
CHANGE_PWD_URL = "/api/auth/change-password/"


class TestLoginView:
    def test_login_success(self, admin_user):
        client = APIClient()
        resp = client.post(LOGIN_URL, {"username": "admin_test", "password": "AdminPass123!"})
        assert resp.status_code == 200
        assert "user" in resp.data
        assert resp.data["user"]["username"] == "admin_test"
        assert "access_token" in resp.cookies
        assert "refresh_token" in resp.cookies

    def test_login_wrong_password(self, admin_user):
        client = APIClient()
        resp = client.post(LOGIN_URL, {"username": "admin_test", "password": "wrong"})
        assert resp.status_code == 401
        assert "attempts_left" in resp.data

    def test_login_user_not_found(self):
        client = APIClient()
        resp = client.post(LOGIN_URL, {"username": "nobody", "password": "pass"})
        assert resp.status_code == 401

    def test_login_missing_fields(self):
        client = APIClient()
        resp = client.post(LOGIN_URL, {"username": "admin_test"})
        assert resp.status_code == 400

    def test_login_inactive_user(self, admin_user):
        admin_user.is_active = False
        admin_user.save()
        client = APIClient()
        resp = client.post(LOGIN_URL, {"username": "admin_test", "password": "AdminPass123!"})
        assert resp.status_code == 403

    def test_login_locked_account(self, admin_user):
        admin_user.locked_until = timezone.now() + timedelta(minutes=20)
        admin_user.failed_login_attempts = 5
        admin_user.save()
        client = APIClient()
        resp = client.post(LOGIN_URL, {"username": "admin_test", "password": "AdminPass123!"})
        assert resp.status_code == 403
        assert resp.data.get("locked") is True

    def test_login_resets_attempts_on_success(self, admin_user):
        admin_user.failed_login_attempts = 3
        admin_user.save()
        client = APIClient()
        client.post(LOGIN_URL, {"username": "admin_test", "password": "AdminPass123!"})
        admin_user.refresh_from_db()
        assert admin_user.failed_login_attempts == 0

    def test_login_increments_failed_attempts(self, admin_user):
        client = APIClient()
        client.post(LOGIN_URL, {"username": "admin_test", "password": "wrong"})
        admin_user.refresh_from_db()
        assert admin_user.failed_login_attempts == 1


class TestLogoutView:
    def test_logout_success(self, admin_user):
        client = APIClient()
        access, refresh = get_tokens(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = client.post(LOGOUT_URL, {"refresh": refresh})
        assert resp.status_code == 200

    def test_logout_without_refresh_token(self, admin_user):
        client = auth_client(admin_user)
        resp = client.post(LOGOUT_URL, {})
        assert resp.status_code == 200

    def test_logout_requires_authentication(self):
        client = APIClient()
        resp = client.post(LOGOUT_URL, {"refresh": "sometoken"})
        assert resp.status_code == 401

    def test_logout_invalid_token(self, admin_user):
        client = auth_client(admin_user)
        resp = client.post(LOGOUT_URL, {"refresh": "invalidtoken"})
        assert resp.status_code == 200


class TestUserMeView:
    def test_me_returns_user_info(self, admin_user):
        client = auth_client(admin_user)
        resp = client.get(ME_URL)
        assert resp.status_code == 200
        assert resp.data["username"] == "admin_test"
        assert resp.data["is_admin"] is True

    def test_me_requires_authentication(self):
        client = APIClient()
        resp = client.get(ME_URL)
        assert resp.status_code == 401

    def test_me_consultant_is_not_admin(self, consultant_user):
        client = auth_client(consultant_user)
        resp = client.get(ME_URL)
        assert resp.status_code == 200
        assert resp.data["is_admin"] is False


class TestChangePasswordView:
    def test_change_password_success(self, admin_user):
        client = auth_client(admin_user)
        resp = client.post(CHANGE_PWD_URL, {
            "ancien_mot_de_passe": "AdminPass123!",
            "nouveau_mot_de_passe": "NewPass1234!",
            "confirmation": "NewPass1234!",
        })
        assert resp.status_code == 200
        admin_user.refresh_from_db()
        assert admin_user.check_password("NewPass1234!")

    def test_change_password_wrong_old_password(self, admin_user):
        client = auth_client(admin_user)
        resp = client.post(CHANGE_PWD_URL, {
            "ancien_mot_de_passe": "wrong",
            "nouveau_mot_de_passe": "NewPass1234!",
            "confirmation": "NewPass1234!",
        })
        assert resp.status_code == 400

    def test_change_password_mismatch(self, admin_user):
        client = auth_client(admin_user)
        resp = client.post(CHANGE_PWD_URL, {
            "ancien_mot_de_passe": "AdminPass123!",
            "nouveau_mot_de_passe": "NewPass1234!",
            "confirmation": "DifferentPass!",
        })
        assert resp.status_code == 400

    def test_change_password_too_short(self, admin_user):
        client = auth_client(admin_user)
        resp = client.post(CHANGE_PWD_URL, {
            "ancien_mot_de_passe": "AdminPass123!",
            "nouveau_mot_de_passe": "Short1!",
            "confirmation": "Short1!",
        })
        assert resp.status_code == 400

    def test_change_password_missing_fields(self, admin_user):
        client = auth_client(admin_user)
        resp = client.post(CHANGE_PWD_URL, {"ancien_mot_de_passe": "AdminPass123!"})
        assert resp.status_code == 400


class TestAdminResetPasswordView:
    def _reset_url(self, user_id):
        return f"/api/admin-users/{user_id}/reset-password/"

    def test_admin_can_reset_password(self, admin_user, consultant_user):
        client = auth_client(admin_user)
        resp = client.post(self._reset_url(consultant_user.pk), {
            "nouveau_mot_de_passe": "ResetPass123!",
            "confirmation": "ResetPass123!",
        })
        assert resp.status_code == 200
        consultant_user.refresh_from_db()
        assert consultant_user.check_password("ResetPass123!")

    def test_consultant_cannot_reset_password(self, admin_user, consultant_user):
        client = auth_client(consultant_user)
        resp = client.post(self._reset_url(admin_user.pk), {
            "nouveau_mot_de_passe": "ResetPass123!",
            "confirmation": "ResetPass123!",
        })
        assert resp.status_code == 403

    def test_reset_password_too_short(self, admin_user, consultant_user):
        client = auth_client(admin_user)
        resp = client.post(self._reset_url(consultant_user.pk), {
            "nouveau_mot_de_passe": "Short",
            "confirmation": "Short",
        })
        assert resp.status_code == 400

    def test_reset_password_mismatch(self, admin_user, consultant_user):
        client = auth_client(admin_user)
        resp = client.post(self._reset_url(consultant_user.pk), {
            "nouveau_mot_de_passe": "ResetPass123!",
            "confirmation": "OtherPass123!",
        })
        assert resp.status_code == 400

    def test_reset_password_user_not_found(self, admin_user):
        import uuid
        client = auth_client(admin_user)
        resp = client.post(self._reset_url(uuid.uuid4()), {
            "nouveau_mot_de_passe": "ResetPass123!",
            "confirmation": "ResetPass123!",
        })
        assert resp.status_code == 404

    def test_reset_password_clears_lockout(self, admin_user, consultant_user):
        consultant_user.failed_login_attempts = 5
        consultant_user.locked_until = timezone.now() + timedelta(minutes=20)
        consultant_user.save()
        client = auth_client(admin_user)
        client.post(self._reset_url(consultant_user.pk), {
            "nouveau_mot_de_passe": "ResetPass123!",
            "confirmation": "ResetPass123!",
        })
        consultant_user.refresh_from_db()
        assert consultant_user.failed_login_attempts == 0
        assert consultant_user.locked_until is None


class TestHasConsentedIntegration:
    def test_unconsented_user_blocked_on_protected_route(self, db):
        user = User.objects.create_user(
            username="bloque_test", password="Pass1234!", nom="N", prenom="N", role="ADMIN",
        )
        client = auth_client(user)
        resp = client.get("/api/employees/")
        assert resp.status_code == 403

    def test_unconsented_user_can_still_call_me(self, db):
        user = User.objects.create_user(
            username="bloque_me", password="Pass1234!", nom="N", prenom="N",
        )
        client = auth_client(user)
        resp = client.get(ME_URL)
        assert resp.status_code == 200

    def test_unconsented_user_can_still_logout(self, db):
        user = User.objects.create_user(
            username="bloque_logout", password="Pass1234!", nom="N", prenom="N",
        )
        client = auth_client(user)
        resp = client.post(LOGOUT_URL)
        assert resp.status_code == 200

    def test_consented_admin_not_blocked(self, admin_user):
        client = auth_client(admin_user)
        resp = client.get("/api/employees/")
        assert resp.status_code == 200
