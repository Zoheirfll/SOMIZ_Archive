from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from consultations.models import DemandeConsultation

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures('media_tmp')]

URL = '/api/consultations/demandes/C-00002-26/prolonger/'


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def test_prolongation_dune_consultation_active(traiteur, demande_validee):
    ancienne = demande_validee.date_echeance
    resp = _client(traiteur).post(URL, {'duree_heures': 24}, format='json')
    assert resp.status_code == 200, resp.data
    demande_validee.refresh_from_db()
    assert demande_validee.date_echeance == ancienne + timedelta(hours=24)
    assert demande_validee.date_echeance_initiale != demande_validee.date_echeance
    assert demande_validee.nb_prolongations == 1


def test_prolongation_reinitialise_les_rappels(traiteur, demande_validee):
    DemandeConsultation.objects.filter(pk=demande_validee.pk).update(
        rappel_24h_envoye=True, rappel_1h_envoye=True,
    )
    _client(traiteur).post(URL, {'duree_heures': 24}, format='json')
    demande_validee.refresh_from_db()
    assert demande_validee.rappel_24h_envoye is False
    assert demande_validee.rappel_1h_envoye is False


def test_prolongation_apres_echeance_dans_le_delai_de_grace(traiteur, demande_validee):
    DemandeConsultation.objects.filter(pk=demande_validee.pk).update(
        date_echeance=timezone.now() - timedelta(hours=2),
    )
    avant = timezone.now()
    resp = _client(traiteur).post(URL, {'duree_heures': 24}, format='json')
    assert resp.status_code == 200, resp.data
    demande_validee.refresh_from_db()
    # Repart de maintenant, pas de l'ancienne échéance déjà passée.
    assert demande_validee.date_echeance >= avant + timedelta(hours=24)
    assert demande_validee.est_active() is True


def test_prolongation_refusee_apres_le_delai_de_grace(traiteur, demande_validee):
    DemandeConsultation.objects.filter(pk=demande_validee.pk).update(
        date_echeance=timezone.now() - timedelta(hours=25),
    )
    resp = _client(traiteur).post(URL, {'duree_heures': 24}, format='json')
    assert resp.status_code == 400


def test_plafond_de_duree_cumulee(traiteur, demande_validee, settings):
    settings.CONSULTATION_MAX_DUREE_TOTALE_HEURES = 30
    resp = _client(traiteur).post(URL, {'duree_heures': 24}, format='json')  # 24 h + 24 h > 30 h
    assert resp.status_code == 400
    assert 'duree_heures' in resp.data
    demande_validee.refresh_from_db()
    assert demande_validee.nb_prolongations == 0


def test_prolongation_refusee_si_revoquee_ou_en_cours(traiteur, demande_validee, demande_en_cours):
    DemandeConsultation.objects.filter(pk=demande_validee.pk).update(
        statut=DemandeConsultation.Statut.REVOQUEE,
    )
    assert _client(traiteur).post(URL, {'duree_heures': 24}, format='json').status_code == 400
    resp = _client(traiteur).post(
        '/api/consultations/demandes/C-00001-26/prolonger/', {'duree_heures': 24}, format='json',
    )
    assert resp.status_code == 400


def test_prolongation_duree_hors_presets(traiteur, demande_validee):
    resp = _client(traiteur).post(URL, {'duree_heures': 7}, format='json')
    assert resp.status_code == 400


def test_prolongation_par_non_traiteur_refusee(gestionnaire_user, admin_user, demande_validee):
    for user in (gestionnaire_user, admin_user):
        assert _client(user).post(URL, {'duree_heures': 24}, format='json').status_code == 403


def test_prolongation_tracee_et_notifiee(
    traiteur, gestionnaire_user, demande_validee, django_capture_on_commit_callbacks,
):
    from notifications.models import Notification
    ancienne = demande_validee.date_echeance
    with django_capture_on_commit_callbacks(execute=True):
        _client(traiteur).post(URL, {'duree_heures': 24}, format='json')
    log = AuditLog.objects.get(action='PROLONG_CONSULTATION')
    assert log.details['ancienne_echeance'] == ancienne.isoformat()
    assert log.details['nouvelle_echeance'] != log.details['ancienne_echeance']
    notif = Notification.objects.get(recipient=gestionnaire_user)
    assert notif.type == Notification.Type.CONSULTATION_PROLONGEE
