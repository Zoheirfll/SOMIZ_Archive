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


def test_admin_ordinaire_ne_peut_pas_creer(traiteur, admin_user):
    """Un ADMIN, même chargé des consultations, reste uniquement traiteur."""
    for user in (traiteur, admin_user):
        resp = _client(user).post('/api/consultations/demandes/', {
            'type_demande': 'dossier', 'description': 'x',
        }, format='json')
        assert resp.status_code == 403


def test_superadmin_peut_creer_comme_pour_les_attestations(superadmin_user, employee):
    resp = _client(superadmin_user).post('/api/consultations/demandes/', {
        'type_demande': 'dossier', 'description': 'Dossier de test', 'employee': str(employee.id),
    }, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['demandeur'] == superadmin_user.id


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


# ─── Parité avec les attestations : importance, détails employé, recherche ──

def test_importance_par_defaut_et_choisie(gestionnaire_user):
    client = _client(gestionnaire_user)
    resp = client.post('/api/consultations/demandes/', {
        'type_demande': 'document', 'description': 'a',
    }, format='json')
    assert resp.data['importance'] == 'moyenne'
    resp = client.post('/api/consultations/demandes/', {
        'type_demande': 'document', 'description': 'b', 'importance': 'haute',
    }, format='json')
    assert resp.data['importance'] == 'haute'
    resp = client.post('/api/consultations/demandes/', {
        'type_demande': 'document', 'description': 'c', 'importance': 'urgentissime',
    }, format='json')
    assert resp.status_code == 400


def test_detail_expose_les_informations_de_lemploye(gestionnaire_user, employee, direction):
    gestionnaire_user.scope_directions.add(direction)
    client = _client(gestionnaire_user)
    created = client.post('/api/consultations/demandes/', {
        'type_demande': 'dossier', 'description': 'x', 'employee': str(employee.id),
    }, format='json')
    slug = created.data['reference'].replace('/', '-')
    data = client.get(f'/api/consultations/demandes/{slug}/').data
    assert data['employee_matricule'] == employee.matricule
    assert data['employee_direction_nom'] == employee.direction.nom
    assert data['employee_service_nom'] == employee.service.nom
    assert data['employee_poste_nom'] == employee.poste.nom
    assert data['demandeur_role'] == 'GESTIONNAIRE'


def test_recherche_par_employe(traiteur, gestionnaire_user, employee):
    DemandeConsultation.objects.create(
        reference='C-00040/26', type_demande='dossier', description='sans mot-clé',
        demandeur=gestionnaire_user, employee=employee,
    )
    DemandeConsultation.objects.create(
        reference='C-00041/26', type_demande='dossier', description='autre',
        demandeur=gestionnaire_user,
    )
    resp = _client(traiteur).get(f'/api/consultations/demandes/?q={employee.matricule}')
    assert [d['reference'] for d in resp.data['results']] == ['C-00040/26']


# ─── Souhaits du demandeur (durée, téléchargement, impression) ──────────────

def test_demandeur_exprime_ses_souhaits(gestionnaire_user):
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
        'type_demande': 'document', 'description': 'x',
        'duree_souhaitee_heures': 72, 'telechargement_souhaite': True, 'impression_souhaitee': True,
    }, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['duree_souhaitee_heures'] == 72
    assert resp.data['telechargement_souhaite'] is True
    assert resp.data['impression_souhaitee'] is True
    # Souhaits ≠ droits : rien n'est accordé avant la validation du traiteur.
    assert resp.data['telechargement_autorise'] is False
    assert resp.data['impression_autorisee'] is False
    assert resp.data['duree_accordee_heures'] is None


def test_souhaits_par_defaut(gestionnaire_user):
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
        'type_demande': 'document', 'description': 'x',
    }, format='json')
    assert resp.data['duree_souhaitee_heures'] == 24
    assert resp.data['telechargement_souhaite'] is False
    assert resp.data['impression_souhaitee'] is False


def test_duree_souhaitee_hors_bornes_refusee(gestionnaire_user, settings):
    settings.CONSULTATION_MAX_DUREE_TOTALE_HEURES = 100
    for duree in (0, -5, 101):
        resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
            'type_demande': 'document', 'description': 'x', 'duree_souhaitee_heures': duree,
        }, format='json')
        assert resp.status_code == 400, duree
        assert 'duree_souhaitee_heures' in resp.data


def test_demandeur_ne_peut_pas_s_accorder_les_droits(gestionnaire_user):
    """Les champs « autorisé » ne sont pas écrivables par le demandeur."""
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
        'type_demande': 'document', 'description': 'x',
        'telechargement_autorise': True, 'impression_autorisee': True,
    }, format='json')
    assert resp.status_code == 201
    assert resp.data['telechargement_autorise'] is False
    assert resp.data['impression_autorisee'] is False


# ─── Actions groupées (traiteurs) ───────────────────────────────────────────

BULK = '/api/consultations/demandes/bulk/'


