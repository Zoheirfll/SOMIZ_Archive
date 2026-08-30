"""
Tests — scoping organisation-wide (accounts.models.User.employee_scope_q /
can_access_employee) et son application dans les vues employés/documents/contrats.

Sélection multiple à chaque niveau (scope_directions/departements/services
sont des ManyToMany) — un employé est visible dès qu'il correspond à AU MOINS
un élément choisi, à n'importe quel niveau.
"""

import pytest
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from employees.models import Direction, Departement, Service, EmployeeDocument, Section

pytestmark = pytest.mark.django_db

User = get_user_model()


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


def make_upload_file(name="test.pdf", size=1024):
    from django.core.files.uploadedfile import SimpleUploadedFile
    content = b"%PDF-1.4 " + b"A" * size
    return SimpleUploadedFile(name, content, content_type="application/pdf")


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
    """Consultant sans périmètre assigné par défaut (affecté dans chaque test)."""
    return User.objects.create_user(
        username="scoped_consultant",
        password="ScopedPass123!",
        nom="Scope",
        prenom="Test",
        role="CONSULTANT",
        consent_loi1807_accepted_at=timezone.now(),
    )


class TestEmployeeScopeQ:
    """Tests unitaires sur User.employee_scope_q() / can_access_employee()."""

    def test_admin_unrestricted(self, admin_user, employee):
        assert admin_user.can_access_employee(employee) is True
        assert admin_user.employee_scope_q().children == []

    def test_consultant_no_scope_unrestricted(self, consultant_user, employee):
        """Comportement historique préservé : pas de scope assigné = accès complet."""
        assert consultant_user.can_access_employee(employee) is True

    def test_consultant_matching_service_scope(self, scoped_consultant, employee, service):
        scoped_consultant.scope_services.set([service])
        assert scoped_consultant.can_access_employee(employee) is True

    def test_consultant_mismatched_service_scope(self, scoped_consultant, employee, other_service):
        scoped_consultant.scope_services.set([other_service])
        assert scoped_consultant.can_access_employee(employee) is False

    def test_consultant_matching_direction_scope(self, scoped_consultant, employee, direction):
        scoped_consultant.scope_directions.set([direction])
        assert scoped_consultant.can_access_employee(employee) is True

    def test_consultant_mismatched_direction_scope(self, scoped_consultant, employee, other_direction):
        scoped_consultant.scope_directions.set([other_direction])
        assert scoped_consultant.can_access_employee(employee) is False

    def test_consultant_multiple_directions_one_matches(
        self, scoped_consultant, employee, direction, other_direction
    ):
        """Sélection multiple : accès accordé dès qu'UNE des directions choisies correspond."""
        scoped_consultant.scope_directions.set([other_direction, direction])
        assert scoped_consultant.can_access_employee(employee) is True

    def test_consultant_multiple_directions_none_matches(
        self, scoped_consultant, employee, other_direction
    ):
        other_direction_2 = Direction.objects.create(nom="Direction Tierce", code="DT")
        scoped_consultant.scope_directions.set([other_direction, other_direction_2])
        assert scoped_consultant.can_access_employee(employee) is False

    def test_consultant_mixed_levels_service_matches(
        self, scoped_consultant, employee, service, other_direction
    ):
        """Un service qui correspond suffit même si la direction choisie ne correspond pas."""
        scoped_consultant.scope_directions.set([other_direction])
        scoped_consultant.scope_services.set([service])
        assert scoped_consultant.can_access_employee(employee) is True


class TestEmployeeListScoping:
    def test_list_excludes_out_of_scope_employee(self, scoped_consultant, employee, other_service):
        scoped_consultant.scope_services.set([other_service])
        client = auth_client(scoped_consultant)
        resp = client.get("/api/employees/")
        assert resp.status_code == 200
        ids = [e["id"] for e in resp.data["results"]]
        assert str(employee.pk) not in ids

    def test_list_includes_in_scope_employee(self, scoped_consultant, employee, service):
        scoped_consultant.scope_services.set([service])
        client = auth_client(scoped_consultant)
        resp = client.get("/api/employees/")
        assert resp.status_code == 200
        ids = [e["id"] for e in resp.data["results"]]
        assert str(employee.pk) in ids


class TestEmployeeDetailScoping:
    def test_detail_404_for_out_of_scope(self, scoped_consultant, employee, other_direction):
        scoped_consultant.scope_directions.set([other_direction])
        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/employees/{employee.pk}/")
        assert resp.status_code == 404

    def test_detail_200_for_in_scope(self, scoped_consultant, employee, direction):
        scoped_consultant.scope_directions.set([direction])
        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/employees/{employee.pk}/")
        assert resp.status_code == 200


