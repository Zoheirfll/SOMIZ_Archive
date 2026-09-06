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


def test_global_search_finds_third_party_mentioned_in_document(
    admin_user, employee, employee_document_file
):
    """Le cas d'usage central : un document du dossier de `employee`
    mentionne un tiers (ex. son épouse) qui n'est elle-même jamais
    employée — la recherche doit quand même la retrouver."""
    OcrResult.objects.create(
        file=employee_document_file,
        status=OcrResult.Status.DONE,
        raw_text="Acte de mariage entre Jean DUPONT et son épouse Fatima BENALI, née le 12/05/1990",
    )
    client = auth_client(admin_user)
    response = client.get('/api/ocr/search/?q=Fatima BENALI')
    assert response.status_code == 200
    assert response.data['total'] == 1
    result = response.data['results'][0]
    assert result['employee_matricule'] == employee.matricule
    assert 'Fatima BENALI' in result['snippet']


def test_global_search_no_match_returns_empty(admin_user, employee_document_file):
    OcrResult.objects.create(
        file=employee_document_file, status=OcrResult.Status.DONE, raw_text="texte sans rapport",
    )
    client = auth_client(admin_user)
    response = client.get('/api/ocr/search/?q=introuvable')
    assert response.status_code == 200
    assert response.data['results'] == []
    assert response.data['total'] == 0


def test_global_search_requires_at_least_2_characters(admin_user):
    client = auth_client(admin_user)
    response = client.get('/api/ocr/search/?q=a')
    assert response.status_code == 200
    assert response.data['results'] == []


def test_global_search_snippet_shows_context_around_match(admin_user, employee_document_file):
    long_text = ("x" * 200) + "MOTCLE" + ("y" * 200)
    OcrResult.objects.create(
        file=employee_document_file, status=OcrResult.Status.DONE, raw_text=long_text,
    )
    client = auth_client(admin_user)
    response = client.get('/api/ocr/search/?q=MOTCLE')
    snippet = response.data['results'][0]['snippet']
    assert 'MOTCLE' in snippet
    assert len(snippet) < len(long_text)


def test_global_search_is_case_insensitive(admin_user, employee_document_file):
    OcrResult.objects.create(
        file=employee_document_file, status=OcrResult.Status.DONE, raw_text="Fatima Benali",
    )
    client = auth_client(admin_user)
    response = client.get('/api/ocr/search/?q=fatima benali')
    assert response.data['total'] == 1


def test_global_search_ignores_pending_and_failed_results(admin_user, employee_document_file):
    OcrResult.objects.create(
        file=employee_document_file, status=OcrResult.Status.PENDING, raw_text="Fatima Benali",
    )
    client = auth_client(admin_user)
    response = client.get('/api/ocr/search/?q=Fatima')
    assert response.data['total'] == 0


def test_global_search_forbidden_for_consultant(consultant_user):
    client = auth_client(consultant_user)
    response = client.get('/api/ocr/search/?q=test')
    assert response.status_code in (403, 404)


def test_global_search_logs_audit(admin_user, employee_document_file):
    OcrResult.objects.create(
        file=employee_document_file, status=OcrResult.Status.DONE, raw_text="Fatima Benali",
    )
    client = auth_client(admin_user)
    client.get('/api/ocr/search/?q=Fatima')

    from audit.models import AuditLog
    assert AuditLog.objects.filter(
        action=AuditLog.Action.VIEW, details__action='ocr_global_search'
    ).exists()
