"""
GET /api/reporting/stats/ — indicateurs du tableau de bord (AdminStatsView).

Couvre : (1) l'encart « contrats arrivant à échéance », (2) la non-régression
des chiffres de complétude et (3) l'absence de N+1 : le nombre de requêtes ne
doit pas croître avec le nombre de types de documents.
"""
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from employees.models import Contrat, Employee, EmployeeDocument, TypeDocument

User = get_user_model()
URL = '/api/reporting/stats/'


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _contrat(employee, numero, jours, type_contrat=None, statut='actif'):
    return Contrat.objects.create(
        numero_contrat=numero, employee=employee, type_contrat=type_contrat,
        date_debut=timezone.localdate() - timedelta(days=100),
        date_fin=timezone.localdate() + timedelta(days=jours), statut=statut,
    )


@pytest.mark.django_db
class TestContratsEcheance:
    def test_contrats_dans_la_fenetre_sont_listes_du_plus_proche_au_plus_lointain(
        self, admin_user, employee, type_contrat
    ):
        _contrat(employee, 'C-LOIN', 25, type_contrat)
        _contrat(employee, 'C-PROCHE', 5, type_contrat)
        data = auth_client(admin_user).get(URL).data
        numeros = [c['numero_contrat'] for c in data['contrats_echeance']]
        assert numeros == ['C-PROCHE', 'C-LOIN']
        assert data['contrats_echeance_total'] == 2
        assert data['contrats_echeance'][0]['jours_restants'] == 5
        # Le lien vers la fiche se construit avec le matricule (cf. employeeSlug.js),
        # jamais avec l'uuid interne.
        assert data['contrats_echeance'][0]['employee_matricule'] == employee.matricule

    def test_contrat_hors_fenetre_ou_non_actif_est_exclu(self, admin_user, employee, type_contrat):
        _contrat(employee, 'C-90J', 90, type_contrat)
        _contrat(employee, 'C-ARCHIVE', 10, type_contrat, statut='archive')
        data = auth_client(admin_user).get(URL).data
        assert data['contrats_echeance'] == []
        assert data['contrats_echeance_total'] == 0

    def test_liste_plafonnee_mais_total_exact(self, admin_user, employee, type_contrat):
        for i in range(8):
            _contrat(employee, f'C-{i}', i + 1, type_contrat)
        data = auth_client(admin_user).get(URL).data
        assert len(data['contrats_echeance']) == 5
        assert data['contrats_echeance_total'] == 8

    def test_consultant_interdit(self, consultant_user):
        assert auth_client(consultant_user).get(URL).status_code == 403


@pytest.mark.django_db
class TestCompletude:
    def test_chiffres_de_completude(self, admin_user, employee, type_doc_obligatoire, type_doc_facultatif):
        autre = Employee.objects.create(
            matricule='EMP-002', nom='Martin', prenom='Luc',
            direction=employee.direction, departement=employee.departement,
            service=employee.service, created_by=admin_user,
        )
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_obligatoire)
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_facultatif)
        EmployeeDocument.objects.create(employee=autre, type_doc=type_doc_facultatif)

        data = auth_client(admin_user).get(URL).data
        assert data['employes_actifs'] == 2
        assert data['dossiers_complets'] == 1
        assert data['taux_completude_global'] == 50.0
        assert data['total_documents'] == 3
        cin = data['completude_par_type']['CIN']
        assert (cin['nb_employes'], cin['pourcentage'], cin['required']) == (1, 50.0, True)
        assert data['completude_par_type']['CV']['nb_employes'] == 2

    def test_aucun_type_obligatoire_tous_les_dossiers_sont_complets(self, admin_user, employee):
        """Sans type obligatoire configuré, la vue reste cohérente avec
        Employee.dossier_complet et le sérialiseur de la liste : tout le monde est complet."""
        assert employee.dossier_complet is True
        assert auth_client(admin_user).get(URL).data['dossiers_complets'] == 1


@pytest.mark.django_db
class TestPasDeNPlusUn:
    def _requetes(self, admin_user):
        with CaptureQueriesContext(connection) as ctx:
            assert auth_client(admin_user).get(URL).status_code == 200
        return len(ctx)

    def test_requetes_constantes_quand_les_types_de_documents_augmentent(
        self, admin_user, employee
    ):
        for i in range(3):
            TypeDocument.objects.create(nom=f'T{i}', code=f'T{i}', obligatoire=(i == 0))
        avant = self._requetes(admin_user)
        for i in range(3, 15):
            TypeDocument.objects.create(nom=f'T{i}', code=f'T{i}', obligatoire=(i % 2 == 0))
        apres = self._requetes(admin_user)
        assert apres == avant, f"{avant} requêtes pour 3 types, {apres} pour 15 : N+1"
