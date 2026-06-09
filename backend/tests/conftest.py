"""
Fixtures partagées pour tous les tests backend SOMIZ.
"""

import pytest
from django.contrib.auth import get_user_model
from employees.models import (
    Direction, Departement, Service, Poste,
    TypeContrat, Categorie, TypeDocument, Employee
)

User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="admin_test",
        password="AdminPass123!",
        nom="Admin",
        prenom="Test",
        role="ADMIN",
    )


@pytest.fixture
def consultant_user(db):
    return User.objects.create_user(
        username="consultant_test",
        password="ConsultPass123!",
        nom="Consultant",
        prenom="Test",
        role="CONSULTANT",
    )


@pytest.fixture
def direction(db):
    return Direction.objects.create(nom="Direction Générale", code="DG")


@pytest.fixture
def departement(db, direction):
    return Departement.objects.create(nom="RH", direction=direction, code="RH")


@pytest.fixture
def service(db, departement):
    return Service.objects.create(nom="Paie", departement=departement)


@pytest.fixture
def poste(db):
    return Poste.objects.create(nom="Ingénieur")


@pytest.fixture
def type_contrat(db):
    return TypeContrat.objects.create(nom="CDI")


@pytest.fixture
def categorie(db):
    return Categorie.objects.create(nom="Cadre")


@pytest.fixture
def type_doc_obligatoire(db):
    return TypeDocument.objects.create(
        nom="Carte Nationale", code="CIN", obligatoire=True, ordre=1
    )


@pytest.fixture
def type_doc_facultatif(db):
    return TypeDocument.objects.create(
        nom="CV", code="CV", obligatoire=False, ordre=2
    )


@pytest.fixture
def employee(db, admin_user, direction, departement, service, poste, type_contrat, categorie):
    return Employee.objects.create(
        matricule="EMP-001",
        nom="Dupont",
        prenom="Jean",
        direction=direction,
        departement=departement,
        service=service,
        poste=poste,
        type_contrat=type_contrat,
        categorie=categorie,
        created_by=admin_user,
    )
