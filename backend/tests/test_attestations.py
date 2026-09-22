import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from attestations.models import DemandeAttestation, ReferenceCounter, AttestationTemplateConfig
from attestations.reference import generate_reference
from attestations.permissions import CanRequestAttestation

pytestmark = pytest.mark.django_db


# ─── Modèles ────────────────────────────────────────────────────────────────

def test_demande_attestation_default_statut_is_recue(employee, gestionnaire_user):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='Dossier administratif',
        demandeur=gestionnaire_user,
    )
    assert demande.statut == DemandeAttestation.Statut.RECUE
    assert demande.traite_par is None


def test_reference_counter_unique_per_year():
    ReferenceCounter.objects.create(annee=2026, dernier_numero=5)
    with pytest.raises(Exception):
        ReferenceCounter.objects.create(annee=2026, dernier_numero=1)


def test_attestation_template_config_singleton_defaults():
    config = AttestationTemplateConfig.objects.create(societe_nom='SOMIZ')
    assert config.societe_nom == 'SOMIZ'
    assert not config.logo


# ─── Référence ──────────────────────────────────────────────────────────────

def test_generate_reference_increments_within_same_year():
    ref1 = generate_reference()
    ref2 = generate_reference()
    num1, year1 = ref1.split('/')
    num2, year2 = ref2.split('/')
    assert year1 == year2
    assert int(num2) == int(num1) + 1


def test_generate_reference_format_is_5digits_slash_2digit_year():
    ref = generate_reference()
    num, year = ref.split('/')
    assert len(num) == 5 and num.isdigit()
    assert len(year) == 2 and year.isdigit()


# ─── Permission ─────────────────────────────────────────────────────────────

from unittest.mock import MagicMock


def _fake_request(role, consented=True, active=True):
    request = MagicMock()
    request.user = MagicMock()
    request.user.is_authenticated = True
    request.user.is_active = active
    request.user.role = role
    request.user.consent_loi1807_accepted_at = 'x' if consented else None
    return request


@pytest.mark.parametrize('role', ['GESTIONNAIRE', 'SUPERADMIN'])
def test_can_request_attestation_allows_gestionnaire_and_superadmin(role):
    perm = CanRequestAttestation()
    assert perm.has_permission(_fake_request(role), None) is True


@pytest.mark.parametrize('role', ['CONSULTANT', 'ADMIN'])
def test_can_request_attestation_blocks_consultant_and_plain_admin(role):
    """Un ADMIN ordinaire reste uniquement traiteur — le laisser créer ses
    propres demandes casserait la séparation demandeur/traiteur (voir
    attestations/permissions.py)."""
    perm = CanRequestAttestation()
    assert perm.has_permission(_fake_request(role), None) is False


def test_can_request_attestation_blocks_unconsented_user():
    perm = CanRequestAttestation()
    assert perm.has_permission(_fake_request('GESTIONNAIRE', consented=False), None) is False


# ─── Création / liste / annulation ──────────────────────────────────────────

def test_gestionnaire_can_create_demande_for_employee_in_scope(
    gestionnaire_user, employee, direction,
):
    gestionnaire_user.scope_directions.add(direction)
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.post('/api/attestations/demandes/', {
        'employee': str(employee.id), 'motif': 'Dossier administratif',
    }, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['statut'] == 'recue'
    assert resp.data['reference']
    demande = DemandeAttestation.objects.get(id=resp.data['id'])
    assert demande.demandeur_id == gestionnaire_user.id


def test_gestionnaire_cannot_create_demande_for_employee_out_of_scope(
    gestionnaire_user, employee, other_direction,
):
    gestionnaire_user.scope_directions.add(other_direction)
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.post('/api/attestations/demandes/', {
        'employee': str(employee.id), 'motif': 'Dossier administratif',
    }, format='json')
    assert resp.status_code in (400, 403, 404)


def test_gestionnaire_list_shows_only_own_demandes(gestionnaire_user, other_gestionnaire, employee):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
    )
    DemandeAttestation.objects.create(
        reference='00002/26', employee=employee, motif='B', demandeur=other_gestionnaire,
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.get('/api/attestations/demandes/')
    assert resp.status_code == 200
    results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert len(results) == 1
    assert results[0]['reference'] == '00001/26'


def test_pending_filter_counts_only_recue(admin_user, gestionnaire_user, employee):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
        statut='recue',
    )
    DemandeAttestation.objects.create(
        reference='00002/26', employee=employee, motif='B', demandeur=gestionnaire_user,
        statut='imprimee',
    )
    DemandeAttestation.objects.create(
        reference='00003/26', employee=employee, motif='C', demandeur=gestionnaire_user,
        statut='prete',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/attestations/demandes/', {'pending': 1})
    results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert len(results) == 1
    assert results[0]['reference'] == '00001/26'


def test_search_filters_by_employee_or_reference_or_demandeur(
    admin_user, gestionnaire_user, employee, other_gestionnaire,
):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)

    for q in ['00001/26', employee.nom, employee.matricule, gestionnaire_user.nom]:
        resp = client.get('/api/attestations/demandes/', {'q': q})
        results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        assert len(results) == 1, f"q={q!r} n'a rien trouvé"

    resp = client.get('/api/attestations/demandes/', {'q': 'introuvable_xyz'})
    results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert len(results) == 0


