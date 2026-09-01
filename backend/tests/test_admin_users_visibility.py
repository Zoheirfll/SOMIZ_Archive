"""
Tests — accounts/admin_views.py : visibilité des comptes ADMIN/SUPERADMIN
sur /api/admin-users/ (UserListCreateView, UserUpdateView).

Un ADMIN ordinaire ne voit et ne peut administrer que lui-même et les
comptes CONSULTANT. Seul un SUPERADMIN voit et gère tous les comptes
(ADMIN et CONSULTANT).
"""

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
pytestmark = pytest.mark.django_db


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def other_admin(db):
    return User.objects.create_user(
        username="other_admin", password="OtherAdmin123!", nom="Autre", prenom="Admin",
        role="ADMIN", consent_loi1807_accepted_at=timezone.now(),
    )


@pytest.fixture
def superadmin_user(db):
    return User.objects.create_user(
        username="super_test", password="SuperPass123!", nom="Super", prenom="Test",
        role="SUPERADMIN", consent_loi1807_accepted_at=timezone.now(),
    )


class TestUserListVisibility:
    def test_admin_does_not_see_other_admin_in_list(self, admin_user, other_admin, consultant_user):
        resp = auth_client(admin_user).get("/api/admin-users/")
        assert resp.status_code == 200
        data = resp.data.get("results", resp.data)
        ids = {row["id"] for row in data}
        assert str(other_admin.id) not in ids

    def test_admin_sees_itself_in_list(self, admin_user, consultant_user):
        resp = auth_client(admin_user).get("/api/admin-users/")
        data = resp.data.get("results", resp.data)
        ids = {row["id"] for row in data}
        assert str(admin_user.id) in ids

    def test_admin_sees_consultants_in_list(self, admin_user, consultant_user):
        resp = auth_client(admin_user).get("/api/admin-users/")
        data = resp.data.get("results", resp.data)
        ids = {row["id"] for row in data}
        assert str(consultant_user.id) in ids

    def test_admin_does_not_see_superadmin_in_list(self, admin_user, superadmin_user):
        resp = auth_client(admin_user).get("/api/admin-users/")
        data = resp.data.get("results", resp.data)
        ids = {row["id"] for row in data}
        assert str(superadmin_user.id) not in ids

    def test_superadmin_sees_everyone(self, superadmin_user, admin_user, other_admin, consultant_user):
        resp = auth_client(superadmin_user).get("/api/admin-users/")
        data = resp.data.get("results", resp.data)
        ids = {row["id"] for row in data}
        assert {str(admin_user.id), str(other_admin.id), str(consultant_user.id), str(superadmin_user.id)} <= ids


class TestUserDetailVisibility:
    def test_admin_gets_404_on_other_admin_detail(self, admin_user, other_admin):
        resp = auth_client(admin_user).get(f"/api/admin-users/{other_admin.id}/")
        assert resp.status_code == 404

    def test_admin_gets_404_patching_other_admin(self, admin_user, other_admin):
        resp = auth_client(admin_user).patch(f"/api/admin-users/{other_admin.id}/", {"nom": "Hack"}, format="json")
        assert resp.status_code == 404
        other_admin.refresh_from_db()
        assert other_admin.nom == "Autre"

    def test_admin_can_still_access_own_detail(self, admin_user):
        resp = auth_client(admin_user).get(f"/api/admin-users/{admin_user.id}/")
        assert resp.status_code == 200

    def test_superadmin_can_access_other_admin_detail(self, superadmin_user, other_admin):
        resp = auth_client(superadmin_user).get(f"/api/admin-users/{other_admin.id}/")
        assert resp.status_code == 200
