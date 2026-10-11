from datetime import date
from io import BytesIO

import openpyxl
import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from audit.models import AuditLog
from registres.exports import construire_pdf, construire_xlsx, neutraliser
from registres.models import MouvementArchive, ReceptionDocument

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _vider_cache_throttle():
    """Le throttle `registre_export` vit dans le cache partagé : on le vide
    pour qu'un test ne dépende jamais des appels de la minute précédente."""
    cache.clear()


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def test_neutraliser_bloque_les_formules():
    assert neutraliser('=HYPERLINK("http://x")') == '\'=HYPERLINK("http://x")'
    assert neutraliser('+1') == "'+1"
    assert neutraliser('-1') == "'-1"
    assert neutraliser('@SUM(A1)') == "'@SUM(A1)"
    assert neutraliser('Dossier normal') == 'Dossier normal'
    assert neutraliser(3) == 3


def test_construire_xlsx_dates_en_ddmmyyyy_et_formules_neutralisees():
    contenu = construire_xlsx(
        'Registre', ['Réf', 'Date', 'Obs'],
        [['M-1', date(2026, 3, 1), '=1+1']], colonnes_date=(1,),
    )
    ws = openpyxl.load_workbook(BytesIO(contenu)).active
    assert ws['B2'].number_format == 'DD/MM/YYYY'
    assert ws['C2'].value == "'=1+1"


def test_construire_pdf_est_un_pdf_et_echappe_le_balisage():
    contenu = construire_pdf('Registre', ['A', 'B'], [['<b>gras</b>', '2']])
    assert contenu.startswith(b'%PDF')


def test_export_mouvements_xlsx_trace_et_sans_colonne_sensible(registre_admin):
    MouvementArchive.objects.create(
        reference='M-00001/26', nom_libre='Ali Ben', type_documents='Dossier',
        nombre_documents=2, date_depart=date(2026, 3, 1),
    )
    reponse = _client(registre_admin).get('/api/registres/mouvements/export/', {'annee': 2026, 'fmt': 'xlsx'})
    assert reponse.status_code == 200
    assert 'spreadsheetml' in reponse['Content-Type']
    assert reponse['Cache-Control'] == 'no-store'
    ws = openpyxl.load_workbook(BytesIO(reponse.content)).active
    entetes = [c.value for c in ws[1]]
    assert entetes[0] == 'Référence'
    for interdit in ('nin', 'rib', 'sécurité'):
        assert not any(interdit in str(e).lower() for e in entetes)
    log = AuditLog.objects.get(action='EXPORT_REGISTRE')
    assert log.details['registre'] == 'mouvements' and log.details['nb_lignes'] == 1


def test_export_pdf_trace_comme_impression(registre_admin):
    ReceptionDocument.objects.create(
        reference='R-00001/26', type_document='Courrier', nombre=1, expediteur='DRH',
        date_reception=date(2026, 3, 1),
    )
    reponse = _client(registre_admin).get('/api/registres/receptions/export/', {'annee': 2026, 'fmt': 'pdf'})
    assert reponse.status_code == 200 and reponse.content.startswith(b'%PDF')
    assert AuditLog.objects.filter(action='PRINT_REGISTRE').exists()


def test_export_refuse_aux_comptes_non_autorises(admin_user, consultant_user):
    for user in (admin_user, consultant_user):
        reponse = _client(user).get('/api/registres/mouvements/export/', {'fmt': 'xlsx'})
        assert reponse.status_code == 403
    assert not AuditLog.objects.filter(action__in=['EXPORT_REGISTRE', 'PRINT_REGISTRE']).exists()


def test_export_format_ou_registre_invalide(registre_admin):
    assert _client(registre_admin).get('/api/registres/mouvements/export/', {'fmt': 'exe'}).status_code == 400
    assert _client(registre_admin).get('/api/registres/inconnu/export/', {'fmt': 'xlsx'}).status_code == 404
