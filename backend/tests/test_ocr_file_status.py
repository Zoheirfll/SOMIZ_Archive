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


def test_document_file_exposes_ocr_status(admin_user, employee, employee_document_file):
    OcrResult.objects.create(file=employee_document_file, status=OcrResult.Status.DONE)
    client = auth_client(admin_user)
    response = client.get(f'/api/employees/{employee.id}/documents/')
    fichier = response.data[0]['fichiers'][0]
    assert fichier['ocr_status'] == 'done'


def test_document_file_ocr_status_is_null_without_result(admin_user, employee, employee_document_file):
    client = auth_client(admin_user)
    response = client.get(f'/api/employees/{employee.id}/documents/')
    fichier = response.data[0]['fichiers'][0]
    assert fichier['ocr_status'] is None
