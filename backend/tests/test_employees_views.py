"""
Tests — employees/views.py
Couvre : EmployeeListCreateView, EmployeeDetailView, employee_search, EmployeeBulkDeleteView
"""

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from employees.models import Employee, EmployeeDocument

pytestmark = pytest.mark.django_db

EMPLOYEES_URL = "/api/employees/"
SEARCH_URL = "/api/employees/search/"


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


def employee_url(pk):
    return f"/api/employees/{pk}/"


class TestEmployeeListView:
    def test_list_requires_authentication(self):
        client = APIClient()
        resp = client.get(EMPLOYEES_URL)
        assert resp.status_code == 401

    def test_list_returns_employees(self, admin_user, employee):
        client = auth_client(admin_user)
        resp = client.get(EMPLOYEES_URL)
        assert resp.status_code == 200
        assert resp.data["count"] >= 1

    def test_list_consultant_can_read(self, consultant_user, employee):
        client = auth_client(consultant_user)
        resp = client.get(EMPLOYEES_URL)
        assert resp.status_code == 200

    def test_search_by_name(self, admin_user, employee):
        client = auth_client(admin_user)
        resp = client.get(EMPLOYEES_URL, {"q": "Dupont"})
        assert resp.status_code == 200
        assert any(e["nom"] == "Dupont" for e in resp.data["results"])

    def test_search_no_results(self, admin_user, employee):
        client = auth_client(admin_user)
        resp = client.get(EMPLOYEES_URL, {"q": "xxxxxxinexistantxxxxxx"})
        assert resp.data["count"] == 0

    def test_filter_by_statut_actif(self, admin_user, employee):
        client = auth_client(admin_user)
        resp = client.get(EMPLOYEES_URL, {"statut": "actif"})
        assert resp.status_code == 200
        assert all(e["statut"] == "actif" for e in resp.data["results"])

    def test_filter_by_statut_archive(self, admin_user, employee):
        employee.statut = "archive"
        employee.save()
        client = auth_client(admin_user)
        resp = client.get(EMPLOYEES_URL, {"statut": "archive"})
        assert any(e["statut"] == "archive" for e in resp.data["results"])

    def test_filter_dossier_complet_true_excludes_incomplet(
        self, admin_user, employee, type_doc_obligatoire
    ):
        # employee n'a pas le document obligatoire -> dossier incomplet
        client = auth_client(admin_user)
        resp = client.get(EMPLOYEES_URL, {"dossier_complet": "true"})
        assert resp.status_code == 200
        assert not any(e["id"] == str(employee.id) for e in resp.data["results"])

    def test_filter_dossier_complet_true_includes_complet(
        self, admin_user, employee, type_doc_obligatoire
    ):
        EmployeeDocument.objects.create(
            employee=employee, type_doc=type_doc_obligatoire, uploaded_by=admin_user
        )
        client = auth_client(admin_user)
        resp = client.get(EMPLOYEES_URL, {"dossier_complet": "true"})
        assert any(e["id"] == str(employee.id) for e in resp.data["results"])

    def test_filter_dossier_complet_false_includes_incomplet(
        self, admin_user, employee, type_doc_obligatoire
    ):
        client = auth_client(admin_user)
        resp = client.get(EMPLOYEES_URL, {"dossier_complet": "false"})
        assert any(e["id"] == str(employee.id) for e in resp.data["results"])

    def test_filter_dossier_complet_false_excludes_complet(
        self, admin_user, employee, type_doc_obligatoire
    ):
        EmployeeDocument.objects.create(
            employee=employee, type_doc=type_doc_obligatoire, uploaded_by=admin_user
        )
        client = auth_client(admin_user)
        resp = client.get(EMPLOYEES_URL, {"dossier_complet": "false"})
        assert not any(e["id"] == str(employee.id) for e in resp.data["results"])

    def test_filter_type_manquant_excludes_employee_who_has_the_type(
        self, admin_user, employee, type_doc_facultatif
    ):
        EmployeeDocument.objects.create(
            employee=employee, type_doc=type_doc_facultatif, uploaded_by=admin_user
        )
        client = auth_client(admin_user)
        resp = client.get(EMPLOYEES_URL, {"type_manquant": type_doc_facultatif.code})
        assert not any(e["id"] == str(employee.id) for e in resp.data["results"])

    def test_filter_type_manquant_includes_employee_missing_the_type(
        self, admin_user, employee, type_doc_facultatif
    ):
        client = auth_client(admin_user)
        resp = client.get(EMPLOYEES_URL, {"type_manquant": type_doc_facultatif.code})
        assert any(e["id"] == str(employee.id) for e in resp.data["results"])


