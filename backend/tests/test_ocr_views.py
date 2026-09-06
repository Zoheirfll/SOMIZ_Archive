import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from ocr.models import OcrResult
from employees.models import EmployeeChampValeur

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
            {'champ_code': 'NIN', 'valeur': '111111111111111111', 'confiance': 90.0, 'statut': 'en_attente'},
            {'champ_code': 'NIN', 'valeur': '222222222222222222', 'confiance': 90.0, 'statut': 'ignoree'},
        ],
    )
    client = auth_client(admin_user)
    response = client.get(f'/api/ocr/employees/{employee.id}/suggestions/')
    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]['valeur'] == '111111111111111111'


def test_apply_suggestion_for_system_field_writes_employee_column(admin_user, employee, employee_document_file):
    """date_naissance reste une vraie colonne Employee exposée côté UI."""
    result = OcrResult.objects.create(
        file=employee_document_file,
        status=OcrResult.Status.DONE,
        extracted_fields=[
            {'champ_code': 'date_naissance', 'valeur': '15/03/1985', 'confiance': 75.0, 'statut': 'en_attente'},
        ],
    )
    client = auth_client(admin_user)
    response = client.post(f'/api/ocr/suggestions/{result.id}/0/appliquer/')
    assert response.status_code == 200

    import datetime as dt
    employee.refresh_from_db()
    assert employee.date_naissance == dt.date(1985, 3, 15)

    result.refresh_from_db()
    assert result.extracted_fields[0]['statut'] == 'appliquee'

    from audit.models import AuditLog
    assert AuditLog.objects.filter(action=AuditLog.Action.MODIFY_EMP).exists()


def test_apply_suggestion_for_champ_personnalise_writes_employee_champ_valeur(
    admin_user, employee, employee_document_file, champ_personnel_2
):
    """NIN a été migré en ChampPersonnalise (code 'NIN') — voir CLAUDE.md
    section Migration des 4 anciens champs. Une suggestion 'NIN' doit
    écrire dans EmployeeChampValeur, jamais dans la colonne Employee.nin
    orpheline (plus exposée par aucun serializer)."""
    result = OcrResult.objects.create(
        file=employee_document_file,
        status=OcrResult.Status.DONE,
        extracted_fields=[
            {'champ_code': 'NIN', 'valeur': '333333333333333333', 'confiance': 90.0, 'statut': 'en_attente'},
        ],
    )
    client = auth_client(admin_user)
    response = client.post(f'/api/ocr/suggestions/{result.id}/0/appliquer/')
    assert response.status_code == 200

    valeur = EmployeeChampValeur.objects.get(employee=employee, champ=champ_personnel_2)
    assert valeur.valeur == '333333333333333333'

    result.refresh_from_db()
    assert result.extracted_fields[0]['statut'] == 'appliquee'


def test_apply_suggestion_champ_code_case_insensitive(
    admin_user, employee, employee_document_file, champ_personnel_2
):
    """champ_source est un champ texte libre — 'nin' (minuscule) doit
    résoudre le même ChampPersonnalise que 'NIN'."""
    result = OcrResult.objects.create(
        file=employee_document_file,
        status=OcrResult.Status.DONE,
        extracted_fields=[
            {'champ_code': 'nin', 'valeur': '555555555555555555', 'confiance': 90.0, 'statut': 'en_attente'},
        ],
    )
    client = auth_client(admin_user)
    response = client.post(f'/api/ocr/suggestions/{result.id}/0/appliquer/')
    assert response.status_code == 200

    valeur = EmployeeChampValeur.objects.get(employee=employee, champ=champ_personnel_2)
    assert valeur.valeur == '555555555555555555'


def test_ignore_suggestion_does_not_write_anything(admin_user, employee, employee_document_file):
    result = OcrResult.objects.create(
        file=employee_document_file,
        status=OcrResult.Status.DONE,
        extracted_fields=[
            {'champ_code': 'NIN', 'valeur': '444444444444444444', 'confiance': 90.0, 'statut': 'en_attente'},
        ],
    )
    client = auth_client(admin_user)
    response = client.post(f'/api/ocr/suggestions/{result.id}/0/ignorer/')
    assert response.status_code == 200

    assert not EmployeeChampValeur.objects.filter(employee=employee).exists()
    result.refresh_from_db()
    assert result.extracted_fields[0]['statut'] == 'ignoree'


def test_consultant_cannot_access_suggestions(consultant_user, employee, employee_document_file):
    client = auth_client(consultant_user)
    response = client.get(f'/api/ocr/employees/{employee.id}/suggestions/')
    assert response.status_code in (403, 404)
