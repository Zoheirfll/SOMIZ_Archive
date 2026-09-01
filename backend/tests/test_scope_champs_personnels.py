import pytest
from django.contrib.auth import get_user_model
from employees.models import ChampPersonnalise

User = get_user_model()


@pytest.fixture
def champ_personnel(db):
    return ChampPersonnalise.objects.create(
        nom="Test Perso", code="TEST_PERSO", categorie=ChampPersonnalise.Categorie.PERSONNEL
    )


@pytest.fixture
def champ_personnel_2(db):
    return ChampPersonnalise.objects.create(
        nom="Test Perso 2", code="TEST_PERSO_2", categorie=ChampPersonnalise.Categorie.PERSONNEL
    )


@pytest.mark.django_db
class TestScopeChampsPersonnels:
    def test_no_selection_means_no_access(self, consultant_user, champ_personnel):
        """Depuis le 2026-09-01 : aucune case cochée = aucun accès sur cet
        axe (règle inversée). has_champ_personnel_scope_restriction reste
        False (sémantique inchangée : reflète si une restriction a été
        explicitement configurée, pas le résultat d'accès)."""
        assert consultant_user.has_champ_personnel_scope_restriction is False
        assert consultant_user.can_access_champ_personnel(champ_personnel.id) is False
        assert consultant_user.accessible_champs_personnels_qs().count() == 0

    def test_selection_restricts_access(self, consultant_user, champ_personnel, champ_personnel_2):
        consultant_user.scope_champs_personnels.add(champ_personnel)
        assert consultant_user.has_champ_personnel_scope_restriction is True
        assert consultant_user.can_access_champ_personnel(champ_personnel.id) is True
        assert consultant_user.can_access_champ_personnel(champ_personnel_2.id) is False
        ids = set(consultant_user.accessible_champs_personnels_qs().values_list('id', flat=True))
        assert ids == {champ_personnel.id}

    def test_admin_always_unrestricted(self, admin_user, champ_personnel, champ_personnel_2):
        admin_user.scope_champs_personnels.add(champ_personnel)
        assert admin_user.can_access_champ_personnel(champ_personnel_2.id) is True


from rest_framework.test import APIClient


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestUserSerializerChampsPersonnels:
    def test_patch_scope_champs_personnels(self, admin_user, consultant_user, champ_personnel):
        resp = auth_client(admin_user).patch(
            f"/api/admin-users/{consultant_user.id}/",
            {"scope_champs_personnels": [str(champ_personnel.id)]},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["scope_champs_personnels_nom"] == ["Test Perso"]
        consultant_user.refresh_from_db()
        assert consultant_user.can_access_champ_personnel(champ_personnel.id)
