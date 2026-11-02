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


def test_fonction_du_compte_vient_du_poste_de_l_employe_lie(admin_user, employee):
    """La « fonction » d'un compte = poste de la fiche employé liée ; vide sinon.
    Exposée dans la liste /admin-users/ et dans /auth/me (navbar, profil)."""
    from employees.models import Poste
    employee.poste = Poste.objects.create(nom="Chef de service")
    employee.save()
    chef = User.objects.create_user(username="chef.sap", password="x", nom="Chef", prenom="Sap",
                                    role=User.Role.CONSULTANT, employee=employee)
    simple = User.objects.create_user(username="sans.fiche", password="x", nom="Sans", prenom="Fiche",
                                      role=User.Role.CONSULTANT)

    resp = _client(admin_user).get('/api/admin-users/', {'q': 'chef.sap'})
    assert resp.data['results'][0]['fonction'] == "Chef de service"
    assert _client(chef).get('/api/auth/me/').data['fonction'] == "Chef de service"
    assert _client(simple).get('/api/auth/me/').data['fonction'] == ""


def test_fonction_deduite_de_la_responsabilite_d_unite(admin_user, employee, direction):
    """Un directeur sans poste renseigné affiche « Directeur · <direction> »."""
    employee.poste = None
    employee.save()
    direction.responsable = employee
    direction.save()
    directeur = User.objects.create_user(username="dir.rh", password="x", nom="Dir", prenom="RH",
                                         role=User.Role.CONSULTANT, employee=employee)
    assert _client(directeur).get('/api/auth/me/').data['fonction'] == f"Directeur · {direction.nom}"
