import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db
User = get_user_model()


def _user(role, **extra):
    return User.objects.create_user(
        username=f"u_{role}_{User.objects.count()}", password="Passw0rd!Long1",
        nom="N", prenom="P", role=role,
        consent_loi1807_accepted_at=timezone.now(), **extra,
    )


def test_superadmin_peut_traiter_et_demander_sans_drapeau():
    sa = _user('SUPERADMIN')
    assert sa.can_manage_conges is True
    assert sa.can_request_conges is True


def test_admin_ordinaire_ne_traite_pas_et_ne_demande_jamais():
    admin = _user('ADMIN')
    assert admin.can_manage_conges is False
    assert admin.can_request_conges is False
    admin.charge_conge = True
    admin.peut_demander_conge = True
    assert admin.can_manage_conges is True
    assert admin.can_request_conges is False  # traiteur seul, jamais demandeur


@pytest.mark.parametrize('role', ['GESTIONNAIRE', 'CONSULTANT'])
def test_demandeur_exige_le_drapeau(role):
    u = _user(role)
    assert u.can_request_conges is False
    u.peut_demander_conge = True
    assert u.can_request_conges is True
    assert u.can_manage_conges is False


def test_admin_ordinaire_ne_peut_pas_se_donner_charge_conge():
    admin = _user('ADMIN')
    client = APIClient()
    client.force_authenticate(admin)
    resp = client.patch(f'/api/admin-users/{admin.id}/', {'charge_conge': True}, format='json')
    assert resp.status_code == 400
    assert 'charge_conge' in resp.data
    admin.refresh_from_db()
    assert admin.charge_conge is False


def test_superadmin_peut_attribuer_charge_conge():
    sa = _user('SUPERADMIN')
    cible = _user('ADMIN')
    client = APIClient()
    client.force_authenticate(sa)
    resp = client.patch(f'/api/admin-users/{cible.id}/', {'charge_conge': True}, format='json')
    assert resp.status_code == 200, resp.data
    cible.refresh_from_db()
    assert cible.charge_conge is True


def test_admin_peut_attribuer_peut_demander_conge_a_un_gestionnaire():
    admin = _user('ADMIN')
    gest = _user('GESTIONNAIRE')
    client = APIClient()
    client.force_authenticate(admin)
    resp = client.patch(f'/api/admin-users/{gest.id}/', {'peut_demander_conge': True}, format='json')
    assert resp.status_code == 200, resp.data
    gest.refresh_from_db()
    assert gest.peut_demander_conge is True


def test_charge_conge_remis_a_zero_si_le_role_n_est_pas_admin():
    sa = _user('SUPERADMIN')
    _user('ADMIN')  # un autre ADMIN actif : le garde-fou « dernier ADMIN » ne doit pas jouer
    cible = _user('ADMIN', charge_conge=True)
    client = APIClient()
    client.force_authenticate(sa)
    resp = client.patch(f'/api/admin-users/{cible.id}/', {'role': 'CONSULTANT'}, format='json')
    assert resp.status_code == 200, resp.data
    cible.refresh_from_db()
    assert cible.charge_conge is False


def test_me_expose_les_droits_conges():
    gest = _user('GESTIONNAIRE', peut_demander_conge=True)
    client = APIClient()
    client.force_authenticate(gest)
    resp = client.get('/api/auth/me/')
    assert resp.status_code == 200
    assert resp.data['can_request_conges'] is True
    assert resp.data['can_manage_conges'] is False
