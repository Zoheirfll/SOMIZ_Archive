import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db
User = get_user_model()


def _user(username, role, **extra):
    return User.objects.create_user(
        username=username, password="Passw0rd!Long1", nom="N", prenom="P",
        role=role, consent_loi1807_accepted_at=timezone.now(), **extra,
    )


def test_superadmin_est_toujours_traiteur():
    assert _user("sa1", "SUPERADMIN").can_manage_consultations is True


def test_admin_sans_drapeau_nest_pas_traiteur():
    assert _user("ad1", "ADMIN").can_manage_consultations is False


def test_admin_avec_drapeau_est_traiteur():
    assert _user("ad2", "ADMIN", charge_consultation=True).can_manage_consultations is True


def test_gestionnaire_avec_drapeau_nest_pas_traiteur():
    user = _user("ge1", "GESTIONNAIRE", charge_consultation=True)
    assert user.can_manage_consultations is False


def test_me_expose_can_manage_consultations():
    admin = _user("ad3", "ADMIN", charge_consultation=True)
    client = APIClient()
    client.force_authenticate(admin)
    resp = client.get('/api/auth/me/')
    assert resp.status_code == 200
    assert resp.data['can_manage_consultations'] is True


def test_admin_users_patch_accepte_le_drapeau_sur_un_admin():
    acteur = _user("sa2", "SUPERADMIN")
    cible = _user("ad4", "ADMIN")
    client = APIClient()
    client.force_authenticate(acteur)
    resp = client.patch(f'/api/admin-users/{cible.id}/', {'charge_consultation': True}, format='json')
    assert resp.status_code == 200, resp.data
    cible.refresh_from_db()
    assert cible.charge_consultation is True


def test_admin_users_force_le_drapeau_a_false_hors_admin():
    acteur = _user("sa3", "SUPERADMIN")
    cible = _user("co1", "CONSULTANT")
    client = APIClient()
    client.force_authenticate(acteur)
    resp = client.patch(f'/api/admin-users/{cible.id}/', {'charge_consultation': True}, format='json')
    assert resp.status_code == 200, resp.data
    cible.refresh_from_db()
    assert cible.charge_consultation is False


def test_admin_ordinaire_ne_peut_pas_se_donner_lacces():
    """Garde-fou : l'accès aux archives confidentielles est attribué par un
    SUPERADMIN uniquement, jamais par auto-attribution d'un ADMIN."""
    admin = _user("ad5", "ADMIN")
    client = APIClient()
    client.force_authenticate(admin)
    resp = client.patch(f'/api/admin-users/{admin.id}/', {'charge_consultation': True}, format='json')
    assert resp.status_code == 400
    assert 'charge_consultation' in resp.data
    admin.refresh_from_db()
    assert admin.charge_consultation is False


def test_admin_ordinaire_ne_peut_pas_se_donner_charge_attestation():
    """Même garde-fou pour les attestations de travail (faille identique
    corrigée le 2026-10-08)."""
    admin = _user("ad7", "ADMIN")
    client = APIClient()
    client.force_authenticate(admin)
    resp = client.patch(f'/api/admin-users/{admin.id}/', {'charge_attestation': True}, format='json')
    assert resp.status_code == 400
    assert 'charge_attestation' in resp.data
    admin.refresh_from_db()
    assert admin.charge_attestation is False


def test_superadmin_peut_attribuer_charge_attestation():
    acteur = _user("sa4", "SUPERADMIN")
    cible = _user("ad8", "ADMIN")
    client = APIClient()
    client.force_authenticate(acteur)
    resp = client.patch(f'/api/admin-users/{cible.id}/', {'charge_attestation': True}, format='json')
    assert resp.status_code == 200, resp.data
    cible.refresh_from_db()
    assert cible.charge_attestation is True


def test_admin_ordinaire_ne_peut_pas_creer_un_compte_avec_charge_attestation():
    admin = _user("ad9", "ADMIN")
    client = APIClient()
    client.force_authenticate(admin)
    resp = client.post('/api/admin-users/', {
        'username': 'nouveau_c', 'nom': 'N', 'prenom': 'P', 'role': 'CONSULTANT',
        'charge_attestation': True, 'password': 'Passw0rd!Long1',
    }, format='json')
    assert resp.status_code == 400
    assert 'charge_attestation' in resp.data


def test_valeur_inchangee_reste_acceptee_pour_un_admin():
    admin = _user("ad6", "ADMIN")
    cible = _user("co2", "CONSULTANT")
    client = APIClient()
    client.force_authenticate(admin)
    resp = client.patch(
        f'/api/admin-users/{cible.id}/', {'charge_consultation': False, 'libelle_role': 'X'}, format='json',
    )
    assert resp.status_code == 200, resp.data
