import datetime

import pytest

from audit.models import AuditLog
from notifications.models import Notification

pytestmark = pytest.mark.django_db


def test_actions_audit_conges_tiennent_dans_20_caracteres():
    noms = [
        'CREATE_CONGE', 'VALIDER_CONGE', 'REJETER_CONGE', 'RECUPERER_CONGE', 'ANNULER_CONGE',
        'INTERROMPRE_CONGE', 'DELETE_CONGE', 'MODIFY_CONGE', 'INITIAL_SOLDE_CONGE',
        'CORRIGER_SOLDE_CONGE', 'BASCULE_CONGE', 'APERCU_CONGE', 'SCAN_CONGE', 'PIECE_CONGE',
    ]
    for nom in noms:
        assert getattr(AuditLog.Action, nom) == nom
        assert len(nom) <= 20


def test_types_notification_conges_existent():
    for nom in ['CONGE_NOUVELLE', 'CONGE_PRETE', 'CONGE_REJETEE', 'CONGE_ANNULEE', 'CONGE_INTERROMPUE']:
        assert getattr(Notification.Type, nom) == nom


# ─── Workflow : valider, rejeter, récupérer, annuler, interrompre ──────────
from conges import workflow  # noqa: E402
from conges.models import DemandeConge, MotifConge, MouvementConge, SoldeConge, SoldeExercice  # noqa: E402
from conges.services import (  # noqa: E402
    ChevauchementError, CongeError, SoldeInsuffisant, SoldeNonInitialise, TransitionInvalide,
    ecarts_solde, exercice_courant, exercice_precedent, exercice_suivant,
)

ACT = exercice_courant()
REL = exercice_precedent(ACT)
ANT = exercice_suivant(ACT)


@pytest.fixture
def motif_cp(db):
    return MotifConge.objects.create(nom='Congé annuel', type_conge='CP')


@pytest.fixture
def motif_ce(db):
    return MotifConge.objects.create(nom='Mariage', type_conge='CE')


@pytest.fixture
def motif_cs(db):
    return MotifConge.objects.create(nom='Convenance personnelle', type_conge='CS')


def _donnees(motif, type_conge='CP', **extra):
    base = dict(
        type_conge=type_conge, motif=motif, date_etablissement=datetime.date(2026, 10, 20),
        nb_jours=10, date_depart=datetime.date(2026, 11, 1), date_retour=datetime.date(2026, 11, 11),
        exercice='', adresse_conge='ALGERIE', observations='',
        signataire_nom='A.BOUSMAHA', signataire_titre='Chef de Département', signataire_interim=False,
    )
    base.update(extra)
    return base


def _valider(demande, traiteur, motif, **extra):
    return workflow.valider_demande(demande, auteur=traiteur, donnees=_donnees(motif, **extra))


def _restants(employee):
    return dict(
        (ligne.exercice, ligne.restant) for ligne in SoldeExercice.objects.filter(employee=employee)
    )


def _coherent(employee):
    return ecarts_solde(SoldeConge.objects.get(employee=employee)) == {}


# ─── Validation CP : le plus ancien d'abord, en cascade ────────────────────