def test_admin_list_shows_all_demandes(admin_user, gestionnaire_user, employee):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/attestations/demandes/')
    results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert len(results) == 1


def test_demandeur_can_cancel_own_demande_while_recue(gestionnaire_user, employee):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.delete(f'/api/attestations/demandes/{demande.id}/')
    assert resp.status_code == 204
    assert not DemandeAttestation.objects.filter(id=demande.id).exists()


def test_demandeur_cannot_cancel_demande_once_imprimee(gestionnaire_user, employee):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
        statut=DemandeAttestation.Statut.IMPRIMEE,
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.delete(f'/api/attestations/demandes/{demande.id}/')
    assert resp.status_code in (400, 403, 404)
    assert DemandeAttestation.objects.filter(id=demande.id).exists()


# ─── Workflow des statuts ───────────────────────────────────────────────────

ORDRE_STATUTS = ['recue', 'imprimee', 'signee', 'prete', 'recuperee']


@pytest.mark.parametrize('depuis,vers', list(zip(ORDRE_STATUTS, ORDRE_STATUTS[1:])))
def test_admin_can_advance_statut_in_order(admin_user, employee, gestionnaire_user, depuis, vers):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif='A', demandeur=gestionnaire_user,
        statut=depuis,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.patch(f'/api/attestations/demandes/{demande.id}/statut/', {'statut': vers}, format='json')
    assert resp.status_code == 200, resp.data
    demande.refresh_from_db()
    assert demande.statut == vers
    assert demande.traite_par_id == admin_user.id


def test_admin_cannot_skip_statuses(admin_user, employee, gestionnaire_user):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif='A', demandeur=gestionnaire_user,
        statut='recue',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.patch(f'/api/attestations/demandes/{demande.id}/statut/', {'statut': 'prete'}, format='json')
    assert resp.status_code == 400
    demande.refresh_from_db()
    assert demande.statut == 'recue'


def test_admin_can_reject_from_any_non_terminal_status(admin_user, employee, gestionnaire_user):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif='A', demandeur=gestionnaire_user,
        statut='signee',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.patch(
        f'/api/attestations/demandes/{demande.id}/statut/',
        {'statut': 'rejetee', 'motif_rejet': 'Employé non éligible'}, format='json',
    )
    assert resp.status_code == 200, resp.data
    demande.refresh_from_db()
    assert demande.statut == 'rejetee'
    assert demande.motif_rejet == 'Employé non éligible'


def test_reject_without_motif_is_rejected(admin_user, employee, gestionnaire_user):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif='A', demandeur=gestionnaire_user,
        statut='recue',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.patch(
        f'/api/attestations/demandes/{demande.id}/statut/', {'statut': 'rejetee'}, format='json',
    )
    assert resp.status_code == 400


def test_gestionnaire_cannot_change_statut(gestionnaire_user, employee):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif='A', demandeur=gestionnaire_user,
        statut='recue',
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.patch(f'/api/attestations/demandes/{demande.id}/statut/', {'statut': 'imprimee'}, format='json')
    assert resp.status_code == 403


# ─── Scan ────────────────────────────────────────────────────────────────────

def test_admin_can_upload_scan_at_any_statut(admin_user, employee, gestionnaire_user):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif='A', demandeur=gestionnaire_user,
        statut='prete',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    fichier = SimpleUploadedFile('scan.pdf', b'%PDF-1.4 contenu', content_type='application/pdf')
    resp = client.post(
        f'/api/attestations/demandes/{demande.id}/scan/', {'scan_document': fichier}, format='multipart',
    )
    assert resp.status_code == 200, resp.data
    demande.refresh_from_db()
    assert demande.scan_document.name


# ─── Configuration du modèle ────────────────────────────────────────────────

