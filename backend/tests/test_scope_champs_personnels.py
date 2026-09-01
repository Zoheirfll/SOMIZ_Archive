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
    def test_no_selection_means_unrestricted(self, consultant_user, champ_personnel):
        assert consultant_user.has_champ_personnel_scope_restriction is False
        assert consultant_user.can_access_champ_personnel(champ_personnel.id) is True
        assert consultant_user.accessible_champs_personnels_qs().count() == \
            ChampPersonnalise.objects.count()

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
