import pytest
from rest_framework.test import APIClient

from consultations.models import DemandeConsultation

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures('media_tmp')]


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


# ─── Création ───────────────────────────────────────────────────────────────

def test_gestionnaire_cree_une_demande_sans_employe(gestionnaire_user):
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
        'type_demande': 'information', 'description': "Date d'embauche du directeur",
    }, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['reference'].startswith('C-')
    assert resp.data['statut'] == 'en_cours'
    demande = DemandeConsultation.objects.get(id=resp.data['id'])
    assert demande.demandeur_id == gestionnaire_user.id


def test_consultant_peut_creer(consultant_user):
    resp = _client(consultant_user).post('/api/consultations/demandes/', {
        'type_demande': 'dossier', 'description': 'Dossier complet',
    }, format='json')
    assert resp.status_code == 201, resp.data


def test_admin_et_superadmin_ne_peuvent_pas_creer(traiteur, superadmin_user, admin_user):
    for user in (traiteur, superadmin_user, admin_user):
        resp = _client(user).post('/api/consultations/demandes/', {
            'type_demande': 'dossier', 'description': 'x',
        }, format='json')
        assert resp.status_code == 403


def test_description_obligatoire(gestionnaire_user):
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
        'type_demande': 'dossier', 'description': '  ',
    }, format='json')
    assert resp.status_code == 400


def test_employe_hors_perimetre_refuse(gestionnaire_user, employee):
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
        'type_demande': 'dossier', 'description': 'x', 'employee': str(employee.id),
    }, format='json')
    assert resp.status_code == 400
    assert 'employee' in resp.data


def test_employe_dans_le_perimetre_accepte(gestionnaire_user, employee, direction):
    gestionnaire_user.scope_directions.add(direction)
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
        'type_demande': 'dossier', 'description': 'x', 'employee': str(employee.id),
    }, format='json')
    assert resp.status_code == 201, resp.data


# ─── Liste / détail ─────────────────────────────────────────────────────────

def test_demandeur_ne_voit_que_ses_demandes(gestionnaire_user, other_gestionnaire, demande_en_cours):
    DemandeConsultation.objects.create(
        reference='C-00009/26', type_demande='document', description='autre',
        demandeur=other_gestionnaire,
    )
    resp = _client(gestionnaire_user).get('/api/consultations/demandes/')
    assert resp.status_code == 200
    refs = [d['reference'] for d in resp.data['results']]
    assert refs == [demande_en_cours.reference]


def test_traiteur_voit_toutes_les_demandes(traiteur, demande_en_cours, other_gestionnaire):
    DemandeConsultation.objects.create(
        reference='C-00009/26', type_demande='document', description='autre',
        demandeur=other_gestionnaire,
    )
    resp = _client(traiteur).get('/api/consultations/demandes/')
    assert resp.status_code == 200
    assert resp.data['count'] == 2


def test_admin_sans_drapeau_est_bloque(admin_user, demande_en_cours):
    resp = _client(admin_user).get('/api/consultations/demandes/')
    assert resp.status_code == 403


def test_detail_dune_demande_dun_autre_est_404(other_gestionnaire, demande_en_cours):
    slug = demande_en_cours.reference.replace('/', '-')
    resp = _client(other_gestionnaire).get(f'/api/consultations/demandes/{slug}/')
    assert resp.status_code == 404


def test_detail_par_slug(gestionnaire_user, demande_en_cours):
    resp = _client(gestionnaire_user).get('/api/consultations/demandes/C-00001-26/')
    assert resp.status_code == 200
    assert resp.data['reference'] == 'C-00001/26'
    assert resp.data['statut_effectif'] == 'en_cours'


def test_filtre_statut_expiree(traiteur, demande_validee):
    from datetime import timedelta
    from django.utils import timezone
    demande_validee.date_echeance = timezone.now() - timedelta(minutes=1)
    demande_validee.save()
    resp = _client(traiteur).get('/api/consultations/demandes/?statut=expiree')
    assert resp.data['count'] == 1
    resp = _client(traiteur).get('/api/consultations/demandes/?statut=validee')
    assert resp.data['count'] == 0


# ─── Annulation ─────────────────────────────────────────────────────────────

def test_demandeur_annule_sa_demande_en_cours(gestionnaire_user, demande_en_cours):
    resp = _client(gestionnaire_user).delete('/api/consultations/demandes/C-00001-26/')
    assert resp.status_code == 204
    assert not DemandeConsultation.objects.filter(pk=demande_en_cours.pk).exists()


def test_annulation_refusee_si_validee(gestionnaire_user, demande_validee):
    resp = _client(gestionnaire_user).delete('/api/consultations/demandes/C-00002-26/')
    assert resp.status_code == 403
    assert DemandeConsultation.objects.filter(pk=demande_validee.pk).exists()


# ─── Notifications et audit ─────────────────────────────────────────────────

def test_creation_notifie_les_traiteurs_et_trace_audit(
    gestionnaire_user, traiteur, django_capture_on_commit_callbacks,
):
    from audit.models import AuditLog
    from notifications.models import Notification
    with django_capture_on_commit_callbacks(execute=True):
        resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
            'type_demande': 'document', 'description': 'Secret défense',
        }, format='json')
    assert resp.status_code == 201
    notif = Notification.objects.get(recipient=traiteur)
    assert notif.type == Notification.Type.CONSULTATION_NOUVELLE
    assert resp.data['reference'] in notif.message
    assert 'Secret' not in notif.message  # message neutre
    assert AuditLog.objects.filter(action='CREATE_CONSULTATION').count() == 1
