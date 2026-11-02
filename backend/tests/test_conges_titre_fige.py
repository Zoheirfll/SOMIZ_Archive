"""Titre de congé figé (2026-10-29) : généré une fois à l'octroi, stocké, jamais
regénéré ; mode test : rien n'est figé ; annulation : filigrane superposé."""
import pytest
from rest_framework.test import APIClient

from conges.models import CongeTemplateConfig, DemandeConge
from tests.test_conges_api import _corps_validation, _ref_via_api, motif_cp  # noqa: F401 (fixture)

pytestmark = pytest.mark.django_db


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _accorder(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    resp = _client(traiteur_conge).post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    assert resp.status_code == 200, resp.data
    return ref


def _mode_test(actif):
    config, _ = CongeTemplateConfig.objects.get_or_create(pk=1)
    config.mode_test = actif
    config.save()
    return config


def test_hors_mode_test_le_titre_est_genere_une_fois_a_l_octroi(demandeur_conge, traiteur_conge, employee, solde_employe,
                                                                motif_cp, media_tmp):
    _mode_test(False)
    ref = _accorder(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    demande = DemandeConge.objects.get(reference=ref.replace('-', '/'))
    assert demande.statut == 'accordee' and demande.titre_pdf and demande.date_document
    detail = _client(traiteur_conge).get(f'/api/conges/demandes/{ref}/').data
    assert detail['titre_fige'] is True


def test_le_titre_figé_ne_change_plus_meme_si_le_modele_evolue(demandeur_conge, traiteur_conge, employee, solde_employe,
                                                              motif_cp, media_tmp):
    _mode_test(False)
    ref = _accorder(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    client = _client(traiteur_conge)
    premier = client.get(f'/api/conges/demandes/{ref}/apercu/')
    assert premier.status_code == 200 and premier['Content-Type'] == 'application/pdf'
    config = _mode_test(False)
    config.adresse = "NOUVELLE ADRESSE QUI CHANGE LE MODELE"
    config.save()
    deuxieme = client.get(f'/api/conges/demandes/{ref}/apercu/')
    assert deuxieme.status_code == 200 and deuxieme.content == premier.content  # octet pour octet


def test_en_mode_test_rien_n_est_fige(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp, media_tmp):
    _mode_test(True)
    ref = _accorder(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    demande = DemandeConge.objects.get(reference=ref.replace('-', '/'))
    assert not demande.titre_pdf
    resp = _client(traiteur_conge).get(f'/api/conges/demandes/{ref}/apercu/')
    assert resp.status_code == 200
    demande.refresh_from_db()
    assert not demande.titre_pdf  # toujours regénéré tant que le mode test est actif


def test_un_titre_annule_est_servi_avec_le_filigrane_sans_toucher_au_fichier_d_origine(
        demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp, media_tmp):
    _mode_test(False)
    ref = _accorder(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    client = _client(traiteur_conge)
    original = client.get(f'/api/conges/demandes/{ref}/apercu/').content
    client.post(f'/api/conges/demandes/{ref}/annuler/',
                {'motif': 'Erreur', 'reference_confirmation': ref.replace('-', '/')}, format='json')
    annule = client.get(f'/api/conges/demandes/{ref}/apercu/')
    assert annule.status_code == 200 and annule.content != original
    demande = DemandeConge.objects.get(reference=ref.replace('-', '/'))
    with demande.titre_pdf.open('rb') as f:
        assert f.read() == original  # le fichier stocké reste l'original


def test_pas_d_apercu_tant_que_la_demande_attend_une_validation(demandeur_conge, traiteur_conge, employee, solde_employe, media_tmp):
    solde_employe(annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    DemandeConge.objects.filter(reference=ref.replace('-', '/')).update(statut='visa')
    assert _client(traiteur_conge).get(f'/api/conges/demandes/{ref}/apercu/').status_code == 400


def test_filtre_en_attente_du_niveau(demandeur_conge, traiteur_conge, employee, solde_employe):
    from conges.models import VisaConge
    solde_employe(annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    demande = DemandeConge.objects.get(reference=ref.replace('-', '/'))
    demande.statut = 'visa'
    demande.save()
    for niveau, decision in ((1, 'vise'), (2, 'en_attente'), (3, 'en_attente')):
        VisaConge.objects.create(demande=demande, niveau=niveau, unite_type='x', unite_nom='x',
                                 responsable_nom='x', decision=decision)
    client = _client(traiteur_conge)

    def total(niveau):
        data = client.get('/api/conges/demandes/', {'attente_niveau': niveau}).data
        return data['count'] if isinstance(data, dict) else len(data)

    assert (total(1), total(2), total(3)) == (0, 1, 1)
