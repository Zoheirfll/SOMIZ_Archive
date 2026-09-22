import pytest
from rest_framework.test import APIClient

from audit.models import AuditLog

pytestmark = pytest.mark.django_db


def test_admin_sees_gestionnaire_actions_in_audit_log(admin_user, gestionnaire_user):
    AuditLog.objects.create(
        user=gestionnaire_user, username_snapshot=gestionnaire_user.username,
        action=AuditLog.Action.CREATE_ATTESTATION, target_label='test',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/reporting/audit-logs/')
    assert resp.status_code == 200
    usernames = [r['username_snapshot'] for r in resp.data['results']]
    assert gestionnaire_user.username in usernames
