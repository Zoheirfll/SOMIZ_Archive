from datetime import date

import pytest

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


def test_les_consultations_ne_sont_pas_des_mouvements_physiques(
    superadmin_user, admin_user, demande_validee,
):
    """Une consultation est une livraison numérique (suivie dans /consultations) :
    elle n'entre jamais dans le registre des mouvements de dossiers."""
    _manuel(admin_user, date_depart=demande_validee.date_validation.date())
    lignes = registre_mouvements(superadmin_user, demande_validee.date_validation.year)
    assert [ligne.reference for ligne in lignes] == ['M-00001/26']


def test_ligne_expose_employe_matricule_et_beneficiaire(superadmin_user, admin_user, employee):
    _manuel(admin_user, employee=employee, nom_libre='', beneficiaire='M. Directeur')
    ligne = registre_mouvements(superadmin_user, 2026)[0]
    assert ligne.employe == 'Dupont Jean'
    assert ligne.matricule == 'EMP-001'
    assert ligne.beneficiaire == 'M. Directeur'


def test_nom_libre_sans_employe(superadmin_user, admin_user):
    _manuel(admin_user)
    ligne = registre_mouvements(superadmin_user, 2026)[0]
    assert ligne.employe == 'Ali Ben' and ligne.matricule == ''


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
