import datetime
from unittest.mock import MagicMock

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from conges.models import DemandeConge, MotifConge, MotifPiece, PieceJointeConge, SoldeConge, SoldeExercice
from conges.permissions import CanRequestConge, IsCongeManager
from conges.serializers import (
    AnnulerSerializer, DemandeCongeCreateSerializer, InterrompreSerializer, ValiderSerializer,
)
from conges.services import exercice_courant, exercice_precedent, exercice_suivant
from notifications.models import Notification

pytestmark = pytest.mark.django_db
User = get_user_model()

ACT = exercice_courant()
REL = exercice_precedent(ACT)
ANT = exercice_suivant(ACT)


def _motif_cp():
    return MotifConge.objects.get_or_create(nom='Congé annuel', type_conge='CP')[0]


def _restants(employee):
    return dict((ligne.exercice, ligne.restant) for ligne in SoldeExercice.objects.filter(employee=employee))


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _rows(data):
    return data['results'] if isinstance(data, dict) else data


def _payload(employee, **extra):
    data = {
        'employee': str(employee.id), 'type_conge': 'CP', 'motif': _motif_cp().id,
        'date_depart': '2026-11-01', 'date_retour': '2026-11-11',
        'nb_jours': 10, 'adresse_conge': '12 rue des Oliviers, Oran',
    }
    data.update(extra)
    return data


def _ctx(user, **extra):
    request = MagicMock()
    request.user = user
    return {'request': request, **extra}


def _fake_request(role, peut_demander=True, charge=False, consented=True):
    request = MagicMock()
    request.user = User(
        username='fake', role=role, is_active=True, peut_demander_conge=peut_demander, charge_conge=charge,
        consent_loi1807_accepted_at=timezone.now() if consented else None,
    )
    return request


# ─── Permissions ────────────────────────────────────────────────────────────

@pytest.mark.parametrize('role', ['GESTIONNAIRE', 'CONSULTANT', 'SUPERADMIN'])
def test_can_request_conge_autorise_roles_coches_et_superadmin(role):
    assert CanRequestConge().has_permission(_fake_request(role), None) is True


def test_can_request_conge_bloque_admin_ordinaire_meme_coche():
    assert CanRequestConge().has_permission(_fake_request('ADMIN'), None) is False


def test_can_request_conge_bloque_sans_consentement():
    assert CanRequestConge().has_permission(_fake_request('GESTIONNAIRE', consented=False), None) is False


def test_is_conge_manager_exige_charge_conge_pour_un_admin():
    assert IsCongeManager().has_permission(_fake_request('ADMIN', charge=False), None) is False
    assert IsCongeManager().has_permission(_fake_request('ADMIN', charge=True), None) is True
    assert IsCongeManager().has_permission(_fake_request('GESTIONNAIRE'), None) is False


# ─── Création ───────────────────────────────────────────────────────────────

def test_create_refuse_retour_avant_ou_egal_au_depart(employee, demandeur_conge):
    demandeur_conge.scope_directions.add(employee.direction)
    s = DemandeCongeCreateSerializer(data=_payload(employee, date_retour='2026-11-01'), context=_ctx(demandeur_conge))
    assert not s.is_valid() and 'date_retour' in s.errors


def test_create_refuse_nb_jours_nul_et_adresse_vide(employee, demandeur_conge):
    demandeur_conge.scope_directions.add(employee.direction)
    s = DemandeCongeCreateSerializer(data=_payload(employee, nb_jours=0, adresse_conge=''), context=_ctx(demandeur_conge))
    assert not s.is_valid()
    assert 'nb_jours' in s.errors and 'adresse_conge' in s.errors


def test_create_refuse_employe_hors_perimetre(employee, demandeur_conge, other_direction):
    demandeur_conge.scope_directions.add(other_direction)
    s = DemandeCongeCreateSerializer(data=_payload(employee), context=_ctx(demandeur_conge))
    assert not s.is_valid() and 'employee' in s.errors


def test_create_ignore_les_champs_reserves_au_traiteur(employee, demandeur_conge):
    demandeur_conge.scope_directions.add(employee.direction)
    s = DemandeCongeCreateSerializer(
        data=_payload(employee, observations='triche', ventilation=[{'exercice': ACT, 'jours': 9}],
                      categorie_exercice='ANTICIPE', statut='prete', validateur_nom='X'),
        context=_ctx(demandeur_conge),
    )
    assert s.is_valid(), s.errors
    for interdit in ('observations', 'ventilation', 'categorie_exercice', 'statut', 'validateur_nom'):
        assert interdit not in s.validated_data


def test_create_exige_type_et_motif_coherents(employee, demandeur_conge):
    demandeur_conge.scope_directions.add(employee.direction)
    sans = _payload(employee)
    del sans['type_conge'], sans['motif']
    s = DemandeCongeCreateSerializer(data=sans, context=_ctx(demandeur_conge))
    assert not s.is_valid() and 'type_conge' in s.errors and 'motif' in s.errors
    mariage = MotifConge.objects.create(nom='Mariage', type_conge='CE')
    s = DemandeCongeCreateSerializer(data=_payload(employee, motif=mariage.id), context=_ctx(demandeur_conge))
    assert not s.is_valid() and 'motif' in s.errors
    inactif = MotifConge.objects.create(nom='Ancien', type_conge='CP', is_active=False)
    s = DemandeCongeCreateSerializer(data=_payload(employee, motif=inactif.id), context=_ctx(demandeur_conge))
    assert not s.is_valid() and 'motif' in s.errors


