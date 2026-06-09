"""
Tests — accounts/permissions.py
Couvre : IsAdmin, IsAdminOrConsultant
"""

import pytest
from unittest.mock import MagicMock
from accounts.permissions import IsAdmin, IsAdminOrConsultant

pytestmark = pytest.mark.django_db


def make_request(role=None, is_authenticated=True, is_active=True):
    request = MagicMock()
    user = MagicMock()
    user.is_authenticated = is_authenticated
    user.is_active = is_active
    user.role = role
    user.is_admin = (role == "ADMIN")
    request.user = user
    return request


class TestIsAdminPermission:
    def setup_method(self):
        self.permission = IsAdmin()

    def test_admin_has_permission(self):
        request = make_request(role="ADMIN")
        assert self.permission.has_permission(request, None) is True

    def test_consultant_denied(self):
        request = make_request(role="CONSULTANT")
        assert self.permission.has_permission(request, None) is False

    def test_unauthenticated_denied(self):
        request = make_request(is_authenticated=False)
        assert self.permission.has_permission(request, None) is False


class TestIsAdminOrConsultantPermission:
    def setup_method(self):
        self.permission = IsAdminOrConsultant()

    def test_admin_has_permission(self):
        request = make_request(role="ADMIN")
        assert self.permission.has_permission(request, None) is True

    def test_consultant_has_permission(self):
        request = make_request(role="CONSULTANT")
        assert self.permission.has_permission(request, None) is True

    def test_unauthenticated_denied(self):
        request = make_request(is_authenticated=False)
        assert self.permission.has_permission(request, None) is False

    def test_inactive_user_denied(self):
        request = make_request(role="CONSULTANT", is_active=False)
        request.user.is_active = False
        assert self.permission.has_permission(request, None) is False
