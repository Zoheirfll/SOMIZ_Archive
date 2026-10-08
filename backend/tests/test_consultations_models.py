from datetime import timedelta

import pytest
from django.utils import timezone

from consultations.models import ConsultationReferenceCounter, DemandeConsultation
from consultations.reference import generate_reference

pytestmark = pytest.mark.django_db


def test_reference_format_et_incrementation():
    ref1, ref2 = generate_reference(), generate_reference()
    prefix1, annee1 = ref1.split('/')
    prefix2, annee2 = ref2.split('/')
    assert prefix1.startswith('C-') and len(prefix1) == 7
    assert annee1 == annee2
    assert int(prefix2[2:]) == int(prefix1[2:]) + 1


def test_compteur_unique_par_annee():
    ConsultationReferenceCounter.objects.create(annee=2026, dernier_numero=3)
    with pytest.raises(Exception):
        ConsultationReferenceCounter.objects.create(annee=2026, dernier_numero=1)


def test_statut_par_defaut_en_cours(gestionnaire_user):
    d = DemandeConsultation.objects.create(
        reference='C-00001/26', type_demande='document', description='Contrat 2019',
        demandeur=gestionnaire_user,
    )
    assert d.statut == DemandeConsultation.Statut.EN_COURS
    assert d.statut_effectif == DemandeConsultation.Statut.EN_COURS
    assert d.est_active() is False


def test_validee_active_puis_expiree(demande_validee):
    assert demande_validee.est_active() is True
    assert demande_validee.statut_effectif == DemandeConsultation.Statut.VALIDEE
    demande_validee.date_echeance = timezone.now() - timedelta(seconds=1)
    assert demande_validee.est_active() is False
    assert demande_validee.statut_effectif == DemandeConsultation.EXPIREE


def test_echeance_exacte_est_expiree(demande_validee):
    maintenant = timezone.now()
    demande_validee.date_echeance = maintenant
    assert demande_validee.est_active(now=maintenant) is False
