import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog

pytestmark = pytest.mark.django_db
User = get_user_model()


def _user(username, role, **extra):
    return User.objects.create_user(
        username=username, password="Passw0rd!Long1", nom=username.title(), prenom="P",
        role=role, consent_loi1807_accepted_at=timezone.now(), **extra,
    )


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


# ── Propriété can_manage_registres ──

def test_superadmin_a_toujours_acces():
    assert _user("sa1", "SUPERADMIN").can_manage_registres is True


def test_admin_sans_drapeau_na_pas_acces():
    assert _user("ad1", "ADMIN").can_manage_registres is False


def test_admin_avec_drapeau_a_acces():
    assert _user("ad2", "ADMIN", charge_registre=True).can_manage_registres is True


def test_gestionnaire_avec_drapeau_na_pas_acces():
    assert _user("ge1", "GESTIONNAIRE", charge_registre=True).can_manage_registres is False


def test_charge_consultation_ne_donne_pas_acces_aux_registres(traiteur):
    """Les deux accès sont indépendants : un chargé des consultations n'entre
    pas dans les registres sans être explicitement coché."""
    assert traiteur.can_manage_consultations is True
    assert traiteur.can_manage_registres is False
    assert _client(traiteur).get('/api/registres/mouvements/').status_code == 403
    assert _client(traiteur).get('/api/registres/receptions/').status_code == 403


def test_charge_registre_ne_donne_pas_acces_aux_consultations(registre_admin):
    assert registre_admin.can_manage_registres is True
    assert registre_admin.can_manage_consultations is False


def test_me_expose_can_manage_registres(registre_admin):
    reponse = _client(registre_admin).get('/api/auth/me/')
    assert reponse.status_code == 200
    assert reponse.data['can_manage_registres'] is True


# ── Attribution : réservée au SUPERADMIN, tracée ──

def test_superadmin_attribue_le_drapeau_et_laction_est_tracee():
    acteur, cible = _user("sa2", "SUPERADMIN"), _user("ad3", "ADMIN")
    reponse = _client(acteur).patch(f'/api/admin-users/{cible.id}/', {'charge_registre': True}, format='json')
    assert reponse.status_code == 200, reponse.data
    cible.refresh_from_db()
    assert cible.charge_registre is True
    log = AuditLog.objects.get(action='MODIFY_USER', target_id=str(cible.pk))
    assert log.details['before']['charge_registre'] is False
    assert log.details['after']['charge_registre'] is True


def test_retrait_du_drapeau_est_trace_aussi():
    acteur, cible = _user("sa3", "SUPERADMIN"), _user("ad4", "ADMIN", charge_registre=True)
    _client(acteur).patch(f'/api/admin-users/{cible.id}/', {'charge_registre': False}, format='json')
    log = AuditLog.objects.get(action='MODIFY_USER', target_id=str(cible.pk))
    assert log.details['before']['charge_registre'] is True
    assert log.details['after']['charge_registre'] is False


def test_attribution_des_autres_drapeaux_est_desormais_tracee():
    """Trou d'audit corrigé le 2026-10-11 : charge_consultation/charge_attestation
    n'apparaissaient pas dans l'audit de modification d'un compte."""
    acteur, cible = _user("sa4", "SUPERADMIN"), _user("ad5", "ADMIN")
    _client(acteur).patch(f'/api/admin-users/{cible.id}/', {'charge_consultation': True}, format='json')
    log = AuditLog.objects.get(action='MODIFY_USER', target_id=str(cible.pk))
    assert log.details['after']['charge_consultation'] is True


def test_admin_ordinaire_ne_peut_pas_se_donner_lacces():
    admin = _user("ad6", "ADMIN")
    reponse = _client(admin).patch(f'/api/admin-users/{admin.id}/', {'charge_registre': True}, format='json')
    assert reponse.status_code == 400
    assert 'charge_registre' in reponse.data
    admin.refresh_from_db()
    assert admin.charge_registre is False