def test_rejet_groupe(traiteur, gestionnaire_user):
    a = DemandeConsultation.objects.create(
        reference='C-00060/26', type_demande='dossier', description='a', demandeur=gestionnaire_user)
    b = DemandeConsultation.objects.create(
        reference='C-00061/26', type_demande='dossier', description='b', demandeur=gestionnaire_user)
    resp = _client(traiteur).post(BULK, {
        'ids': [str(a.id), str(b.id)], 'action': 'rejeter', 'motif_rejet': 'Hors périmètre',
    }, format='json')
    assert resp.status_code == 200, resp.data
    assert sorted(resp.data['updated']) == ['C-00060/26', 'C-00061/26']
    assert resp.data['errors'] == []
    a.refresh_from_db()
    assert a.statut == DemandeConsultation.Statut.REJETEE and a.motif_rejet == 'Hors périmètre'


def test_revocation_groupee_et_erreur_isolee(traiteur, demande_validee, demande_en_cours):
    """Une demande qui ne peut pas être révoquée n'empêche pas les autres."""
    resp = _client(traiteur).post(BULK, {
        'ids': [str(demande_validee.id), str(demande_en_cours.id)], 'action': 'revoquer',
    }, format='json')
    assert resp.status_code == 200, resp.data
    assert resp.data['updated'] == [demande_validee.reference]
    assert [e['reference'] for e in resp.data['errors']] == [demande_en_cours.reference]
    demande_validee.refresh_from_db()
    assert demande_validee.statut == DemandeConsultation.Statut.REVOQUEE


def test_groupe_trace_audit_par_demande(traiteur, demande_en_cours):
    from audit.models import AuditLog
    _client(traiteur).post(BULK, {
        'ids': [str(demande_en_cours.id)], 'action': 'rejeter', 'motif_rejet': 'x',
    }, format='json')
    log = AuditLog.objects.get(action='STATUT_CONSULTATION')
    assert log.details['groupe'] is True


def test_groupe_validations_des_entrees(traiteur, gestionnaire_user, demande_en_cours):
    client = _client(traiteur)
    assert client.post(BULK, {'ids': [], 'action': 'rejeter'}, format='json').status_code == 400
    assert client.post(BULK, {'ids': [str(demande_en_cours.id)], 'action': 'valider'}, format='json').status_code == 400
    assert client.post(BULK, {'ids': ['pas-un-uuid'], 'action': 'revoquer'}, format='json').status_code == 400
    # motif obligatoire pour un rejet : l'erreur est rapportée, pas de 500
    resp = client.post(BULK, {'ids': [str(demande_en_cours.id)], 'action': 'rejeter'}, format='json')
    assert resp.status_code == 200
    assert resp.data['updated'] == [] and len(resp.data['errors']) == 1


def test_groupe_reserve_aux_traiteurs(gestionnaire_user, admin_user, demande_en_cours):
    for user in (gestionnaire_user, admin_user):
        resp = _client(user).post(BULK, {
            'ids': [str(demande_en_cours.id)], 'action': 'rejeter', 'motif_rejet': 'x',
        }, format='json')
        assert resp.status_code == 403
    demande_en_cours.refresh_from_db()
    assert demande_en_cours.statut == DemandeConsultation.Statut.EN_COURS


# ─── Statistiques (traiteurs) ───────────────────────────────────────────────

def test_stats_reservees_aux_traiteurs(gestionnaire_user, admin_user, traiteur):
    assert _client(gestionnaire_user).get('/api/consultations/stats/').status_code == 403
    assert _client(admin_user).get('/api/consultations/stats/').status_code == 403
    assert _client(traiteur).get('/api/consultations/stats/').status_code == 200


def test_stats_contenu(traiteur, demande_en_cours, demande_validee, employee, gestionnaire_user):
    from datetime import timedelta
    from django.utils import timezone
    DemandeConsultation.objects.create(
        reference='C-00050/26', type_demande='dossier', description='expirée',
        demandeur=gestionnaire_user, employee=employee,
        statut=DemandeConsultation.Statut.VALIDEE, traite_par=traiteur,
        date_validation=timezone.now() - timedelta(days=3),
        date_echeance=timezone.now() - timedelta(days=1),
    )
    data = _client(traiteur).get('/api/consultations/stats/').data
    assert data['total'] == 3
    par_statut = {s['id']: s['count'] for s in data['par_statut']}
    assert par_statut == {'en_cours': 1, 'validee': 1, 'expiree': 1}
    assert data['par_demandeur'][0]['count'] == 3
    assert data['par_employe'][0]['count'] == 1
    assert data['delai_moyen_heures'] is not None
    assert data['evolution_mensuelle'][0]['demandees'] == 3


def test_stats_filtre_par_dates_et_date_invalide(traiteur, demande_en_cours):
    client = _client(traiteur)
    assert client.get('/api/consultations/stats/?date_debut=2999-01-01').data['total'] == 0
    assert client.get('/api/consultations/stats/?date_debut=pas-une-date').status_code == 400
