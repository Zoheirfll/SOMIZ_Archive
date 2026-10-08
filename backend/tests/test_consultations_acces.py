from datetime import timedelta
from io import BytesIO

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from pypdf import PdfReader
from rest_framework.test import APIClient

from audit.models import AuditLog
from consultations import services
from consultations.models import DemandeConsultation

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures('media_tmp')]


@pytest.fixture(autouse=True)
def _vider_throttle():
    """Le throttle 'consultation' (30/min) vit dans le cache partagé : sans
    nettoyage, les tests s'influencent entre eux."""
    cache.clear()


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def livree(traiteur, demande_en_cours, pdf_bytes):
    fichier_upload = SimpleUploadedFile('scan.pdf', pdf_bytes, content_type='application/pdf')
    demande = services.valider(
        demande_en_cours, traiteur, duree_heures=24, telechargement_autorise=False,
        uploads=[fichier_upload], ids_copies=[],
    )
    return demande, demande.fichiers.get()


def _url(demande, fichier, action='voir'):
    slug = demande.reference.replace('/', '-')
    return f"/api/consultations/demandes/{slug}/fichiers/{fichier.id}/{action}/"


def _corps(resp):
    if getattr(resp, 'streaming', False):
        return b''.join(resp.streaming_content)
    return resp.content


# ─── Lecture par le demandeur ───────────────────────────────────────────────

def test_demandeur_recoit_une_copie_filigranee(gestionnaire_user, livree, pdf_bytes):
    demande, fichier = livree
    resp = _client(gestionnaire_user).get(_url(demande, fichier))
    assert resp.status_code == 200
    assert resp['Content-Type'] == 'application/pdf'
    assert 'no-store' in resp['Cache-Control']
    assert resp['Content-Disposition'].startswith('inline')
    corps = _corps(resp)
    assert corps != pdf_bytes                       # jamais l'original
    texte = PdfReader(BytesIO(corps)).pages[0].extract_text()
    assert demande.reference in texte               # filigrane présent
    assert 'Contenu confidentiel' in texte


def test_lecture_tracee_dans_laudit(gestionnaire_user, livree):
    demande, fichier = livree
    _client(gestionnaire_user).get(_url(demande, fichier))
    log = AuditLog.objects.get(action='VIEW_CONSULTATION')
    assert log.user_id == gestionnaire_user.id
    assert log.details['reference'] == demande.reference
    assert log.details['fichier'] == 'scan.pdf'


def test_traiteur_recoit_loriginal(traiteur, livree, pdf_bytes):
    demande, fichier = livree
    resp = _client(traiteur).get(_url(demande, fichier))
    assert resp.status_code == 200
    assert _corps(resp) == pdf_bytes


# ─── Refus ──────────────────────────────────────────────────────────────────

def test_tiers_recoit_404(other_gestionnaire, admin_user, livree):
    demande, fichier = livree
    for user in (other_gestionnaire, admin_user):
        assert _client(user).get(_url(demande, fichier)).status_code == 404
    assert not AuditLog.objects.filter(action='VIEW_CONSULTATION').exists()


def test_non_authentifie_refuse(livree):
    demande, fichier = livree
    assert APIClient().get(_url(demande, fichier)).status_code in (401, 403)


def test_consultation_expiree_donne_403_explicite(gestionnaire_user, livree):
    demande, fichier = livree
    DemandeConsultation.objects.filter(pk=demande.pk).update(
        date_echeance=timezone.now() - timedelta(seconds=1),
    )
    resp = _client(gestionnaire_user).get(_url(demande, fichier))
    assert resp.status_code == 403
    assert 'expir' in resp.data['detail'].lower()
    assert not AuditLog.objects.filter(action='VIEW_CONSULTATION').exists()


def test_echeance_exactement_atteinte_refusee(gestionnaire_user, livree):
    demande, fichier = livree
    DemandeConsultation.objects.filter(pk=demande.pk).update(date_echeance=timezone.now())
    assert _client(gestionnaire_user).get(_url(demande, fichier)).status_code == 403


