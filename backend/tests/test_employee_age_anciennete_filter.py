import pytest
from datetime import date, timedelta
from rest_framework.test import APIClient
from django.utils import timezone
from employees.models import Employee

pytestmark = pytest.mark.django_db


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _make_employee(matricule, direction, departement, **kwargs):
    defaults = dict(matricule=matricule, nom="Test", prenom="X", direction=direction, departement=departement, statut="actif")
    defaults.update(kwargs)
    return Employee.objects.create(**defaults)


def test_age_min_max_filters_by_date_naissance_bracket(admin_user, direction, departement):
    today = timezone.localdate()
    jeune = _make_employee(
        "EMP-AGE-1", direction, departement,
        date_naissance=date(today.year - 20, today.month, 1),
    )
    dans_tranche = _make_employee(
        "EMP-AGE-2", direction, departement,
        date_naissance=date(today.year - 30, today.month, 1),
    )
    vieux = _make_employee(
        "EMP-AGE-3", direction, departement,
        date_naissance=date(today.year - 60, today.month, 1),
    )
    resp = auth_client(admin_user).get('/api/employees/?age_min=25&age_max=34')
    matricules = [e['matricule'] for e in resp.data['results']]
    assert 'EMP-AGE-2' in matricules
    assert 'EMP-AGE-1' not in matricules
    assert 'EMP-AGE-3' not in matricules


def test_anciennete_min_max_filters_by_date_embauche_bracket(admin_user, direction, departement):
    today = timezone.localdate()
    recent = _make_employee(
        "EMP-ANC-1", direction, departement,
        date_embauche=today - timedelta(days=100),
    )
    dans_tranche = _make_employee(
        "EMP-ANC-2", direction, departement,
        date_embauche=today - timedelta(days=365 * 7),
    )
    ancien = _make_employee(
        "EMP-ANC-3", direction, departement,
        date_embauche=today - timedelta(days=365 * 15),
    )
    resp = auth_client(admin_user).get('/api/employees/?anciennete_min=5&anciennete_max=9')
    matricules = [e['matricule'] for e in resp.data['results']]
    assert 'EMP-ANC-2' in matricules
    assert 'EMP-ANC-1' not in matricules
    assert 'EMP-ANC-3' not in matricules


def test_anciennete_min_only_open_ended_bracket(admin_user, direction, departement):
    today = timezone.localdate()
    recent = _make_employee(
        "EMP-ANC-4", direction, departement,
        date_embauche=today - timedelta(days=365 * 2),
    )
    ancien = _make_employee(
        "EMP-ANC-5", direction, departement,
        date_embauche=today - timedelta(days=365 * 15),
    )
    resp = auth_client(admin_user).get('/api/employees/?anciennete_min=10&anciennete_max=200')
    matricules = [e['matricule'] for e in resp.data['results']]
    assert 'EMP-ANC-5' in matricules
    assert 'EMP-ANC-4' not in matricules
