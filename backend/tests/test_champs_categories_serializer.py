import pytest
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory
from employees.models import ChampPersonnalise, Direction, Departement, Service, EmployeeAccessGrant
from employees.serializers import EmployeeDetailSerializer

User = get_user_model()


def make_context(user):
    request = APIRequestFactory().get("/")
    request.user = user
    return {"request": request}


@pytest.fixture
def other_service_2(db):
    direction = Direction.objects.create(nom="Direction Bis", code="DB2")
    departement = Departement.objects.create(nom="Logistique 2", direction=direction, code="LOG2")
    return Service.objects.create(nom="Transport 2", departement=departement)


@pytest.fixture
def scoped_consultant_2(db):
    return User.objects.create_user(
        username="champs_scoped_consultant",
        password="ScopedPass123!",
        nom="Champs",
        prenom="Test",
        role="CONSULTANT",
        consent_loi1807_accepted_at=timezone.now(),
    )


@pytest.mark.django_db
class TestChampsCategories:
    def test_admin_sees_all_categories(self, admin_user, employee):
        data = EmployeeDetailSerializer(employee, context=make_context(admin_user)).data
        assert data["champs_categories"]["matricule"] == "ADMINISTRATIF"
        assert data["champs_categories"]["date_naissance"] == "PERSONNEL"

    def test_consultant_without_any_scope_loses_personal_fields(self, consultant_user, employee):
        """Depuis le 2026-09-01 : un CONSULTANT sans aucun périmètre
        configuré (organisationnel ni champs personnels) n'a plus accès
        par défaut aux champs personnels (règle inversée)."""
        data = EmployeeDetailSerializer(employee, context=make_context(consultant_user)).data
        assert "date_naissance" not in data["champs_categories"]
        # ADMINISTRATIF fields are never restricted by this scope.
        assert data["champs_categories"]["matricule"] == "ADMINISTRATIF"

    def test_consultant_restricted_loses_unauthorized_personal_field(self, consultant_user, employee):
        # Le périmètre "champs personnels" se combine en ET avec le
        # périmètre organisationnel (qui vs quoi) — il faut donc aussi
        # couvrir l'employé organisationnellement pour observer l'effet du
        # périmètre "champs personnels" seul (les deux axes sont
        # default-deny depuis le 2026-09-01).
        consultant_user.scope_directions.set([employee.direction])
        date_naissance = ChampPersonnalise.objects.get(code="date_naissance")
        autre_perso = ChampPersonnalise.objects.create(
            nom="Autre perso", code="AUTRE_PERSO", categorie=ChampPersonnalise.Categorie.PERSONNEL
        )
        consultant_user.scope_champs_personnels.add(date_naissance)
        data = EmployeeDetailSerializer(employee, context=make_context(consultant_user)).data
        assert "date_naissance" in data["champs_categories"]
        assert "AUTRE_PERSO" not in data["champs_categories"]

    def test_administratif_never_restricted(self, consultant_user, employee):
        consultant_user.scope_directions.set([employee.direction])
        date_naissance = ChampPersonnalise.objects.get(code="date_naissance")
        consultant_user.scope_champs_personnels.add(date_naissance)
        data = EmployeeDetailSerializer(employee, context=make_context(consultant_user)).data
        assert data["champs_categories"]["matricule"] == "ADMINISTRATIF"

    def test_precise_champ_grant_unlocks_field_outside_org_scope(
        self, scoped_consultant_2, employee, other_service_2
    ):
        """Un grant EmployeeAccessGrant.champ_personnel donne accès à ce
        champ précis pour cet employé, même hors périmètre organisationnel
        et sans périmètre global scope_champs_personnels."""
        scoped_consultant_2.scope_services.set([other_service_2])
        date_naissance = ChampPersonnalise.objects.get(code="date_naissance")
        EmployeeAccessGrant.objects.create(
            user=scoped_consultant_2, employee=employee, champ_personnel=date_naissance
        )
        data = EmployeeDetailSerializer(employee, context=make_context(scoped_consultant_2)).data
        assert "date_naissance" in data["champs_categories"]

    def test_full_dossier_grant_unlocks_all_personal_fields(
        self, scoped_consultant_2, employee, other_service_2
    ):
        scoped_consultant_2.scope_services.set([other_service_2])
        EmployeeAccessGrant.objects.create(user=scoped_consultant_2, employee=employee)
        data = EmployeeDetailSerializer(employee, context=make_context(scoped_consultant_2)).data
        assert "date_naissance" in data["champs_categories"]
        assert data["champs_categories"]["matricule"] == "ADMINISTRATIF"

    def test_no_org_scope_no_grant_hides_personal_fields(
        self, scoped_consultant_2, employee, other_service_2
    ):
        scoped_consultant_2.scope_services.set([other_service_2])
        data = EmployeeDetailSerializer(employee, context=make_context(scoped_consultant_2)).data
        assert "date_naissance" not in data["champs_categories"]
        # ADMINISTRATIF fields are never restricted by this scope.
        assert data["champs_categories"]["matricule"] == "ADMINISTRATIF"
