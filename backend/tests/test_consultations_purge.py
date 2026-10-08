import os
from datetime import timedelta
from io import StringIO

import pytest
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from audit.models import AuditLog
from consultations.models import ConsultationFichier, DemandeConsultation
from consultations.services import fichiers_purgeables

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures('media_tmp')]


def _fichier(demande, origine=ConsultationFichier.Origine.SCAN_EXTERNE, nom='scan.pdf', contenu=b'%PDF-1.4 secret'):
    f = ConsultationFichier(
        demande=demande, file_name=nom, mime_type='application/pdf',
        file_size=len(contenu), origine=origine,
    )
    f.file.save(nom, ContentFile(contenu), save=False)
    f.save()
    return f


def _expirer(demande, jours):
    DemandeConsultation.objects.filter(pk=demande.pk).update(
        date_echeance=timezone.now() - timedelta(days=jours),
    )
    demande.refresh_from_db()


def _lancer(*args):
    sortie = StringIO()
    call_command('purger_consultations', *args, stdout=sortie)
    return sortie.getvalue()


def test_selection_des_fichiers_purgeables(demande_validee):
    f = _fichier(demande_validee)
    _expirer(demande_validee, 100)
    assert list(fichiers_purgeables(90)) == [f]
    assert list(fichiers_purgeables(120)) == []          # pas assez ancien


def test_copies_darchive_jamais_purgees(demande_validee):
    _fichier(demande_validee, origine=ConsultationFichier.Origine.COPIE_ARCHIVE)
    _expirer(demande_validee, 400)
    assert list(fichiers_purgeables(90)) == []


def test_consultation_encore_active_jamais_purgee(demande_validee):
    _fichier(demande_validee)
    assert list(fichiers_purgeables(0)) == []


def test_revoquee_depuis_longtemps_est_purgeable(demande_validee):
    f = _fichier(demande_validee)
    DemandeConsultation.objects.filter(pk=demande_validee.pk).update(
        statut=DemandeConsultation.Statut.REVOQUEE,
        date_revocation=timezone.now() - timedelta(days=100),
    )
    assert list(fichiers_purgeables(90)) == [f]


def test_sans_confirmer_la_commande_ne_fait_que_lister(demande_validee):
    f = _fichier(demande_validee)
    _expirer(demande_validee, 100)
    chemin = f.file.path
    sortie = _lancer('--jours', '90')
    assert demande_validee.reference in sortie
    assert 'scan.pdf' in sortie
    assert os.path.exists(chemin)
    f.refresh_from_db()
    assert f.supprime_le is None
    assert not AuditLog.objects.filter(action='PURGE_CONSULTATION').exists()


def test_purge_confirmee_sauvegarde_puis_supprime_et_trace(demande_validee, tmp_path):
    f = _fichier(demande_validee, contenu=b'%PDF-1.4 contenu-a-sauvegarder')
    _expirer(demande_validee, 100)
    chemin = f.file.path
    sauvegarde = tmp_path / 'sauvegarde'
    _lancer('--jours', '90', '--confirmer', '--sauvegarde-dir', str(sauvegarde))
    assert not os.path.exists(chemin)                                     # supprimé
    f.refresh_from_db()
    assert f.supprime_le is not None                                      # ligne conservée
    copies = [p for p in sauvegarde.rglob('*') if p.is_file()]
    assert len(copies) == 1
    assert copies[0].read_bytes() == b'%PDF-1.4 contenu-a-sauvegarder'    # sauvegarde fidèle
    log = AuditLog.objects.get(action='PURGE_CONSULTATION')
    assert log.details['reference'] == demande_validee.reference
    assert log.details['fichier'] == 'scan.pdf'
    assert log.username_snapshot == 'system:purger_consultations'


def test_chemin_hors_du_dossier_consultations_refuse(demande_validee, media_tmp):
    hors = media_tmp / 'autre'
    hors.mkdir()
    (hors / 'hors.pdf').write_bytes(b'ne jamais supprimer')
    f = ConsultationFichier.objects.create(
        demande=demande_validee, file='consultations/../autre/hors.pdf', file_name='hors.pdf',
        mime_type='application/pdf', file_size=3,
        origine=ConsultationFichier.Origine.SCAN_EXTERNE,
    )
    _expirer(demande_validee, 100)
    sortie = _lancer('--jours', '90', '--confirmer', '--sauvegarde-dir', str(media_tmp / 'sauv'))
    assert (hors / 'hors.pdf').exists()                                   # intact
    f.refresh_from_db()
    assert f.supprime_le is None
    assert 'refus' in sortie.lower()


def test_echec_de_sauvegarde_annule_toute_suppression(demande_validee, tmp_path):
    f = _fichier(demande_validee)
    _expirer(demande_validee, 100)
    chemin = f.file.path
    bloquant = tmp_path / 'fichier_pas_dossier'
    bloquant.write_text('je suis un fichier')                              # impossible d'y créer un dossier
    with pytest.raises(CommandError):
        _lancer('--jours', '90', '--confirmer', '--sauvegarde-dir', str(bloquant / 'sous'))
    assert os.path.exists(chemin)
    f.refresh_from_db()
    assert f.supprime_le is None


def test_fichier_deja_purge_ignore(demande_validee):
    f = _fichier(demande_validee)
    f.supprime_le = timezone.now()
    f.save()
    _expirer(demande_validee, 100)
    assert list(fichiers_purgeables(90)) == []
