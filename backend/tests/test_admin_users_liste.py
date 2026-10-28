"""Liste /api/admin-users/ : recherche, filtre de rôle, pagination et compteurs
par rôle (onglets de /users, prévus pour des milliers de comptes)."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def comptes(admin_user):
    for i in range(30):
        User.objects.create_user(username=f"cons{i:02d}", password="x", nom=f"Nom{i:02d}", prenom="Cons",
                                 role=User.Role.CONSULTANT)
    User.objects.create_user(username="gest.rare", password="x", nom="Zorro", prenom="Gest",
                             role=User.Role.GESTIONNAIRE)


def test_pagination_a_25_et_compteurs_par_role(admin_user, comptes):
    resp = _client(admin_user).get('/api/admin-users/')
    assert resp.status_code == 200
    assert len(resp.data['results']) == 25
    assert resp.data['count'] == 32  # 30 consultants + 1 gestionnaire + l'admin
    assert resp.data['compteurs']['CONSULTANT'] == 30
    assert resp.data['compteurs']['GESTIONNAIRE'] == 1


def test_filtre_par_role_garde_les_compteurs_des_autres_onglets(admin_user, comptes):
    resp = _client(admin_user).get('/api/admin-users/', {'role': 'GESTIONNAIRE'})
    assert [u['username'] for u in resp.data['results']] == ['gest.rare']
    assert resp.data['compteurs']['CONSULTANT'] == 30


def test_recherche_par_nom_ou_identifiant(admin_user, comptes):
    resp = _client(admin_user).get('/api/admin-users/', {'q': 'zorr'})
    assert [u['username'] for u in resp.data['results']] == ['gest.rare']
    resp = _client(admin_user).get('/api/admin-users/', {'q': 'cons07'})
    assert resp.data['count'] == 1


def test_un_non_admin_n_accede_pas_a_la_liste(consultant_user, comptes):
    assert _client(consultant_user).get('/api/admin-users/').status_code == 403
