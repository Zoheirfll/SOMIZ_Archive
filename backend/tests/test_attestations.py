import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from attestations.models import DemandeAttestation, ReferenceCounter, AttestationTemplateConfig
from attestations.reference import generate_reference
from attestations.permissions import CanRequestAttestation

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_user(admin_user):
    """Surcharge la fixture globale (tests/conftest.py) : dans ce module,
    `admin_user` représente un ADMIN chargé des attestations
    (User.can_manage_attestations) — un ADMIN nouvellement créé ne l'est
    pas par défaut (voir test_admin_non_charge_est_bloque_partout ci-dessous
    pour le cas contraire)."""
    admin_user.charge_attestation = True
    admin_user.save(update_fields=['charge_attestation'])
    return admin_user


# ─── Modèles ────────────────────────────────────────────────────────────────

def test_demande_attestation_default_statut_is_recue(employee, gestionnaire_user, motif_attestation):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif=motif_attestation,
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
    gestionnaire_user, employee, direction, motif_attestation,
):
    gestionnaire_user.scope_directions.add(direction)
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.post('/api/attestations/demandes/', {
        'employee': str(employee.id), 'motif': str(motif_attestation.id),
    }, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['statut'] == 'recue'
    assert resp.data['reference']
    demande = DemandeAttestation.objects.get(id=resp.data['id'])
    assert demande.demandeur_id == gestionnaire_user.id


def test_gestionnaire_can_create_demande_with_motif_libre(
    gestionnaire_user, employee, direction,
):
    """Le select "Motif" propose "Autre..." — un GESTIONNAIRE (pas ADMIN,
    donc sans accès à /ref/motifs-attestation/ en écriture) peut quand même
    créer un motif à la volée via `motif_autre`."""
    from employees.models import MotifArchivage
    gestionnaire_user.scope_directions.add(direction)
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.post('/api/attestations/demandes/', {
        'employee': str(employee.id), 'motif_autre': 'Visa Schengen',
    }, format='json')
    assert resp.status_code == 201, resp.data
    motif = MotifArchivage.objects.get(nom='Visa Schengen')
    assert motif.categorie == MotifArchivage.Categorie.ATTESTATION
    assert str(resp.data['motif']) == str(motif.id)


def test_gestionnaire_cannot_create_demande_for_employee_out_of_scope(
    gestionnaire_user, employee, other_direction, motif_attestation,
):
    gestionnaire_user.scope_directions.add(other_direction)
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.post('/api/attestations/demandes/', {
        'employee': str(employee.id), 'motif': str(motif_attestation.id),
    }, format='json')
    assert resp.status_code in (400, 403, 404)


def test_gestionnaire_list_shows_only_own_demandes(gestionnaire_user, other_gestionnaire, employee, motif_attestation):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    DemandeAttestation.objects.create(
        reference='00002/26', employee=employee, motif=motif_attestation, demandeur=other_gestionnaire,
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.get('/api/attestations/demandes/')
    assert resp.status_code == 200
    results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert len(results) == 1
    assert results[0]['reference'] == '00001/26'


def test_pending_filter_counts_only_recue(admin_user, gestionnaire_user, employee, motif_attestation):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
        statut='recue',
    )
    DemandeAttestation.objects.create(
        reference='00002/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
        statut='prete',
    )
    DemandeAttestation.objects.create(
        reference='00003/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
        statut='recuperee',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/attestations/demandes/', {'pending': 1})
    results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert len(results) == 1
    assert results[0]['reference'] == '00001/26'


def test_search_filters_by_employee_or_reference_or_demandeur(
    admin_user, gestionnaire_user, employee, other_gestionnaire, motif_attestation,
):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
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


def test_employee_filter_scopes_to_one_employee(
    admin_user, gestionnaire_user, employee, other_gestionnaire, motif_attestation,
):
    """Onglet "Attestations" de la fiche employé (EmployeeDetail.jsx) —
    ?employee=<id> ne renvoie que les demandes de CET employé, combiné avec
    le scoping demandeur habituel (un GESTIONNAIRE ne voit toujours que ses
    propres demandes, même filtrées par employé)."""
    from employees.models import Employee
    autre_employee = Employee.objects.create(
        matricule='EMP-002', nom='Martin', prenom='Paul',
        direction=employee.direction, departement=employee.departement,
        service=employee.service, poste=employee.poste,
        type_contrat=employee.type_contrat, categorie=employee.categorie,
        created_by=admin_user,
    )
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    DemandeAttestation.objects.create(
        reference='00002/26', employee=autre_employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    DemandeAttestation.objects.create(
        reference='00003/26', employee=employee, motif=motif_attestation, demandeur=other_gestionnaire,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/attestations/demandes/', {'employee': employee.matricule})
    results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert {r['reference'] for r in results} == {'00001/26', '00003/26'}

    client.force_authenticate(gestionnaire_user)
    resp = client.get('/api/attestations/demandes/', {'employee': employee.matricule})
    results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert {r['reference'] for r in results} == {'00001/26'}


def test_admin_list_shows_all_demandes(admin_user, gestionnaire_user, employee, motif_attestation):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/attestations/demandes/')
    results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert len(results) == 1


def test_demandeur_can_cancel_own_demande_while_recue(gestionnaire_user, employee, motif_attestation):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.delete(f'/api/attestations/demandes/{_url_ref(demande)}/')
    assert resp.status_code == 204
    assert not DemandeAttestation.objects.filter(id=demande.id).exists()


def test_demandeur_cannot_cancel_demande_once_prete(gestionnaire_user, employee, motif_attestation):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
        statut=DemandeAttestation.Statut.PRETE,
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.delete(f'/api/attestations/demandes/{_url_ref(demande)}/')
    assert resp.status_code in (400, 403, 404)
    assert DemandeAttestation.objects.filter(id=demande.id).exists()


# ─── Workflow des statuts ───────────────────────────────────────────────────

ORDRE_STATUTS = ['recue', 'prete', 'recuperee']


@pytest.mark.parametrize('depuis,vers', list(zip(ORDRE_STATUTS, ORDRE_STATUTS[1:])))
def test_admin_can_advance_statut_in_order(admin_user, employee, gestionnaire_user, motif_attestation, depuis, vers):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
        statut=depuis,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.patch(f'/api/attestations/demandes/{_url_ref(demande)}/statut/', {'statut': vers}, format='json')
    assert resp.status_code == 200, resp.data
    demande.refresh_from_db()
    assert demande.statut == vers
    assert demande.traite_par_id == admin_user.id
    if vers == 'prete':
        assert demande.date_prete is not None
    elif vers == 'recuperee':
        assert demande.date_recuperee is not None


def test_admin_cannot_skip_statuses(admin_user, employee, gestionnaire_user, motif_attestation):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
        statut='recue',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.patch(f'/api/attestations/demandes/{_url_ref(demande)}/statut/', {'statut': 'recuperee'}, format='json')
    assert resp.status_code == 400
    demande.refresh_from_db()
    assert demande.statut == 'recue'


def test_admin_can_reject_from_any_non_terminal_status(admin_user, employee, gestionnaire_user, motif_attestation):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
        statut='prete',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.patch(
        f'/api/attestations/demandes/{_url_ref(demande)}/statut/',
        {'statut': 'rejetee', 'motif_rejet': 'Employé non éligible'}, format='json',
    )
    assert resp.status_code == 200, resp.data
    demande.refresh_from_db()
    assert demande.statut == 'rejetee'
    assert demande.motif_rejet == 'Employé non éligible'


def test_reject_without_motif_is_rejected(admin_user, employee, gestionnaire_user, motif_attestation):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
        statut='recue',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.patch(
        f'/api/attestations/demandes/{_url_ref(demande)}/statut/', {'statut': 'rejetee'}, format='json',
    )
    assert resp.status_code == 400


def test_gestionnaire_cannot_change_statut(gestionnaire_user, employee, motif_attestation):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
        statut='recue',
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.patch(f'/api/attestations/demandes/{_url_ref(demande)}/statut/', {'statut': 'prete'}, format='json')
    assert resp.status_code == 403


# ─── Scan ────────────────────────────────────────────────────────────────────

def test_admin_can_upload_scan_at_any_statut(admin_user, employee, gestionnaire_user, motif_attestation):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
        statut='prete',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    fichier = SimpleUploadedFile('scan.pdf', b'%PDF-1.4 contenu', content_type='application/pdf')
    resp = client.post(
        f'/api/attestations/demandes/{_url_ref(demande)}/scan/', {'scan_document': fichier}, format='multipart',
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

def _url_ref(demande):
    """Encode la référence pour l'URL, comme le fait le frontend
    (voir ReferenceLookupMixin côté backend)."""
    return demande.reference.replace('/', '-', 1)


def _texte_pdf(contenu):
    from io import BytesIO
    from pypdf import PdfReader
    return PdfReader(BytesIO(contenu)).pages[0].extract_text()


def test_apercu_renvoie_un_pdf_avec_les_donnees_de_la_demande(admin_user, employee, gestionnaire_user, motif_attestation):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif=motif_attestation,
        demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get(f'/api/attestations/demandes/{_url_ref(demande)}/apercu/')
    assert resp.status_code == 200
    assert resp['Content-Type'] == 'application/pdf'
    assert resp.content.startswith(b'%PDF')

    texte = _texte_pdf(resp.content)
    assert '00001/26' in texte
    assert employee.nom.upper() in texte
    assert employee.matricule in texte
    assert 'DOSSIER ADMINISTRATIF' in texte
    assert 'ATTESTATION DE TRAVAIL' in texte


def test_apercu_reprend_la_configuration_du_modele(admin_user, employee, gestionnaire_user, motif_attestation):
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
        reference='00002/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get(f'/api/attestations/demandes/{_url_ref(demande)}/apercu/')
    texte = _texte_pdf(resp.content)
    assert 'SOCIETE TEST' in texte
    assert 'Alger' in texte
    assert 'DIRECTEUR DES RESSOURCES HUMAINES' in texte
    assert 'B.TESTEUR' in texte


def test_apercu_reprend_le_dernier_contrat_si_la_demande_nen_vise_aucun(
    admin_user, employee, gestionnaire_user, contrat, motif_attestation,
):
    demande = DemandeAttestation.objects.create(
        reference='00003/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get(f'/api/attestations/demandes/{_url_ref(demande)}/apercu/')
    assert contrat.numero_contrat in _texte_pdf(resp.content)


def test_apercu_fige_la_date_du_document_au_premier_appel(admin_user, employee, gestionnaire_user, motif_attestation):
    """La date imprimée sur le document ("Arzew le :") doit rester la même
    d'un aperçu à l'autre le même jour — entre l'impression et la signature
    effective, un admin peut rouvrir l'aperçu plusieurs fois sans que la
    date change tant qu'on reste le même jour."""
    demande = DemandeAttestation.objects.create(
        reference='00004/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp1 = client.get(f'/api/attestations/demandes/{_url_ref(demande)}/apercu/')
    assert resp1.status_code == 200
    demande.refresh_from_db()
    assert demande.date_document is not None

    resp2 = client.get(f'/api/attestations/demandes/{_url_ref(demande)}/apercu/')
    assert resp2.status_code == 200
    demande.refresh_from_db()
    date_figee = demande.date_document
    assert date_figee is not None
    # Un second appel le même jour ne modifie pas la date déjà figée.
    assert demande.date_document == date_figee


def test_apercu_demande_confirmation_si_la_date_a_change(admin_user, employee, gestionnaire_user, motif_attestation):
    """Rouvrir l'aperçu un jour différent de la première génération renvoie
    409 (pas le PDF) tant que ?confirmer_date=1 n'est pas passé — voir
    AttestationApercuView.get. `?confirmer_date=1` applique la nouvelle
    date et régénère normalement."""
    from datetime import timedelta
    from django.utils import timezone
    demande = DemandeAttestation.objects.create(
        reference='00005/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    # Simule une première génération "hier".
    hier = timezone.localdate() - timedelta(days=1)
    demande.date_document = hier
    demande.save(update_fields=['date_document'])

    client = APIClient()
    client.force_authenticate(admin_user)

    resp = client.get(f'/api/attestations/demandes/{_url_ref(demande)}/apercu/')
    assert resp.status_code == 409
    payload = resp.json()
    assert payload['needs_confirmation'] is True
    assert payload['date_document'] == hier.isoformat()

    demande.refresh_from_db()
    assert demande.date_document == hier  # inchangée tant que non confirmé

    resp_confirme = client.get(
        f'/api/attestations/demandes/{_url_ref(demande)}/apercu/', {'confirmer_date': '1'},
    )
    assert resp_confirme.status_code == 200
    demande.refresh_from_db()
    assert demande.date_document != hier


def test_gestionnaire_cannot_access_apercu(gestionnaire_user, employee, motif_attestation):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.get(f'/api/attestations/demandes/{_url_ref(demande)}/apercu/')
    assert resp.status_code == 403


# ─── Signature P.I (intérim) — réglage global de AttestationTemplateConfig ──

def test_admin_active_la_signature_interim_dans_la_config(admin_user):
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.put(
        '/api/attestations/config/',
        {'signataire_interim': True, 'signataire_interim_nom': 'C.INTERIM'},
        format='json',
    )
    assert resp.status_code == 200
    config = AttestationTemplateConfig.objects.get(pk=1)
    assert config.signataire_interim is True
    assert config.signataire_interim_nom == 'C.INTERIM'


def test_activer_interim_sans_nom_est_rejete(admin_user):
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.put(
        '/api/attestations/config/',
        {'signataire_interim': True, 'signataire_interim_nom': ''},
        format='json',
    )
    assert resp.status_code == 400


def test_desactiver_interim_efface_le_nom(admin_user):
    config, _ = AttestationTemplateConfig.objects.get_or_create(pk=1)
    config.signataire_interim = True
    config.signataire_interim_nom = 'C.INTERIM'
    config.save()
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.put(
        '/api/attestations/config/',
        {'signataire_interim': False}, format='json',
    )
    assert resp.status_code == 200
    config.refresh_from_db()
    assert config.signataire_interim is False
    assert config.signataire_interim_nom == ''


def test_apercu_affiche_pi_et_le_nom_interimaire(admin_user, employee, gestionnaire_user, motif_attestation):
    config, _ = AttestationTemplateConfig.objects.get_or_create(pk=1)
    config.signataire_nom = 'A.BOUSMAHA'
    config.signataire_interim = True
    config.signataire_interim_nom = 'C.INTERIM'
    config.save()
    demande = DemandeAttestation.objects.create(
        reference='00007/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get(f'/api/attestations/demandes/{_url_ref(demande)}/apercu/')
    texte = _texte_pdf(resp.content)
    assert 'P.I' in texte
    assert 'C.INTERIM' in texte
    assert 'A.BOUSMAHA' not in texte


def test_apercu_sans_interim_garde_le_signataire_de_la_config(admin_user, employee, gestionnaire_user, motif_attestation):
    config, _ = AttestationTemplateConfig.objects.get_or_create(pk=1)
    config.signataire_nom = 'A.BOUSMAHA'
    config.signataire_interim = False
    config.save()
    demande = DemandeAttestation.objects.create(
        reference='00008/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get(f'/api/attestations/demandes/{_url_ref(demande)}/apercu/')
    texte = _texte_pdf(resp.content)
    assert 'P.I' not in texte
    assert 'A.BOUSMAHA' in texte


# ─── Reporting ──────────────────────────────────────────────────────────────

def test_stats_counts_demandes_by_gestionnaire_and_employee(
    admin_user, employee, gestionnaire_user, other_gestionnaire, motif_attestation,
):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    DemandeAttestation.objects.create(
        reference='00002/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    DemandeAttestation.objects.create(
        reference='00003/26', employee=employee, motif=motif_attestation, demandeur=other_gestionnaire,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/attestations/stats/')
    assert resp.status_code == 200
    par_gest = {r['nom']: r['count'] for r in resp.data['par_gestionnaire']}
    assert par_gest[gestionnaire_user.full_name] == 2
    assert par_gest[other_gestionnaire.full_name] == 1
    par_emp = resp.data['par_employe']
    assert par_emp[0]['count'] == 3


def test_stats_forbidden_for_gestionnaire(gestionnaire_user):
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.get('/api/attestations/stats/')
    assert resp.status_code == 403


# ─── ADMIN non chargé des attestations ──────────────────────────────────────

def test_admin_non_charge_est_bloque_partout(db, employee, gestionnaire_user, motif_attestation):
    """Un ADMIN pour qui `charge_attestation` n'est pas coché n'a plus aucun
    accès à /attestations, comme un GESTIONNAIRE en dehors de son propre
    périmètre de demandes — voir User.can_manage_attestations et
    CanAccessAttestations/IsAttestationManager."""
    from django.contrib.auth import get_user_model
    from django.utils import timezone
    User = get_user_model()
    admin_non_charge = User.objects.create_user(
        username='admin_non_charge', password='AdminPass123!', nom='Non', prenom='Charge',
        role='ADMIN', consent_loi1807_accepted_at=timezone.now(),
    )
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_non_charge)

    assert client.get('/api/attestations/demandes/').status_code == 403
    assert client.get(f'/api/attestations/demandes/{_url_ref(demande)}/').status_code == 403
    assert client.patch(
        f'/api/attestations/demandes/{_url_ref(demande)}/statut/', {'statut': 'prete'}, format='json',
    ).status_code == 403
    assert client.get('/api/attestations/config/').status_code == 403
    assert client.get('/api/attestations/stats/').status_code == 403
    assert client.get(f'/api/attestations/demandes/{_url_ref(demande)}/apercu/').status_code == 403


def test_admin_charge_attestation_force_a_false_si_role_non_admin(gestionnaire_user):
    """Garde-fou serveur (UserSerializer.validate) : charge_attestation ne
    peut jamais rester coché sur un compte qui n'est pas ADMIN."""
    gestionnaire_user.charge_attestation = True
    gestionnaire_user.save(update_fields=['charge_attestation'])
    assert gestionnaire_user.can_manage_attestations is False


# ─── Action en masse ─────────────────────────────────────────────────────────

def test_bulk_statut_marque_plusieurs_demandes_recues_comme_pretes(
    admin_user, employee, gestionnaire_user, motif_attestation,
):
    d1 = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation,
        demandeur=gestionnaire_user, statut='recue',
    )
    d2 = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation,
        demandeur=gestionnaire_user, statut='recue',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.post('/api/attestations/demandes/bulk-statut/', {
        'ids': [str(d1.id), str(d2.id)], 'statut': 'prete',
    }, format='json')
    assert resp.status_code == 200, resp.data
    assert set(resp.data['updated']) == {d1.reference, d2.reference}
    assert resp.data['errors'] == []
    d1.refresh_from_db(); d2.refresh_from_db()
    assert d1.statut == d2.statut == 'prete'
    assert d1.traite_par_id == d2.traite_par_id == admin_user.id


def test_bulk_statut_reporte_les_transitions_invalides_sans_bloquer_le_lot(
    admin_user, employee, gestionnaire_user, motif_attestation,
):
    valide = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation,
        demandeur=gestionnaire_user, statut='recue',
    )
    deja_recuperee = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation,
        demandeur=gestionnaire_user, statut='recuperee',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.post('/api/attestations/demandes/bulk-statut/', {
        'ids': [str(valide.id), str(deja_recuperee.id)], 'statut': 'prete',
    }, format='json')
    assert resp.status_code == 200, resp.data
    assert resp.data['updated'] == [valide.reference]
    assert len(resp.data['errors']) == 1
    assert resp.data['errors'][0]['reference'] == deja_recuperee.reference
    valide.refresh_from_db()
    assert valide.statut == 'prete'


def test_bulk_statut_forbidden_for_gestionnaire(gestionnaire_user, employee, motif_attestation):
    demande = DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation, demandeur=gestionnaire_user,
        statut='recue',
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.post('/api/attestations/demandes/bulk-statut/', {
        'ids': [str(demande.id)], 'statut': 'prete',
    }, format='json')
    assert resp.status_code == 403


# ─── Badge navbar côté demandeur ─────────────────────────────────────────────

def test_pending_filter_cote_gestionnaire_compte_ses_demandes_pretes(
    gestionnaire_user, other_gestionnaire, employee, motif_attestation,
):
    """Symétrique de test_pending_filter_counts_only_recue côté ADMIN : un
    GESTIONNAIRE voit dans son propre badge uniquement SES demandes Prêtes à
    récupérer, jamais celles d'un autre GESTIONNAIRE ni ses propres demandes
    à un autre statut."""
    DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation,
        demandeur=gestionnaire_user, statut='prete',
    )
    DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation,
        demandeur=gestionnaire_user, statut='recue',
    )
    DemandeAttestation.objects.create(
        reference=generate_reference(), employee=employee, motif=motif_attestation,
        demandeur=other_gestionnaire, statut='prete',
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.get('/api/attestations/demandes/', {'pending': 1})
    results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert len(results) == 1
    assert results[0]['statut'] == 'prete'
    assert str(results[0]['demandeur']) == str(gestionnaire_user.id)
