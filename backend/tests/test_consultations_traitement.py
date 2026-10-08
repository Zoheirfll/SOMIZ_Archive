from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from consultations.models import ConsultationFichier, DemandeConsultation

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures('media_tmp')]

URL_VALIDER = '/api/consultations/demandes/C-00001-26/valider/'


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _pdf(pdf_bytes, nom='scan.pdf'):
    return SimpleUploadedFile(nom, pdf_bytes, content_type='application/pdf')


def test_traiteur_valide_avec_un_scan(traiteur, demande_en_cours, pdf_bytes):
    avant = timezone.now()
    resp = _client(traiteur).post(URL_VALIDER, {
        'duree_heures': 24, 'fichiers': [_pdf(pdf_bytes)],
    }, format='multipart')
    assert resp.status_code == 200, resp.data
    demande_en_cours.refresh_from_db()
    assert demande_en_cours.statut == DemandeConsultation.Statut.VALIDEE
    assert demande_en_cours.traite_par_id == traiteur.id
    assert demande_en_cours.telechargement_autorise is False
    ecart = demande_en_cours.date_echeance - (avant + timedelta(hours=24))
    assert timedelta(0) <= ecart < timedelta(seconds=10)
    assert demande_en_cours.date_echeance == demande_en_cours.date_echeance_initiale
    fichier = ConsultationFichier.objects.get(demande=demande_en_cours)
    assert fichier.origine == ConsultationFichier.Origine.SCAN_EXTERNE
    assert fichier.mime_type == 'application/pdf'
    assert fichier.file_name == 'scan.pdf'
    assert 'scan' not in fichier.file.name  # nom de stockage en UUID


def test_validation_avec_telechargement_autorise(traiteur, demande_en_cours, pdf_bytes):
    resp = _client(traiteur).post(URL_VALIDER, {
        'duree_heures': 1, 'telechargement_autorise': 'true', 'fichiers': [_pdf(pdf_bytes)],
    }, format='multipart')
    assert resp.status_code == 200, resp.data
    demande_en_cours.refresh_from_db()
    assert demande_en_cours.telechargement_autorise is True


def test_validation_sans_fichier_refusee(traiteur, demande_en_cours):
    resp = _client(traiteur).post(URL_VALIDER, {'duree_heures': 24}, format='multipart')
    assert resp.status_code == 400
    demande_en_cours.refresh_from_db()
    assert demande_en_cours.statut == DemandeConsultation.Statut.EN_COURS


def test_duree_hors_presets_refusee(traiteur, demande_en_cours, pdf_bytes):
    resp = _client(traiteur).post(URL_VALIDER, {
        'duree_heures': 5, 'fichiers': [_pdf(pdf_bytes)],
    }, format='multipart')
    assert resp.status_code == 400
    assert 'duree_heures' in resp.data


def test_type_mime_interdit_refuse(traiteur, demande_en_cours):
    faux = SimpleUploadedFile('note.txt', b'juste du texte', content_type='text/plain')
    resp = _client(traiteur).post(URL_VALIDER, {
        'duree_heures': 24, 'fichiers': [faux],
    }, format='multipart')
    assert resp.status_code == 400
    assert not ConsultationFichier.objects.exists()


def test_validation_par_non_traiteur_refusee(
    admin_user, gestionnaire_user, demande_en_cours, pdf_bytes,
):
    for user in (admin_user, gestionnaire_user):
        resp = _client(user).post(URL_VALIDER, {
            'duree_heures': 24, 'fichiers': [_pdf(pdf_bytes)],
        }, format='multipart')
        assert resp.status_code == 403
    demande_en_cours.refresh_from_db()
    assert demande_en_cours.statut == DemandeConsultation.Statut.EN_COURS


def test_double_validation_refusee(traiteur, demande_en_cours, pdf_bytes):
    client = _client(traiteur)
    client.post(URL_VALIDER, {'duree_heures': 24, 'fichiers': [_pdf(pdf_bytes)]}, format='multipart')
    resp = client.post(URL_VALIDER, {'duree_heures': 24, 'fichiers': [_pdf(pdf_bytes)]}, format='multipart')
    assert resp.status_code == 400


def test_validation_par_copie_dun_document_archive(
    traiteur, gestionnaire_user, employee, direction, employee_document_file,
):
    demande = DemandeConsultation.objects.create(
        reference='C-00005/26', type_demande='document', description='CV',
        demandeur=gestionnaire_user, employee=employee,
    )
    resp = _client(traiteur).post('/api/consultations/demandes/C-00005-26/valider/', {
        'duree_heures': 72, 'copier_fichiers': [str(employee_document_file.id)],
    }, format='multipart')
    assert resp.status_code == 200, resp.data
    fichier = ConsultationFichier.objects.get(demande=demande)
    assert fichier.origine == ConsultationFichier.Origine.COPIE_ARCHIVE
    assert fichier.source_document_file_id == employee_document_file.id
    # Copie réelle : le fichier livré n'est PAS le fichier archivé.
    assert fichier.file.path != employee_document_file.file.path