def test_valider_cp_debite_le_plus_ancien_puis_deborde(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(reliquat=13, annuel=30)
    d = _valider(demande_recue(nb_jours=20), traiteur_conge, motif_cp, nb_jours=20)
    assert _restants(employee) == {REL: 0, ACT: 23, ANT: 30}
    assert SoldeConge.objects.get(employee=employee).cp_consomme == 20
    assert d.ventilation == [{'exercice': REL, 'jours': 13}, {'exercice': ACT, 'jours': 7}]
    assert d.exercice == REL and d.categorie_exercice == 'RELIQUAT'
    assert d.statut == DemandeConge.Statut.PRETE
    assert d.traite_par_id == traiteur_conge.id
    assert d.validateur_nom == traiteur_conge.full_name
    assert d.date_prete is not None and d.type_conge == 'CP' and d.motif_id == motif_cp.id
    assert _coherent(employee)
    debits = MouvementConge.objects.filter(demande=d, nature=MouvementConge.Nature.DEBIT).order_by('exercice')
    assert sorted((m.exercice, m.d_consomme, m.d_cp_consomme) for m in debits) == sorted(
        [(ACT, 7, 7), (REL, 13, 13)])


def test_valider_cp_sur_l_actuel_seul_imprime_annuel(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe(annuel=30)
    d = _valider(demande_recue(), traiteur_conge, motif_cp, exercice=ACT)
    assert d.categorie_exercice == 'ACTUEL' and d.ventilation == [{'exercice': ACT, 'jours': 10}]


def test_valider_cp_deborde_jusqu_a_l_anticipe(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(reliquat=2, annuel=3)
    d = _valider(demande_recue(), traiteur_conge, motif_cp)
    assert _restants(employee) == {REL: 0, ACT: 0, ANT: 25}
    assert [p['jours'] for p in d.ventilation] == [2, 3, 5]


def test_valider_cp_refuse_de_commencer_apres_un_exercice_non_vide(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe(reliquat=13, annuel=30)
    d = demande_recue()
    with pytest.raises(CongeError, match=REL):
        _valider(d, traiteur_conge, motif_cp, exercice=ACT)
    d.refresh_from_db()
    assert d.statut == DemandeConge.Statut.RECUE
    assert not MouvementConge.objects.filter(demande=d).exists()


def test_valider_cp_refuse_si_le_total_ne_suffit_pas_et_ne_change_rien(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(annuel=2, anticipe=5)
    d = demande_recue()
    with pytest.raises(SoldeInsuffisant):
        _valider(d, traiteur_conge, motif_cp)
    d.refresh_from_db()
    assert d.statut == DemandeConge.Statut.RECUE
    assert _restants(employee) == {ACT: 2, ANT: 5}
    assert not MouvementConge.objects.filter(demande=d).exists()


def test_valider_cp_sans_solde_initialise_est_refuse(demande_recue, traiteur_conge, motif_cp):
    d = demande_recue()
    with pytest.raises(SoldeNonInitialise):
        _valider(d, traiteur_conge, motif_cp)
    d.refresh_from_db()
    assert d.statut == DemandeConge.Statut.RECUE


def test_valider_ce_ne_debite_rien(demande_recue, traiteur_conge, solde_employe, motif_ce, employee):
    solde_employe(reliquat=5, annuel=30)
    d = _valider(demande_recue(nb_jours=3), traiteur_conge, motif_ce, type_conge='CE', nb_jours=3)
    assert _restants(employee) == {REL: 5, ACT: 30, ANT: 30}
    assert d.statut == DemandeConge.Statut.PRETE and d.type_conge == 'CE'
    assert d.ventilation == [] and d.categorie_exercice == ''
    assert not MouvementConge.objects.filter(demande=d).exists()


def test_valider_ce_fonctionne_meme_sans_solde_initialise(demande_recue, traiteur_conge, motif_ce):
    d = _valider(demande_recue(nb_jours=3), traiteur_conge, motif_ce, type_conge='CE', nb_jours=3)
    assert d.statut == DemandeConge.Statut.PRETE


def test_valider_cs_ajoute_au_retrait_cs_sans_debiter(demande_recue, traiteur_conge, solde_employe, motif_cs, employee):
    solde_employe(reliquat=5, annuel=30)
    d = _valider(demande_recue(nb_jours=7), traiteur_conge, motif_cs, type_conge='CS', nb_jours=7)
    entete = SoldeConge.objects.get(employee=employee)
    assert (entete.retrait_cs, entete.cp_consomme) == (7, 0)
    assert _restants(employee) == {REL: 5, ACT: 30, ANT: 30}
    assert _coherent(employee) and d.ventilation == []


def test_valider_refuse_un_statut_autre_que_recue(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe()
    d = _valider(demande_recue(), traiteur_conge, motif_cp)
    with pytest.raises(TransitionInvalide):
        _valider(d, traiteur_conge, motif_cp)


def test_valider_refuse_un_chevauchement_apres_correction_des_dates(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe()
    _valider(demande_recue(), traiteur_conge, motif_cp)  # 01/11 → 11/11
    autre = demande_recue(date_depart=datetime.date(2026, 12, 1), date_retour=datetime.date(2026, 12, 11))
    with pytest.raises(ChevauchementError):
        _valider(autre, traiteur_conge, motif_cp,
                 date_depart=datetime.date(2026, 11, 5), date_retour=datetime.date(2026, 11, 15))


def test_valider_permet_de_changer_la_reference_et_fige_le_signataire(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe()
    d = _valider(demande_recue(), traiteur_conge, motif_cp, reference='04512/26',
                 signataire_nom='INTERIMAIRE X', signataire_interim=True)
    assert d.reference == '04512/26'
    assert d.signataire_nom == 'INTERIMAIRE X' and d.signataire_interim is True


# ─── Rejet, récupération ────────────────────────────────────────────────────

def test_rejeter_une_demande_recue_exige_un_motif_et_ne_touche_pas_au_solde(demande_recue, traiteur_conge, solde_employe, employee):
    solde_employe()
    d = demande_recue()
    with pytest.raises(CongeError):
        workflow.rejeter_demande(d, auteur=traiteur_conge, motif=' ')
    d = workflow.rejeter_demande(d, auteur=traiteur_conge, motif="Période de clôture")
    assert d.statut == DemandeConge.Statut.REJETEE and d.motif_rejet == "Période de clôture"
    assert _restants(employee)[ACT] == 30


def test_rejeter_un_titre_prete_restitue_le_debit(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(reliquat=13, annuel=30)
    d = _valider(demande_recue(nb_jours=20), traiteur_conge, motif_cp, nb_jours=20)
    workflow.rejeter_demande(d, auteur=traiteur_conge, motif="Erreur")
    assert _restants(employee) == {REL: 13, ACT: 30, ANT: 30}
    assert SoldeConge.objects.get(employee=employee).cp_consomme == 0
    assert _coherent(employee)


def test_marquer_recuperee_exige_le_statut_prete(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe()
    d = demande_recue()
    with pytest.raises(TransitionInvalide):
        workflow.marquer_recuperee(d, auteur=traiteur_conge)
    d = _valider(d, traiteur_conge, motif_cp)
    d = workflow.marquer_recuperee(d, auteur=traiteur_conge)
    assert d.statut == DemandeConge.Statut.RECUPEREE and d.date_recuperee is not None


# ─── Annulation (même signé) ────────────────────────────────────────────────

def test_annuler_restitue_exactement_la_ventilation(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(reliquat=13, annuel=30)
    d = _valider(demande_recue(nb_jours=20), traiteur_conge, motif_cp, nb_jours=20)
    d = workflow.marquer_recuperee(d, auteur=traiteur_conge)  # signé et récupéré
    d = workflow.annuler_demande(d, auteur=traiteur_conge, motif="Annulé par l'employé")
    assert _restants(employee) == {REL: 13, ACT: 30, ANT: 30}
    assert SoldeConge.objects.get(employee=employee).cp_consomme == 0
    assert d.statut == DemandeConge.Statut.ANNULEE
    assert d.motif_annulation == "Annulé par l'employé" and d.annulee_par_id == traiteur_conge.id
    assert d.date_annulation is not None and d.is_active is True  # conservé dans l'historique
    assert _coherent(employee)
    restitutions = MouvementConge.objects.filter(demande=d, nature=MouvementConge.Nature.RESTITUTION_ANNULATION)
    assert restitutions.count() == 2  # une par exercice débité


def test_annuler_exige_un_motif_et_un_statut_valide(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe()
    recue = demande_recue()
    with pytest.raises(TransitionInvalide):
        workflow.annuler_demande(recue, auteur=traiteur_conge, motif="x")
    prete = _valider(recue, traiteur_conge, motif_cp)
    with pytest.raises(CongeError):
        workflow.annuler_demande(prete, auteur=traiteur_conge, motif="")


def test_annuler_deux_fois_est_impossible(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe()
    d = _valider(demande_recue(), traiteur_conge, motif_cp)
    workflow.annuler_demande(d, auteur=traiteur_conge, motif="x")
    with pytest.raises(TransitionInvalide):
        workflow.annuler_demande(d, auteur=traiteur_conge, motif="x")


def test_annuler_cs_retire_du_retrait_cs(demande_recue, traiteur_conge, solde_employe, motif_cs, employee):
    solde_employe()
    d = _valider(demande_recue(nb_jours=7), traiteur_conge, motif_cs, type_conge='CS', nb_jours=7)
    workflow.annuler_demande(d, auteur=traiteur_conge, motif="x")
    assert SoldeConge.objects.get(employee=employee).retrait_cs == 0 and _coherent(employee)


def test_annuler_apres_le_1er_juillet_rend_au_meme_exercice(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    """Les jours reviennent à l'exercice débité, même s'il a changé de groupe
    depuis (aucun jour ne se déplace lors de la bascule)."""
    solde_employe(annuel=30)
    d = _valider(demande_recue(), traiteur_conge, motif_cp)  # ACT : 30 → 20
    SoldeExercice.objects.filter(employee=employee, exercice=ANT).delete()  # simule le passage
    workflow.annuler_demande(d, auteur=traiteur_conge, motif="x")
    restants = _restants(employee)
    assert restants[ACT] == 30 and restants[ANT] == 30  # anticipé ré-ouvert au passage


# ─── Interruption ───────────────────────────────────────────────────────────

def test_interrompre_restitue_les_jours_non_pris_le_plus_ancien_d_abord(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(reliquat=13, annuel=30)
    d = _valider(demande_recue(nb_jours=20), traiteur_conge, motif_cp, nb_jours=20,
                 date_depart=datetime.date(2026, 11, 1), date_retour=datetime.date(2026, 11, 21))
    d = workflow.interrompre_demande(
        d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif="Rappel de l'employeur",
    )
    # pris : 4 jours (01→05/11) ; restitués : 16 = 13 au reliquat + 3 à l'actuel
    assert _restants(employee) == {REL: 13, ACT: 26, ANT: 30}
    assert SoldeConge.objects.get(employee=employee).cp_consomme == 4
    assert d.statut == DemandeConge.Statut.INTERROMPUE
    assert d.jours_effectifs == 4 and d.date_rappel == datetime.date(2026, 11, 5)
    assert d.motif_interruption == "Rappel de l'employeur" and d.interrompue_par_id == traiteur_conge.id
    assert d.ventilation == [{'exercice': REL, 'jours': 13}, {'exercice': ACT, 'jours': 7}]  # titre intact
    assert _coherent(employee)
    rendus = MouvementConge.objects.filter(demande=d, nature=MouvementConge.Nature.RESTITUTION_INTERRUPTION)
    assert sorted((m.exercice, m.d_consomme) for m in rendus) == sorted([(ACT, -3), (REL, -13)])


def test_interrompre_valide_la_date_de_rappel(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe()
    d = _valider(demande_recue(), traiteur_conge, motif_cp)
    for mauvaise in (datetime.date(2026, 11, 1), datetime.date(2026, 11, 11), datetime.date(2026, 10, 1)):
        with pytest.raises(CongeError):
            workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=mauvaise, motif="x")
    with pytest.raises(CongeError):
        workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif=" ")


def test_interrompre_une_seule_fois_et_pas_avant_validation(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe()
    d = demande_recue()
    with pytest.raises(TransitionInvalide):
        workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif="x")
    d = _valider(d, traiteur_conge, motif_cp)
    d = workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif="x")
    with pytest.raises(TransitionInvalide):
        workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 6), motif="x")


def test_interrompre_un_cs_rend_au_retrait_cs(demande_recue, traiteur_conge, solde_employe, motif_cs, employee):
    solde_employe()
    d = _valider(demande_recue(), traiteur_conge, motif_cs, type_conge='CS')
    workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif="x")
    assert SoldeConge.objects.get(employee=employee).retrait_cs == 4 and _coherent(employee)


def test_un_titre_interrompu_n_est_pas_annulable_en_v1(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe()
    d = _valider(demande_recue(), traiteur_conge, motif_cp)
    d = workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif="x")
    with pytest.raises(TransitionInvalide):
        workflow.annuler_demande(d, auteur=traiteur_conge, motif="x")


def test_la_periode_effective_d_un_titre_interrompu_libere_les_dates(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe()
    d = _valider(demande_recue(), traiteur_conge, motif_cp)  # 01 → 11/11
    workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif="x")
    assert workflow.trouver_chevauchement(employee, datetime.date(2026, 11, 6), datetime.date(2026, 11, 9)) is None
    assert workflow.trouver_chevauchement(employee, datetime.date(2026, 11, 3), datetime.date(2026, 11, 9)) is not None


# ─── Chevauchement ──────────────────────────────────────────────────────────

def test_chevauchement_ignore_les_demandes_rejetee_annulee_ou_supprimee(demande_recue, employee):
    demande_recue(statut='rejetee')
    demande_recue(statut='annulee')
    demande_recue(is_active=False)
    assert workflow.trouver_chevauchement(employee, datetime.date(2026, 11, 5), datetime.date(2026, 11, 8)) is None


def test_chevauchement_accepte_une_reprise_le_jour_du_nouveau_depart(demande_recue, employee):
    demande_recue(date_depart=datetime.date(2026, 10, 20), date_retour=datetime.date(2026, 11, 1))
    assert workflow.trouver_chevauchement(employee, datetime.date(2026, 11, 1), datetime.date(2026, 11, 5)) is None


def test_chevauchement_detecte_une_demande_active_qui_recoupe(demande_recue, employee):
    existante = demande_recue()  # 01 → 11/11
    assert workflow.trouver_chevauchement(employee, datetime.date(2026, 11, 5), datetime.date(2026, 11, 15)) == existante
