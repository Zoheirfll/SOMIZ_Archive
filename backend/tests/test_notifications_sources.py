"""
Tests — sources d'événements du système de notifications :
attestations (lot 1), sécurité (lot 2), employés/import/contrats (lot 3).
Toujours via de vraies routes quand une route existe.
"""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from attestations.models import DemandeAttestation
from attestations.reference import generate_reference
from notifications.alerts import notifier_echeances_contrat
from notifications.models import Notification

pytestmark = pytest.mark.django_db
User = get_user_model()


def _mk(username, role, **kw):
    return User.objects.create_user(
        username=username, password="Passw0rd!123", nom=username, prenom="T",
        role=role, consent_loi1807_accepted_at=timezone.now(), **kw,
    )


def _url_ref(demande):
    return demande.reference.replace('/', '-', 1)


def _types(user):
    return list(Notification.objects.filter(recipient=user).values_list('type', flat=True))


# ─── Lot 1 : attestations ───────────────────────────────────────────────────

@pytest.fixture
def traiteur(db):
    return _mk("traiteur", "ADMIN", charge_attestation=True)


@pytest.fixture
def admin_non_charge(db):
    return _mk("admin_nc", "ADMIN")


def test_nouvelle_demande_notifie_les_traiteurs_seulement(
    traiteur, admin_non_charge, gestionnaire_user, employee, direction, motif_attestation,
    django_capture_on_commit_callbacks,
):
    gestionnaire_user.scope_directions.add(direction)
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    with django_capture_on_commit_callbacks(execute=True):
        resp = client.post('/api/attestations/demandes/', {
            'employee': str(employee.id), 'motif': str(motif_attestation.id),
        }, format='json')
    assert resp.status_code == 201, resp.data
    assert _types(traiteur) == ['ATTESTATION_NOUVELLE']
    assert _types(admin_non_charge) == []
    assert _types(gestionnaire_user) == []
    notif = Notification.objects.get(recipient=traiteur)
    assert notif.link.startswith('/attestations/') and '/' not in notif.link[len('/attestations/'):]
    # Texte neutre : jamais le nom de l'employé.
    assert employee.nom not in notif.message and employee.prenom not in notif.message


@pytest.mark.parametrize('vers,type_attendu', [
    ('prete', 'ATTESTATION_PRETE'), ('rejetee', 'ATTESTATION_REJETEE'),
])
def test_changement_statut_notifie_le_demandeur(
    vers, type_attendu, traiteur, gestionnaire_user, employee, motif_attestation,
    django_capture_on_commit_callbacks,
):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation,
        demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(traiteur)
    payload = {'statut': vers}
    if vers == 'rejetee':
        payload['motif_rejet'] = 'Dossier incomplet'
    with django_capture_on_commit_callbacks(execute=True):
        resp = client.patch(f'/api/attestations/demandes/{_url_ref(demande)}/statut/', payload, format='json')
    assert resp.status_code == 200, resp.data
    assert _types(gestionnaire_user) == [type_attendu]
    assert _types(traiteur) == []


def test_statut_recuperee_ne_notifie_personne(
    traiteur, gestionnaire_user, employee, motif_attestation, django_capture_on_commit_callbacks,
):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation,
        demandeur=gestionnaire_user, statut='prete',
    )
    client = APIClient()
    client.force_authenticate(traiteur)
    with django_capture_on_commit_callbacks(execute=True):
        client.patch(f'/api/attestations/demandes/{_url_ref(demande)}/statut/', {'statut': 'recuperee'}, format='json')
    assert Notification.objects.count() == 0


def test_bulk_statut_prete_notifie_chaque_demandeur(
    traiteur, gestionnaire_user, other_gestionnaire, employee, motif_attestation,
    django_capture_on_commit_callbacks,
):
    d1 = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation, demandeur=gestionnaire_user)
    d2 = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation, demandeur=other_gestionnaire)
    client = APIClient()
    client.force_authenticate(traiteur)
    with django_capture_on_commit_callbacks(execute=True):
        resp = client.post('/api/attestations/demandes/bulk-statut/',
                           {'ids': [str(d1.id), str(d2.id)], 'statut': 'prete'}, format='json')
    assert resp.status_code == 200
    assert _types(gestionnaire_user) == ['ATTESTATION_PRETE']
    assert _types(other_gestionnaire) == ['ATTESTATION_PRETE']


# ─── Lot 2 : sécurité ───────────────────────────────────────────────────────

def test_verrouillage_alerte_superadmin_et_admin_pour_un_consultant(
    consultant_user, admin_user, django_capture_on_commit_callbacks,
):
    superadmin = _mk("super", "SUPERADMIN")
    with django_capture_on_commit_callbacks(execute=True):
        for _ in range(5):
            consultant_user.register_failed_login()
    assert _types(superadmin) == ['COMPTE_VERROUILLE']
    assert _types(admin_user) == ['COMPTE_VERROUILLE']
    assert _types(consultant_user) == []
    assert Notification.objects.get(recipient=admin_user).severity == 'critical'


