import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from employees.models import Employee
from audit.models import AuditLog

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

    def test_stats_are_organization_wide_for_any_admin(self, admin_user, direction, departement):
        other_admin = User.objects.create_user(
            username="other_admin2", password="Pass123!", nom="Other", prenom="Admin", role="ADMIN",
        )
        Employee.objects.create(
            matricule="EMP-OTHER", nom="Etranger", prenom="X",
            direction=direction, departement=departement, statut='actif', created_by=other_admin,
        )
        resp = auth_client(admin_user).get('/api/reporting/stats-detail/')
        row = next(r for r in resp.data['repartition_direction'] if r['id'] == str(direction.id))
        assert row['count'] == 1


@pytest.mark.django_db
class TestStatsDetailViewActivite:
    def test_admin_gets_mon_activite(self, admin_user):
        resp = auth_client(admin_user).get('/api/reporting/stats-detail/')
        assert 'mon_activite' in resp.data
        assert 'activite_par_admin' not in resp.data

    def test_mon_activite_counts_only_this_admins_actions(self, admin_user):
        other_admin = User.objects.create_user(
            username="other_admin3", password="Pass123!", nom="Other", prenom="Admin", role="ADMIN",
        )
        AuditLog.objects.create(
            user=admin_user, action=AuditLog.Action.CREATE_EMP,
            target_model='Employee', target_id='a', target_label='a',
        )
        AuditLog.objects.create(
            user=other_admin, action=AuditLog.Action.CREATE_EMP,
            target_model='Employee', target_id='b', target_label='b',
        )
        resp = auth_client(admin_user).get('/api/reporting/stats-detail/')
        assert resp.data['mon_activite']['employes_crees'] == 1

    def test_superadmin_gets_activite_par_admin(self, superadmin_user, admin_user):
        resp = auth_client(superadmin_user).get('/api/reporting/stats-detail/')
        assert 'activite_par_admin' in resp.data
        assert 'mon_activite' in resp.data
        noms = [a['nom_complet'] for a in resp.data['activite_par_admin']]
        assert superadmin_user.full_name in noms
        assert admin_user.full_name in noms
