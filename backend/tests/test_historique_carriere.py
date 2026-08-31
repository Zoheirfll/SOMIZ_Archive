import pytest
from datetime import date
from django.core.exceptions import ValidationError
from employees.models import HistoriqueFonction, HistoriqueCategorie, HistoriqueEchelle


@pytest.mark.django_db
class TestHistoriqueModels:
    def test_create_historique_fonction(self, employee, poste, admin_user):
        h = HistoriqueFonction.objects.create(
            employee=employee, poste=poste,
            date_debut=date(2020, 1, 1), date_fin=date(2022, 12, 31),
            created_by=admin_user,
        )
        assert h.pk is not None
        assert employee.historiquefonction_periodes.count() == 1

    def test_periode_en_cours_has_no_date_fin(self, employee, poste, admin_user):
        h = HistoriqueFonction.objects.create(
            employee=employee, poste=poste, date_debut=date(2023, 1, 1),
            created_by=admin_user,
        )
        assert h.date_fin is None

    def test_date_fin_before_date_debut_is_invalid(self, employee, poste):
        h = HistoriqueFonction(
            employee=employee, poste=poste,
            date_debut=date(2023, 1, 1), date_fin=date(2022, 1, 1),
        )
        with pytest.raises(ValidationError):
            h.full_clean()

    def test_create_historique_categorie(self, employee, categorie, admin_user):
        h = HistoriqueCategorie.objects.create(
            employee=employee, categorie=categorie, date_debut=date(2020, 1, 1),
            created_by=admin_user,
        )
        assert employee.historiquecategorie_periodes.count() == 1

    def test_create_historique_echelle(self, employee, echelle, admin_user):
        h = HistoriqueEchelle.objects.create(
            employee=employee, echelle=echelle, date_debut=date(2020, 1, 1),
            created_by=admin_user,
        )
        assert employee.historiqueechelle_periodes.count() == 1
