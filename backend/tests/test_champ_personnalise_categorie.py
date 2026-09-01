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


@pytest.mark.django_db
class TestSeedChampsSysteme:
    def test_19_system_fields_seeded(self):
        assert ChampPersonnalise.objects.filter(is_systeme=True).count() == 19

    def test_date_naissance_is_personnel(self):
        c = ChampPersonnalise.objects.get(code="date_naissance")
        assert c.is_systeme is True
        assert c.categorie == "PERSONNEL"

    def test_matricule_is_administratif(self):
        c = ChampPersonnalise.objects.get(code="matricule")
        assert c.categorie == "ADMINISTRATIF"

    def test_rib_is_personnel_if_exists(self):
        # RIB n'existe que si la migration 2026-07-25 (migration des 4 anciens
        # champs) a été appliquée dans cet environnement — vérifie seulement
        # si présent, ne crée jamais la ligne elle-même.
        c = ChampPersonnalise.objects.filter(code="RIB").first()
        if c is not None:
            assert c.categorie == "PERSONNEL"
