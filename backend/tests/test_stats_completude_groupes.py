"""
audit/stats.py — complétude par direction / par département et dossiers
complétés par mois (build_stats_detail).

Verrouille les chiffres (parité avant/après optimisation) et vérifie que le
nombre de requêtes ne dépend ni du nombre de groupes ni du nombre de types
obligatoires (avant : 1 requête + 1 jointure par type, PAR groupe).
"""
import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from audit.stats import build_stats_detail
from employees.models import (
    Departement, Direction, Employee, EmployeeDocument, TypeDocument,
)

pytestmark = pytest.mark.django_db


def _types_obligatoires(n):
    return [
        TypeDocument.objects.create(nom=f"Oblig {i}", code=f"OB{i}", obligatoire=True, ordre=i)
        for i in range(n)
    ]


def _employe(admin_user, direction, departement, matricule):
    return Employee.objects.create(
        matricule=matricule, nom=f"Nom{matricule}", prenom="P",
        direction=direction, departement=departement, created_by=admin_user,
    )


@pytest.fixture
def deux_directions(admin_user, direction, departement):
    """DG : 2 employés (1 complet, 1 partiel). DIR2 : 1 employé complet."""
    types = _types_obligatoires(2)
    autre_dir = Direction.objects.create(nom="Direction 2", code="D2")
    autre_dep = Departement.objects.create(nom="Dép 2", direction=autre_dir, code="D2D")
    a = _employe(admin_user, direction, departement, "A")
    b = _employe(admin_user, direction, departement, "B")
    c = _employe(admin_user, autre_dir, autre_dep, "C")
    for t in types:
        EmployeeDocument.objects.create(employee=a, type_doc=t)
        EmployeeDocument.objects.create(employee=c, type_doc=t)
    EmployeeDocument.objects.create(employee=b, type_doc=types[0])
    return direction, autre_dir


class TestChiffres:
    def test_completude_par_direction(self, deux_directions):
        dg, d2 = deux_directions
        par_nom = {r["nom"]: r for r in build_stats_detail(None, None)["completude_par_direction"]}
        assert (par_nom[dg.nom]["total"], par_nom[dg.nom]["complets"], par_nom[dg.nom]["taux"]) == (2, 1, 50.0)
        assert (par_nom[d2.nom]["total"], par_nom[d2.nom]["complets"], par_nom[d2.nom]["taux"]) == (1, 1, 100.0)

    def test_resultat_trie_par_taux_croissant(self, deux_directions):
        taux = [r["taux"] for r in build_stats_detail(None, None)["completude_par_direction"]]
        assert taux == sorted(taux)

    def test_completude_par_departement_expose_la_direction(self, deux_directions):
        rows = build_stats_detail(None, None)["completude_par_departement"]
        assert {r["direction_nom"] for r in rows} == {"Direction Générale", "Direction 2"}
        assert sum(r["complets"] for r in rows) == 2

    def test_dossiers_completes_comptes_au_mois_du_dernier_document(self, deux_directions):
        evolution = build_stats_detail(None, None)["evolution_mensuelle"]
        assert sum(m["dossiers_completes"] for m in evolution) == 2  # A et C, pas B

    def test_sans_type_obligatoire_tous_les_actifs_sont_complets(self, admin_user, direction, departement):
        _employe(admin_user, direction, departement, "Z1")
        _employe(admin_user, direction, departement, "Z2")
        rows = build_stats_detail(None, None)["completude_par_direction"]
        assert (rows[0]["total"], rows[0]["complets"]) == (2, 2)


class TestRequetes:
    @staticmethod
    def _nb_requetes():
        with CaptureQueriesContext(connection) as ctx:
            build_stats_detail(None, None)
        return len(ctx)

    def test_requetes_constantes_quand_groupes_et_types_augmentent(self, admin_user, direction, departement):
        _types_obligatoires(2)
        _employe(admin_user, direction, departement, "E0")
        avant = self._nb_requetes()
        for i in range(3, 9):
            TypeDocument.objects.create(nom=f"Oblig {i}", code=f"OB{i}", obligatoire=True, ordre=i)
        for i in range(5):
            d = Direction.objects.create(nom=f"Dir {i}", code=f"X{i}")
            dep = Departement.objects.create(nom=f"Dep {i}", direction=d, code=f"XD{i}")
            _employe(admin_user, d, dep, f"E{i + 1}")
        apres = self._nb_requetes()
        assert apres == avant, f"{avant} requêtes (1 groupe, 2 types) puis {apres} (6 groupes, 8 types)"

    def test_requetes_constantes_quand_la_periode_s_allonge(self, admin_user, direction, departement):
        from datetime import date
        _employe(admin_user, direction, departement, "P0")

        def nb(debut, fin):
            with CaptureQueriesContext(connection) as ctx:
                build_stats_detail(debut, fin)
            return len(ctx)

        court = nb(date(2026, 1, 1), date(2026, 2, 28))
        long = nb(date(2024, 1, 1), date(2026, 2, 28))
        assert long == court, f"{court} requêtes sur 2 mois, {long} sur 26 mois : N+1 par mois"


class TestIndicateurDossiersCompletes:
    @staticmethod
    def _valeur(debut, fin):
        from datetime import date
        d = build_stats_detail(date.fromisoformat(debut), date.fromisoformat(fin))
        return d["indicateurs"]["dossiers_completes"]["valeur"]

    def test_compte_les_dossiers_complets_recrutes_sur_la_periode(self, admin_user, direction, departement):
        from datetime import date
        types = _types_obligatoires(2)
        dans = _employe(admin_user, direction, departement, "I1")
        partiel = _employe(admin_user, direction, departement, "I2")
        hors = _employe(admin_user, direction, departement, "I3")
        for e, jour in ((dans, date(2026, 2, 10)), (partiel, date(2026, 2, 11)), (hors, date(2025, 6, 1))):
            Employee.objects.filter(pk=e.pk).update(date_embauche=jour)
        for t in types:
            EmployeeDocument.objects.create(employee=dans, type_doc=t)
            EmployeeDocument.objects.create(employee=hors, type_doc=t)
        EmployeeDocument.objects.create(employee=partiel, type_doc=types[0])
        assert self._valeur("2026-02-01", "2026-02-28") == 1

    def test_sans_type_obligatoire_tous_les_actifs_de_la_periode_comptent(self, admin_user, direction, departement):
        from datetime import date
        e = _employe(admin_user, direction, departement, "J1")
        Employee.objects.filter(pk=e.pk).update(date_embauche=date(2026, 2, 10))
        assert self._valeur("2026-02-01", "2026-02-28") == 1


class TestEvolutionMensuelle:
    def test_recrutements_comptes_par_mois(self, admin_user, direction, departement):
        from datetime import date
        for matricule, jour in (("R1", date(2026, 1, 5)), ("R2", date(2026, 1, 20)), ("R3", date(2026, 3, 2))):
            e = _employe(admin_user, direction, departement, matricule)
            Employee.objects.filter(pk=e.pk).update(date_embauche=jour)
        evo = {m["mois"]: m for m in build_stats_detail(date(2026, 1, 1), date(2026, 3, 31))["evolution_mensuelle"]}
        assert [evo[k]["recrutements"] for k in ("2026-01", "2026-02", "2026-03")] == [2, 0, 1]
