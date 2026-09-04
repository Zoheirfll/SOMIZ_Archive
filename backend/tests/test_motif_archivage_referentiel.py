import pytest
from employees.models import MotifArchivage
from rest_framework.test import APIClient


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestMotifArchivageModel:
    def test_create_motif(self):
        motif = MotifArchivage.objects.create(nom="Fin de contrat")
        assert motif.pk is not None
        assert motif.is_active is True
        assert str(motif) == "Fin de contrat"

    def test_nom_unique(self):
        MotifArchivage.objects.create(nom="Fin de contrat")
        with pytest.raises(Exception):
            MotifArchivage.objects.create(nom="Fin de contrat")


@pytest.mark.django_db
class TestMotifArchivageEndpoints:
    def test_admin_can_list_motifs(self, admin_user):
        MotifArchivage.objects.create(nom="Fin de contrat")
        resp = auth_client(admin_user).get("/api/ref/motifs-archivage/")
        assert resp.status_code == 200
        assert any(m["nom"] == "Fin de contrat" for m in resp.data)

    def test_admin_can_create_motif(self, admin_user):
        resp = auth_client(admin_user).post("/api/ref/motifs-archivage/", {"nom": "Démission"})
        assert resp.status_code == 201
        assert MotifArchivage.objects.filter(nom="Démission").exists()

    def test_consultant_cannot_create_motif(self, consultant_user):
        resp = auth_client(consultant_user).post("/api/ref/motifs-archivage/", {"nom": "Démission"})
        assert resp.status_code == 403

    def test_admin_can_delete_motif(self, admin_user):
        motif = MotifArchivage.objects.create(nom="Fin de contrat")
        resp = auth_client(admin_user).delete(f"/api/ref/motifs-archivage/{motif.id}/")
        assert resp.status_code == 204
        assert not MotifArchivage.objects.filter(pk=motif.pk).exists()

    def test_admin_can_download_motif_template(self, admin_user):
        resp = auth_client(admin_user).get("/api/ref/import/motifs-archivage/template/")
        assert resp.status_code == 200

    def test_admin_can_import_motifs(self, admin_user):
        import io
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.append(["nom", "description"])
        ws.append(["Retraite", ""])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        buf.name = "motifs.xlsx"
        resp = auth_client(admin_user).post(
            "/api/ref/import/motifs-archivage/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200
        assert MotifArchivage.objects.filter(nom="Retraite").exists()


@pytest.mark.django_db
class TestEmployeeMotifArchivage:
    def test_patch_statut_actif_clears_motif(self, admin_user, employee):
        """Un employé Actif n'a pas de motif — forcé côté serveur même si
        le payload en envoie un (voir CLAUDE.md section Archivage employé,
        action "Restaurer")."""
        motif = MotifArchivage.objects.create(nom="Fin de contrat")
        employee.statut = "archive"
        employee.motif_archivage = motif
        employee.save(update_fields=["statut", "motif_archivage"])
        resp = auth_client(admin_user).patch(
            f"/api/employees/{employee.pk}/",
            {"statut": "actif", "motif_archivage": str(motif.pk)},
            format="json",
        )
        assert resp.status_code == 200
        employee.refresh_from_db()
        assert employee.statut == "actif"
        assert employee.motif_archivage_id is None

    def test_patch_statut_archive_with_motif(self, admin_user, employee):
        motif = MotifArchivage.objects.create(nom="Fin de contrat")
        resp = auth_client(admin_user).patch(
            f"/api/employees/{employee.pk}/",
            {"statut": "archive", "motif_archivage": str(motif.pk)},
            format="json",
        )
        assert resp.status_code == 200
        employee.refresh_from_db()
        assert employee.statut == "archive"
        assert employee.motif_archivage_id == motif.pk