class TestEmployeeCreateView:
    def _payload(self):
        return {
            "matricule": "EMP-NEW",
            "nom": "Martin",
            "prenom": "Marie",
            "statut": "actif",
        }

    def test_admin_can_create(self, admin_user):
        client = auth_client(admin_user)
        resp = client.post(EMPLOYEES_URL, self._payload(), format="json")
        assert resp.status_code == 201
        assert Employee.objects.filter(matricule="EMP-NEW").exists()

    def test_consultant_cannot_create(self, consultant_user):
        client = auth_client(consultant_user)
        resp = client.post(EMPLOYEES_URL, self._payload(), format="json")
        assert resp.status_code == 403

    def test_create_duplicate_matricule_fails(self, admin_user, employee):
        client = auth_client(admin_user)
        payload = self._payload()
        payload["matricule"] = "EMP-001"
        resp = client.post(EMPLOYEES_URL, payload, format="json")
        assert resp.status_code == 400

    def test_create_missing_matricule_fails(self, admin_user):
        client = auth_client(admin_user)
        resp = client.post(EMPLOYEES_URL, {"nom": "Test"}, format="json")
        assert resp.status_code == 400


class TestEmployeeDetailView:
    def test_get_employee(self, admin_user, employee):
        client = auth_client(admin_user)
        resp = client.get(employee_url(employee.pk))
        assert resp.status_code == 200
        assert resp.data["matricule"] == "EMP-001"

    def test_get_employee_not_found(self, admin_user):
        import uuid
        client = auth_client(admin_user)
        resp = client.get(employee_url(uuid.uuid4()))
        assert resp.status_code == 404

    def test_consultant_can_view_detail(self, consultant_user, employee):
        client = auth_client(consultant_user)
        resp = client.get(employee_url(employee.pk))
        assert resp.status_code == 200

    def test_admin_can_patch(self, admin_user, employee):
        client = auth_client(admin_user)
        resp = client.patch(employee_url(employee.pk), {"nom": "Durand"}, format="json")
        assert resp.status_code == 200
        employee.refresh_from_db()
        assert employee.nom == "DURAND"

    def test_consultant_cannot_patch(self, consultant_user, employee):
        client = auth_client(consultant_user)
        resp = client.patch(employee_url(employee.pk), {"nom": "Durand"}, format="json")
        assert resp.status_code == 403

    def test_patch_service_logs_transfer_detail(self, admin_user, employee, departement):
        """Changer le service d'un employé (transfert) doit apparaître
        dans l'audit log avec l'ancien et le nouveau nom de service."""
        from employees.models import Service
        from audit.models import AuditLog
        nouveau_service = Service.objects.create(nom="Comptabilité", departement=departement)
        ancien_service_nom = employee.service.nom
        client = auth_client(admin_user)
        resp = client.patch(
            employee_url(employee.pk), {"service": str(nouveau_service.id)}, format="json"
        )
        assert resp.status_code == 200
        log = AuditLog.objects.filter(
            action=AuditLog.Action.MODIFY_EMP, target_id=str(employee.pk)
        ).order_by('-timestamp').first()
        assert log is not None
        assert log.details.get("transfer", {}).get("service") == {
            "de": ancien_service_nom,
            "vers": "Comptabilité",
        }
        # Un champ non modifié ne doit pas apparaître dans "transfer".
        assert "direction" not in log.details.get("transfer", {})

    def test_patch_without_org_change_has_no_transfer_detail(self, admin_user, employee):
        """Une modification qui ne touche pas l'affectation organisationnelle
        (ex: juste le nom) ne doit pas produire de clé 'transfer'."""
        from audit.models import AuditLog
        client = auth_client(admin_user)
        resp = client.patch(employee_url(employee.pk), {"nom": "Martin"}, format="json")
        assert resp.status_code == 200
        log = AuditLog.objects.filter(
            action=AuditLog.Action.MODIFY_EMP, target_id=str(employee.pk)
        ).order_by('-timestamp').first()
        assert "transfer" not in log.details

    def test_admin_delete_soft_deletes(self, admin_user, employee):
        client = auth_client(admin_user)
        resp = client.delete(employee_url(employee.pk))
        assert resp.status_code == 204
        employee.refresh_from_db()
        assert employee.statut == "archive"

    def test_consultant_cannot_delete(self, consultant_user, employee):
        client = auth_client(consultant_user)
        resp = client.delete(employee_url(employee.pk))
        assert resp.status_code == 403


