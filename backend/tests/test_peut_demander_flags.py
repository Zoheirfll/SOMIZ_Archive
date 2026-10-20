"""Drapeaux peut_demander_attestation / peut_demander_consultation : un
GESTIONNAIRE/CONSULTANT ne crée une demande que si le drapeau est coché
(vraies routes métier, pas seulement la classe de permission), et tout ADMIN
peut l'attribuer."""
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog

pytestmark = pytest.mark.django_db
User = get_user_model()

URL_ATTESTATIONS = '/api/attestations/demandes/'
URL_CONSULTATIONS = '/api/consultations/demandes/'


def _user(username, role, **extra):
    return User.objects.create_user(
        username=username, password="Passw0rd!Long1", nom="N", prenom="P",
        role=role, consent_loi1807_accepted_at=timezone.now(), **extra,
    )


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.parametrize('role', ['GESTIONNAIRE', 'CONSULTANT'])
def test_sans_drapeau_creation_attestation_refusee(role):
    assert _client(_user('u1', role)).post(URL_ATTESTATIONS, {}, format='json').status_code == 403


@pytest.mark.parametrize('role', ['GESTIONNAIRE', 'CONSULTANT'])
def test_avec_drapeau_creation_attestation_autorisee_jusqua_la_validation(role):
    user = _user('u2', role, peut_demander_attestation=True)
    # 400 = la permission est passée, seul le corps (vide) est rejeté.
    assert _client(user).post(URL_ATTESTATIONS, {}, format='json').status_code == 400


@pytest.mark.parametrize('role', ['GESTIONNAIRE', 'CONSULTANT'])
def test_sans_drapeau_creation_consultation_refusee(role):
    assert _client(_user('u3', role)).post(URL_CONSULTATIONS, {}, format='json').status_code == 403


@pytest.mark.parametrize('role', ['GESTIONNAIRE', 'CONSULTANT'])
def test_avec_drapeau_creation_consultation_autorisee_jusqua_la_validation(role):
    user = _user('u4', role, peut_demander_consultation=True)
    assert _client(user).post(URL_CONSULTATIONS, {}, format='json').status_code == 400


def test_drapeaux_independants_un_gestionnaire_par_service():
    gest_attestations = _user('g1', 'GESTIONNAIRE', peut_demander_attestation=True)
    assert _client(gest_attestations).post(URL_CONSULTATIONS, {}, format='json').status_code == 403
    gest_consultations = _user('g2', 'GESTIONNAIRE', peut_demander_consultation=True)
    assert _client(gest_consultations).post(URL_ATTESTATIONS, {}, format='json').status_code == 403


def test_sans_drapeau_la_liste_est_refusee_aussi():
    client = _client(_user('u5', 'GESTIONNAIRE'))
    assert client.get(URL_ATTESTATIONS).status_code == 403
    assert client.get(URL_CONSULTATIONS).status_code == 403


@pytest.mark.parametrize('champ', ['peut_demander_attestation', 'peut_demander_consultation'])
@pytest.mark.parametrize('role', ['GESTIONNAIRE', 'CONSULTANT'])
def test_un_admin_ordinaire_peut_attribuer_et_retirer_le_drapeau(champ, role):
    cible = _user('c1', role)
    client = _client(_user('ad1', 'ADMIN'))
    resp = client.patch(f'/api/admin-users/{cible.id}/', {champ: True}, format='json')
    assert resp.status_code == 200, resp.data
    cible.refresh_from_db()
    assert getattr(cible, champ) is True
    resp = client.patch(f'/api/admin-users/{cible.id}/', {champ: False}, format='json')
    assert resp.status_code == 200, resp.data
    cible.refresh_from_db()
    assert getattr(cible, champ) is False


def test_le_drapeau_est_remis_a_false_hors_gestionnaire_consultant():
    cible = _user('ad2', 'ADMIN')
    resp = _client(_user('sa1', 'SUPERADMIN')).patch(
        f'/api/admin-users/{cible.id}/', {'peut_demander_attestation': True}, format='json',
    )
    assert resp.status_code == 200, resp.data
    cible.refresh_from_db()
    assert cible.peut_demander_attestation is False


def test_un_admin_ordinaire_reste_exclu_meme_avec_le_drapeau_en_base():
    admin = _user('ad3', 'ADMIN', peut_demander_attestation=True, peut_demander_consultation=True)
    client = _client(admin)
    assert client.post(URL_ATTESTATIONS, {}, format='json').status_code == 403
    assert client.post(URL_CONSULTATIONS, {}, format='json').status_code == 403


def test_attribution_tracee_dans_laudit():
    cible = _user('c2', 'GESTIONNAIRE')
    _client(_user('ad4', 'ADMIN')).patch(
        f'/api/admin-users/{cible.id}/', {'peut_demander_consultation': True}, format='json',
    )
    log = AuditLog.objects.filter(action=AuditLog.Action.MODIFY_USER).latest('timestamp')
    assert log.details['after']['peut_demander_consultation'] is True
    assert log.details['before']['peut_demander_consultation'] is False


def test_me_expose_les_droits_de_demande():
    data = _client(_user('u6', 'GESTIONNAIRE', peut_demander_attestation=True)).get('/api/auth/me/').data
    assert data['can_request_attestations'] is True
    assert data['can_request_consultations'] is False


def test_retirer_le_droit_coupe_l_acces_aux_fichiers_deja_livres(demande_validee, gestionnaire_user):
    """Révoquer peut_demander_consultation est effectif tout de suite, y
    compris sur une consultation validée et encore dans son délai."""
    from consultations.access import controler_acces
    from rest_framework.exceptions import PermissionDenied

    class _Fichier:
        supprime_le = None

    controler_acces(gestionnaire_user, demande_validee, _Fichier())  # droit présent : autorisé

    gestionnaire_user.peut_demander_consultation = False
    gestionnaire_user.save(update_fields=['peut_demander_consultation'])
    with pytest.raises(PermissionDenied):
        controler_acces(gestionnaire_user, demande_validee, _Fichier())
