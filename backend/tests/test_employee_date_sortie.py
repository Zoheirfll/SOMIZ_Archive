# backend/tests/test_employee_date_sortie.py
"""Employee.date_sortie — vraie date de départ, base du turnover (voir
docs/superpowers/specs/2026-10-30-reporting-statistiques-design.md)."""
from datetime import date, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from employees.models import ChampPersonnalise, Employee

pytestmark = pytest.mark.django_db


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _patch(user, employee, data):
    return _client(user).patch(f'/api/employees/{employee.id}/', data, format='json')


class TestFormulaire:
    def test_archiver_sans_date_de_sortie_est_refuse(self, admin_user, employee):
        resp = _patch(admin_user, employee, {'statut': 'archive'})
        assert resp.status_code == 400
        assert 'date_sortie' in resp.data
        employee.refresh_from_db()
        assert employee.statut == 'actif'

    def test_archiver_avec_date_de_sortie(self, admin_user, employee):
        resp = _patch(admin_user, employee, {'statut': 'archive', 'date_sortie': '2026-03-31'})
        assert resp.status_code == 200, resp.data
        employee.refresh_from_db()
        assert employee.date_sortie == date(2026, 3, 31)

    def test_date_future_refusee(self, admin_user, employee):
        demain = (timezone.localdate() + timedelta(days=1)).isoformat()
        resp = _patch(admin_user, employee, {'statut': 'archive', 'date_sortie': demain})
        assert resp.status_code == 400
        assert 'date_sortie' in resp.data

    def test_date_avant_recrutement_refusee(self, admin_user, employee):
        employee.date_embauche = date(2020, 1, 1)
        employee.save()
        resp = _patch(admin_user, employee, {'statut': 'archive', 'date_sortie': '2019-12-31'})
        assert resp.status_code == 400
        assert 'date_sortie' in resp.data

    def test_archive_historique_sans_date_reste_modifiable(self, admin_user, employee):
        """Un archivé d'avant ce chantier (date_sortie vide) n'est pas bloqué
        pour une autre modification : la date n'est exigée qu'à la transition."""
        Employee.objects.filter(pk=employee.pk).update(statut='archive')
        resp = _patch(admin_user, employee, {'nom': 'Martin'})
        assert resp.status_code == 200, resp.data

    def test_restauration_vide_la_date(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(statut='archive', date_sortie=date(2026, 1, 15))
        resp = _patch(admin_user, employee, {'statut': 'actif'})
        assert resp.status_code == 200, resp.data
        employee.refresh_from_db()
        assert employee.date_sortie is None

    def test_null_du_formulaire_accepte_pour_un_actif(self, admin_user, employee):
        resp = _patch(admin_user, employee, {'statut': 'actif', 'date_sortie': None})
        assert resp.status_code == 200, resp.data


class TestExposition:
    def test_fiche_expose_la_date(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(statut='archive', date_sortie=date(2026, 2, 1))
        resp = _client(admin_user).get(f'/api/employees/{employee.id}/')
        assert resp.data['date_sortie'] == '2026-02-01'

    def test_champ_systeme_administratif_seede(self):
        champ = ChampPersonnalise.objects.get(code='date_sortie')
        assert champ.is_systeme is True
        assert champ.categorie == ChampPersonnalise.Categorie.ADMINISTRATIF


from audit.models import AuditLog

URL_MASSE = '/api/employees/bulk-delete/'


class TestMasse:
    def _post(self, user, data):
        return _client(user).post(URL_MASSE, data, format='json')

    def test_archivage_sans_date_refuse(self, admin_user, employee):
        resp = self._post(admin_user, {'ids': [str(employee.id)], 'action': 'archive'})
        assert resp.status_code == 400
        employee.refresh_from_db()
        assert employee.statut == 'actif'

    def test_archivage_avec_date(self, admin_user, employee):
        resp = self._post(admin_user, {'ids': [str(employee.id)], 'action': 'archive', 'date_sortie': '2026-04-30'})
        assert resp.status_code == 200, resp.data
        employee.refresh_from_db()
        assert (employee.statut, employee.date_sortie) == ('archive', date(2026, 4, 30))
        log = AuditLog.objects.filter(target_label__startswith='Archivage en masse').latest('timestamp')
        assert log.details['date_sortie'] == '2026-04-30'

    def test_date_illisible_ou_future_refusee(self, admin_user, employee):
        demain = (timezone.localdate() + timedelta(days=1)).isoformat()
        for valeur in ('31/04/2026', demain):
            resp = self._post(admin_user, {'ids': [str(employee.id)], 'action': 'archive', 'date_sortie': valeur})
            assert resp.status_code == 400, valeur

    def test_date_avant_recrutement_cite_le_matricule(self, admin_user, employee):
        employee.date_embauche = date(2025, 6, 1)
        employee.save()
        resp = self._post(admin_user, {'ids': [str(employee.id)], 'action': 'archive', 'date_sortie': '2025-01-01'})
        assert resp.status_code == 400
        assert employee.matricule in resp.data['error']

    def test_restauration_vide_la_date(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(statut='archive', date_sortie=date(2026, 1, 15))
        resp = self._post(admin_user, {'ids': [str(employee.id)], 'action': 'restaurer'})
        assert resp.status_code == 200
        employee.refresh_from_db()
        assert (employee.statut, employee.date_sortie) == ('actif', None)


import io

import openpyxl
from openpyxl import Workbook

from employees.models import Contrat


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


class TestContrat:
    """Transition automatique (le statut suit le dernier contrat) : pas de
    clic, donc la date de sortie vient de la date de fin du contrat."""

    def test_contrat_archive_date_la_sortie_par_sa_fin(self, admin_user, employee, type_contrat):
        contrat = Contrat.objects.create(
            numero_contrat='C-1', employee=employee, type_contrat=type_contrat,
            date_debut=date(2024, 1, 1), date_fin=date(2025, 12, 31), created_by=admin_user,
        )
        contrat.statut = 'archive'
        contrat.save()
        employee.refresh_from_db()
        assert (employee.statut, employee.date_sortie) == ('archive', date(2025, 12, 31))

    def test_contrat_sans_fin_laisse_la_date_vide(self, admin_user, employee, type_contrat):
        contrat = Contrat.objects.create(
            numero_contrat='C-2', employee=employee, type_contrat=type_contrat,
            date_debut=date(2024, 1, 1), created_by=admin_user,
        )
        contrat.statut = 'archive'
        contrat.save()
        employee.refresh_from_db()
        assert employee.statut == 'archive'
        assert employee.date_sortie is None

    def test_contrat_reactive_vide_la_date(self, admin_user, employee, type_contrat):
        contrat = Contrat.objects.create(
            numero_contrat='C-3', employee=employee, type_contrat=type_contrat,
            date_debut=date(2024, 1, 1), date_fin=date(2025, 12, 31), statut='archive', created_by=admin_user,
        )
        contrat.statut = 'actif'
        contrat.save()
        employee.refresh_from_db()
        assert (employee.statut, employee.date_sortie) == ('actif', None)


class TestImportExport:
    URL_IMPORT = '/api/employees/import/'

    def test_import_avec_date_de_sortie(self, admin_user):
        buf = _xlsx(['matricule', 'numero_contrat', 'nom', 'prenom', 'statut', 'date_sortie'],
                    [['D001', '11', 'ALI', 'Sara', 'archive', '2024-09-30']])
        resp = _client(admin_user).post(self.URL_IMPORT, {'file': buf}, format='multipart')
        assert resp.data['nb_crees'] == 1, resp.data
        assert Employee.objects.get(matricule='D001').date_sortie == date(2024, 9, 30)

    def test_import_actif_ignore_la_date(self, admin_user):
        buf = _xlsx(['matricule', 'numero_contrat', 'nom', 'prenom', 'statut', 'date_sortie'],
                    [['D002', '12', 'ALI', 'Omar', 'actif', '2024-09-30']])
        _client(admin_user).post(self.URL_IMPORT, {'file': buf}, format='multipart')
        assert Employee.objects.get(matricule='D002').date_sortie is None

    def test_import_date_future_bloque_la_ligne(self, admin_user):
        demain = (timezone.localdate() + timedelta(days=1)).isoformat()
        buf = _xlsx(['matricule', 'numero_contrat', 'nom', 'prenom', 'statut', 'date_sortie'],
                    [['D003', '13', 'ALI', 'Nour', 'archive', demain]])
        resp = _client(admin_user).post(self.URL_IMPORT, {'file': buf}, format='multipart')
        assert resp.data['nb_crees'] == 0

    def test_export_colonne_date_de_sortie(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(statut='archive', date_sortie=date(2026, 2, 1))
        resp = _client(admin_user).get('/api/employees/export/?vue=archives')
        lignes = list(openpyxl.load_workbook(io.BytesIO(resp.content))['Employés'].iter_rows(values_only=True))
        entetes = list(lignes[0])
        assert entetes.index('Date de sortie') == entetes.index('Sexe') + 1
        assert dict(zip(entetes, lignes[1]))['Date de sortie'] == '2026-02-01'