class TestEmployeeSearch:
    def test_search_returns_results(self, admin_user, employee):
        client = auth_client(admin_user)
        resp = client.get(SEARCH_URL, {"q": "Du"})
        assert resp.status_code == 200

    def test_search_too_short_query(self, admin_user):
        client = auth_client(admin_user)
        resp = client.get(SEARCH_URL, {"q": "D"})
        assert resp.status_code in [200, 400]

    def test_search_requires_auth(self):
        client = APIClient()
        resp = client.get(SEARCH_URL, {"q": "test"})
        assert resp.status_code == 401

    def test_search_by_numero_contrat(self, admin_user, employee, type_contrat):
        from employees.models import Contrat
        Contrat.objects.create(
            employee=employee, type_contrat=type_contrat,
            numero_contrat="CTR-2026-0042", date_debut="2026-01-01",
        )
        client = auth_client(admin_user)
        resp = client.get(SEARCH_URL, {"q": "2026-0042"})
        assert resp.status_code == 200
        assert any(e["id"] == str(employee.id) for e in resp.data)

    def test_search_no_duplicate_rows_with_multiple_contrats(self, admin_user, employee, type_contrat):
        from employees.models import Contrat
        Contrat.objects.create(
            employee=employee, type_contrat=type_contrat,
            numero_contrat="CTR-A", date_debut="2025-01-01", date_fin="2025-12-31",
        )
        Contrat.objects.create(
            employee=employee, type_contrat=type_contrat,
            numero_contrat="CTR-B", date_debut="2026-01-01",
        )
        client = auth_client(admin_user)
        resp = client.get(SEARCH_URL, {"q": "Du"})
        assert resp.status_code == 200
        ids = [e["id"] for e in resp.data]
        assert ids.count(str(employee.id)) == 1


class TestBulkDeleteView:
    BULK_URL = "/api/employees/bulk-delete/"

    def test_bulk_archive(self, admin_user, employee):
        client = auth_client(admin_user)
        resp = client.post(
            self.BULK_URL,
            {"ids": [str(employee.pk)], "action": "archive"},
            format="json",
        )
        assert resp.status_code == 200
        employee.refresh_from_db()
        assert employee.statut == "archive"

    def test_bulk_delete_permanent(self, admin_user, employee):
        emp_pk = employee.pk
        client = auth_client(admin_user)
        resp = client.post(
            self.BULK_URL,
            {"ids": [str(emp_pk)], "action": "delete"},
            format="json",
        )
        assert resp.status_code == 200
        assert not Employee.objects.filter(pk=emp_pk).exists()

    def test_consultant_cannot_bulk_delete(self, consultant_user, employee):
        client = auth_client(consultant_user)
        resp = client.post(
            self.BULK_URL,
            {"ids": [str(employee.pk)], "action": "archive"},
            format="json",
        )
        assert resp.status_code == 403
