"""Un GESTIONNAIRE ne consulte jamais de document (2026-10-28) : il fait des
demandes. Vérifié sur de vraies routes métier, même avec périmètre complet,
types de documents cochés et grant « dossier complet »."""
import pytest
from rest_framework.test import APIClient

from employees.models import EmployeeAccessGrant

pytestmark = pytest.mark.django_db


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _donner_tous_les_acces(user, employee, type_doc):
    user.scope_directions.add(employee.service.departement.direction)
    user.scope_types_documents.add(type_doc)
    EmployeeAccessGrant.objects.create(user=user, employee=employee, type_doc=None, champ_personnel=None)


def test_gestionnaire_liste_documents_vide_malgre_acces(gestionnaire_user, employee, employee_document_file, type_doc_facultatif):
    _donner_tous_les_acces(gestionnaire_user, employee, type_doc_facultatif)
    resp = _client(gestionnaire_user).get(f'/api/employees/{employee.pk}/documents/')
    assert resp.status_code == 200
    assert resp.data == []


def test_gestionnaire_ne_peut_pas_visualiser_un_document(gestionnaire_user, employee, employee_document_file, type_doc_facultatif):
    _donner_tous_les_acces(gestionnaire_user, employee, type_doc_facultatif)
    resp = _client(gestionnaire_user).get(f'/api/documents/{employee_document_file.document_id}/view/')
    assert resp.status_code == 404


def test_consultant_avec_acces_voit_toujours_le_document(consultant_user, employee, employee_document_file, type_doc_facultatif):
    _donner_tous_les_acces(consultant_user, employee, type_doc_facultatif)
    resp = _client(consultant_user).get(f'/api/employees/{employee.pk}/documents/')
    assert resp.status_code == 200
    assert len(resp.data) == 1


def test_gestionnaire_ne_peut_pas_ouvrir_le_detail_d_un_contrat(gestionnaire_user, contrat):
    gestionnaire_user.scope_directions.add(contrat.employee.service.departement.direction)
    assert _client(gestionnaire_user).get(f'/api/contrats/{contrat.pk}/').status_code == 404


def test_consultant_ouvre_le_detail_d_un_contrat(consultant_user, contrat):
    consultant_user.scope_directions.add(contrat.employee.service.departement.direction)
    assert _client(consultant_user).get(f'/api/contrats/{contrat.pk}/').status_code == 200
