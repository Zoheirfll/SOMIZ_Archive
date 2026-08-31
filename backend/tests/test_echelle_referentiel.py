import pytest
from employees.models import Echelle
from rest_framework.test import APIClient


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestEchelleModel:
    def test_create_echelle(self):
        echelle = Echelle.objects.create(nom="Échelle 10")
        assert echelle.pk is not None
        assert echelle.is_active is True
        assert str(echelle) == "Échelle 10"

    def test_nom_unique(self):
        Echelle.objects.create(nom="Échelle 10")
        with pytest.raises(Exception):
            Echelle.objects.create(nom="Échelle 10")


@pytest.mark.django_db
class TestEchelleEndpoints:
    def test_admin_can_list_echelles(self, admin_user, echelle):
        resp = auth_client(admin_user).get("/api/ref/echelles/")
        assert resp.status_code == 200
        assert any(e["nom"] == "Échelle 10" for e in resp.data)

    def test_admin_can_create_echelle(self, admin_user):
        resp = auth_client(admin_user).post("/api/ref/echelles/", {"nom": "Échelle 12"})
        assert resp.status_code == 201
        assert Echelle.objects.filter(nom="Échelle 12").exists()

    def test_consultant_cannot_create_echelle(self, consultant_user):
        resp = auth_client(consultant_user).post("/api/ref/echelles/", {"nom": "Échelle 12"})
        assert resp.status_code == 403

    def test_admin_can_delete_echelle(self, admin_user, echelle):
        resp = auth_client(admin_user).delete(f"/api/ref/echelles/{echelle.id}/")
        assert resp.status_code == 204
        assert not Echelle.objects.filter(pk=echelle.pk).exists()
