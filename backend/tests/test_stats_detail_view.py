import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from employees.models import Employee

User = get_user_model()


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def superadmin_user(db):
    return User.objects.create_user(
        username="superadmin_test", password="SuperPass123!", nom="Super", prenom="Admin",
        role="SUPERADMIN", consent_loi1807_accepted_at=timezone.now(),
    )


@pytest.mark.django_db
class TestStatsDetailView:
    def test_admin_can_get_stats_detail(self, admin_user):
        resp = auth_client(admin_user).get('/api/reporting/stats-detail/')
        assert resp.status_code == 200
        assert 'indicateurs' in resp.data
        assert 'periode' in resp.data

    def test_consultant_forbidden(self, consultant_user):
        resp = auth_client(consultant_user).get('/api/reporting/stats-detail/')
        assert resp.status_code == 403

    def test_invalid_date_returns_400(self, admin_user):
        resp = auth_client(admin_user).get('/api/reporting/stats-detail/?date_debut=not-a-date')
        assert resp.status_code == 400

    def test_date_range_is_forwarded(self, admin_user):
        resp = auth_client(admin_user).get(
            '/api/reporting/stats-detail/?date_debut=2026-01-01&date_fin=2026-01-31'
        )
        assert resp.status_code == 200
        assert resp.data['periode']['debut'] == '2026-01-01'
        assert resp.data['periode']['fin'] == '2026-01-31'


@pytest.mark.django_db
class TestStatsDetailViewScope:
    def test_admin_is_always_scoped_to_mine(self, admin_user):
        resp = auth_client(admin_user).get('/api/reporting/stats-detail/')
        assert resp.status_code == 200
        assert resp.data['scope'] == 'mine'

    def test_admin_does_not_see_other_admins_employees(self, admin_user, direction, departement):
        other_admin = User.objects.create_user(
            username="other_admin2", password="Pass123!", nom="Other", prenom="Admin", role="ADMIN",
        )
        Employee.objects.create(
            matricule="EMP-OTHER", nom="Etranger", prenom="X",
            direction=direction, departement=departement, statut='actif', created_by=other_admin,
        )
        resp = auth_client(admin_user).get('/api/reporting/stats-detail/')
        assert resp.data['repartition_direction'] == []

    def test_admin_sees_own_created_employee(self, admin_user, direction, departement):
        Employee.objects.create(
            matricule="EMP-MINE", nom="Mine", prenom="X",
            direction=direction, departement=departement, statut='actif', created_by=admin_user,
        )
        resp = auth_client(admin_user).get('/api/reporting/stats-detail/')
        row = next(r for r in resp.data['repartition_direction'] if r['id'] == str(direction.id))
        assert row['count'] == 1

    def test_superadmin_defaults_to_all(self, superadmin_user):
        resp = auth_client(superadmin_user).get('/api/reporting/stats-detail/')
        assert resp.status_code == 200
        assert resp.data['scope'] == 'all'

    def test_superadmin_can_request_mine(self, superadmin_user):
        resp = auth_client(superadmin_user).get('/api/reporting/stats-detail/?scope=mine')
        assert resp.status_code == 200
        assert resp.data['scope'] == 'mine'

    def test_superadmin_sees_all_admins_employees_by_default(self, superadmin_user, admin_user, direction, departement):
        Employee.objects.create(
            matricule="EMP-ANYONE", nom="Anyone", prenom="X",
            direction=direction, departement=departement, statut='actif', created_by=admin_user,
        )
        resp = auth_client(superadmin_user).get('/api/reporting/stats-detail/')
        row = next(r for r in resp.data['repartition_direction'] if r['id'] == str(direction.id))
        assert row['count'] == 1
