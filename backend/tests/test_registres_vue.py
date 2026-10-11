from datetime import date, timedelta

import pytest
from django.utils import timezone

from consultations.models import ConsultationFichier, DemandeConsultation
from registres.models import MouvementArchive
from registres.services import annuler, registre_mouvements

pytestmark = pytest.mark.django_db


def _manuel(admin_user, **kw):
    valeurs = dict(
        reference='M-00001/26', nom_libre='Ali Ben', type_documents='Dossier',
        nombre_documents=2, date_depart=date(2026, 3, 1), saisi_par=admin_user,
    )
    valeurs.update(kw)
    return MouvementArchive.objects.create(**valeurs)


def test_fusionne_lignes_manuelles_et_consultations_validees(
    superadmin_user, admin_user, demande_validee, employee, contrat,
):
    demande_validee.employee = employee
    demande_validee.save()
    for nom in ('a.pdf', 'b.pdf'):
        ConsultationFichier.objects.create(
            demande=demande_validee, file=nom, file_name=nom, mime_type='application/pdf',
            file_size=1, origine='scan_externe',
        )
    _manuel(admin_user, date_depart=timezone.localdate())
    lignes = registre_mouvements(superadmin_user, timezone.localdate().year)
    assert {ligne.origine for ligne in lignes} == {'manuel', 'consultation'}
    conso = next(ligne for ligne in lignes if ligne.origine == 'consultation')
    assert conso.reference == 'C-00002/26'
    assert conso.nombre_documents == 2
    assert conso.numero_contrat == 'CTR-2024-001'
    assert conso.matricule == 'EMP-001'
    assert conso.fonction == 'Ingénieur'
    assert conso.date_retour is None  # échéance dans 24 h : pas encore rendu


def test_consultation_revoquee_a_pour_retour_la_date_de_revocation(superadmin_user, demande_validee):
    revocation = timezone.now()
    demande_validee.statut = DemandeConsultation.Statut.REVOQUEE
    demande_validee.date_revocation = revocation
    demande_validee.save()
    ligne = registre_mouvements(superadmin_user, revocation.year)[0]
    assert ligne.date_retour == timezone.localtime(revocation).date()
    assert ligne.observation == 'Révoquée'


def test_consultation_expiree_a_pour_retour_lecheance(superadmin_user, demande_validee):
    passe = timezone.now() - timedelta(days=2)
    demande_validee.date_validation = passe - timedelta(hours=24)
    demande_validee.date_echeance = passe
    demande_validee.save()
    ligne = registre_mouvements(superadmin_user, demande_validee.date_validation.year)[0]
    assert ligne.date_retour == timezone.localtime(passe).date()
    assert ligne.observation == 'Expirée'


def test_consultation_non_validee_exclue(superadmin_user, demande_en_cours):
    assert registre_mouvements(superadmin_user, timezone.localdate().year) == []


def test_filtre_annee_en_cours_et_recherche(superadmin_user, admin_user):
    _manuel(admin_user, reference='M-00001/26', date_depart=date(2026, 3, 1), date_retour=date(2026, 3, 9))
    _manuel(admin_user, reference='M-00002/26', nom_libre='Zoe Karim', date_depart=date(2026, 4, 1))
    _manuel(admin_user, reference='M-00001/25', date_depart=date(2025, 12, 31))
    assert len(registre_mouvements(superadmin_user, 2026)) == 2
    en_cours = registre_mouvements(superadmin_user, 2026, statut='en_cours')
    assert [ligne.reference for ligne in en_cours] == ['M-00002/26']
    trouvees = registre_mouvements(superadmin_user, 2026, q='karim')
    assert [ligne.reference for ligne in trouvees] == ['M-00002/26']


def test_ligne_annulee_reste_visible_et_marquee(superadmin_user, admin_user):
    annuler(_manuel(admin_user), "Saisie en double")
    ligne = registre_mouvements(superadmin_user, 2026)[0]
    assert ligne.annulee is True and ligne.motif_annulation == "Saisie en double"


def test_ligne_annulee_exclue_du_filtre_en_cours(superadmin_user, admin_user):
    annuler(_manuel(admin_user), "Saisie en double")
    assert registre_mouvements(superadmin_user, 2026, statut='en_cours') == []


def test_annuler_exige_un_motif_et_refuse_le_double_appel(admin_user):
    m = _manuel(admin_user)
    with pytest.raises(ValueError):
        annuler(m, "   ")
    annuler(m, "Erreur")
    with pytest.raises(ValueError):
        annuler(m, "Encore")


def test_tri_chronologique_croissant(superadmin_user, admin_user):
    _manuel(admin_user, reference='M-00002/26', date_depart=date(2026, 5, 1))
    _manuel(admin_user, reference='M-00001/26', date_depart=date(2026, 2, 1))
    refs = [ligne.reference for ligne in registre_mouvements(superadmin_user, 2026)]
    assert refs == ['M-00001/26', 'M-00002/26']
