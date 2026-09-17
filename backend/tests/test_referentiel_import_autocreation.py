import io
import pytest
from openpyxl import Workbook
from rest_framework.test import APIClient
from employees.models import Direction, Departement, Service


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _xlsx(headers, rows):
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
class TestReferentielImportAutocreation:
    def test_direction_absente_creee_automatiquement_pour_departement(self, admin_user):
        assert not Direction.objects.filter(nom="Direction Achats").exists()
        buf = _xlsx(["nom", "direction"], [["Approvisionnement", "Direction Achats"]])
        resp = auth_client(admin_user).post(
            "/api/ref/import/departements/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 1
        dept = Departement.objects.get(nom="Approvisionnement")
        assert dept.direction.nom == "Direction Achats"

    def test_departement_absent_cree_automatiquement_pour_service(self, admin_user, direction):
        buf = _xlsx(
            ["nom", "departement", "direction"],
            [["Recouvrement", "Comptabilité", direction.nom]],
        )
        resp = auth_client(admin_user).post(
            "/api/ref/import/services/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 1
        service = Service.objects.get(nom="Recouvrement")
        assert service.departement.nom == "Comptabilité"
        assert service.departement.direction_id == direction.id

    def test_departement_ambigu_toujours_bloque(self, admin_user, direction):
        autre = Direction.objects.create(nom="Autre Direction")
        Departement.objects.create(nom="RH", direction=direction)
        Departement.objects.create(nom="RH", direction=autre)
        buf = _xlsx(["nom", "departement"], [["Paie Cadres", "RH"]])
        resp = auth_client(admin_user).post(
            "/api/ref/import/services/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 0
        assert resp.data["nb_erreurs"] == 1

    def test_departement_sans_direction_ni_correspondance_bloque(self, admin_user):
        buf = _xlsx(["nom", "departement"], [["Service Fantome", "Departement Inconnu"]])
        resp = auth_client(admin_user).post(
            "/api/ref/import/services/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 0
        assert resp.data["nb_erreurs"] == 1

    def test_direction_absente_creee_pour_cellule_parent_direct(self, admin_user):
        from employees.models import Cellule
        buf = _xlsx(["nom", "direction"], [["Cellule Qualité", "Direction Nouvelle"]])
        resp = auth_client(admin_user).post(
            "/api/ref/import/cellules/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 1
        cellule = Cellule.objects.get(nom="Cellule Qualité")
        assert cellule.direction.nom == "Direction Nouvelle"
