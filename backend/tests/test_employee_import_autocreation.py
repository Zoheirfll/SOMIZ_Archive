import io
import pytest
from openpyxl import Workbook
from rest_framework.test import APIClient
from employees.models import Employee, Poste, Direction, Departement, Service
from audit.models import AuditLog


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _build_xlsx(headers, rows):
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    buf.name = "import.xlsx"
    return buf


@pytest.mark.django_db
class TestEmployeeImportAutocreation:
    def test_poste_inconnu_est_cree_automatiquement(self, admin_user):
        assert not Poste.objects.filter(nom="Ingénieur R&D").exists()
        buf = _build_xlsx(
            ["matricule", "numero_contrat", "nom", "prenom", "poste"],
            [["M001", "1", "DUPONT", "Jean", "Ingénieur R&D"]],
        )
        resp = auth_client(admin_user).post(
            "/api/employees/import/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 1
        poste = Poste.objects.get(nom="Ingénieur R&D")
        emp = Employee.objects.get(matricule="M001")
        assert emp.poste_id == poste.id

    def test_departement_et_direction_absents_sont_crees_en_cascade(self, admin_user):
        buf = _build_xlsx(
            ["matricule", "numero_contrat", "nom", "prenom", "direction", "departement"],
            [["M002", "2", "MARTIN", "Paul", "Direction Technique", "Comptabilité"]],
        )
        resp = auth_client(admin_user).post(
            "/api/employees/import/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 1
        emp = Employee.objects.get(matricule="M002")
        assert emp.departement.nom == "Comptabilité"
        assert emp.departement.direction.nom == "Direction Technique"
        assert emp.direction.nom == "Direction Technique"

    def test_departement_homonyme_ambigu_bloque_toujours(self, admin_user, direction):
        autre_direction = Direction.objects.create(nom="Autre Direction")
        Departement.objects.create(nom="RH", direction=direction)
        Departement.objects.create(nom="RH", direction=autre_direction)
        buf = _build_xlsx(
            ["matricule", "numero_contrat", "nom", "prenom", "departement"],
            [["M003", "3", "DURAND", "Alice", "RH"]],
        )
        resp = auth_client(admin_user).post(
            "/api/employees/import/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 0
        assert resp.data["nb_erreurs"] == 1

    def test_service_sans_departement_resolu_reste_vide(self, admin_user):
        buf = _build_xlsx(
            ["matricule", "numero_contrat", "nom", "prenom", "service"],
            [["M005", "5", "PETIT", "Léa", "Service Inconnu"]],
        )
        resp = auth_client(admin_user).post(
            "/api/employees/import/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 1
        assert not Service.objects.filter(nom="Service Inconnu").exists()
        emp = Employee.objects.get(matricule="M005")
        assert emp.service_id is None

    def test_creation_auto_tracee_dans_audit_log(self, admin_user):
        buf = _build_xlsx(
            ["matricule", "numero_contrat", "nom", "prenom", "poste"],
            [["M004", "4", "BERNARD", "Eve", "Technicien Réseau"]],
        )
        resp = auth_client(admin_user).post(
            "/api/employees/import/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        entry = AuditLog.objects.filter(action=AuditLog.Action.CREATE_EMP).latest('id')
        noms_crees = [r['nom'] for r in entry.details.get('referentiels_crees', [])]
        assert "Technicien Réseau" in noms_crees
