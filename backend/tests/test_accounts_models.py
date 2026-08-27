"""
Tests — accounts/models.py
Couvre : UserManager, User, brute-force, propriétés
"""

import pytest
from django.utils import timezone
from datetime import timedelta
from django.contrib.auth import get_user_model

User = get_user_model()
pytestmark = pytest.mark.django_db


class TestUserManager:
    def test_create_user_success(self):
        user = User.objects.create_user(
            username="test_user",
            password="TestPass123!",
            nom="Doe",
            prenom="John",
        )
        assert user.username == "test_user"
        assert user.role == "CONSULTANT"
        assert user.check_password("TestPass123!")
        assert user.is_active is True

    def test_create_user_without_username_raises(self):
        with pytest.raises(ValueError, match="obligatoire"):
            User.objects.create_user(username="", password="pass")

    def test_create_user_custom_role(self):
        user = User.objects.create_user(
            username="admin_x", password="Pass123!", role="ADMIN"
        )
        assert user.role == "ADMIN"

    def test_create_superuser(self):
        user = User.objects.create_superuser(
            username="superadmin", password="SuperPass123!"
        )
        assert user.role == "ADMIN"
        assert user.is_staff is True
        assert user.is_superuser is True

    def test_password_is_hashed(self):
        user = User.objects.create_user(username="hashed", password="MySecret!")
        assert user.password != "MySecret!"
        assert user.check_password("MySecret!")


class TestUserProperties:
    def test_full_name(self, admin_user):
        assert admin_user.full_name == "Test Admin"

    def test_is_admin_true(self, admin_user):
        assert admin_user.is_admin is True

    def test_is_admin_false_for_consultant(self, consultant_user):
        assert consultant_user.is_admin is False

    def test_is_consultant_true(self, consultant_user):
        assert consultant_user.is_consultant is True

    def test_str_representation(self, admin_user):
        result = str(admin_user)
        assert "Admin" in result
        assert "ADMIN" in result


class TestBruteForce:
    def test_is_locked_false_by_default(self, admin_user):
        assert admin_user.is_locked() is False

    def test_register_failed_login_increments(self, admin_user):
        admin_user.register_failed_login()
        admin_user.refresh_from_db()
        assert admin_user.failed_login_attempts == 1

    def test_account_locked_after_max_attempts(self, admin_user):
        for _ in range(5):
            admin_user.register_failed_login()
        admin_user.refresh_from_db()
        assert admin_user.is_locked() is True
        assert admin_user.locked_until is not None

    def test_reset_login_attempts_clears_lock(self, admin_user):
        for _ in range(5):
            admin_user.register_failed_login()
        admin_user.reset_login_attempts()
        admin_user.refresh_from_db()
        assert admin_user.failed_login_attempts == 0
        assert admin_user.locked_until is None
        assert admin_user.is_locked() is False

    def test_is_locked_true_when_within_lockout_period(self, admin_user):
        admin_user.locked_until = timezone.now() + timedelta(minutes=25)
        admin_user.save()
        assert admin_user.is_locked() is True

    def test_is_locked_false_when_lockout_expired(self, admin_user):
        admin_user.locked_until = timezone.now() - timedelta(minutes=1)
        admin_user.save()
        assert admin_user.is_locked() is False


class TestConsentLoi1807:
    def test_new_user_has_no_consent_by_default(self):
        user = User.objects.create_user(
            username="nouveau", password="Pass1234!", nom="N", prenom="N",
        )
        assert user.consent_loi1807_accepted_at is None

    def test_consent_can_be_recorded(self):
        user = User.objects.create_user(
            username="nouveau2", password="Pass1234!", nom="N", prenom="N",
        )
        now = timezone.now()
        user.consent_loi1807_accepted_at = now
        user.save(update_fields=["consent_loi1807_accepted_at"])
        user.refresh_from_db()
        assert user.consent_loi1807_accepted_at is not None
