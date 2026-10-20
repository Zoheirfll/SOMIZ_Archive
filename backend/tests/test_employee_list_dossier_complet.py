"""
GET /api/employees/?dossier_complet=true|false avec PLUSIEURS types obligatoires.

Les tests existants (test_employees_views.py) n'utilisent qu'un seul type
obligatoire. Ici : présence partielle, cohérence avec le champ `dossier_complet`
renvoyé par la liste, et nombre de jointures sur `employee_documents`
indépendant du nombre de types obligatoires (avant : une jointure par type).
"""
import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from employees.models import Employee, EmployeeDocument, TypeDocument

pytestmark = pytest.mark.django_db
URL = "/api/employees/"


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _employe(admin_user, base, matricule):
    return Employee.objects.create(
        matricule=matricule, nom=f"Nom{matricule}", prenom="P",
        direction=base.direction, departement=base.departement,
        service=base.service, created_by=admin_user,
    )


def _types_obligatoires(n):
    return [
        TypeDocument.objects.create(nom=f"Oblig {i}", code=f"OB{i}", obligatoire=True, ordre=i)
        for i in range(n)
    ]


def _ids(resp):
    return {e["matricule"] for e in resp.data["results"]}


class TestPlusieursTypesObligatoires:
    @pytest.fixture
    def trois_employes(self, admin_user, employee):
        types = _types_obligatoires(3)
        complet = employee                                  # EMP-001 : 3/3
        partiel = _employe(admin_user, employee, "EMP-002")  # 2/3
        _employe(admin_user, employee, "EMP-003")            # 0/3
        for t in types:
            EmployeeDocument.objects.create(employee=complet, type_doc=t)
        for t in types[:2]:
            EmployeeDocument.objects.create(employee=partiel, type_doc=t)
        return types

    def test_true_ne_garde_que_les_dossiers_complets(self, admin_user, trois_employes):
        assert _ids(_client(admin_user).get(URL, {"dossier_complet": "true"})) == {"EMP-001"}

    def test_false_garde_partiels_et_vides(self, admin_user, trois_employes):
        assert _ids(_client(admin_user).get(URL, {"dossier_complet": "false"})) == {"EMP-002", "EMP-003"}

    def test_un_document_inactif_ne_compte_pas(self, admin_user, trois_employes, employee):
        EmployeeDocument.objects.filter(employee=employee, type_doc=trois_employes[0]).update(is_active=False)
        assert _ids(_client(admin_user).get(URL, {"dossier_complet": "true"})) == set()

    def test_un_type_facultatif_present_ne_compense_pas_un_obligatoire_manquant(
        self, admin_user, trois_employes
    ):
        facultatif = TypeDocument.objects.create(nom="CV", code="CV", obligatoire=False)
        vide = Employee.objects.get(matricule="EMP-003")
        EmployeeDocument.objects.create(employee=vide, type_doc=facultatif)
        assert "EMP-003" in _ids(_client(admin_user).get(URL, {"dossier_complet": "false"}))

    def test_coherent_avec_le_champ_dossier_complet_de_la_liste(self, admin_user, trois_employes):
        resp = _client(admin_user).get(URL)
        par_matricule = {e["matricule"]: e["dossier_complet"] for e in resp.data["results"]}
        assert par_matricule == {"EMP-001": True, "EMP-002": False, "EMP-003": False}

    def test_sans_type_obligatoire_true_garde_tout_et_false_ne_garde_rien(self, admin_user, employee):
        """Comportement historique conservé : rien d'obligatoire => tout le monde est complet."""
        assert _ids(_client(admin_user).get(URL, {"dossier_complet": "true"})) == {"EMP-001"}
        assert _ids(_client(admin_user).get(URL, {"dossier_complet": "false"})) == set()


class TestJointures:
    @staticmethod
    def _jointures_documents(admin_user):
        with CaptureQueriesContext(connection) as ctx:
            assert _client(admin_user).get(URL, {"dossier_complet": "true"}).status_code == 200
        liste = max(ctx.captured_queries, key=lambda q: len(q["sql"]))["sql"]
        return liste.count('JOIN "employee_documents"')

    def test_le_nombre_de_jointures_ne_depend_pas_du_nombre_de_types_obligatoires(
        self, admin_user, employee
    ):
        _types_obligatoires(2)
        avec_2 = self._jointures_documents(admin_user)
        for i in range(2, 9):
            TypeDocument.objects.create(nom=f"Oblig {i}", code=f"OB{i}", obligatoire=True, ordre=i)
        avec_9 = self._jointures_documents(admin_user)
        assert avec_9 == avec_2, f"{avec_2} jointures pour 2 types obligatoires, {avec_9} pour 9"
