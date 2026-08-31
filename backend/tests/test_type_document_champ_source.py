import pytest
from rest_framework.test import APIClient
from employees.models import TypeDocument


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestChampSourceModel:
    def test_champ_source_defaults_blank(self, type_doc_obligatoire):
        assert type_doc_obligatoire.champ_source == ""

    def test_champ_source_can_be_set(self):
        t = TypeDocument.objects.create(nom="Acte de naissance", code="ACTE_NAISSANCE", champ_source="date_naissance")
        assert t.champ_source == "date_naissance"


@pytest.mark.django_db
class TestChampSourceEndpoint:
    def test_admin_can_set_champ_source(self, admin_user, type_doc_obligatoire):
        resp = auth_client(admin_user).patch(
            f"/api/ref/types-documents/{type_doc_obligatoire.id}/",
            {"champ_source": "date_naissance"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["champ_source"] == "date_naissance"
        type_doc_obligatoire.refresh_from_db()
        assert type_doc_obligatoire.champ_source == "date_naissance"

    def test_champ_source_forced_blank_when_type_becomes_categorie(self, admin_user, type_doc_obligatoire):
        # type_doc_obligatoire devient une catégorie en recevant un sous-type
        TypeDocument.objects.create(nom="Sous-type", code="SOUS_TYPE", parent=type_doc_obligatoire)
        resp = auth_client(admin_user).patch(
            f"/api/ref/types-documents/{type_doc_obligatoire.id}/",
            {"champ_source": "date_naissance"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["champ_source"] == ""

    def test_list_exposes_champ_source(self, admin_user, type_doc_obligatoire):
        TypeDocument.objects.filter(pk=type_doc_obligatoire.pk).update(champ_source="nin")
        resp = auth_client(admin_user).get("/api/ref/types-documents/")
        item = next(t for t in resp.data if t["id"] == str(type_doc_obligatoire.id))
        assert item["champ_source"] == "nin"