def test_verrouillage_d_un_admin_ne_previent_pas_les_autres_admins(
    admin_user, django_capture_on_commit_callbacks,
):
    superadmin = _mk("super", "SUPERADMIN")
    autre = _mk("autre_admin", "ADMIN")
    with django_capture_on_commit_callbacks(execute=True):
        for _ in range(5):
            admin_user.register_failed_login()
    assert _types(superadmin) == ['COMPTE_VERROUILLE']
    assert _types(autre) == []


def test_verrouillage_notifie_une_seule_fois(admin_user, consultant_user, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        for _ in range(8):
            consultant_user.register_failed_login()
    assert Notification.objects.filter(recipient=admin_user).count() == 1


# ─── Lot 3 : employés / import / contrats ───────────────────────────────────

def test_archivage_employe_notifie_les_autres_admins_et_le_perimetre(
    admin_user, employee, consultant_user, django_capture_on_commit_callbacks,
):
    autre_admin = _mk("autre_admin", "ADMIN")
    consultant_user.scope_services.set([employee.service])
    hors_perimetre = _mk("hors_perimetre", "CONSULTANT")
    client = APIClient()
    client.force_authenticate(admin_user)
    with django_capture_on_commit_callbacks(execute=True):
        resp = client.patch(f'/api/employees/{employee.id}/', {'statut': 'archive'}, format='json')
    assert resp.status_code == 200, resp.data
    assert _types(autre_admin) == ['EMPLOYE_ARCHIVE']
    assert _types(consultant_user) == ['EMPLOYE_ARCHIVE']
    assert _types(admin_user) == []
    assert _types(hors_perimetre) == []
    assert employee.nom not in Notification.objects.first().message


def test_modification_sans_statut_ni_transfert_ne_notifie_pas(
    admin_user, employee, django_capture_on_commit_callbacks,
):
    _mk("autre_admin", "ADMIN")
    client = APIClient()
    client.force_authenticate(admin_user)
    with django_capture_on_commit_callbacks(execute=True):
        client.patch(f'/api/employees/{employee.id}/', {'nom': 'Nouveau'}, format='json')
    assert Notification.objects.count() == 0


def test_echeance_contrat_notifie_une_seule_fois(admin_user, contrat, django_capture_on_commit_callbacks):
    contrat.date_fin = timezone.localdate() + timedelta(days=10)
    contrat.save()
    # Deux blocs distincts : les notifications ne sont créées qu'à la sortie
    # du bloc (on_commit), donc le 2e appel doit venir après.
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_contrat() == 1
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_contrat() == 0  # idempotent
    assert _types(admin_user) == ['CONTRAT_ECHEANCE']


def test_echeance_contrat_ignore_les_contrats_lointains(admin_user, contrat, django_capture_on_commit_callbacks):
    contrat.date_fin = timezone.localdate() + timedelta(days=90)
    contrat.save()
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_contrat() == 0


def test_commande_echeances(admin_user, contrat, django_capture_on_commit_callbacks):
    contrat.date_fin = timezone.localdate() + timedelta(days=3)
    contrat.save()
    with django_capture_on_commit_callbacks(execute=True):
        call_command('notifier_echeances_contrat')
    assert Notification.objects.filter(recipient=admin_user, severity='warning').count() == 1


# ─── Consentements Loi 18-07 en attente ─────────────────────────────────────

def _compte_sans_consentement(username, role, jours):
    u = User.objects.create_user(username=username, password="Passw0rd!123", nom=username,
                                 prenom="T", role=role)
    User.objects.filter(pk=u.pk).update(date_joined=timezone.now() - timedelta(days=jours))
    return u


def test_consentement_en_attente_apres_7_jours_une_seule_fois(
    admin_user, django_capture_on_commit_callbacks,
):
    from notifications.alerts import notifier_consentements_en_attente
    _compte_sans_consentement("vieux", "CONSULTANT", 10)
    _compte_sans_consentement("recent", "CONSULTANT", 2)
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_consentements_en_attente() == 1
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_consentements_en_attente() == 0
    assert _types(admin_user) == ['CONSENTEMENT_EN_ATTENTE']


def test_consentement_compte_admin_ne_previent_pas_les_autres_admins(
    admin_user, django_capture_on_commit_callbacks,
):
    from notifications.alerts import notifier_consentements_en_attente
    superadmin = _mk("super", "SUPERADMIN")
    _compte_sans_consentement("admin_vieux", "ADMIN", 10)
    with django_capture_on_commit_callbacks(execute=True):
        notifier_consentements_en_attente()
    assert _types(superadmin) == ['CONSENTEMENT_EN_ATTENTE']
    assert _types(admin_user) == []
