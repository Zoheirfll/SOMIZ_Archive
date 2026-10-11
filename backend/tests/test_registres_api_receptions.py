from datetime import date

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from registres.models import ReceptionDocument

pytestmark = pytest.mark.django_db

URL = '/api/registres/receptions/'


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _payload(**kw):
    base = {
        'type_document': 'Courrier', 'nombre': 2, 'expediteur': 'DRH', 'date_reception': '2026-03-01',
    }
    base.update(kw)
    return base


def _slug(reception):
    return reception.reference.replace('/', '-')


@pytest.mark.parametrize('fixture', ['consultant_user', 'gestionnaire_user', 'admin_user'])
def test_comptes_non_autorises_refuses(request, fixture):
    client = _client(request.getfixturevalue(fixture))
    assert client.get(URL).status_code == 403
    assert client.post(URL, _payload(), format='json').status_code == 403


def test_creation_reference_R_et_audit(traiteur):
    reponse = _client(traiteur).post(URL, _payload(), format='json')
    assert reponse.status_code == 201
    annee = timezone.localdate().year % 100
    assert reponse.data['reference'] == f"R-00001/{annee:02d}"
    assert AuditLog.objects.filter(action='CREATE_RECEPTION').exists()


def test_expediteur_et_type_obligatoires(traiteur):
    assert _client(traiteur).post(URL, _payload(expediteur=''), format='json').status_code == 400
    assert _client(traiteur).post(URL, _payload(type_document=''), format='json').status_code == 400


def test_classement_avant_reception_refuse(traiteur):
    reponse = _client(traiteur).post(URL, _payload(date_classement='2026-02-01'), format='json')
    assert reponse.status_code == 400


def test_liste_filtre_annee_a_classer_et_recherche(traiteur, superadmin_user):
    ReceptionDocument.objects.create(
        reference='R-00001/26', type_document='A', nombre=1, expediteur='X',
        date_reception=date(2026, 1, 5), date_classement=date(2026, 1, 9),
    )
    ReceptionDocument.objects.create(
        reference='R-00002/26', type_document='B', nombre=1, expediteur='Y', date_reception=date(2026, 2, 5),
    )
    ReceptionDocument.objects.create(
        reference='R-00001/25', type_document='C', nombre=1, expediteur='Z', date_reception=date(2025, 2, 5),
    )
    reponse = _client(superadmin_user).get(URL, {'annee': 2026})
    assert [r['reference'] for r in reponse.data['results']] == ['R-00001/26', 'R-00002/26']
    a_classer = _client(traiteur).get(URL, {'annee': 2026, 'statut': 'a_classer'})
    assert [r['reference'] for r in a_classer.data['results']] == ['R-00002/26']
    cherche = _client(traiteur).get(URL, {'annee': 2026, 'q': 'y'})
    assert [r['reference'] for r in cherche.data['results']] == ['R-00002/26']


def test_classer_en_un_clic(traiteur):
    _client(traiteur).post(URL, _payload(date_reception='2026-01-01'), format='json')
    r = ReceptionDocument.objects.get()
    assert _client(traiteur).post(f"{URL}{_slug(r)}/classer/").status_code == 200
    r.refresh_from_db()
    assert r.date_classement == timezone.localdate()
    assert AuditLog.objects.filter(action='CLASSER_RECEPTION').exists()
    assert _client(traiteur).post(f"{URL}{_slug(r)}/classer/").status_code == 400  # déjà classé


def test_modification_auditee(traiteur):
    _client(traiteur).post(URL, _payload(), format='json')
    r = ReceptionDocument.objects.get()
    assert _client(traiteur).patch(f"{URL}{_slug(r)}/", {'nombre': 7}, format='json').status_code == 200
    log = AuditLog.objects.get(action='MODIFY_RECEPTION')
    assert log.details['changes']['nombre'] == {'avant': 2, 'apres': 7}


def test_annulation_motif_obligatoire_sans_suppression_ni_delete(traiteur):
    _client(traiteur).post(URL, _payload(), format='json')
    r = ReceptionDocument.objects.get()
    assert _client(traiteur).post(f"{URL}{_slug(r)}/annuler/", {}, format='json').status_code == 400
    assert _client(traiteur).post(f"{URL}{_slug(r)}/annuler/", {'motif': 'Erreur'}, format='json').status_code == 200
    r.refresh_from_db()
    assert r.is_active is False
    assert _client(traiteur).delete(f"{URL}{_slug(r)}/").status_code == 405
    assert AuditLog.objects.filter(action='CANCEL_RECEPTION').exists()
