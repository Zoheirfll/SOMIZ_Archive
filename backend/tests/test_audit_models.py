"""
Tests — audit/models.py
Couvre : AuditLog.log(), _get_ip(), username_snapshot, actions
"""

import pytest
from unittest.mock import MagicMock
from audit.models import AuditLog
from django.contrib.auth import get_user_model

User = get_user_model()
pytestmark = pytest.mark.django_db


def make_request(user=None, ip="127.0.0.1", forwarded_for=None, user_agent="TestAgent"):
    request = MagicMock()
    request.user = user or MagicMock(is_authenticated=False)
    request.META = {
        "REMOTE_ADDR": ip,
        "HTTP_USER_AGENT": user_agent,
    }
    if forwarded_for:
        request.META["HTTP_X_FORWARDED_FOR"] = forwarded_for
    if user:
        request.data = {}
    else:
        request.data = {"username": "inconnu"}
    return request


class TestAuditLogCreation:
    def test_log_authenticated_user(self, admin_user):
        request = make_request(user=admin_user)
        log = AuditLog.log(request, AuditLog.Action.LOGIN)
        assert log.pk is not None
        assert log.action == "LOGIN"
        assert log.user == admin_user
        assert log.username_snapshot == "admin_test"

    def test_log_unauthenticated_user(self):
        request = make_request()
        log = AuditLog.log(request, AuditLog.Action.LOGIN_FAIL)
        assert log.user is None
        assert log.username_snapshot == "inconnu"

    def test_log_with_target(self, admin_user, employee):
        request = make_request(user=admin_user)
        log = AuditLog.log(request, AuditLog.Action.VIEW, target=employee)
        assert log.target_model == "Employee"
        assert log.target_id == str(employee.pk)
        assert "EMP-001" in log.target_label

    def test_log_with_details(self, admin_user):
        request = make_request(user=admin_user)
        log = AuditLog.log(
            request, AuditLog.Action.UPLOAD,
            details={"file_count": 2, "type": "CIN"}
        )
        assert log.details["file_count"] == 2
        assert log.details["type"] == "CIN"

    def test_log_no_target_empty_strings(self, admin_user):
        request = make_request(user=admin_user)
        log = AuditLog.log(request, AuditLog.Action.LOGOUT)
        assert log.target_model == ""
        assert log.target_id == ""
        assert log.target_label == ""

    def test_username_snapshot_preserved_on_save(self, admin_user):
        log = AuditLog.objects.create(
            user=admin_user,
            action=AuditLog.Action.LOGIN,
            ip_address="127.0.0.1",
        )
        assert log.username_snapshot == "admin_test"

    def test_str_representation(self, admin_user):
        request = make_request(user=admin_user)
        log = AuditLog.log(request, AuditLog.Action.LOGIN)
        result = str(log)
        assert "admin_test" in result
        assert "LOGIN" in result


class TestGetIp:
    def test_remote_addr(self):
        request = MagicMock()
        request.META = {"REMOTE_ADDR": "192.168.1.1"}
        assert AuditLog._get_ip(request) == "192.168.1.1"

    def test_x_forwarded_for_single(self):
        request = MagicMock()
        request.META = {
            "REMOTE_ADDR": "10.0.0.1",
            "HTTP_X_FORWARDED_FOR": "203.0.113.5",
        }
        assert AuditLog._get_ip(request) == "203.0.113.5"

    def test_x_forwarded_for_multiple(self):
        request = MagicMock()
        request.META = {
            "REMOTE_ADDR": "10.0.0.1",
            "HTTP_X_FORWARDED_FOR": "203.0.113.5, 10.0.0.1, 172.16.0.1",
        }
        assert AuditLog._get_ip(request) == "203.0.113.5"

    def test_no_forwarded_for_uses_remote_addr(self):
        request = MagicMock()
        request.META = {"REMOTE_ADDR": "192.168.0.50"}
        assert AuditLog._get_ip(request) == "192.168.0.50"


class TestAuditActions:
    def test_all_action_choices_exist(self):
        choices = [c[0] for c in AuditLog.Action.choices]
        expected = [
            "VIEW", "UPLOAD", "DELETE_DOC", "MODIFY_DOC",
            "CREATE_EMP", "MODIFY_EMP", "DELETE_EMP",
            "LOGIN", "LOGOUT", "LOGIN_FAIL", "EXPORT"
        ]
        for action in expected:
            assert action in choices

    def test_create_log_for_each_action(self, admin_user):
        request = make_request(user=admin_user)
        for action, _ in AuditLog.Action.choices:
            log = AuditLog.log(request, action)
            assert log.action == action
