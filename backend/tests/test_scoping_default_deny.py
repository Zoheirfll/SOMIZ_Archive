"""
Tests — nouvelle règle de scoping (2026-09-01) : "aucune case cochée dans
une dimension" signifie désormais accès à RIEN sur cette dimension
(inversion de l'ancien comportement "vide = non restreint"). ADMIN/
SUPERADMIN restent toujours non restreints. Les accès ponctuels
(EmployeeAccessGrant) continuent de fonctionner comme un AJOUT (OR) même
quand le périmètre organisationnel de base est "rien par défaut".
"""

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from employees.models import (
    Direction, Departement, Service, Pole, Cellule, Section,
    TypeDocument, ChampPersonnalise, EmployeeAccessGrant,
)

pytestmark = pytest.mark.django_db

User = get_user_model()


@pytest.fixture
def bare_consultant(db):
    """Consultant sans AUCUNE case cochée nulle part — doit désormais
    n'avoir accès à rien (sauf grants ponctuels explicites)."""
    return User.objects.create_user(
        username="bare_consultant",
        password="BarePass123!",
        nom="Bare",
        prenom="Test",
        role="CONSULTANT",
        consent_loi1807_accepted_at=timezone.now(),
    )


class TestOrgScopeDefaultDeny:
    def test_consultant_no_scope_denied(self, bare_consultant, employee):
        assert bare_consultant.can_access_employee(employee) is False

    def test_employee_scope_q_matches_nothing(self, bare_consultant, employee):
        from employees.models import Employee
        qs = Employee.objects.filter(bare_consultant.employee_scope_q())
        assert not qs.filter(pk=employee.pk).exists()

    def test_admin_still_unrestricted(self, admin_user, employee):
        assert admin_user.can_access_employee(employee) is True
        assert admin_user.employee_scope_q().children == []

    def test_superadmin_still_unrestricted(self, employee):
        superadmin = User.objects.create_user(
            username="superadmin_deny_test", password="SuperPass123!",
            nom="Super", prenom="Admin", role="SUPERADMIN",
            consent_loi1807_accepted_at=timezone.now(),
        )
        assert superadmin.can_access_employee(employee) is True

    def test_grant_still_gives_access_with_empty_org_scope(self, bare_consultant, employee):
        assert bare_consultant.can_access_employee(employee) is False
        EmployeeAccessGrant.objects.create(user=bare_consultant, employee=employee)
        assert bare_consultant.can_access_employee(employee) is True


class TestAccessibleReferentielQsDefaultDeny:
    def test_directions_qs_empty_for_bare_consultant(self, bare_consultant, direction):
        assert bare_consultant.accessible_directions_qs().count() == 0

    def test_poles_qs_empty_for_bare_consultant(self, bare_consultant, direction):
        Pole.objects.create(nom="Pole X", direction=direction)
        assert bare_consultant.accessible_poles_qs().count() == 0

    def test_departements_qs_empty_for_bare_consultant(self, bare_consultant, departement):
        assert bare_consultant.accessible_departements_qs().count() == 0

    def test_services_qs_empty_for_bare_consultant(self, bare_consultant, service):
        assert bare_consultant.accessible_services_qs().count() == 0

    def test_cellules_qs_empty_for_bare_consultant(self, bare_consultant, direction):
        Cellule.objects.create(nom="Cellule X", direction=direction)
        assert bare_consultant.accessible_cellules_qs().count() == 0

    def test_sections_qs_empty_for_bare_consultant(self, bare_consultant, direction):
        Section.objects.create(nom="Section X", direction=direction)
        assert bare_consultant.accessible_sections_qs().count() == 0

    def test_directions_qs_full_for_admin(self, admin_user, direction):
        assert admin_user.accessible_directions_qs().count() >= 1

    def test_directions_list_endpoint_empty_for_bare_consultant(self, bare_consultant, direction):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=bare_consultant)
        resp = client.get("/api/ref/directions/")
        assert resp.status_code == 200
        data = resp.data if isinstance(resp.data, list) else resp.data.get("results")
        assert data == []


class TestTypeDocumentScopeDefaultDeny:
    def test_can_access_document_type_denied_when_empty(self, bare_consultant, type_doc_obligatoire):
        assert bare_consultant.can_access_document_type(type_doc_obligatoire.id) is False

    def test_document_type_scope_q_matches_nothing(self, bare_consultant, type_doc_obligatoire):
        from employees.models import EmployeeDocument
        q = bare_consultant.document_type_scope_q()
        qs = EmployeeDocument.objects.filter(q)
        assert not qs.filter(type_doc_id=type_doc_obligatoire.id).exists()

    def test_accessible_types_documents_qs_empty(self, bare_consultant, type_doc_obligatoire):
        assert bare_consultant.accessible_types_documents_qs().count() == 0

    def test_admin_can_access_any_type(self, admin_user, type_doc_obligatoire):
        assert admin_user.can_access_document_type(type_doc_obligatoire.id) is True

    def test_accessible_type_doc_ids_for_employee_empty_when_org_and_types_both_unconfigured(
        self, bare_consultant, employee
    ):
        """Même si l'employé était par ailleurs accessible, l'axe Types de
        documents vide ne débloque plus tout — seul un grant précis
        pourrait le faire."""
        ids = bare_consultant.accessible_type_doc_ids_for_employee(employee)
        assert ids == set()


class TestChampPersonnelScopeDefaultDeny:
    def test_can_access_champ_personnel_denied_when_empty(self, bare_consultant):
        champ = ChampPersonnalise.objects.create(
            nom="Champ Test Deny", code="CHAMP_DENY", categorie=ChampPersonnalise.Categorie.PERSONNEL,
        )
        assert bare_consultant.can_access_champ_personnel(champ.id) is False

    def test_accessible_champs_personnels_qs_empty(self, bare_consultant):
        ChampPersonnalise.objects.create(
            nom="Champ Test Deny 2", code="CHAMP_DENY_2", categorie=ChampPersonnalise.Categorie.PERSONNEL,
        )
        assert bare_consultant.accessible_champs_personnels_qs().count() == 0

    def test_admin_can_access_any_champ(self, admin_user):
        champ = ChampPersonnalise.objects.create(
            nom="Champ Test Deny Admin", code="CHAMP_DENY_ADMIN", categorie=ChampPersonnalise.Categorie.PERSONNEL,
        )
        assert admin_user.can_access_champ_personnel(champ.id) is True

    def test_accessible_champs_personnels_for_employee_empty_when_unconfigured(self, bare_consultant, employee):
        ids = bare_consultant.accessible_champs_personnels_for_employee(employee)
        assert ids == set()

    def test_has_champ_personnel_scope_restriction_still_false_when_not_configured(self, bare_consultant):
        """Sémantique inchangée : has_*_scope_restriction reste 'True si une
        restriction est explicitement configurée' — pas un indicateur du
        résultat d'accès réel (qui, lui, est désormais 'rien' par défaut)."""
        assert bare_consultant.has_champ_personnel_scope_restriction is False