def test_create_impose_la_duree_fixe_du_motif(employee, demandeur_conge):
    demandeur_conge.scope_directions.add(employee.direction)
    mariage = MotifConge.objects.create(nom='Mariage', type_conge='CE', nb_jours_fixe=3)
    s = DemandeCongeCreateSerializer(data=_payload(employee, type_conge='CE', motif=mariage.id),
                                     context=_ctx(demandeur_conge))
    assert not s.is_valid() and '3 jour' in str(s.errors['nb_jours'])
    s = DemandeCongeCreateSerializer(
        data=_payload(employee, type_conge='CE', motif=mariage.id, nb_jours=3, date_retour='2026-11-04',
                      exercice=REL),
        context=_ctx(demandeur_conge),
    )
    assert s.is_valid(), s.errors
    assert s.validated_data['exercice'] == ''  # l'exercice ne concerne que le CP


def test_create_controle_l_exercice(employee, demandeur_conge):
    demandeur_conge.scope_directions.add(employee.direction)
    for mauvais in ('2025-2026', exercice_suivant(ANT)):
        s = DemandeCongeCreateSerializer(data=_payload(employee, exercice=mauvais), context=_ctx(demandeur_conge))
        assert not s.is_valid() and 'exercice' in s.errors
    s = DemandeCongeCreateSerializer(data=_payload(employee, exercice=REL), context=_ctx(demandeur_conge))
    assert s.is_valid(), s.errors


def test_create_refuse_chevauchement(employee, demandeur_conge, demande_recue):
    demandeur_conge.scope_directions.add(employee.direction)
    demande_recue(reference='00001/26', date_depart=datetime.date(2026, 11, 5), date_retour=datetime.date(2026, 11, 15))
    s = DemandeCongeCreateSerializer(data=_payload(employee), context=_ctx(demandeur_conge))
    assert not s.is_valid() and '00001/26' in str(s.errors)


# ─── Validation (saisie du traiteur) ────────────────────────────────────────

def _valider_data(motif, **extra):
    data = {
        'type_conge': 'CP', 'motif': motif.id, 'date_etablissement': '2026-10-20', 'nb_jours': 10,
        'date_depart': '2026-11-01', 'date_retour': '2026-11-11', 'exercice': '',
        'adresse_conge': 'ALGERIE', 'observations': '',
    }
    data.update(extra)
    return data


def test_valider_serializer_exige_un_motif_du_bon_type(demande_recue):
    motif_ce = MotifConge.objects.create(nom='Mariage', type_conge='CE')
    s = ValiderSerializer(data=_valider_data(motif_ce, type_conge='CP'), context={'demande': demande_recue()})
    assert not s.is_valid() and 'motif' in s.errors


def test_valider_serializer_controle_format_exercice_et_reference(demande_recue):
    motif = MotifConge.objects.create(nom='Annuel', type_conge='CP')
    d = demande_recue()
    assert not ValiderSerializer(data=_valider_data(motif, exercice='2025-2026'), context={'demande': d}).is_valid()
    assert not ValiderSerializer(data=_valider_data(motif, reference='ABC'), context={'demande': d}).is_valid()
    assert ValiderSerializer(data=_valider_data(motif, reference='04512/26'), context={'demande': d}).is_valid()
    assert ValiderSerializer(data=_valider_data(motif, exercice=REL), context={'demande': d}).is_valid()


def test_valider_serializer_impose_la_duree_fixe(demande_recue):
    mariage = MotifConge.objects.create(nom='Mariage', type_conge='CE', nb_jours_fixe=3)
    s = ValiderSerializer(data=_valider_data(mariage, type_conge='CE'), context={'demande': demande_recue()})
    assert not s.is_valid() and 'nb_jours' in s.errors


def test_valider_serializer_refuse_une_reference_deja_prise(demande_recue):
    motif = MotifConge.objects.create(nom='Annuel', type_conge='CP')
    demande_recue(reference='04512/26')
    s = ValiderSerializer(data=_valider_data(motif, reference='04512/26'), context={'demande': demande_recue()})
    assert not s.is_valid() and 'reference' in s.errors


def test_valider_serializer_signataire_par_defaut_vient_de_la_configuration(demande_recue):
    from conges.models import CongeTemplateConfig
    CongeTemplateConfig.objects.update_or_create(pk=1, defaults={
        'signataire_interim': True, 'signataire_interim_nom': 'INTERIMAIRE Y',
    })
    motif = MotifConge.objects.create(nom='Annuel', type_conge='CP')
    s = ValiderSerializer(data=_valider_data(motif), context={'demande': demande_recue()})
    assert s.is_valid(), s.errors
    assert s.validated_data['signataire_nom'] == 'INTERIMAIRE Y'
    assert s.validated_data['signataire_interim'] is True