class TestDocumentViewerScoping:
    def test_document_view_404_for_out_of_scope(
        self, admin_user, scoped_consultant, employee, other_service, type_doc_obligatoire
    ):
        client_admin = auth_client(admin_user)
        pdf = make_upload_file("cin.pdf")
        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client_admin.post(
                f"/api/employees/{employee.pk}/documents/",
                {"files": pdf, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )
        assert resp.status_code == 201
        doc = EmployeeDocument.objects.get(employee=employee)
        file_obj = doc.fichiers.first()

        scoped_consultant.scope_services.set([other_service])
        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/files/{file_obj.pk}/view/")
        assert resp.status_code == 404

    def test_document_view_ok_for_in_scope(
        self, admin_user, scoped_consultant, employee, service, type_doc_obligatoire
    ):
        client_admin = auth_client(admin_user)
        pdf = make_upload_file("cin.pdf")
        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client_admin.post(
                f"/api/employees/{employee.pk}/documents/",
                {"files": pdf, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )
        assert resp.status_code == 201
        doc = EmployeeDocument.objects.get(employee=employee)
        file_obj = doc.fichiers.first()

        scoped_consultant.scope_services.set([service])
        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/files/{file_obj.pk}/view/")
        assert resp.status_code == 200


class TestDocumentViewerViewEndpoint:
    """
    Régression : DocumentViewerView (/api/documents/{id}/view/) référençait
    doc.file/doc.mime_type, des attributs inexistants sur EmployeeDocument
    (le fichier réel vit sur EmployeeDocumentFile) — endpoint cassé depuis
    longtemps, jamais exercé par un test ni par le frontend. Corrigé pour
    servir le premier fichier actif du document, comme FileViewerView.
    """

    def test_document_viewer_serves_first_active_file(
        self, admin_user, employee, type_doc_obligatoire
    ):
        client_admin = auth_client(admin_user)
        pdf = make_upload_file("cin.pdf")
        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client_admin.post(
                f"/api/employees/{employee.pk}/documents/",
                {"files": pdf, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )
        assert resp.status_code == 201
        doc = EmployeeDocument.objects.get(employee=employee)

        resp = client_admin.get(f"/api/documents/{doc.pk}/view/")
        assert resp.status_code == 200
        assert resp["Content-Disposition"].startswith("inline;")

    def test_document_viewer_scoping_still_applies(
        self, admin_user, scoped_consultant, employee, other_service, type_doc_obligatoire
    ):
        client_admin = auth_client(admin_user)
        pdf = make_upload_file("cin.pdf")
        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client_admin.post(
                f"/api/employees/{employee.pk}/documents/",
                {"files": pdf, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )
        assert resp.status_code == 201
        doc = EmployeeDocument.objects.get(employee=employee)

        scoped_consultant.scope_services.set([other_service])
        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/documents/{doc.pk}/view/")
        assert resp.status_code == 404


class TestContratScoping:
    def test_contrat_detail_404_for_out_of_scope(self, scoped_consultant, contrat, other_direction):
        scoped_consultant.scope_directions.set([other_direction])
        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/contrats/{contrat.pk}/")
        assert resp.status_code == 404

    def test_contrat_detail_ok_for_in_scope(self, scoped_consultant, contrat, direction):
        scoped_consultant.scope_directions.set([direction])
        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/contrats/{contrat.pk}/")
        assert resp.status_code == 200

    def test_contrat_list_for_employee_404_for_out_of_scope(self, scoped_consultant, employee, other_direction):
        scoped_consultant.scope_directions.set([other_direction])
        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/employees/{employee.pk}/contrats/")
        assert resp.status_code == 404


class TestUserScopeAdminAPI:
    """L'ADMIN peut assigner/lire le périmètre via /admin-users/."""

    def test_admin_can_set_scope_services(self, admin_user, scoped_consultant, service):
        client = auth_client(admin_user)
        resp = client.patch(
            f"/api/admin-users/{scoped_consultant.pk}/",
            {"scope_services": [str(service.pk)]},
            format="json",
        )
        assert resp.status_code == 200
        scoped_consultant.refresh_from_db()
        assert list(scoped_consultant.scope_services.values_list('id', flat=True)) == [service.pk]

    def test_admin_can_set_multiple_directions(self, admin_user, scoped_consultant, direction, other_direction):
        client = auth_client(admin_user)
        resp = client.patch(
            f"/api/admin-users/{scoped_consultant.pk}/",
            {"scope_directions": [str(direction.pk), str(other_direction.pk)]},
            format="json",
        )
        assert resp.status_code == 200
        scoped_consultant.refresh_from_db()
        ids = set(scoped_consultant.scope_directions.values_list('id', flat=True))
        assert ids == {direction.pk, other_direction.pk}

    def test_admin_can_clear_scope(self, admin_user, scoped_consultant, service):
        scoped_consultant.scope_services.set([service])
        client = auth_client(admin_user)
        resp = client.patch(
            f"/api/admin-users/{scoped_consultant.pk}/",
            {"scope_services": []},
            format="json",
        )
        assert resp.status_code == 200
        scoped_consultant.refresh_from_db()
        assert scoped_consultant.scope_services.count() == 0

    def test_user_list_exposes_scope_names(self, admin_user, scoped_consultant, service):
        scoped_consultant.scope_services.set([service])
        client = auth_client(admin_user)
        resp = client.get("/api/admin-users/")
        assert resp.status_code == 200
        results = resp.data["results"] if "results" in resp.data else resp.data
        found = next(u for u in results if u["id"] == str(scoped_consultant.pk))
        assert found["scope_services_nom"] == [service.nom]


class TestReferentielListScoping:
    """
    /ref/directions/, /ref/departements/, /ref/services/ (utilisés par le
    filtre en cascade de la page Employés) ne doivent proposer que le
    périmètre du CONSULTANT scopé — ADMIN et CONSULTANT non scopé voient tout.
    """

    def test_directions_list_restricted_for_scoped_consultant(
        self, scoped_consultant, direction, other_direction, service
    ):
        scoped_consultant.scope_services.set([service])
        client = auth_client(scoped_consultant)
        resp = client.get("/api/ref/directions/")
        assert resp.status_code == 200
        noms = [d["nom"] for d in (resp.data if isinstance(resp.data, list) else resp.data.get("results"))]
        assert direction.nom in noms
        assert other_direction.nom not in noms

    def test_directions_list_full_for_unrestricted_consultant(
        self, consultant_user, direction, other_direction
    ):
        client = auth_client(consultant_user)
        resp = client.get("/api/ref/directions/")
        assert resp.status_code == 200
        noms = [d["nom"] for d in (resp.data if isinstance(resp.data, list) else resp.data.get("results"))]
        assert direction.nom in noms
        assert other_direction.nom in noms

    def test_directions_list_full_for_admin(self, admin_user, direction, other_direction):
        client = auth_client(admin_user)
        resp = client.get("/api/ref/directions/")
        assert resp.status_code == 200
        noms = [d["nom"] for d in (resp.data if isinstance(resp.data, list) else resp.data.get("results"))]
        assert direction.nom in noms
        assert other_direction.nom in noms

    def test_departements_list_restricted_for_scoped_consultant(
        self, scoped_consultant, departement, other_departement, direction
    ):
        scoped_consultant.scope_directions.set([direction])
        client = auth_client(scoped_consultant)
        resp = client.get("/api/ref/departements/")
        assert resp.status_code == 200
        noms = [d["nom"] for d in (resp.data if isinstance(resp.data, list) else resp.data.get("results"))]
        assert departement.nom in noms
        assert other_departement.nom not in noms

    def test_services_list_restricted_for_scoped_consultant(
        self, scoped_consultant, service, other_service, departement
    ):
        scoped_consultant.scope_departements.set([departement])
        client = auth_client(scoped_consultant)
        resp = client.get("/api/ref/services/")
        assert resp.status_code == 200
        noms = [s["nom"] for s in (resp.data if isinstance(resp.data, list) else resp.data.get("results"))]
        assert service.nom in noms
        assert other_service.nom not in noms


class TestSectionScoping:
    def test_consultant_matching_section_scope(self, scoped_consultant, employee):
        section = Section.objects.create(nom="Section Test", direction=employee.direction)
        employee.section = section
        employee.service = None
        employee.save()
        scoped_consultant.scope_sections.set([section])
        assert scoped_consultant.can_access_employee(employee) is True

    def test_consultant_mismatched_section_scope(self, scoped_consultant, employee, direction):
        other_direction = Direction.objects.create(nom="Direction Section Autre", code="DSA")
        section = Section.objects.create(nom="Section Autre", direction=other_direction)
        scoped_consultant.scope_sections.set([section])
        assert scoped_consultant.can_access_employee(employee) is False

    def test_accessible_sections_qs_unrestricted_by_default(self, consultant_user):
        Section.objects.create(nom="Section X", direction=Direction.objects.create(nom="Dir X", code="DX"))
        assert consultant_user.accessible_sections_qs().count() == Section.objects.count()
