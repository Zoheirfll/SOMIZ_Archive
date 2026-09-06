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


def test_list_suggestions_returns_only_en_attente(admin_user, employee, employee_document_file):
    OcrResult.objects.create(
        file=employee_document_file,
        status=OcrResult.Status.DONE,
        extracted_fields=[
            {'champ_code': 'nin', 'valeur': '111111111111111111', 'confiance': 90.0, 'statut': 'en_attente'},
            {'champ_code': 'nin', 'valeur': '222222222222222222', 'confiance': 90.0, 'statut': 'ignoree'},
        ],
    )
    client = auth_client(admin_user)
    response = client.get(f'/api/ocr/employees/{employee.id}/suggestions/')
    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]['valeur'] == '111111111111111111'


def test_apply_suggestion_writes_employee_field_and_logs_audit(admin_user, employee, employee_document_file):
    result = OcrResult.objects.create(
        file=employee_document_file,
        status=OcrResult.Status.DONE,
        extracted_fields=[
            {'champ_code': 'nin', 'valeur': '333333333333333333', 'confiance': 90.0, 'statut': 'en_attente'},
        ],
    )
    client = auth_client(admin_user)
    response = client.post(f'/api/ocr/suggestions/{result.id}/0/appliquer/')
    assert response.status_code == 200

    employee.refresh_from_db()
    assert employee.nin == '333333333333333333'

    result.refresh_from_db()
    assert result.extracted_fields[0]['statut'] == 'appliquee'

    from audit.models import AuditLog
    assert AuditLog.objects.filter(action=AuditLog.Action.MODIFY_EMP).exists()


def test_ignore_suggestion_does_not_write_employee_field(admin_user, employee, employee_document_file):
    result = OcrResult.objects.create(
        file=employee_document_file,
        status=OcrResult.Status.DONE,
        extracted_fields=[
            {'champ_code': 'nin', 'valeur': '444444444444444444', 'confiance': 90.0, 'statut': 'en_attente'},
        ],
    )
    client = auth_client(admin_user)
    response = client.post(f'/api/ocr/suggestions/{result.id}/0/ignorer/')
    assert response.status_code == 200

    employee.refresh_from_db()
    assert employee.nin != '444444444444444444'
    result.refresh_from_db()
    assert result.extracted_fields[0]['statut'] == 'ignoree'


def test_consultant_cannot_access_suggestions(consultant_user, employee, employee_document_file):
    client = auth_client(consultant_user)
    response = client.get(f'/api/ocr/employees/{employee.id}/suggestions/')
    assert response.status_code in (403, 404)