def test_valider_serializer_retour_apres_depart(demande_recue):
    motif = MotifConge.objects.create(nom='Annuel', type_conge='CP')
    s = ValiderSerializer(data=_valider_data(motif, date_retour='2026-11-01'), context={'demande': demande_recue()})
    assert not s.is_valid() and 'date_retour' in s.errors


# ─── Annulation : confirmation renforcée ────────────────────────────────────

def test_annuler_serializer_exige_la_reference_saisie(demande_recue):
    d = demande_recue(reference='00007/26')
    assert not AnnulerSerializer(data={'motif': 'x', 'reference_confirmation': '00008/26'}, context={'demande': d}).is_valid()
    assert AnnulerSerializer(data={'motif': 'x', 'reference_confirmation': '00007/26'}, context={'demande': d}).is_valid()
    assert not AnnulerSerializer(data={'motif': ' ', 'reference_confirmation': '00007/26'}, context={'demande': d}).is_valid()


def test_interrompre_serializer_exige_date_et_motif():
    assert not InterrompreSerializer(data={'motif': 'x'}).is_valid()
    assert InterrompreSerializer(data={'date_rappel': '2026-11-05', 'motif': 'Rappel'}).is_valid()


# ─── Helpers d'API ──────────────────────────────────────────────────────────

@pytest.fixture
def motif_cp(db):
    return _motif_cp()


def _creer(client, employee, **extra):
    return client.post('/api/conges/demandes/', _payload(employee, **extra), format='json')


def _ref_via_api(demandeur_conge, employee):
    demandeur_conge.scope_directions.add(employee.direction)
    return _creer(_client(demandeur_conge), employee).data['reference'].replace('/', '-')


def _corps_validation(motif, **extra):
    data = {
        'type_conge': 'CP', 'motif': motif.id, 'date_etablissement': '2026-10-20', 'nb_jours': 10,
        'date_depart': '2026-11-01', 'date_retour': '2026-11-11', 'exercice': '',
        'adresse_conge': 'ALGERIE', 'observations': 'RAS',
    }
    data.update(extra)
    return data


# ─── Création, liste, détail, annulation par le demandeur ───────────────────

def test_demandeur_cree_une_demande_dans_son_perimetre(demandeur_conge, employee):
    demandeur_conge.scope_directions.add(employee.direction)
    resp = _creer(_client(demandeur_conge), employee)
    assert resp.status_code == 201, resp.data
    assert resp.data['statut'] == 'recue' and resp.data['reference']
    assert resp.data['employee_matricule'] == employee.matricule
    assert DemandeConge.objects.get(id=resp.data['id']).demandeur_id == demandeur_conge.id
    assert AuditLog.objects.filter(action=AuditLog.Action.CREATE_CONGE).exists()


def test_creation_notifie_les_traiteurs(demandeur_conge, traiteur_conge, employee, django_capture_on_commit_callbacks):
    demandeur_conge.scope_directions.add(employee.direction)
    with django_capture_on_commit_callbacks(execute=True):  # notify() diffère via transaction.on_commit
        _creer(_client(demandeur_conge), employee)
    assert Notification.objects.filter(recipient=traiteur_conge, type=Notification.Type.CONGE_NOUVELLE).exists()


def test_gestionnaire_sans_drapeau_et_admin_ordinaire_ne_peuvent_pas_creer(gestionnaire_user, traiteur_conge, employee):
    gestionnaire_user.scope_directions.add(employee.direction)
    assert gestionnaire_user.peut_demander_conge is False
    assert _creer(_client(gestionnaire_user), employee).status_code == 403
    assert _creer(_client(traiteur_conge), employee).status_code == 403  # traiteur seul


def test_admin_non_charge_est_bloque_partout(admin_user, demandeur_conge, employee):
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(admin_user)
    assert client.get('/api/conges/demandes/').status_code == 403
    assert client.get(f'/api/conges/demandes/{ref}/').status_code == 403
    assert client.post(f'/api/conges/demandes/{ref}/valider/', {}, format='json').status_code == 403
    assert client.post(f'/api/conges/demandes/{ref}/annuler/', {}, format='json').status_code == 403
    assert client.get(f'/api/conges/soldes/{employee.matricule}/').status_code == 403
    assert client.get('/api/conges/motifs/').status_code == 403
    assert client.get('/api/conges/parametres/').status_code == 403


def test_demandeur_ne_voit_que_ses_demandes_et_pas_celles_d_un_autre(demandeur_conge, other_gestionnaire, employee):
    other_gestionnaire.peut_demander_conge = True
    other_gestionnaire.save(update_fields=['peut_demander_conge'])
    for u in (demandeur_conge, other_gestionnaire):
        u.scope_directions.add(employee.direction)
    _creer(_client(demandeur_conge), employee)
    ref2 = _creer(_client(other_gestionnaire), employee, date_depart='2027-01-01', date_retour='2027-01-11').data['reference'].replace('/', '-')
    rows = _rows(_client(demandeur_conge).get('/api/conges/demandes/').data)
    assert len(rows) == 1 and rows[0]['demandeur'] == demandeur_conge.id
    assert _client(demandeur_conge).get(f'/api/conges/demandes/{ref2}/').status_code == 403


