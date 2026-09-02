import pytest
from rest_framework.test import APIClient


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


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
