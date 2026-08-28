import hashlib
import hmac
import json

import pytest
from rest_framework.test import APIClient

from employees.models import Employee
from audit.models import AuditLog

SECRET = "test-grh-secret"


def signed_post(client, url, payload, secret=SECRET):
    body = json.dumps(payload).encode()
    signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return client.post(url, data=body, content_type="application/json", HTTP_X_GRH_SIGNATURE=signature)


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture(autouse=True)
def grh_secret(settings):
    settings.GRH_WEBHOOK_SECRET = SECRET


class TestGRHEmployeeSync:
    def test_rejects_missing_signature(self, client):
        response = client.post(
            "/api/employees/grh-sync/",
            data=json.dumps({"matricule": "EMP-9001", "nom": "X", "prenom": "Y"}),
            content_type="application/json",
        )
        assert response.status_code == 401

    def test_rejects_invalid_signature(self, client):
        response = signed_post(
            client, "/api/employees/grh-sync/",
            {"matricule": "EMP-9001", "nom": "X", "prenom": "Y"},
            secret="wrong-secret",
        )
        assert response.status_code == 401

    def test_rejects_missing_required_field(self, client):
        response = signed_post(client, "/api/employees/grh-sync/", {"nom": "X", "prenom": "Y"})
        assert response.status_code == 400
        assert "matricule" in response.data["detail"]

    def test_rejects_unknown_referentiel_code(self, client, db):
        response = signed_post(client, "/api/employees/grh-sync/", {
            "matricule": "EMP-9001",
            "nom": "Bensalem",
            "prenom": "Yasmine",
            "direction_code": "DOES-NOT-EXIST",
        })
        assert response.status_code == 400
        assert "direction_code" in response.data["errors"]
        assert not Employee.objects.filter(matricule="EMP-9001").exists()

    def test_creates_employee_with_resolved_referentiels(self, client, direction, departement, poste, type_contrat, categorie):
        poste.code = "CHG-RECRUT"
        poste.save()
        response = signed_post(client, "/api/employees/grh-sync/", {
            "matricule": "EMP-4521",
            "nom": "Bensalem",
            "prenom": "Yasmine",
            "date_naissance": "1994-03-12",
            "date_embauche": "2026-08-25",
            "direction_code": direction.code,
            "departement_code": departement.code,
            "poste_code": poste.code,
            "type_contrat": type_contrat.nom,
            "categorie": categorie.nom,
        })
        assert response.status_code == 201
        employee = Employee.objects.get(matricule="EMP-4521")
        assert employee.nom == "Bensalem"
        assert employee.direction_id == direction.id
        assert employee.departement_id == departement.id
        assert employee.poste_id == poste.id
        assert AuditLog.objects.filter(action=AuditLog.Action.CREATE_EMP, target_id=str(employee.id)).exists()

    def test_second_call_updates_instead_of_duplicating(self, client, direction):
        payload = {"matricule": "EMP-4521", "nom": "Bensalem", "prenom": "Yasmine"}
        first = signed_post(client, "/api/employees/grh-sync/", payload)
        assert first.status_code == 201

        payload["prenom"] = "Yasmine-Updated"
        second = signed_post(client, "/api/employees/grh-sync/", payload)
        assert second.status_code == 200
        assert Employee.objects.filter(matricule="EMP-4521").count() == 1
        assert Employee.objects.get(matricule="EMP-4521").prenom == "Yasmine-Updated"
