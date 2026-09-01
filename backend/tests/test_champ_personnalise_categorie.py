import pytest
from employees.models import ChampPersonnalise


@pytest.mark.django_db
class TestChampPersonnaliseCategorie:
    def test_default_categorie_is_administratif(self):
        c = ChampPersonnalise.objects.create(nom="Permis", code="PERMIS")
        assert c.categorie == ChampPersonnalise.Categorie.ADMINISTRATIF
        assert c.is_systeme is False

    def test_can_create_personnel_categorie(self):
        c = ChampPersonnalise.objects.create(
            nom="Permis", code="PERMIS2", categorie=ChampPersonnalise.Categorie.PERSONNEL
        )
        assert c.categorie == "PERSONNEL"
