import pytest
from datetime import date
from django.core.exceptions import ValidationError
from employees.models import HistoriqueFonction, HistoriqueCategorie, HistoriqueEchelle
from rest_framework.test import APIClient


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


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


def historique_list_url(emp_id, axe):
    return f"/api/employees/{emp_id}/historique/{axe}/"


def historique_detail_url(axe, pk):
    return f"/api/historique/{axe}/{pk}/"


@pytest.mark.django_db
class TestHistoriqueEndpoints:
    def test_admin_can_create_periode_fonction(self, admin_user, employee, poste):
        resp = auth_client(admin_user).post(
            historique_list_url(employee.pk, "fonctions"),
            {"poste": str(poste.id), "date_debut": "2020-01-01", "date_fin": "2022-12-31"},
            format="json",
        )
        assert resp.status_code == 201
        assert HistoriqueFonction.objects.filter(employee=employee).count() == 1

    def test_consultant_cannot_create_periode(self, consultant_user, employee, poste):
        resp = auth_client(consultant_user).post(
            historique_list_url(employee.pk, "fonctions"),
            {"poste": str(poste.id), "date_debut": "2020-01-01"},
            format="json",
        )
        assert resp.status_code == 403

    def test_admin_can_list_periodes(self, admin_user, employee, poste):
        HistoriqueFonction.objects.create(employee=employee, poste=poste, date_debut=date(2020, 1, 1))
        resp = auth_client(admin_user).get(historique_list_url(employee.pk, "fonctions"))
        assert resp.status_code == 200
        assert len(resp.data["results"]) == 1

    def test_overlapping_periode_is_rejected(self, admin_user, employee, poste):
        HistoriqueFonction.objects.create(
            employee=employee, poste=poste, date_debut=date(2020, 1, 1), date_fin=date(2022, 12, 31)
        )
        resp = auth_client(admin_user).post(
            historique_list_url(employee.pk, "fonctions"),
            {"poste": str(poste.id), "date_debut": "2021-06-01", "date_fin": "2023-01-01"},
            format="json",
        )
        assert resp.status_code == 400

    def test_admin_can_update_periode(self, admin_user, employee, poste):
        h = HistoriqueFonction.objects.create(employee=employee, poste=poste, date_debut=date(2020, 1, 1))
        resp = auth_client(admin_user).patch(
            historique_detail_url("fonctions", h.pk), {"date_fin": "2021-12-31"}, format="json"
        )
        assert resp.status_code == 200
        h.refresh_from_db()
        assert h.date_fin == date(2021, 12, 31)

    def test_admin_can_delete_periode(self, admin_user, employee, poste):
        h = HistoriqueFonction.objects.create(employee=employee, poste=poste, date_debut=date(2020, 1, 1))
        resp = auth_client(admin_user).delete(historique_detail_url("fonctions", h.pk))
        assert resp.status_code == 204
        assert not HistoriqueFonction.objects.filter(pk=h.pk).exists()

    def test_unknown_axe_returns_404(self, admin_user, employee):
        resp = auth_client(admin_user).get(historique_list_url(employee.pk, "bogus"))
        assert resp.status_code == 404


def employee_url(pk):
    return f"/api/employees/{pk}/"


@pytest.mark.django_db
class TestCarriereAutoTracking:
    def test_changing_poste_creates_new_periode(self, admin_user, employee, poste):
        from employees.models import Poste
        client = auth_client(admin_user)
        nouveau_poste = Poste.objects.create(nom="Chef de service")
        resp = client.patch(employee_url(employee.pk), {"poste": str(nouveau_poste.id)}, format="json")
        assert resp.status_code == 200

        # Aucune période préexistante (employé créé sans historique initial)
        # : le premier changement ouvre juste la nouvelle période, sans
        # "ancienne" période à clôturer.
        periodes = HistoriqueFonction.objects.filter(employee=employee).order_by('date_debut')
        assert periodes.count() == 1
        nouvelle = periodes.first()
        assert nouvelle.poste_id == nouveau_poste.id
        assert nouvelle.date_debut == date.today()
        assert nouvelle.date_fin is None

    def test_changing_poste_twice_closes_the_first_new_periode(self, admin_user, employee, poste):
        from employees.models import Poste
        client = auth_client(admin_user)
        poste_b = Poste.objects.create(nom="Chef de service")
        poste_c = Poste.objects.create(nom="Directeur")
        client.patch(employee_url(employee.pk), {"poste": str(poste_b.id)}, format="json")
        client.patch(employee_url(employee.pk), {"poste": str(poste_c.id)}, format="json")

        periodes = HistoriqueFonction.objects.filter(employee=employee).order_by('date_debut')
        assert periodes.count() == 2
        premiere, seconde = periodes
        assert premiere.poste_id == poste_b.id
        assert premiere.date_fin == date.today()
        assert seconde.poste_id == poste_c.id
        assert seconde.date_fin is None

    def test_changing_poste_logs_transfer_detail(self, admin_user, employee, poste):
        from employees.models import Poste
        from audit.models import AuditLog
        client = auth_client(admin_user)
        nouveau_poste = Poste.objects.create(nom="Chef de service")
        client.patch(employee_url(employee.pk), {"poste": str(nouveau_poste.id)}, format="json")
        log = AuditLog.objects.filter(
            action=AuditLog.Action.MODIFY_EMP, target_id=str(employee.pk)
        ).order_by('-timestamp').first()
        assert log.details["transfer"]["poste"] == {"de": poste.nom, "vers": "Chef de service"}

    def test_unchanged_poste_creates_no_periode(self, admin_user, employee):
        client = auth_client(admin_user)
        client.patch(employee_url(employee.pk), {"nom": employee.nom}, format="json")
        assert HistoriqueFonction.objects.filter(employee=employee).count() == 0
