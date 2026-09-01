"""
Tests — GET /api/employees/<id>/adjacent/ (EmployeeAdjacentView) : employé
précédent/suivant trié par N° Contrat, pour la navigation sur la fiche
employé sans repasser par la liste.
"""

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from employees.models import Employee, Contrat

pytestmark = pytest.mark.django_db


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def three_employees_with_contrats(admin_user, direction, departement, service, poste, type_contrat, categorie):
    employees = []
    for i, num in enumerate(["A-001", "B-002", "C-003"]):
        e = Employee.objects.create(
            matricule=f"EMP-ADJ-{i}", nom=f"Nom{i}", prenom="Test",
            direction=direction, departement=departement, service=service,
            poste=poste, type_contrat=type_contrat, categorie=categorie,
            created_by=admin_user,
        )
        Contrat.objects.create(
            numero_contrat=num, employee=e, type_contrat=type_contrat,
            date_debut="2024-01-01", statut="actif", created_by=admin_user,
        )
        employees.append(e)
    return employees


class TestEmployeeAdjacent:
    def test_middle_employee_has_both_neighbors(self, admin_user, three_employees_with_contrats):
        e_a, e_b, e_c = three_employees_with_contrats
        resp = auth_client(admin_user).get(f"/api/employees/{e_b.id}/adjacent/")
        assert resp.status_code == 200
        assert resp.data["prev"]["id"] == str(e_a.id)
        assert resp.data["next"]["id"] == str(e_c.id)

    def test_first_employee_has_no_prev(self, admin_user, three_employees_with_contrats):
        e_a, _, _ = three_employees_with_contrats
        resp = auth_client(admin_user).get(f"/api/employees/{e_a.id}/adjacent/")
        assert resp.data["prev"] is None
        assert resp.data["next"] is not None

    def test_last_employee_has_no_next(self, admin_user, three_employees_with_contrats):
        _, _, e_c = three_employees_with_contrats
        resp = auth_client(admin_user).get(f"/api/employees/{e_c.id}/adjacent/")
        assert resp.data["next"] is None
        assert resp.data["prev"] is not None

    def test_consultant_out_of_scope_gets_404(self, consultant_user, three_employees_with_contrats):
        e_a, _, _ = three_employees_with_contrats
        resp = auth_client(consultant_user).get(f"/api/employees/{e_a.id}/adjacent/")
        assert resp.status_code == 404

    def test_consultant_scoped_only_sees_scoped_neighbors(
        self, consultant_user, three_employees_with_contrats, service
    ):
        e_a, e_b, e_c = three_employees_with_contrats
        consultant_user.scope_services.set([service])
        resp = auth_client(consultant_user).get(f"/api/employees/{e_b.id}/adjacent/")
        assert resp.status_code == 200
        assert resp.data["prev"]["id"] == str(e_a.id)
        assert resp.data["next"]["id"] == str(e_c.id)
