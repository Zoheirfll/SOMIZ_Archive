import pytest
from django.db import IntegrityError, transaction

from conges.models import (
    CongeTemplateConfig, DemandeConge, MotifConge, MotifPiece, MouvementConge, ParametreConge,
    PieceJointeConge, ReferenceCounter, SoldeConge, SoldeExercice, conge_piece_upload_path,
)
from conges.reference import generate_reference

pytestmark = pytest.mark.django_db


def test_demande_statut_par_defaut_et_champs_de_validation_vides(demande_recue):
    d = demande_recue()
    assert d.statut == DemandeConge.Statut.RECUE
    assert d.is_active is True
    assert d.type_conge == ''
    assert d.ventilation == [] and d.categorie_exercice == ''
    assert d.signataire_interim is False


def test_reference_unique(demande_recue):
    demande_recue(reference='00001/26')
    with pytest.raises(IntegrityError), transaction.atomic():
        demande_recue(reference='00001/26')


def test_reference_counter_unique_par_annee():
    ReferenceCounter.objects.create(annee=2026, dernier_numero=5)
    with pytest.raises(IntegrityError), transaction.atomic():
        ReferenceCounter.objects.create(annee=2026, dernier_numero=1)


def test_generate_reference_format_et_incrementation():
    n1, a1 = generate_reference().split('/')
    n2, a2 = generate_reference().split('/')
    assert len(n1) == 5 and n1.isdigit() and len(a1) == 2 and a1.isdigit()
    assert a1 == a2 and int(n2) == int(n1) + 1


def test_solde_exercice_restant(employee):
    ligne = SoldeExercice.objects.create(employee=employee, exercice='2025/2026', droit=30, consomme=12)
    assert ligne.restant == 18


def test_solde_exercice_unique_par_employe_et_exercice(employee):
    SoldeExercice.objects.create(employee=employee, exercice='2025/2026', droit=30)
    with pytest.raises(IntegrityError), transaction.atomic():
        SoldeExercice.objects.create(employee=employee, exercice='2025/2026', droit=10)


@pytest.mark.parametrize('droit,consomme', [(5, 6), (5, -1)])
def test_solde_exercice_contraintes_en_base(employee, droit, consomme):
    with pytest.raises(IntegrityError), transaction.atomic():
        SoldeExercice.objects.create(employee=employee, exercice='2025/2026', droit=droit, consomme=consomme)


def test_solde_un_seul_entete_par_employe(employee):
    SoldeConge.objects.create(employee=employee)
    with pytest.raises(IntegrityError), transaction.atomic():
        SoldeConge.objects.create(employee=employee)


def test_mouvement_est_immuable(employee, traiteur_conge):
    m = MouvementConge.objects.create(
        employee=employee, nature=MouvementConge.Nature.INITIAL, exercice='2025/2026', d_droit=30,
        auteur=traiteur_conge,
    )
    m.motif = 'x'
    with pytest.raises(RuntimeError):
        m.save()
    with pytest.raises(RuntimeError):
        m.delete()


def test_parametre_conge_singleton_30_jours():
    p = ParametreConge.get()
    assert p.droit_annuel_jours == 30
    assert ParametreConge.get().pk == p.pk == 1


def test_motif_conge_unique_par_type_et_duree_fixe_facultative():
    m = MotifConge.objects.create(nom='Mariage', type_conge='CE', nb_jours_fixe=3)
    assert MotifConge.objects.create(nom='Mariage', type_conge='CS').nb_jours_fixe is None
    with pytest.raises(IntegrityError), transaction.atomic():
        MotifConge.objects.create(nom='Mariage', type_conge='CE')
    assert m.nb_jours_fixe == 3


def test_pieces_attendues_d_un_motif():
    m = MotifConge.objects.create(nom='Mariage', type_conge='CE')
    MotifPiece.objects.create(motif=m, libelle='Acte de mariage')
    assert list(m.pieces.values_list('libelle', flat=True)) == ['Acte de mariage']


def test_chemin_de_piece_jointe_regenere_le_nom(demande_recue):
    d = demande_recue()
    piece = PieceJointeConge(demande=d)
    chemin = conge_piece_upload_path(piece, '../../etc/passwd.pdf')
    assert chemin.startswith(f'conges/pieces/{d.employee_id}/') and chemin.endswith('.pdf')
    assert '..' not in chemin and 'passwd' not in chemin
    assert conge_piece_upload_path(piece, 'x.p/df').endswith('.bin')


def test_config_defauts_mode_test_et_fax_du_papier_conge():
    c = CongeTemplateConfig.objects.create()
    assert c.mode_test is True
    assert c.fax == '213 (0) 41.68.01.03'
    assert not c.logo
