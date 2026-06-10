"""
Tests — Contrat API views
Couvre : ContratListCreateView, ContratDetailView, ContratDocumentListUploadView
"""

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from employees.models import Contrat, EmployeeDocument

pytestmark = pytest.mark.django_db


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


def contrats_url(emp_pk):
    return f"/api/employees/{emp_pk}/contrats/"


def contrat_detail_url(pk):
    return f"/api/contrats/{pk}/"


def contrat_docs_url(pk):
    return f"/api/contrats/{pk}/documents/"


class TestContratListCreateView:
    def test_list_requires_auth(self, employee):
        client = APIClient()
        resp = client.get(contrats_url(employee.pk))
        assert resp.status_code == 401

    def test_list_empty(self, admin_user, employee):
        client = auth_client(admin_user)
        resp = client.get(contrats_url(employee.pk))
        assert resp.status_code == 200
        assert resp.data == []

    def test_list_returns_contrats(self, admin_user, employee, contrat):
        client = auth_client(admin_user)
        resp = client.get(contrats_url(employee.pk))
        assert resp.status_code == 200
        assert len(resp.data) == 1
        assert resp.data[0]["numero_contrat"] == "CTR-2024-001"

    def test_consultant_can_list(self, consultant_user, employee, contrat):
        client = auth_client(consultant_user)
        resp = client.get(contrats_url(employee.pk))
        assert resp.status_code == 200

    def test_admin_can_create(self, admin_user, employee, type_contrat):
        client = auth_client(admin_user)
        payload = {
            "numero_contrat": "CTR-NEW-001",
            "type_contrat": str(type_contrat.pk),
            "date_debut": "2024-06-01",
            "statut": "actif",
        }
        resp = client.post(contrats_url(employee.pk), payload, format="json")
        assert resp.status_code == 201
        assert Contrat.objects.filter(numero_contrat="CTR-NEW-001").exists()

    def test_numero_contrat_uppercased(self, admin_user, employee):
        client = auth_client(admin_user)
        payload = {"numero_contrat": "ctr-lower-001", "statut": "actif"}
        resp = client.post(contrats_url(employee.pk), payload, format="json")
        assert resp.status_code == 201
        assert resp.data["numero_contrat"] == "CTR-LOWER-001"

    def test_consultant_cannot_create(self, consultant_user, employee):
        client = auth_client(consultant_user)
        payload = {"numero_contrat": "CTR-DENIED", "statut": "actif"}
        resp = client.post(contrats_url(employee.pk), payload, format="json")
        assert resp.status_code == 403

    def test_duplicate_numero_contrat_fails(self, admin_user, employee, contrat):
        client = auth_client(admin_user)
        payload = {"numero_contrat": "CTR-2024-001", "statut": "actif"}
        resp = client.post(contrats_url(employee.pk), payload, format="json")
        assert resp.status_code == 400

    def test_missing_numero_contrat_fails(self, admin_user, employee):
        client = auth_client(admin_user)
        resp = client.post(contrats_url(employee.pk), {"statut": "actif"}, format="json")
        assert resp.status_code == 400

    def test_employee_not_found_returns_404(self, admin_user):
        import uuid
        client = auth_client(admin_user)
        resp = client.get(contrats_url(uuid.uuid4()))
        assert resp.status_code == 404


class TestContratDetailView:
    def test_get_contrat_detail(self, admin_user, contrat):
        client = auth_client(admin_user)
        resp = client.get(contrat_detail_url(contrat.pk))
        assert resp.status_code == 200
        assert resp.data["numero_contrat"] == "CTR-2024-001"
        assert "employee_matricule" in resp.data
        assert "documents" in resp.data

    def test_consultant_can_view(self, consultant_user, contrat):
        client = auth_client(consultant_user)
        resp = client.get(contrat_detail_url(contrat.pk))
        assert resp.status_code == 200

    def test_admin_can_patch(self, admin_user, contrat):
        client = auth_client(admin_user)
        resp = client.patch(
            contrat_detail_url(contrat.pk),
            {"statut": "termine"},
            format="json",
        )
        assert resp.status_code == 200
        contrat.refresh_from_db()
        assert contrat.statut == "termine"

    def test_consultant_cannot_patch(self, consultant_user, contrat):
        client = auth_client(consultant_user)
        resp = client.patch(
            contrat_detail_url(contrat.pk),
            {"statut": "termine"},
            format="json",
        )
        assert resp.status_code == 403

    def test_admin_can_delete(self, admin_user, contrat):
        pk = contrat.pk
        client = auth_client(admin_user)
        resp = client.delete(contrat_detail_url(pk))
        assert resp.status_code == 204
        assert not Contrat.objects.filter(pk=pk).exists()

    def test_consultant_cannot_delete(self, consultant_user, contrat):
        client = auth_client(consultant_user)
        resp = client.delete(contrat_detail_url(contrat.pk))
        assert resp.status_code == 403

    def test_not_found_returns_404(self, admin_user):
        import uuid
        client = auth_client(admin_user)
        resp = client.get(contrat_detail_url(uuid.uuid4()))
        assert resp.status_code == 404


class TestContratDocumentListView:
    def test_list_documents_empty(self, admin_user, contrat):
        client = auth_client(admin_user)
        resp = client.get(contrat_docs_url(contrat.pk))
        assert resp.status_code == 200
        assert resp.data == []

    def test_list_documents_with_doc(self, admin_user, contrat, type_doc_obligatoire):
        EmployeeDocument.objects.create(
            employee=contrat.employee,
            contrat=contrat,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        client = auth_client(admin_user)
        resp = client.get(contrat_docs_url(contrat.pk))
        assert resp.status_code == 200
        assert len(resp.data) == 1

    def test_consultant_can_list_docs(self, consultant_user, contrat):
        client = auth_client(consultant_user)
        resp = client.get(contrat_docs_url(contrat.pk))
        assert resp.status_code == 200

    def test_upload_no_files_returns_400(self, admin_user, contrat, type_doc_obligatoire):
        client = auth_client(admin_user)
        resp = client.post(
            contrat_docs_url(contrat.pk),
            {"type_doc": str(type_doc_obligatoire.pk)},
            format="multipart",
        )
        assert resp.status_code == 400

    def test_consultant_cannot_upload(self, consultant_user, contrat, type_doc_obligatoire):
        client = auth_client(consultant_user)
        resp = client.post(
            contrat_docs_url(contrat.pk),
            {"type_doc": str(type_doc_obligatoire.pk)},
            format="multipart",
        )
        assert resp.status_code == 403

    def test_contrat_not_found_returns_404(self, admin_user):
        import uuid
        client = auth_client(admin_user)
        resp = client.get(contrat_docs_url(uuid.uuid4()))
        assert resp.status_code == 404