def test_consultation_revoquee_donne_403(gestionnaire_user, traiteur, livree):
    demande, fichier = livree
    services.revoquer(demande, traiteur)
    resp = _client(gestionnaire_user).get(_url(demande, fichier))
    assert resp.status_code == 403
    assert 'révoqu' in resp.data['detail'].lower()


def test_fichier_dune_autre_demande_donne_404(gestionnaire_user, livree, traiteur, pdf_bytes):
    demande, _ = livree
    autre = DemandeConsultation.objects.create(
        reference='C-00077/26', type_demande='document', description='autre',
        demandeur=gestionnaire_user,
    )
    services.valider(
        autre, traiteur, duree_heures=24, telechargement_autorise=False,
        uploads=[SimpleUploadedFile('b.pdf', pdf_bytes, content_type='application/pdf')], ids_copies=[],
    )
    fichier_autre = autre.fichiers.get()
    # URL de la demande A avec le fichier de la demande B.
    assert _client(gestionnaire_user).get(_url(demande, fichier_autre)).status_code == 404


def test_fichier_purge_donne_410(traiteur, livree):
    demande, fichier = livree
    fichier.supprime_le = timezone.now()
    fichier.save()
    assert _client(traiteur).get(_url(demande, fichier)).status_code == 410


def test_echec_du_filigrane_ne_sert_rien(gestionnaire_user, livree, pdf_bytes):
    """Échec fermé : un fichier illisible ne doit jamais être servi tel quel."""
    demande, fichier = livree
    with open(fichier.file.path, 'wb') as fh:
        fh.write(b'%PDF-1.4 corrompu')
    resp = _client(gestionnaire_user).get(_url(demande, fichier))
    assert resp.status_code == 422
    assert b'corrompu' not in resp.content


# ─── Téléchargement ─────────────────────────────────────────────────────────

def test_telechargement_refuse_si_non_autorise(gestionnaire_user, livree):
    demande, fichier = livree
    resp = _client(gestionnaire_user).get(_url(demande, fichier, 'telecharger'))
    assert resp.status_code == 403
    assert not AuditLog.objects.filter(action='DL_CONSULTATION').exists()


def test_telechargement_autorise_sert_une_copie_filigranee(gestionnaire_user, livree, pdf_bytes):
    demande, fichier = livree
    DemandeConsultation.objects.filter(pk=demande.pk).update(telechargement_autorise=True)
    resp = _client(gestionnaire_user).get(_url(demande, fichier, 'telecharger'))
    assert resp.status_code == 200
    assert resp['Content-Disposition'].startswith('attachment')
    assert _corps(resp) != pdf_bytes
    assert demande.reference in PdfReader(BytesIO(_corps(resp))).pages[0].extract_text()
    assert AuditLog.objects.filter(action='DL_CONSULTATION').count() == 1


def test_telechargement_expire_refuse_meme_si_autorise(gestionnaire_user, livree):
    demande, fichier = livree
    DemandeConsultation.objects.filter(pk=demande.pk).update(
        telechargement_autorise=True, date_echeance=timezone.now() - timedelta(minutes=1),
    )
    assert _client(gestionnaire_user).get(_url(demande, fichier, 'telecharger')).status_code == 403


# ─── Métadonnées du détail ──────────────────────────────────────────────────

def test_detail_masque_les_fichiers_une_fois_expiree(gestionnaire_user, livree):
    demande, _ = livree
    slug = demande.reference.replace('/', '-')
    client = _client(gestionnaire_user)
    assert len(client.get(f'/api/consultations/demandes/{slug}/').data['fichiers']) == 1
    DemandeConsultation.objects.filter(pk=demande.pk).update(
        date_echeance=timezone.now() - timedelta(minutes=1),
    )
    resp = client.get(f'/api/consultations/demandes/{slug}/')
    assert resp.data['statut_effectif'] == 'expiree'
    assert resp.data['fichiers'] == []
