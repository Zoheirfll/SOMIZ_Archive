import pytest

from accounts.models import User
from conges.hierarchie import chaine_validation
from employees.models import Cellule, Employee, Section


def _emp(employee, matricule, nom, **unites):
    base = dict(
        direction=employee.direction, departement=employee.departement, service=employee.service,
        poste=employee.poste, type_contrat=employee.type_contrat, categorie=employee.categorie,
        created_by=employee.created_by,
    )
    base.update(unites)
    return Employee.objects.create(matricule=matricule, nom=nom, prenom="X", **base)


def _chef(unite, employee):
    unite.responsable = employee
    unite.save()
    return employee


def _niveaux(employee):
    return [(m.niveau, m.unite_type, m.responsable_id) for m in chaine_validation(employee)]


@pytest.mark.django_db
class TestChaineValidation:
    def test_chaine_complete_service_departement_direction(self, employee, service, departement, direction):
        chef_s = _chef(service, _emp(employee, "S1", "ChefS"))
        chef_d = _chef(departement, _emp(employee, "D1", "ChefD"))
        dir_ = _chef(direction, _emp(employee, "R1", "Dir"))
        assert _niveaux(employee) == [
            (1, "service", chef_s.pk), (2, "departement", chef_d.pk), (3, "direction", dir_.pk),
        ]

    def test_maillon_vacant_saute(self, employee, service, direction):
        chef_s = _chef(service, _emp(employee, "S1", "ChefS"))
        dir_ = _chef(direction, _emp(employee, "R1", "Dir"))
        assert _niveaux(employee) == [(1, "service", chef_s.pk), (3, "direction", dir_.pk)]

    def test_aucun_responsable_chaine_vide(self, employee):
        assert chaine_validation(employee) == []

    def test_chef_direct_est_l_employe_lui_meme_saute(self, employee, service, departement):
        _chef(service, employee)
        chef_d = _chef(departement, _emp(employee, "D1", "ChefD"))
        assert _niveaux(employee) == [(2, "departement", chef_d.pk)]

    def test_section_prioritaire_sur_service(self, employee, service, departement):
        section = Section.objects.create(nom="Sec", departement=departement)
        chef_sec = _chef(section, _emp(employee, "SE1", "ChefSec"))
        _chef(service, _emp(employee, "S1", "ChefS"))
        e = _emp(employee, "E2", "Agent", section=section)
        assert _niveaux(e)[0] == (1, "section", chef_sec.pk)

    def test_cellule_sous_direction_directe_sans_departement(self, employee, direction):
        cellule = Cellule.objects.create(nom="Cel", direction=direction)
        chef_c = _chef(cellule, _emp(employee, "C1", "ChefC"))
        dir_ = _chef(direction, _emp(employee, "R1", "Dir"))
        e = _emp(employee, "E2", "Agent", cellule=cellule, departement=None, service=None)
        assert _niveaux(e) == [(1, "cellule", chef_c.pk), (3, "direction", dir_.pk)]

    def test_meme_personne_deux_niveaux_signe_une_fois_au_plus_haut(self, employee, service, departement):
        chef = _emp(employee, "S1", "Cumul")
        _chef(service, chef)
        _chef(departement, chef)
        assert _niveaux(employee) == [(2, "departement", chef.pk)]

    def test_compte_lie_expose_et_sans_compte_signale(self, employee, service, departement):
        chef_s = _chef(service, _emp(employee, "S1", "ChefS"))
        chef_d = _chef(departement, _emp(employee, "D1", "ChefD"))
        user = User.objects.create_user(username="cs", password="x", nom="a", prenom="b", employee=chef_s)
        chaine = chaine_validation(Employee.objects.get(pk=employee.pk))
        assert chaine[0].compte == user
        assert chaine[1].compte is None
        assert chaine[1].responsable_id == chef_d.pk
