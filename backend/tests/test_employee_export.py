from datetime import date
from io import BytesIO

import openpyxl
import pytest
from rest_framework.test import APIClient

from employees.models import Contrat

pytestmark = pytest.mark.django_db

URL = '/api/employees/export/'


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _feuille(response, nom='Employés'):
    classeur = openpyxl.load_workbook(BytesIO(response.content))
    lignes = list(classeur[nom].iter_rows(values_only=True))
    entetes = list(lignes[0])
    return entetes, [dict(zip(entetes, ligne)) for ligne in lignes[1:]]


def test_colonnes_demandees_et_colonnes_du_contrat(admin_user, employee, type_contrat):
    employee.date_naissance = date(1990, 5, 17)
    employee.date_embauche = date(2020, 1, 6)
    employee.save()
    Contrat.objects.create(
        numero_contrat='CTR-1', employee=employee, type_contrat=type_contrat,
        date_debut=date(2024, 2, 1), date_fin=date(2026, 1, 31), created_by=admin_user,
    )
    resp = _client(admin_user).get(URL)
    assert resp.status_code == 200
    entetes, lignes = _feuille(resp)
    for colonne in (
        'Matricule', 'Nom', 'Prénom', 'N° Contrat actif', 'Date début contrat', 'Date fin contrat',
        'Statut du contrat', 'Date de naissance', 'Date de recrutement', 'Fonction',
    ):
        assert colonne in entetes
    # Ordre demandé par l'utilisateur pour le début du fichier.
    assert entetes[:7] == [
        'Matricule', 'N° Contrat actif', 'Nom', 'Prénom', 'Fonction',
        'Date de naissance', 'Date de recrutement',
    ]
    for colonne in ('NIN', 'N° Sécurité sociale', 'RIP/RIB', 'Groupe sanguin', "Motif d'archivage"):
        assert colonne in entetes
    ligne = lignes[0]
    assert ligne['Matricule'] == employee.matricule
    assert ligne['Fonction'] == employee.poste.nom
    assert ligne['N° Contrat actif'] == 'CTR-1'
    assert ligne['Date début contrat'] == '2024-02-01'
    assert ligne['Date fin contrat'] == '2026-01-31'
    assert ligne['Statut du contrat'] == 'Actif'
    assert ligne['Date de naissance'] == '1990-05-17'
    assert ligne['Date de recrutement'] == '2020-01-06'


def test_le_contrat_le_plus_recent_est_celui_exporte(admin_user, employee, type_contrat):
    Contrat.objects.create(
        numero_contrat='CTR-ANCIEN', employee=employee, type_contrat=type_contrat,
        date_debut=date(2020, 1, 1), date_fin=date(2022, 12, 31), statut='archive', created_by=admin_user,
    )
    Contrat.objects.create(
        numero_contrat='CTR-RECENT', employee=employee, type_contrat=type_contrat,
        date_debut=date(2023, 2, 1), date_fin=None, statut='actif', created_by=admin_user,
    )
    _, lignes = _feuille(_client(admin_user).get(URL))
    assert lignes[0]['N° Contrat actif'] == 'CTR-RECENT'
    assert lignes[0]['Date début contrat'] == '2023-02-01'
    assert lignes[0]['Date fin contrat'] in (None, '')          # CDI : pas de fin
    assert lignes[0]['Statut du contrat'] == 'Actif'


def test_employe_sans_contrat_reste_exporte_avec_cellules_vides(admin_user, employee):
    """Un employé n'est jamais écarté de l'export parce qu'une valeur manque."""
    resp = _client(admin_user).get(URL)
    _, lignes = _feuille(resp)
    assert [ligne['Matricule'] for ligne in lignes] == [employee.matricule]
    ligne = lignes[0]
    for colonne in ('N° Contrat actif', 'Date début contrat', 'Date fin contrat', 'Statut du contrat',
                    'Date de naissance'):
        assert ligne[colonne] in (None, ''), colonne


def test_export_dun_seul_employe_a_les_memes_colonnes(admin_user, employee, type_contrat):
    Contrat.objects.create(
        numero_contrat='CTR-9', employee=employee, type_contrat=type_contrat,
        date_debut=date(2025, 3, 3), date_fin=date(2027, 3, 2), created_by=admin_user,
    )
    resp = _client(admin_user).get(f'/api/employees/{employee.id}/export/')
    assert resp.status_code == 200
    entetes, lignes = _feuille(resp, 'Informations')
    assert 'Date début contrat' in entetes and 'Date fin contrat' in entetes and 'Statut du contrat' in entetes
    assert lignes[0]['N° Contrat actif'] == 'CTR-9'
    assert lignes[0]['Date début contrat'] == '2025-03-03'
    assert lignes[0]['Date fin contrat'] == '2027-03-02'


def test_export_reserve_aux_admins(consultant_user, gestionnaire_user, employee):
    assert _client(consultant_user).get(URL).status_code == 403
    assert _client(gestionnaire_user).get(URL).status_code == 403