def test_traiteur_voit_toutes_les_demandes(demandeur_conge, traiteur_conge, employee):
    _ref_via_api(demandeur_conge, employee)
    assert len(_rows(_client(traiteur_conge).get('/api/conges/demandes/').data)) == 1


def test_annulation_par_le_demandeur_est_un_soft_delete_limite_a_recue(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(annuel=30)
    ref1 = _ref_via_api(demandeur_conge, employee)
    assert _client(demandeur_conge).delete(f'/api/conges/demandes/{ref1}/').status_code == 204
    d = DemandeConge.objects.get(reference=ref1.replace('-', '/', 1))
    assert d.is_active is False
    assert AuditLog.objects.filter(action=AuditLog.Action.DELETE_CONGE).exists()
    assert _rows(_client(demandeur_conge).get('/api/conges/demandes/').data) == []
    ref2 = _creer(_client(demandeur_conge), employee).data['reference'].replace('/', '-')
    _client(traiteur_conge).post(f'/api/conges/demandes/{ref2}/valider/', _corps_validation(motif_cp), format='json')
    assert _client(demandeur_conge).delete(f'/api/conges/demandes/{ref2}/').status_code == 403


def test_filtre_pending_traiteur_et_demandeur(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    assert len(_rows(_client(traiteur_conge).get('/api/conges/demandes/', {'pending': 1}).data)) == 1
    _client(traiteur_conge).post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    assert len(_rows(_client(traiteur_conge).get('/api/conges/demandes/', {'pending': 1}).data)) == 0
    assert len(_rows(_client(demandeur_conge).get('/api/conges/demandes/', {'pending': 1}).data)) == 1


# ─── Validation, rejet, récupération ────────────────────────────────────────

def test_valider_debite_les_soldes_et_notifie(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp, django_capture_on_commit_callbacks):
    solde_employe(reliquat=13, annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    with django_capture_on_commit_callbacks(execute=True):
        resp = _client(traiteur_conge).post(
            f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp, nb_jours=20, date_retour='2026-11-21'), format='json',
        )
    assert resp.status_code == 200, resp.data
    assert resp.data['statut'] == 'prete'
    assert resp.data['ventilation'] == [{'exercice': REL, 'jours': 13}, {'exercice': ACT, 'jours': 7}]
    assert resp.data['categorie_exercice'] == 'RELIQUAT' and resp.data['exercice'] == REL
    assert resp.data['validateur_nom'] == traiteur_conge.full_name
    assert _restants(employee) == {REL: 0, ACT: 23, ANT: 30}
    assert SoldeConge.objects.get(employee=employee).cp_consomme == 20
    log = AuditLog.objects.filter(action=AuditLog.Action.VALIDER_CONGE).latest('id')
    assert log.details['ventilation'] == resp.data['ventilation']
    assert Notification.objects.filter(recipient=demandeur_conge, type=Notification.Type.CONGE_PRETE).exists()


def test_valider_solde_non_initialise_renvoie_400_lisible(demandeur_conge, traiteur_conge, employee, motif_cp):
    ref = _ref_via_api(demandeur_conge, employee)
    resp = _client(traiteur_conge).post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    assert resp.status_code == 400
    assert 'initialisés' in resp.data['error']


def test_valider_refuse_de_sauter_le_reliquat_avec_message_lisible(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(reliquat=13, annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    resp = _client(traiteur_conge).post(f'/api/conges/demandes/{ref}/valider/',
                                        _corps_validation(motif_cp, exercice=ACT), format='json')
    assert resp.status_code == 400 and REL in resp.data['error']


def test_valider_interdit_au_demandeur(demandeur_conge, employee, motif_cp):
    ref = _ref_via_api(demandeur_conge, employee)
    assert _client(demandeur_conge).post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json').status_code == 403


def test_rejeter_notifie_le_demandeur(demandeur_conge, traiteur_conge, employee, django_capture_on_commit_callbacks):
    ref = _ref_via_api(demandeur_conge, employee)
    with django_capture_on_commit_callbacks(execute=True):
        resp = _client(traiteur_conge).post(f'/api/conges/demandes/{ref}/rejeter/', {'motif': 'Période de clôture'}, format='json')
    assert resp.status_code == 200 and resp.data['statut'] == 'rejetee'
    assert AuditLog.objects.filter(action=AuditLog.Action.REJETER_CONGE).exists()
    assert Notification.objects.filter(recipient=demandeur_conge, type=Notification.Type.CONGE_REJETEE).exists()


def test_recuperee_exige_prete(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(traiteur_conge)
    assert client.post(f'/api/conges/demandes/{ref}/recuperee/', {}, format='json').status_code == 400
    client.post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    resp = client.post(f'/api/conges/demandes/{ref}/recuperee/', {}, format='json')
    assert resp.status_code == 200 and resp.data['statut'] == 'recuperee'
    assert AuditLog.objects.filter(action=AuditLog.Action.RECUPERER_CONGE).exists()


# ─── Annulation et interruption par le traiteur ─────────────────────────────

def test_annuler_exige_la_reference_et_restitue_avec_audit(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp, django_capture_on_commit_callbacks):
    solde_employe(reliquat=13, annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(traiteur_conge)
    client.post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    mauvais = client.post(f'/api/conges/demandes/{ref}/annuler/', {'motif': 'x', 'reference_confirmation': '99999/99'}, format='json')
    assert mauvais.status_code == 400
    with django_capture_on_commit_callbacks(execute=True):
        ok = client.post(
            f'/api/conges/demandes/{ref}/annuler/',
            {'motif': "Annulé par l'employé", 'reference_confirmation': ref.replace('-', '/', 1)}, format='json',
        )
    assert ok.status_code == 200 and ok.data['statut'] == 'annulee'
    assert _restants(employee) == {REL: 13, ACT: 30, ANT: 30}
    assert SoldeConge.objects.get(employee=employee).cp_consomme == 0
    log = AuditLog.objects.filter(action=AuditLog.Action.ANNULER_CONGE).latest('id')
    assert log.details['motif'] == "Annulé par l'employé"
    assert log.details['restitue'] == [{'exercice': REL, 'jours': 10}]
    assert Notification.objects.filter(recipient=demandeur_conge, type=Notification.Type.CONGE_ANNULEE).exists()


def test_interrompre_recalcule_et_trace(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp, django_capture_on_commit_callbacks):
    solde_employe(reliquat=13, annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(traiteur_conge)
    client.post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    with django_capture_on_commit_callbacks(execute=True):
        resp = client.post(
            f'/api/conges/demandes/{ref}/interrompre/', {'date_rappel': '2026-11-05', 'motif': "Rappel de l'employeur"}, format='json',
        )
    assert resp.status_code == 200, resp.data
    assert resp.data['statut'] == 'interrompue' and resp.data['jours_effectifs'] == 4
    assert _restants(employee)[REL] == 9  # 13 − 4 pris
    assert SoldeConge.objects.get(employee=employee).cp_consomme == 4
    log = AuditLog.objects.filter(action=AuditLog.Action.INTERROMPRE_CONGE).latest('id')
    assert log.details['jours_effectifs'] == 4 and log.details['jours_restitues'] == 6
    assert Notification.objects.filter(recipient=demandeur_conge, type=Notification.Type.CONGE_INTERROMPUE).exists()


def test_interrompre_date_invalide_renvoie_400(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(traiteur_conge)
    client.post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    resp = client.post(f'/api/conges/demandes/{ref}/interrompre/', {'date_rappel': '2026-12-01', 'motif': 'x'}, format='json')
    assert resp.status_code == 400 and 'error' in resp.data


def test_observations_modifiables_tant_que_pas_recuperee(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(traiteur_conge)
    client.post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    assert client.patch(f'/api/conges/demandes/{ref}/observations/', {'observations': 'corrigé'}, format='json').status_code == 200
    client.post(f'/api/conges/demandes/{ref}/recuperee/', {}, format='json')
    assert client.patch(f'/api/conges/demandes/{ref}/observations/', {'observations': 'trop tard'}, format='json').status_code == 400
    assert AuditLog.objects.filter(action=AuditLog.Action.MODIFY_CONGE).exists()


def test_scan_accepte_un_pdf_et_refuse_un_executable(demandeur_conge, traiteur_conge, employee, media_tmp, pdf_bytes):
    from django.core.files.uploadedfile import SimpleUploadedFile
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(traiteur_conge)
    ok = client.post(f'/api/conges/demandes/{ref}/scan/',
                     {'scan_document': SimpleUploadedFile('t.pdf', pdf_bytes, content_type='application/pdf')}, format='multipart')
    assert ok.status_code == 200, ok.data
    assert AuditLog.objects.filter(action=AuditLog.Action.SCAN_CONGE).exists()
    ko = client.post(f'/api/conges/demandes/{ref}/scan/',
                     {'scan_document': SimpleUploadedFile('x.pdf', b'MZ\x90\x00' + b'\x00' * 64, content_type='application/pdf')}, format='multipart')
    assert ko.status_code == 400


# ─── Soldes (lecture scopée, saisie initiale, correction) ──────────────────

def test_solde_non_initialise_est_signale(traiteur_conge, employee):
    resp = _client(traiteur_conge).get(f'/api/conges/soldes/{employee.matricule}/')
    assert resp.status_code == 200
    assert resp.data == {'initialise': False, 'solde': None, 'mouvements': []}


def test_initial_puis_lecture_avec_mouvements_pour_le_traiteur(traiteur_conge, employee):
    client = _client(traiteur_conge)
    resp = client.post(f'/api/conges/soldes/{employee.matricule}/initial/',
                       {'exercices': {REL: 5, ACT: 30}, 'droit_initial': 210, 'cp_consomme': 180}, format='json')
    assert resp.status_code == 201, resp.data
    log = AuditLog.objects.filter(action=AuditLog.Action.INITIAL_SOLDE_CONGE).latest('id')
    assert log.details['exercices'] == {REL: 5, ACT: 30}
    lecture = client.get(f'/api/conges/soldes/{employee.matricule}/').data
    assert lecture['initialise'] is True
    solde = lecture['solde']
    assert (solde['reliquat'], solde['actuel'], solde['anticipe'], solde['disponible']) == (5, 30, 30, 35)
    assert solde['cp_consomme'] == 180
    assert [e['exercice'] for e in solde['exercices']] == [REL, ACT, ANT]
    assert len(lecture['mouvements']) == 4  # compteurs + 2 exercices saisis + ouverture de l'anticipé
    assert client.post(f'/api/conges/soldes/{employee.matricule}/initial/',
                       {'exercices': {ACT: 1}}, format='json').status_code == 400


def test_initial_refuse_un_exercice_mal_forme(traiteur_conge, employee):
    resp = _client(traiteur_conge).post(f'/api/conges/soldes/{employee.matricule}/initial/',
                                        {'exercices': {'2025-2026': 5}}, format='json')
    assert resp.status_code == 400


def test_initial_et_correction_interdits_au_demandeur(demandeur_conge, employee):
    client = _client(demandeur_conge)
    assert client.post(f'/api/conges/soldes/{employee.matricule}/initial/',
                       {'exercices': {ACT: 30}}, format='json').status_code == 403
    assert client.post(f'/api/conges/soldes/{employee.matricule}/correction/',
                       {'exercices': {ACT: 1}, 'motif': 'x'}, format='json').status_code == 403


def test_correction_exige_un_motif_et_trace(traiteur_conge, employee, solde_employe):
    solde_employe(reliquat=5, annuel=30)
    client = _client(traiteur_conge)
    url = f'/api/conges/soldes/{employee.matricule}/correction/'
    assert client.post(url, {'exercices': {REL: -2}, 'motif': ' '}, format='json').status_code == 400
    assert client.post(url, {'exercices': {REL: 0}, 'motif': 'x'}, format='json').status_code == 400
    ok = client.post(url, {'exercices': {REL: -2}, 'motif': 'Erreur de reprise'}, format='json')
    assert ok.status_code == 200 and ok.data['reliquat'] == 3
    trop = client.post(url, {'exercices': {REL: -9}, 'motif': 'x'}, format='json')
    assert trop.status_code == 400 and 'error' in trop.data
    log = AuditLog.objects.filter(action=AuditLog.Action.CORRIGER_SOLDE_CONGE).latest('id')
    assert log.details['motif'] == 'Erreur de reprise'
    assert log.details['corrections']['exercices'] == {REL: -2}


def test_demandeur_voit_le_solde_dans_son_perimetre_sans_les_mouvements(demandeur_conge, employee, solde_employe):
    solde_employe(reliquat=5, annuel=30)
    demandeur_conge.scope_directions.add(employee.direction)
    resp = _client(demandeur_conge).get(f'/api/conges/soldes/{employee.matricule}/')
    assert resp.status_code == 200
    assert resp.data['solde']['disponible'] == 35 and resp.data['mouvements'] == []


def test_demandeur_ne_voit_pas_le_solde_hors_perimetre(demandeur_conge, employee, solde_employe, other_direction):
    solde_employe(annuel=30)
    demandeur_conge.scope_directions.add(other_direction)
    assert _client(demandeur_conge).get(f'/api/conges/soldes/{employee.matricule}/').status_code == 403


# ─── Motifs et paramètres ───────────────────────────────────────────────────

def test_motifs_crud_traiteur_et_desactivation(traiteur_conge):
    client = _client(traiteur_conge)
    r = client.post('/api/conges/motifs/', {'nom': 'Mariage', 'type_conge': 'CE'}, format='json')
    assert r.status_code == 201
    assert client.post('/api/conges/motifs/', {'nom': 'mariage', 'type_conge': 'CE'}, format='json').status_code == 400
    assert client.patch(f"/api/conges/motifs/{r.data['id']}/", {'nom': "Mariage de l'employé"}, format='json').status_code == 200
    assert client.delete(f"/api/conges/motifs/{r.data['id']}/").status_code == 204
    assert MotifConge.objects.get(pk=r.data['id']).is_active is False  # jamais supprimé


def test_motif_duree_fixe_et_pieces_attendues(traiteur_conge):
    client = _client(traiteur_conge)
    r = client.post('/api/conges/motifs/', {'nom': 'Mariage', 'type_conge': 'CE', 'nb_jours_fixe': 3}, format='json')
    assert r.status_code == 201 and r.data['nb_jours_fixe'] == 3 and r.data['pieces'] == []
    p = client.post(f"/api/conges/motifs/{r.data['id']}/pieces/", {'libelle': 'Acte de mariage'}, format='json')
    assert p.status_code == 201, p.data
    assert client.post(f"/api/conges/motifs/{r.data['id']}/pieces/", {'libelle': ' '}, format='json').status_code == 400
    assert client.get(f"/api/conges/motifs/{r.data['id']}/").data['pieces'][0]['libelle'] == 'Acte de mariage'
    assert client.delete(f"/api/conges/motifs/pieces/{p.data['id']}/").status_code == 204
    assert MotifPiece.objects.get(pk=p.data['id']).is_active is False  # désactivée, jamais supprimée
    assert client.patch(f"/api/conges/motifs/pieces/{p.data['id']}/", {'is_active': True}, format='json').status_code == 200


def test_le_demandeur_lit_les_motifs_mais_ne_les_modifie_pas(demandeur_conge, gestionnaire_user):
    _motif_cp()
    client = _client(demandeur_conge)
    assert client.get('/api/conges/motifs/').status_code == 200
    assert client.post('/api/conges/motifs/', {'nom': 'X', 'type_conge': 'CE'}, format='json').status_code == 403
    m = MotifConge.objects.get(nom='Congé annuel')
    assert client.patch(f'/api/conges/motifs/{m.id}/', {'nom': 'Y'}, format='json').status_code == 403
    assert client.post(f'/api/conges/motifs/{m.id}/pieces/', {'libelle': 'Z'}, format='json').status_code == 403
    # Un gestionnaire sans le droit de demander n'y a pas accès du tout.
    assert _client(gestionnaire_user).get('/api/conges/motifs/').status_code == 403


# ─── Pièces jointes d'une demande ──────────────────────────────────────────

def _upload(client, ref, contenu, nom='piece.pdf', **extra):
    from django.core.files.uploadedfile import SimpleUploadedFile
    data = {'fichier': SimpleUploadedFile(nom, contenu, content_type='application/pdf'), **extra}
    return client.post(f'/api/conges/demandes/{ref}/pieces/', data, format='multipart')


def test_le_demandeur_joint_une_piece_et_le_traiteur_la_telecharge(demandeur_conge, traiteur_conge, employee, media_tmp, pdf_bytes):
    ref = _ref_via_api(demandeur_conge, employee)
    resp = _upload(_client(demandeur_conge), ref, pdf_bytes, libelle='Acte de mariage')
    assert resp.status_code == 201, resp.data
    assert resp.data['libelle'] == 'Acte de mariage' and resp.data['mime_type'] == 'application/pdf'
    assert 'fichier' not in resp.data  # jamais d'URL directe
    piece = PieceJointeConge.objects.get(pk=resp.data['id'])
    assert piece.fichier.name.startswith(f'conges/pieces/{employee.id}/')
    assert 'piece' not in piece.fichier.name.rsplit('/', 1)[-1]  # nom client jamais réutilisé
    assert piece.nom_fichier == 'piece.pdf'
    detail = _client(traiteur_conge).get(f'/api/conges/demandes/{ref}/').data
    assert [p['libelle'] for p in detail['pieces_jointes']] == ['Acte de mariage']
    fichier = _client(traiteur_conge).get(f"/api/conges/demandes/{ref}/pieces/{piece.id}/")
    assert fichier.status_code == 200 and fichier['Content-Type'] == 'application/pdf'
    assert fichier['X-Content-Type-Options'] == 'nosniff'
    operations = list(AuditLog.objects.filter(action=AuditLog.Action.PIECE_CONGE)
                      .values_list('details__operation', flat=True))
    assert sorted(operations) == ['ajout', 'consultation']


def test_piece_jointe_refuse_un_executable_et_un_libelle_vide(demandeur_conge, employee, media_tmp, pdf_bytes):
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(demandeur_conge)
    assert _upload(client, ref, b'MZ\x90\x00' + b'\x00' * 64, libelle='x').status_code == 400
    assert _upload(client, ref, pdf_bytes).status_code == 400  # ni pièce attendue ni libellé
    assert not PieceJointeConge.objects.exists()


def test_piece_jointe_liee_a_une_piece_attendue_du_motif(demandeur_conge, employee, media_tmp, pdf_bytes):
    ref = _ref_via_api(demandeur_conge, employee)
    attendue = MotifPiece.objects.create(motif=_motif_cp(), libelle='Justificatif')
    autre = MotifPiece.objects.create(motif=MotifConge.objects.create(nom='Mariage', type_conge='CE'), libelle='Acte')
    client = _client(demandeur_conge)
    ok = _upload(client, ref, pdf_bytes, piece=attendue.id)
    assert ok.status_code == 201 and ok.data['libelle'] == 'Justificatif'
    assert _upload(client, ref, pdf_bytes, piece=autre.id).status_code == 400


def test_pieces_jointes_cloisonnees_et_figees_apres_traitement(demandeur_conge, other_gestionnaire, traiteur_conge, employee, solde_employe, motif_cp, media_tmp, pdf_bytes):
    solde_employe()
    ref = _ref_via_api(demandeur_conge, employee)
    piece = _upload(_client(demandeur_conge), ref, pdf_bytes, libelle='x').data
    other_gestionnaire.peut_demander_conge = True
    other_gestionnaire.save(update_fields=['peut_demander_conge'])
    intrus = _client(other_gestionnaire)
    assert intrus.get(f'/api/conges/demandes/{ref}/pieces/').status_code == 403
    assert intrus.get(f"/api/conges/demandes/{ref}/pieces/{piece['id']}/").status_code == 403
    assert _upload(intrus, ref, pdf_bytes, libelle='y').status_code == 403
    _client(traiteur_conge).post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    assert _upload(_client(demandeur_conge), ref, pdf_bytes, libelle='tard').status_code == 403
    assert _upload(_client(traiteur_conge), ref, pdf_bytes, libelle='traiteur').status_code == 201


def test_parametres_droit_annuel(traiteur_conge):
    client = _client(traiteur_conge)
    assert client.get('/api/conges/parametres/').data['droit_annuel_jours'] == 30
    assert client.put('/api/conges/parametres/', {'droit_annuel_jours': 35}, format='json').status_code == 200
    assert client.put('/api/conges/parametres/', {'droit_annuel_jours': 0}, format='json').status_code == 400


# ─── Aperçu PDF ─────────────────────────────────────────────────────────────

def _titre_valide(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(reliquat=13, annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    _client(traiteur_conge).post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    return ref


def test_apercu_renvoie_un_pdf_et_trace_l_audit(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    ref = _titre_valide(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    resp = _client(traiteur_conge).get(f'/api/conges/demandes/{ref}/apercu/')
    assert resp.status_code == 200 and resp['Content-Type'] == 'application/pdf'
    assert resp.content.startswith(b'%PDF')
    assert AuditLog.objects.filter(action=AuditLog.Action.APERCU_CONGE).exists()


def test_apercu_refuse_tant_que_la_demande_n_est_pas_validee(demandeur_conge, traiteur_conge, employee):
    ref = _ref_via_api(demandeur_conge, employee)
    assert _client(traiteur_conge).get(f'/api/conges/demandes/{ref}/apercu/').status_code == 400


def test_apercu_interdit_au_demandeur(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    ref = _titre_valide(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    assert _client(demandeur_conge).get(f'/api/conges/demandes/{ref}/apercu/').status_code == 403


def test_apercu_fige_la_date_et_demande_confirmation_si_elle_change(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    ref = _titre_valide(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    client, today = _client(traiteur_conge), timezone.localdate()
    client.get(f'/api/conges/demandes/{ref}/apercu/')
    d = DemandeConge.objects.get(reference=ref.replace('-', '/', 1))
    assert d.date_document == today
    DemandeConge.objects.filter(pk=d.pk).update(date_document=today - datetime.timedelta(days=1))
    resp = client.get(f'/api/conges/demandes/{ref}/apercu/')
    assert resp.status_code == 409 and resp.data['needs_confirmation'] is True
    assert client.get(f'/api/conges/demandes/{ref}/apercu/', {'confirmer_date': 1}).status_code == 200
    d.refresh_from_db()
    assert d.date_document == today


def test_apercu_d_un_titre_annule_reste_accessible_avec_filigrane(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    ref = _titre_valide(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    _client(traiteur_conge).post(
        f'/api/conges/demandes/{ref}/annuler/', {'motif': 'x', 'reference_confirmation': ref.replace('-', '/', 1)}, format='json',
    )
    assert _client(traiteur_conge).get(f'/api/conges/demandes/{ref}/apercu/').status_code == 200


# ─── Configuration du modèle ────────────────────────────────────────────────

def test_config_get_put_et_defauts(traiteur_conge):
    client = _client(traiteur_conge)
    resp = client.get('/api/conges/config/')
    assert resp.status_code == 200 and resp.data['mode_test'] is True and resp.data['fax'] == '213 (0) 41.68.01.03'
    corps = {k: v for k, v in resp.data.items() if k not in ('logo', 'id')}
    put = client.put('/api/conges/config/', {**corps, 'societe_nom': 'AUTRE'}, format='json')
    assert put.status_code == 200 and put.data['societe_nom'] == 'AUTRE'


def test_config_interim_exige_un_nom(traiteur_conge):
    client = _client(traiteur_conge)
    corps = {k: v for k, v in client.get('/api/conges/config/').data.items() if k not in ('logo', 'id')}
    resp = client.put('/api/conges/config/', {**corps, 'signataire_interim': True, 'signataire_interim_nom': ''}, format='json')
    assert resp.status_code == 400 and 'signataire_interim_nom' in resp.data


def test_config_apercu_live_ne_persiste_rien(traiteur_conge):
    from conges.models import CongeTemplateConfig
    resp = _client(traiteur_conge).post('/api/conges/config/apercu/', {'societe_nom': 'TEMPORAIRE'}, format='json')
    assert resp.status_code == 200 and resp.content.startswith(b'%PDF')
    assert CongeTemplateConfig.objects.get(pk=1).societe_nom == 'SOMIZ'


def test_config_stats_et_logo_interdits_au_demandeur_et_a_l_admin_non_charge(demandeur_conge, admin_user):
    for u in (demandeur_conge, admin_user):
        client = _client(u)
        for url in ('/api/conges/config/', '/api/conges/stats/', '/api/conges/config/logo-defaut/'):
            assert client.get(url).status_code == 403


# ─── Statistiques ───────────────────────────────────────────────────────────

def test_stats_structure_et_comptes(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    _titre_valide(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    resp = _client(traiteur_conge).get('/api/conges/stats/')
    assert resp.status_code == 200 and resp.data['total'] == 1
    assert resp.data['par_statut'] == [{'id': 'prete', 'nom': 'Prête', 'count': 1}]
    assert resp.data['par_gestionnaire'][0]['count'] == 1 and resp.data['par_employe'][0]['count'] == 1
    assert len(resp.data['evolution_mensuelle']) == 1 and resp.data['delai_moyen_jours'] is None


def test_stats_exclut_les_demandes_supprimees_par_le_demandeur(demandeur_conge, traiteur_conge, employee):
    ref = _ref_via_api(demandeur_conge, employee)
    _client(demandeur_conge).delete(f'/api/conges/demandes/{ref}/')
    assert _client(traiteur_conge).get('/api/conges/stats/').data['total'] == 0
