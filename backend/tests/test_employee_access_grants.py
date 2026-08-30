"""
Tests — périmètre CONSULTANT "employés spécifiques" (EmployeeAccessGrant)
et son intégration dans User.employee_scope_q / can_access_employee /
accessible_type_doc_ids_for_employee / can_access_document.
"""

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from employees.models import (
    Direction, Departement, Service, EmployeeAccessGrant, TypeDocument,
)

pytestmark = pytest.mark.django_db

User = get_user_model()


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def other_direction(db):
    return Direction.objects.create(nom="Direction Autre", code="DA")


@pytest.fixture
def other_departement(db, other_direction):
    return Departement.objects.create(nom="Logistique", direction=other_direction, code="LOG")


@pytest.fixture
def other_service(db, other_departement):
    return Service.objects.create(nom="Transport", departement=other_departement)


@pytest.fixture
def scoped_consultant(db):
    return User.objects.create_user(
        username="grant_consultant",
        password="ScopedPass123!",
        nom="Grant",
        prenom="Test",
        role="CONSULTANT",
        consent_loi1807_accepted_at=timezone.now(),
    )


class TestEmployeeAccessGrantModel:
    def test_create_full_dossier_grant(self, scoped_consultant, employee):
        grant = EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        assert grant.type_doc_id is None

    def test_create_type_specific_grant(self, scoped_consultant, employee, type_doc_obligatoire):
        grant = EmployeeAccessGrant.objects.create(
            user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire
        )
        assert grant.type_doc_id == type_doc_obligatoire.id


class TestEmployeeScopeQWithGrants:
    def test_grant_gives_access_outside_org_scope(self, scoped_consultant, employee, other_service):
        """Un grant rend l'employé visible même hors du périmètre organisationnel."""
        scoped_consultant.scope_services.set([other_service])
        assert scoped_consultant.can_access_employee(employee) is False
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        assert scoped_consultant.can_access_employee(employee) is True

    def test_grant_reflected_in_employee_scope_q(self, scoped_consultant, employee, other_service):
        from employees.models import Employee
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        assert Employee.objects.filter(scoped_consultant.employee_scope_q()).filter(pk=employee.pk).exists()

    def test_partial_type_grant_still_grants_employee_visibility(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire
    ):
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(
            user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire
        )
        assert scoped_consultant.can_access_employee(employee) is True


class TestAccessibleTypeDocIdsForEmployee:
    def test_admin_unrestricted(self, admin_user, employee):
        assert admin_user.accessible_type_doc_ids_for_employee(employee) is None

    def test_org_scope_no_type_restriction(self, scoped_consultant, employee, service):
        scoped_consultant.scope_services.set([service])
        assert scoped_consultant.accessible_type_doc_ids_for_employee(employee) is None

    def test_full_dossier_grant_unrestricted(self, scoped_consultant, employee, other_service):
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        assert scoped_consultant.accessible_type_doc_ids_for_employee(employee) is None

    def test_partial_grant_restricts_to_granted_type(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_doc_facultatif
    ):
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(
            user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire
        )
        ids = scoped_consultant.accessible_type_doc_ids_for_employee(employee)
        assert ids == {type_doc_obligatoire.id}

    def test_partial_grant_ignored_in_contrat_scope(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire
    ):
        """Un grant type_doc précis ne couvre pas les documents de contrat."""
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(
            user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire
        )
        ids = scoped_consultant.accessible_type_doc_ids_for_employee(employee, contrat_scope=True)
        assert ids == set()

    def test_full_grant_unrestricted_in_contrat_scope(self, scoped_consultant, employee, other_service):
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        assert scoped_consultant.accessible_type_doc_ids_for_employee(employee, contrat_scope=True) is None

    def test_no_access_at_all_gives_empty_set(self, scoped_consultant, employee, other_service):
        scoped_consultant.scope_services.set([other_service])
        assert scoped_consultant.accessible_type_doc_ids_for_employee(employee) == set()


class TestCanAccessDocument:
    def test_org_scope_and_global_type_scope(self, scoped_consultant, employee, service, type_doc_obligatoire):
        scoped_consultant.scope_services.set([service])
        assert scoped_consultant.can_access_document(employee, type_doc_obligatoire.id) is True

    def test_no_access_outside_scope_and_grants(self, scoped_consultant, employee, other_service, type_doc_obligatoire):
        scoped_consultant.scope_services.set([other_service])
        assert scoped_consultant.can_access_document(employee, type_doc_obligatoire.id) is False

    def test_partial_grant_allows_only_that_type(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_doc_facultatif
    ):
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(
            user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire
        )
        assert scoped_consultant.can_access_document(employee, type_doc_obligatoire.id) is True
        assert scoped_consultant.can_access_document(employee, type_doc_facultatif.id) is False


