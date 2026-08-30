"""Tests — CRUD référentiel Section (clone de Cellule) + import CSV/xlsx."""
import io
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from employees.models import Direction, Departement, Section

pytestmark = pytest.mark.django_db

User = get_user_model()


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


class TestSectionCRUD:
    def test_admin_can_create_section_on_direction(self, admin_user, direction):
        client = auth_client(admin_user)
        resp = client.post(
            "/api/ref/sections/",
            {"nom": "Section Test", "direction": str(direction.id)},
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert Section.objects.filter(nom="Section Test", direction=direction).exists()

    def test_rejects_both_direction_and_departement(self, admin_user, direction, departement):
        client = auth_client(admin_user)
        resp = client.post(
            "/api/ref/sections/",
            {"nom": "Section Test", "direction": str(direction.id), "departement": str(departement.id)},
            format="json",
        )
        assert resp.status_code == 400

    def test_rejects_neither(self, admin_user):
        client = auth_client(admin_user)
        resp = client.post("/api/ref/sections/", {"nom": "Section Test"}, format="json")
        assert resp.status_code == 400

    def test_consultant_cannot_create(self, consultant_user):
        client = auth_client(consultant_user)
        resp = client.post("/api/ref/sections/", {"nom": "Section Test"}, format="json")
        assert resp.status_code == 403

    def test_bulk_delete_section(self, admin_user, direction):
        section = Section.objects.create(nom="Section À supprimer", direction=direction)
        client = auth_client(admin_user)
        resp = client.post(
            "/api/ref/bulk-delete/sections/",
            {"ids": [str(section.id)]},
            format="json",
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_supprimes"] == 1
        assert not Section.objects.filter(pk=section.id).exists()

    def test_direction_serializer_exposes_nb_sections(self, admin_user, direction):
        Section.objects.create(nom="Section A", direction=direction)
        client = auth_client(admin_user)
        resp = client.get("/api/ref/directions/")
        results = resp.data["results"] if isinstance(resp.data, dict) else resp.data
        row = next(d for d in results if d["id"] == str(direction.id))
        assert row["nb_sections"] == 1


class TestSectionImport:
    def test_import_section_attached_to_direction(self, admin_user, direction):
        client = auth_client(admin_user)
        csv_content = "nom;code;direction;departement;description\nSection Import;SIMP;{};;\n".format(direction.nom)
        file = io.BytesIO(csv_content.encode("utf-8"))
        file.name = "sections.csv"
        resp = client.post(
            "/api/ref/import/sections/",
            {"file": file},
            format="multipart",
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 1
        assert Section.objects.filter(nom="Section Import", direction=direction).exists()

    def test_import_template_sections(self, admin_user):
        client = auth_client(admin_user)
        resp = client.get("/api/ref/import/sections/template/")
        assert resp.status_code == 200
