import pytest
from django.db.models import Q
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User

pytestmark = pytest.mark.django_db


def test_gestionnaire_role_exists_and_is_not_admin():
    user = User.objects.create(
        username='gest1', nom='Test', prenom='Gest',
        role=User.Role.GESTIONNAIRE,
    )
    assert user.is_gestionnaire is True
    assert user.is_admin is False
    assert user.is_consultant is False


def test_gestionnaire_libelle_role_is_optional_display_label():
    user = User.objects.create(
        username='gest2', nom='Test', prenom='Gest',
        role=User.Role.GESTIONNAIRE, libelle_role='Secrétaire',
    )
    assert user.libelle_role == 'Secrétaire'


def test_gestionnaire_uses_same_scoping_branch_as_consultant():
    user = User.objects.create(
        username='gest3', nom='Test', prenom='Gest',
        role=User.Role.GESTIONNAIRE,
    )
    assert user.has_scope_restriction is False
    q = user.employee_scope_q()
    assert isinstance(q, Q)


def test_admin_can_create_gestionnaire_via_api(admin_user):
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.post('/api/admin-users/', {
        'username': 'gest_api', 'nom': 'Api', 'prenom': 'Test',
        'role': 'GESTIONNAIRE', 'libelle_role': 'Superviseur',
        'password': 'Un_MotDePasse_Valide123',
    }, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['role'] == 'GESTIONNAIRE'
    assert resp.data['libelle_role'] == 'Superviseur'