def test_drapeau_force_a_false_hors_admin():
    acteur, cible = _user("sa5", "SUPERADMIN"), _user("co1", "CONSULTANT")
    reponse = _client(acteur).patch(f'/api/admin-users/{cible.id}/', {'charge_registre': True}, format='json')
    assert reponse.status_code == 200, reponse.data
    cible.refresh_from_db()
    assert cible.charge_registre is False


def test_admin_ordinaire_ne_peut_pas_creer_un_compte_avec_le_drapeau():
    reponse = _client(_user("ad7", "ADMIN")).post('/api/admin-users/', {
        'username': 'nouveau_r', 'nom': 'N', 'prenom': 'P', 'role': 'CONSULTANT',
        'charge_registre': True, 'password': 'Passw0rd!Long1',
    }, format='json')
    assert reponse.status_code == 400
    assert 'charge_registre' in reponse.data


def test_creation_par_superadmin_trace_les_drapeaux():
    reponse = _client(_user("sa6", "SUPERADMIN")).post('/api/admin-users/', {
        'username': 'nouvel_admin', 'nom': 'N', 'prenom': 'P', 'role': 'ADMIN',
        'charge_registre': True, 'password': 'Passw0rd!Long1',
    }, format='json')
    assert reponse.status_code == 201, reponse.data
    log = AuditLog.objects.get(action='CREATE_USER')
    assert log.details['charge_registre'] is True


def test_valeur_inchangee_reste_acceptee_pour_un_admin():
    admin, cible = _user("ad8", "ADMIN"), _user("co2", "CONSULTANT")
    reponse = _client(admin).patch(
        f'/api/admin-users/{cible.id}/', {'charge_registre': False, 'libelle_role': 'X'}, format='json',
    )
    assert reponse.status_code == 200, reponse.data


# ── Registre commun à tous les comptes autorisés, avec l'auteur de la saisie ──

def test_registre_commun_chaque_charge_voit_les_lignes_des_autres(registre_admin):
    autre = _user("ad9", "ADMIN", charge_registre=True)
    payload = {'nom_libre': 'Ali Ben', 'type_documents': 'Dossier', 'nombre_documents': 1, 'date_depart': '2026-03-01'}
    assert _client(registre_admin).post('/api/registres/mouvements/', payload, format='json').status_code == 201
    vue_autre = _client(autre).get('/api/registres/mouvements/', {'annee': 2026})
    assert vue_autre.data['count'] == 1
    assert vue_autre.data['results'][0]['saisi_par'] == "Registre Admin"
    # Le SUPERADMIN voit tout, comme toujours.
    superadmin = _user("sa7", "SUPERADMIN")
    assert _client(superadmin).get('/api/registres/mouvements/', {'annee': 2026}).data['count'] == 1


def test_saisi_par_est_pose_par_le_serveur_jamais_par_le_client(registre_admin):
    autre = _user("ad10", "ADMIN", charge_registre=True)
    reponse = _client(registre_admin).post('/api/registres/mouvements/', {
        'nom_libre': 'Ali Ben', 'type_documents': 'Dossier', 'nombre_documents': 1,
        'date_depart': '2026-03-01', 'saisi_par': str(autre.pk), 'saisi_par_nom': 'Usurpé',
    }, format='json')
    assert reponse.status_code == 201
    assert reponse.data['saisi_par_nom'] == "Registre Admin"


def test_reception_expose_saisi_par_nom(registre_admin):
    reponse = _client(registre_admin).post('/api/registres/receptions/', {
        'type_document': 'Courrier', 'nombre': 1, 'expediteur': 'DRH', 'date_reception': '2026-03-01',
    }, format='json')
    assert reponse.status_code == 201
    liste = _client(registre_admin).get('/api/registres/receptions/', {'annee': 2026})
    assert liste.data['results'][0]['saisi_par_nom'] == "Registre Admin"