def test_get_config_creates_singleton_on_first_access(admin_user):
    assert AttestationTemplateConfig.objects.count() == 0
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/attestations/config/')
    assert resp.status_code == 200
    assert AttestationTemplateConfig.objects.count() == 1


def test_put_config_updates_singleton_in_place(admin_user):
    client = APIClient()
    client.force_authenticate(admin_user)
    client.get('/api/attestations/config/')
    resp = client.put('/api/attestations/config/', {
        'societe_nom': 'SOMIZ', 'ville': 'Arzew',
        'signataire_titre': 'Chef de Département Administration du Personnel',
        'signataire_nom': 'A.BOUSMAHA',
    }, format='json')
    assert resp.status_code == 200, resp.data
    assert AttestationTemplateConfig.objects.count() == 1
    assert AttestationTemplateConfig.objects.first().ville == 'Arzew'


def test_gestionnaire_cannot_access_config(gestionnaire_user):
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.get('/api/attestations/config/')
    assert resp.status_code == 403


# ─── Aperçu ─────────────────────────────────────────────────────────────────

def _texte_pdf(contenu):
    from io import BytesIO
    from pypdf import PdfReader
    return PdfReader(BytesIO(contenu)).pages[0].extract_text()


def test_apercu_renvoie_un_pdf_avec_les_donnees_de_la_demande(admin_user, employee, gestionnaire_user):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='Dossier administratif',
        demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get(f'/api/attestations/demandes/{demande.id}/apercu/')
    assert resp.status_code == 200
    assert resp['Content-Type'] == 'application/pdf'
    assert resp.content.startswith(b'%PDF')

    texte = _texte_pdf(resp.content)
    assert '00001/26' in texte
    assert employee.nom.upper() in texte
    assert employee.matricule in texte
    assert 'DOSSIER ADMINISTRATIF' in texte
    assert 'ATTESTATION DE TRAVAIL' in texte


def test_apercu_reprend_la_configuration_du_modele(admin_user, employee, gestionnaire_user):
    """Le document n'embarque aucune valeur codée en dur : tout l'en-tête,
    le signataire et le pied de page viennent de AttestationTemplateConfig,
    modifiable par un ADMIN dans /parametres."""
    config, _ = AttestationTemplateConfig.objects.get_or_create(pk=1)
    config.societe_nom = 'SOCIETE TEST'
    config.ville = 'Alger'
    config.signataire_titre = 'Directeur des Ressources Humaines'
    config.signataire_nom = 'B.TESTEUR'
    config.save()

    demande = DemandeAttestation.objects.create(
        reference='00002/26', employee=employee, motif='Banque', demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get(f'/api/attestations/demandes/{demande.id}/apercu/')
    texte = _texte_pdf(resp.content)
    assert 'SOCIETE TEST' in texte
    assert 'Alger' in texte
    assert 'DIRECTEUR DES RESSOURCES HUMAINES' in texte
    assert 'B.TESTEUR' in texte


def test_apercu_reprend_le_dernier_contrat_si_la_demande_nen_vise_aucun(
    admin_user, employee, gestionnaire_user, contrat,
):
    demande = DemandeAttestation.objects.create(
        reference='00003/26', employee=employee, motif='Banque', demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get(f'/api/attestations/demandes/{demande.id}/apercu/')
    assert contrat.numero_contrat in _texte_pdf(resp.content)


def test_gestionnaire_cannot_access_apercu(gestionnaire_user, employee):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.get(f'/api/attestations/demandes/{demande.id}/apercu/')
    assert resp.status_code == 403


# ─── Reporting ──────────────────────────────────────────────────────────────

def test_stats_counts_demandes_by_gestionnaire_and_employee(
    admin_user, employee, gestionnaire_user, other_gestionnaire,
):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
    )
    DemandeAttestation.objects.create(
        reference='00002/26', employee=employee, motif='B', demandeur=gestionnaire_user,
    )
    DemandeAttestation.objects.create(
        reference='00003/26', employee=employee, motif='C', demandeur=other_gestionnaire,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/attestations/stats/')
    assert resp.status_code == 200
    par_gest = {r['demandeur_nom']: r['count'] for r in resp.data['par_gestionnaire']}
    assert par_gest[gestionnaire_user.full_name] == 2
    assert par_gest[other_gestionnaire.full_name] == 1
    par_emp = resp.data['par_employe']
    assert par_emp[0]['count'] == 3


def test_stats_forbidden_for_gestionnaire(gestionnaire_user):
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.get('/api/attestations/stats/')
    assert resp.status_code == 403
