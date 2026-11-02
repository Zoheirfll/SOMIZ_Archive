"""Champ `Employee.sexe` (2026-10-30) — colonne fixe à choix fermés, ajoutée
pour les indicateurs de parité du reporting DRH (voir
docs/superpowers/specs/2026-10-30-reporting-statistiques-design.md).
Donnée personnelle : champ système de catégorie PERSONNEL, masqué côté
serveur dans la fiche pour un compte qui n'a pas accès à ce champ."""
import io

import openpyxl
import pytest
from openpyxl import Workbook
from rest_framework.test import APIClient, APIRequestFactory

from employees.models import ChampPersonnalise, Employee
from employees.serializers import EmployeeDetailSerializer

pytestmark = pytest.mark.django_db


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _context(user):
    request = APIRequestFactory().get('/')
    request.user = user
    return {'request': request}


def _xlsx(headers, rows):
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    buf.name = 'import.xlsx'
    return buf


class TestModele:
    def test_vide_par_defaut(self, employee):
        assert employee.sexe == ''

    def test_champ_systeme_personnel_seede(self):
        champ = ChampPersonnalise.objects.get(code='sexe')
        assert champ.is_systeme is True
        assert champ.categorie == ChampPersonnalise.Categorie.PERSONNEL


class TestApi:
    def test_admin_modifie_le_sexe(self, admin_user, employee):
        resp = _client(admin_user).patch(f'/api/employees/{employee.id}/', {'sexe': 'F'}, format='json')
        assert resp.status_code == 200, resp.data
        employee.refresh_from_db()
        assert employee.sexe == 'F'

    def test_null_du_formulaire_vide_le_champ(self, admin_user, employee):
        employee.sexe = 'M'
        employee.save()
        resp = _client(admin_user).patch(f'/api/employees/{employee.id}/', {'sexe': None}, format='json')
        assert resp.status_code == 200, resp.data
        employee.refresh_from_db()
        assert employee.sexe == ''

    def test_valeur_hors_choix_refusee(self, admin_user, employee):
        resp = _client(admin_user).patch(f'/api/employees/{employee.id}/', {'sexe': 'X'}, format='json')
        assert resp.status_code == 400
        assert 'sexe' in resp.data

    def test_admin_voit_le_sexe_dans_la_fiche(self, admin_user, employee):
        employee.sexe = 'M'
        employee.save()
        data = EmployeeDetailSerializer(employee, context=_context(admin_user)).data
        assert data['sexe'] == 'M'
        assert data['champs_categories']['sexe'] == 'PERSONNEL'

    def test_consultant_sans_acces_au_champ_ne_recoit_pas_la_valeur(self, consultant_user, employee):
        """Masquage côté serveur, pas seulement dans l'UI."""
        employee.sexe = 'F'
        employee.save()
        consultant_user.scope_directions.set([employee.direction])
        data = EmployeeDetailSerializer(employee, context=_context(consultant_user)).data
        assert 'sexe' not in data['champs_categories']
        assert data['sexe'] is None

    def test_consultant_avec_acces_au_champ_recoit_la_valeur(self, consultant_user, employee):
        employee.sexe = 'F'
        employee.save()
        consultant_user.scope_directions.set([employee.direction])
        consultant_user.scope_champs_personnels.add(ChampPersonnalise.objects.get(code='sexe'))
        data = EmployeeDetailSerializer(employee, context=_context(consultant_user)).data
        assert data['sexe'] == 'F'

    def test_filtre_de_liste(self, admin_user, employee):
        employee.sexe = 'F'
        employee.save()
        client = _client(admin_user)
        assert client.get('/api/employees/?sexe=F').data['count'] == 1
        assert client.get('/api/employees/?sexe=M').data['count'] == 0
        assert client.get('/api/employees/?sexe=non_renseigne').data['count'] == 0


class TestImport:
    @pytest.mark.parametrize('saisie, attendu', [
        ('F', 'F'), ('femme', 'F'), ('Féminin', 'F'),
        ('M', 'M'), ('H', 'M'), ('Homme', 'M'), ('masculin', 'M'),
        ('', ''),
    ])
    def test_valeurs_normalisees(self, admin_user, saisie, attendu):
        buf = _xlsx(['matricule', 'numero_contrat', 'nom', 'prenom', 'sexe'],
                    [['S001', '1', 'DUPONT', 'Lina', saisie]])
        resp = _client(admin_user).post('/api/employees/import/', {'file': buf}, format='multipart')
        assert resp.status_code == 200, resp.data
        assert resp.data['nb_crees'] == 1
        assert Employee.objects.get(matricule='S001').sexe == attendu

    def test_valeur_inconnue_bloque_la_ligne(self, admin_user):
        buf = _xlsx(['matricule', 'numero_contrat', 'nom', 'prenom', 'sexe'],
                    [['S002', '2', 'DUPONT', 'Sam', 'Z']])
        resp = _client(admin_user).post('/api/employees/import/', {'file': buf}, format='multipart')
        assert resp.data['nb_crees'] == 0
        assert not Employee.objects.filter(matricule='S002').exists()

    def test_template_contient_la_colonne(self, admin_user):
        resp = _client(admin_user).get('/api/employees/import/template/')
        assert resp.status_code == 200
        entetes = [c.value for c in next(openpyxl.load_workbook(io.BytesIO(resp.content)).active.iter_rows())]
        assert 'sexe' in entetes


class TestExport:
    def test_colonne_sexe_libellee(self, admin_user, employee):
        employee.sexe = 'F'
        employee.save()
        resp = _client(admin_user).get('/api/employees/export/')
        lignes = list(openpyxl.load_workbook(io.BytesIO(resp.content))['Employés'].iter_rows(values_only=True))
        ligne = dict(zip(lignes[0], lignes[1]))
        assert ligne['Sexe'] == 'Féminin'
