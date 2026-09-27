import pytest
from rest_framework.test import APIClient
from audit.models import AuditLog

pytestmark = pytest.mark.django_db


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_categorie_employes_archives_filters_out_other_modify_emp_entries(admin_user):
    AuditLog.objects.create(
        user=admin_user, action=AuditLog.Action.MODIFY_EMP,
        target_model='Employee', target_id='x', target_label='Archivé',
        details={'transfer': {'statut': {'de': 'Actif', 'vers': 'Archivé'}}},
    )
    AuditLog.objects.create(
        user=admin_user, action=AuditLog.Action.MODIFY_EMP,
        target_model='Employee', target_id='y', target_label='Transfert',
        details={'transfer': {'poste': {'de': 'A', 'vers': 'B'}}},
    )
    resp = auth_client(admin_user).get('/api/reporting/audit-logs/?categorie=employes_archives')
    assert resp.status_code == 200
    labels = [r['target_label'] for r in resp.data['results']]
    assert labels == ['Archivé']


def test_categorie_documents_supprimes_uses_delete_doc_action(admin_user):
    AuditLog.objects.create(
        user=admin_user, action=AuditLog.Action.DELETE_DOC,
        target_model='EmployeeDocument', target_id='d1', target_label='doc1',
    )
    AuditLog.objects.create(
        user=admin_user, action=AuditLog.Action.MODIFY_DOC,
        target_model='EmployeeDocument', target_id='d2', target_label='doc2',
    )
    resp = auth_client(admin_user).get('/api/reporting/audit-logs/?categorie=documents_supprimes')
    labels = [r['target_label'] for r in resp.data['results']]
    assert labels == ['doc1']


def test_categorie_documents_uploades_uses_upload_action(admin_user):
    AuditLog.objects.create(
        user=admin_user, action=AuditLog.Action.UPLOAD,
        target_model='EmployeeDocument', target_id='d3', target_label='doc3',
    )
    resp = auth_client(admin_user).get('/api/reporting/audit-logs/?categorie=documents_uploades')
    labels = [r['target_label'] for r in resp.data['results']]
    assert labels == ['doc3']


def test_unknown_categorie_is_ignored(admin_user):
    AuditLog.objects.create(
        user=admin_user, action=AuditLog.Action.CREATE_EMP,
        target_model='Employee', target_id='z', target_label='z',
    )
    resp = auth_client(admin_user).get('/api/reporting/audit-logs/?categorie=n_importe_quoi')
    assert resp.status_code == 200
    assert len(resp.data['results']) == 1
