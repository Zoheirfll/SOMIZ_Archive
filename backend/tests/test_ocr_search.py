import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from ocr.models import OcrResult

pytestmark = pytest.mark.django_db


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


def test_employee_list_filters_by_ocr_content(admin_user, employee, employee_document_file):
    OcrResult.objects.create(
        file=employee_document_file, status=OcrResult.Status.DONE,
        raw_text="Attestation de travail — mention rare xyzzy123"
    )
    client = auth_client(admin_user)
    response = client.get('/api/employees/?q_contenu=xyzzy123')
    assert response.status_code == 200
    ids = [e['id'] for e in response.data['results']] if 'results' in response.data else [e['id'] for e in response.data]
    assert str(employee.id) in ids


def test_employee_list_q_contenu_no_match_returns_empty(admin_user, employee, employee_document_file):
    OcrResult.objects.create(
        file=employee_document_file, status=OcrResult.Status.DONE,
        raw_text="Un contenu quelconque"
    )
    client = auth_client(admin_user)
    response = client.get('/api/employees/?q_contenu=introuvable_xyz')
    assert response.status_code == 200
    results = response.data['results'] if 'results' in response.data else response.data
    assert results == []
