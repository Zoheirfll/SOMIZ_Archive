import pytest
from rest_framework.test import APIRequestFactory
from employees.models import ChampPersonnalise
from employees.serializers import EmployeeDetailSerializer


def make_context(user):
    request = APIRequestFactory().get("/")
    request.user = user
    return {"request": request}


@pytest.mark.django_db
class TestChampsCategories:
    def test_admin_sees_all_categories(self, admin_user, employee):
        data = EmployeeDetailSerializer(employee, context=make_context(admin_user)).data
        assert data["champs_categories"]["matricule"] == "ADMINISTRATIF"
        assert data["champs_categories"]["date_naissance"] == "PERSONNEL"

    def test_consultant_without_restriction_sees_all(self, consultant_user, employee):
        data = EmployeeDetailSerializer(employee, context=make_context(consultant_user)).data
        assert "date_naissance" in data["champs_categories"]

    def test_consultant_restricted_loses_unauthorized_personal_field(self, consultant_user, employee):
        date_naissance = ChampPersonnalise.objects.get(code="date_naissance")
        autre_perso = ChampPersonnalise.objects.create(
            nom="Autre perso", code="AUTRE_PERSO", categorie=ChampPersonnalise.Categorie.PERSONNEL
        )
        consultant_user.scope_champs_personnels.add(date_naissance)
        data = EmployeeDetailSerializer(employee, context=make_context(consultant_user)).data
        assert "date_naissance" in data["champs_categories"]
        assert "AUTRE_PERSO" not in data["champs_categories"]

    def test_administratif_never_restricted(self, consultant_user, employee):
        date_naissance = ChampPersonnalise.objects.get(code="date_naissance")
        consultant_user.scope_champs_personnels.add(date_naissance)
        data = EmployeeDetailSerializer(employee, context=make_context(consultant_user)).data
        assert data["champs_categories"]["matricule"] == "ADMINISTRATIF"
