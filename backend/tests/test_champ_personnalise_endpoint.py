import pytest
from rest_framework.test import APIClient
from employees.models import ChampPersonnalise


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestChampPersonnaliseCategorieEndpoint:
    def test_admin_can_change_categorie_on_system_field(self, admin_user):
        c = ChampPersonnalise.objects.get(code="matricule")
        resp = auth_client(admin_user).patch(
            f"/api/ref/champs-personnalises/{c.id}/",
            {"categorie": "PERSONNEL"},
            format="json",
        )
        assert resp.status_code == 200
        c.refresh_from_db()
        assert c.categorie == "PERSONNEL"

    def test_cannot_change_code_on_system_field(self, admin_user):
        c = ChampPersonnalise.objects.get(code="matricule")
        resp = auth_client(admin_user).patch(
            f"/api/ref/champs-personnalises/{c.id}/",
            {"code": "hacked"},
            format="json",
        )
        assert resp.status_code == 400

    def test_cannot_delete_system_field(self, admin_user):
        c = ChampPersonnalise.objects.get(code="matricule")
        resp = auth_client(admin_user).delete(f"/api/ref/champs-personnalises/{c.id}/")
        assert resp.status_code == 400
        assert ChampPersonnalise.objects.filter(id=c.id).exists()

    def test_list_exposes_is_systeme_and_categorie(self, admin_user):
        resp = auth_client(admin_user).get("/api/ref/champs-personnalises/")
        # Sans ?page=, ReferentielPagination renvoie la liste complète non
        # paginée (ReturnList), pas un dict {results: [...]}.
        data = resp.data["results"] if isinstance(resp.data, dict) else resp.data
        matricule = next(i for i in data if i["code"] == "matricule")
        assert matricule["is_systeme"] is True
        assert "categorie" in matricule
