import pytest
from employees.models import Echelle


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