class TestEmployeeGrantsEndpoint:
    def test_admin_can_set_full_dossier_grant(self, admin_user, scoped_consultant, employee):
        client = auth_client(admin_user)
        resp = client.put(
            f"/api/admin-users/{scoped_consultant.id}/employee-grants/",
            {"grants": [{"employee": str(employee.id), "type_doc": None}]},
            format="json",
        )
        assert resp.status_code == 200, resp.data
        assert EmployeeAccessGrant.objects.filter(user=scoped_consultant, employee=employee, type_doc=None).exists()

    def test_admin_can_set_type_specific_grant(self, admin_user, scoped_consultant, employee, type_doc_obligatoire):
        client = auth_client(admin_user)
        resp = client.put(
            f"/api/admin-users/{scoped_consultant.id}/employee-grants/",
            {"grants": [{"employee": str(employee.id), "type_doc": str(type_doc_obligatoire.id)}]},
            format="json",
        )
        assert resp.status_code == 200, resp.data
        assert EmployeeAccessGrant.objects.filter(
            user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire
        ).exists()

    def test_put_replaces_existing_grants(self, admin_user, scoped_consultant, employee):
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        client = auth_client(admin_user)
        resp = client.put(
            f"/api/admin-users/{scoped_consultant.id}/employee-grants/",
            {"grants": []},
            format="json",
        )
        assert resp.status_code == 200
        assert not EmployeeAccessGrant.objects.filter(user=scoped_consultant).exists()

    def test_rejects_categorie_type_doc(self, admin_user, scoped_consultant, employee):
        categorie = TypeDocument.objects.create(nom="État civil", code="ETAT_CIVIL", obligatoire=False)
        TypeDocument.objects.create(nom="Acte de naissance", code="ACTE_NAISS", parent=categorie, obligatoire=False)
        client = auth_client(admin_user)
        resp = client.put(
            f"/api/admin-users/{scoped_consultant.id}/employee-grants/",
            {"grants": [{"employee": str(employee.id), "type_doc": str(categorie.id)}]},
            format="json",
        )
        assert resp.status_code == 400

    def test_consultant_forbidden(self, scoped_consultant, employee):
        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/admin-users/{scoped_consultant.id}/employee-grants/")
        assert resp.status_code == 403

    def test_get_lists_current_grants(self, admin_user, scoped_consultant, employee, type_doc_obligatoire):
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire)
        client = auth_client(admin_user)
        resp = client.get(f"/api/admin-users/{scoped_consultant.id}/employee-grants/")
        assert resp.status_code == 200
        assert len(resp.data["grants"]) == 1
        assert resp.data["grants"][0]["employee_matricule"] == employee.matricule


class TestGrantIntegrationInViews:
    def test_document_list_shows_only_granted_type(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_doc_facultatif
    ):
        from employees.models import EmployeeDocument
        scoped_consultant.scope_services.set([other_service])
        doc1 = EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_obligatoire, uploaded_by=None)
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_facultatif, uploaded_by=None)
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire)

        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/employees/{employee.id}/documents/")
        assert resp.status_code == 200
        ids = [d['id'] for d in resp.data]
        assert str(doc1.id) in ids
        assert len(ids) == 1

    def test_full_dossier_grant_shows_all_documents(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_doc_facultatif
    ):
        from employees.models import EmployeeDocument
        scoped_consultant.scope_services.set([other_service])
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_obligatoire, uploaded_by=None)
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_facultatif, uploaded_by=None)
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)

        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/employees/{employee.id}/documents/")
        assert resp.status_code == 200
        assert len(resp.data) == 2

    def test_employee_detail_documents_respect_partial_grant(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_doc_facultatif
    ):
        from employees.models import EmployeeDocument
        scoped_consultant.scope_services.set([other_service])
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_obligatoire, uploaded_by=None)
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_facultatif, uploaded_by=None)
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire)

        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/employees/{employee.id}/")
        assert resp.status_code == 200
        assert len(resp.data['documents']) == 1
        assert resp.data['documents'][0]['type_doc'] == type_doc_obligatoire.id

    def test_contrat_documents_not_shown_via_partial_dossier_grant(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_contrat
    ):
        from employees.models import EmployeeDocument, Contrat
        scoped_consultant.scope_services.set([other_service])
        contrat = Contrat.objects.create(
            employee=employee, type_contrat=type_contrat,
            numero_contrat="C-001", date_debut="2026-01-01",
        )
        EmployeeDocument.objects.create(
            employee=employee, contrat=contrat, type_doc=type_doc_obligatoire, uploaded_by=None
        )
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire)

        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/contrats/{contrat.id}/documents/")
        assert resp.status_code == 200
        assert resp.data == []

    def test_contrat_documents_shown_via_full_dossier_grant(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_contrat
    ):
        from employees.models import EmployeeDocument, Contrat
        scoped_consultant.scope_services.set([other_service])
        contrat = Contrat.objects.create(
            employee=employee, type_contrat=type_contrat,
            numero_contrat="C-002", date_debut="2026-01-01",
        )
        EmployeeDocument.objects.create(
            employee=employee, contrat=contrat, type_doc=type_doc_obligatoire, uploaded_by=None
        )
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)

        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/contrats/{contrat.id}/documents/")
        assert resp.status_code == 200
        assert len(resp.data) == 1


class TestUserSerializerGrantsCount:
    def test_list_exposes_grants_count(self, admin_user, scoped_consultant, employee):
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        client = auth_client(admin_user)
        resp = client.get("/api/admin-users/")
        assert resp.status_code == 200
        results = resp.data.get('results', resp.data)
        row = next(u for u in results if u['id'] == str(scoped_consultant.id))
        assert row['employee_grants_count'] == 1