def test_copie_refusee_sans_employe(traiteur, demande_en_cours, employee_document_file):
    resp = _client(traiteur).post(URL_VALIDER, {
        'duree_heures': 24, 'copier_fichiers': [str(employee_document_file.id)],
    }, format='multipart')
    assert resp.status_code == 400


def test_copie_refusee_si_fichier_dun_autre_employe(
    traiteur, gestionnaire_user, employee_document_file, direction, departement,
    service, poste, type_contrat, categorie, admin_user,
):
    from employees.models import Employee
    autre = Employee.objects.create(
        matricule="EMP-777", nom="Autre", prenom="Personne", direction=direction,
        departement=departement, service=service, poste=poste,
        type_contrat=type_contrat, categorie=categorie, created_by=admin_user,
    )
    DemandeConsultation.objects.create(
        reference='C-00006/26', type_demande='document', description='x',
        demandeur=gestionnaire_user, employee=autre,
    )
    resp = _client(traiteur).post('/api/consultations/demandes/C-00006-26/valider/', {
        'duree_heures': 24, 'copier_fichiers': [str(employee_document_file.id)],
    }, format='multipart')
    assert resp.status_code == 400


def test_validation_trace_audit_et_notifie(
    traiteur, gestionnaire_user, demande_en_cours, pdf_bytes, django_capture_on_commit_callbacks,
):
    from audit.models import AuditLog
    from notifications.models import Notification
    with django_capture_on_commit_callbacks(execute=True):
        _client(traiteur).post(URL_VALIDER, {
            'duree_heures': 24, 'fichiers': [_pdf(pdf_bytes)],
        }, format='multipart')
    assert AuditLog.objects.filter(action='STATUT_CONSULTATION').count() == 1
    assert AuditLog.objects.filter(action='UPLOAD_CONSULTATION').count() == 1
    notif = Notification.objects.get(recipient=gestionnaire_user)
    assert notif.type == Notification.Type.CONSULTATION_VALIDEE
    assert demande_en_cours.reference in notif.message


# ─── Rejet ──────────────────────────────────────────────────────────────────

def test_rejet_exige_un_motif(traiteur, demande_en_cours):
    resp = _client(traiteur).post(
        '/api/consultations/demandes/C-00001-26/rejeter/', {'motif_rejet': '  '}, format='json',
    )
    assert resp.status_code == 400


def test_rejet_ok(traiteur, demande_en_cours):
    resp = _client(traiteur).post(
        '/api/consultations/demandes/C-00001-26/rejeter/', {'motif_rejet': 'Hors périmètre'}, format='json',
    )
    assert resp.status_code == 200, resp.data
    demande_en_cours.refresh_from_db()
    assert demande_en_cours.statut == DemandeConsultation.Statut.REJETEE
    assert demande_en_cours.motif_rejet == 'Hors périmètre'


def test_rejet_impossible_si_deja_validee(traiteur, demande_validee):
    resp = _client(traiteur).post(
        '/api/consultations/demandes/C-00002-26/rejeter/', {'motif_rejet': 'x'}, format='json',
    )
    assert resp.status_code == 400


# ─── Révocation ─────────────────────────────────────────────────────────────

def test_revocation_ok(traiteur, demande_validee):
    resp = _client(traiteur).post('/api/consultations/demandes/C-00002-26/revoquer/', {}, format='json')
    assert resp.status_code == 200, resp.data
    demande_validee.refresh_from_db()
    assert demande_validee.statut == DemandeConsultation.Statut.REVOQUEE
    assert demande_validee.date_revocation is not None
    assert demande_validee.est_active() is False


def test_revocation_impossible_si_en_cours(traiteur, demande_en_cours):
    resp = _client(traiteur).post('/api/consultations/demandes/C-00001-26/revoquer/', {}, format='json')
    assert resp.status_code == 400


def test_revocation_impossible_si_deja_expiree(traiteur, demande_validee):
    demande_validee.date_echeance = timezone.now() - timedelta(minutes=1)
    demande_validee.save()
    resp = _client(traiteur).post('/api/consultations/demandes/C-00002-26/revoquer/', {}, format='json')
    assert resp.status_code == 400


def test_revocation_par_gestionnaire_refusee(gestionnaire_user, demande_validee):
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/C-00002-26/revoquer/', {}, format='json')
    assert resp.status_code == 403
