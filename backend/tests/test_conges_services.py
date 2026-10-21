import datetime
from types import SimpleNamespace

import pytest
from django.db import transaction

from conges.models import CategorieExercice, MouvementConge, ParametreConge, SoldeExercice
from conges.services import (
    CongeError, SoldeInsuffisant, SoldeNonInitialise,
    calculer_ventilation, categorie, corriger_solde, ecarts_solde, etat_soldes, exercice_courant,
    exercice_pour, exercice_precedent, exercice_suivant, initialiser_solde, valider_format_exercice,
    verrouiller_soldes,
)

pytestmark = pytest.mark.django_db

# Exercices relatifs à la date du jour : les tests restent vrais après le 1er juillet.
ACT = exercice_courant()
REL = exercice_precedent(ACT)
VIEUX = exercice_precedent(REL)
ANT = exercice_suivant(ACT)
TROP_LOIN = exercice_suivant(ANT)


# ─── Exercice (1er juillet → 30 juin) et groupes ───────────────────────────

@pytest.mark.parametrize('jour,attendu', [
    (datetime.date(2026, 6, 30), '2025/2026'),
    (datetime.date(2026, 7, 1), '2026/2027'),
    (datetime.date(2026, 8, 10), '2026/2027'),
    (datetime.date(2027, 1, 15), '2026/2027'),
])
def test_exercice_pour(jour, attendu):
    assert exercice_pour(jour) == attendu


def test_exercice_suivant_et_precedent():
    assert exercice_suivant('2025/2026') == '2026/2027'
    assert exercice_precedent('2025/2026') == '2024/2025'


def test_categorie_selon_la_date_du_jour():
    jour = datetime.date(2026, 10, 21)
    assert categorie('2024/2025', jour) == CategorieExercice.RELIQUAT
    assert categorie('2025/2026', jour) == CategorieExercice.RELIQUAT
    assert categorie('2026/2027', jour) == CategorieExercice.ACTUEL
    assert categorie('2027/2028', jour) == CategorieExercice.ANTICIPE


def test_categorie_glisse_au_1er_juillet_sans_rien_deplacer():
    assert categorie('2026/2027', datetime.date(2027, 6, 30)) == CategorieExercice.ACTUEL
    assert categorie('2026/2027', datetime.date(2027, 7, 1)) == CategorieExercice.RELIQUAT
    assert categorie('2027/2028', datetime.date(2027, 7, 1)) == CategorieExercice.ACTUEL


@pytest.mark.parametrize('valeur', ['2025-2026', '2025/2027', '25/26', '', 'abcd/efgh'])
def test_format_exercice_invalide(valeur):
    with pytest.raises(CongeError):
        valider_format_exercice(valeur)


# ─── Ventilation : le plus ancien d'abord, en cascade ──────────────────────

def _lignes(**restants):
    """_lignes(REL=13, ACT=30) avec les clés des constantes du module."""
    noms = {'VIEUX': VIEUX, 'REL': REL, 'ACT': ACT, 'ANT': ANT, 'TROP_LOIN': TROP_LOIN}
    return [SimpleNamespace(exercice=noms[k], restant=v) for k, v in restants.items()]


def test_ventilation_par_defaut_part_du_plus_ancien():
    assert calculer_ventilation(_lignes(REL=13, ACT=30), 10) == [{'exercice': REL, 'jours': 10}]


def test_ventilation_deborde_sur_les_exercices_suivants():
    assert calculer_ventilation(_lignes(VIEUX=2, REL=3, ACT=30), 10) == [
        {'exercice': VIEUX, 'jours': 2}, {'exercice': REL, 'jours': 3}, {'exercice': ACT, 'jours': 5},
    ]


def test_ventilation_peut_aller_jusqu_a_l_anticipe():
    assert calculer_ventilation(_lignes(ACT=2, ANT=30), 5) == [
        {'exercice': ACT, 'jours': 2}, {'exercice': ANT, 'jours': 3},
    ]


def test_ventilation_ignore_les_exercices_vides():
    assert calculer_ventilation(_lignes(REL=0, ACT=30), 4, ACT) == [{'exercice': ACT, 'jours': 4}]


def test_ventilation_refuse_de_sauter_un_exercice_plus_ancien_non_vide():
    with pytest.raises(CongeError, match=REL):
        calculer_ventilation(_lignes(REL=13, ACT=30), 5, ACT)


def test_ventilation_refuse_un_exercice_de_depart_sans_jours():
    with pytest.raises(SoldeInsuffisant):
        calculer_ventilation(_lignes(REL=0, ACT=30), 5, REL)


def test_ventilation_refuse_si_le_total_ne_suffit_pas():
    with pytest.raises(SoldeInsuffisant, match="35"):
        calculer_ventilation(_lignes(ACT=5, ANT=30), 36)


def test_ventilation_ne_va_jamais_au_dela_de_l_anticipe():
    with pytest.raises(SoldeInsuffisant):
        calculer_ventilation(_lignes(ACT=1, TROP_LOIN=30), 5)


def test_ventilation_refuse_zero_jour():
    with pytest.raises(CongeError):
        calculer_ventilation(_lignes(ACT=5), 0)


# ─── Saisie initiale ───────────────────────────────────────────────────────

def test_initialiser_cree_les_exercices_et_les_mouvements(employee, traiteur_conge):
    soldes = initialiser_solde(
        employee, exercices={REL: 5, ACT: 20}, compteurs={'droit_initial': 210, 'cp_consomme': 180},
        auteur=traiteur_conge, motif="Reprise",
    )
    restants = {e: ligne.restant for e, ligne in soldes.lignes.items()}
    assert restants == {REL: 5, ACT: 20, ANT: 30}  # anticipé non saisi : ouvert au droit annuel
    assert (soldes.entete.droit_initial, soldes.entete.cp_consomme) == (210, 180)
    natures = list(MouvementConge.objects.filter(employee=employee).values_list('nature', flat=True))
    assert natures.count(MouvementConge.Nature.INITIAL) == 3  # compteurs + 2 exercices saisis
    assert natures.count(MouvementConge.Nature.OUVERTURE) == 1
    assert ecarts_solde(soldes.entete) == {}


def test_initialiser_refuse_un_double_appel(employee, traiteur_conge, solde_employe):
    solde_employe()
    with pytest.raises(CongeError):
        initialiser_solde(employee, exercices={ACT: 10}, auteur=traiteur_conge)


def test_initialiser_refuse_negatif_format_invalide_et_exercice_trop_lointain(employee, traiteur_conge):
    for exercices in ({ACT: -1}, {'2025-2026': 3}, {TROP_LOIN: 30}):
        with pytest.raises(CongeError):
            initialiser_solde(employee, exercices=exercices, auteur=traiteur_conge)


# ─── Correction ────────────────────────────────────────────────────────────

def test_corriger_exige_un_motif_et_garde_une_trace(employee, traiteur_conge, solde_employe):
    solde_employe(reliquat=5)
    with pytest.raises(CongeError):
        corriger_solde(employee, exercices={REL: -2}, auteur=traiteur_conge, motif='  ')
    soldes = corriger_solde(employee, exercices={REL: -2}, auteur=traiteur_conge, motif="Erreur de reprise")
    assert soldes.lignes[REL].restant == 3
    m = MouvementConge.objects.filter(nature=MouvementConge.Nature.CORRECTION).get()
    assert (m.exercice, m.d_droit, m.motif) == (REL, -2, "Erreur de reprise")
    assert m.avant['droit'] == 5 and m.apres['droit'] == 3
    assert ecarts_solde(soldes.entete) == {}


def test_corriger_peut_creer_un_ancien_exercice(employee, traiteur_conge, solde_employe):
    solde_employe()
    soldes = corriger_solde(employee, exercices={VIEUX: 4}, auteur=traiteur_conge, motif="Oubli")
    assert soldes.lignes[VIEUX].restant == 4
    assert ecarts_solde(soldes.entete) == {}


def test_corriger_les_compteurs(employee, traiteur_conge, solde_employe):
    solde_employe(retrait_cs=3)
    soldes = corriger_solde(employee, compteurs={'retrait_cs': -1}, auteur=traiteur_conge, motif="x")
    assert soldes.entete.retrait_cs == 2
    with pytest.raises(SoldeInsuffisant):
        corriger_solde(employee, compteurs={'retrait_cs': -5}, auteur=traiteur_conge, motif="x")


def test_corriger_refuse_de_passer_sous_zero(employee, traiteur_conge, solde_employe):
    solde_employe(reliquat=1)
    with pytest.raises(SoldeInsuffisant):
        corriger_solde(employee, exercices={REL: -2}, auteur=traiteur_conge, motif="x")
    with pytest.raises(SoldeInsuffisant):
        corriger_solde(employee, exercices={VIEUX: -1}, auteur=traiteur_conge, motif="x")


def test_corriger_sans_variation_refuse(employee, traiteur_conge, solde_employe):
    solde_employe()
    with pytest.raises(CongeError):
        corriger_solde(employee, exercices={ACT: 0}, auteur=traiteur_conge, motif="x")


# ─── Verrou et ouverture automatique des exercices (bascule) ───────────────

def test_verrouiller_sans_solde_initialise_leve(employee):
    with transaction.atomic():
        with pytest.raises(SoldeNonInitialise):
            verrouiller_soldes(employee)


def test_ouverture_cree_l_anticipe_manquant_sans_rien_deplacer(employee, traiteur_conge, solde_employe):
    """Simule le passage du 1er juillet : le nouvel anticipé n'existe pas encore."""
    solde_employe(reliquat=4)
    SoldeExercice.objects.filter(employee=employee, exercice=ANT).delete()
    with transaction.atomic():
        s = verrouiller_soldes(employee, auteur=traiteur_conge)
    assert s.lignes[ANT].restant == ParametreConge.get().droit_annuel_jours
    assert s.lignes[REL].restant == 4
    ouverture = MouvementConge.objects.filter(nature=MouvementConge.Nature.OUVERTURE, exercice=ANT).latest('id')
    assert ouverture.d_droit == 30


def test_ouverture_est_idempotente(employee, solde_employe):
    solde_employe(reliquat=3)
    avant = MouvementConge.objects.count()
    with transaction.atomic():
        verrouiller_soldes(employee)
    with transaction.atomic():
        verrouiller_soldes(employee)
    assert MouvementConge.objects.count() == avant


def test_ouverture_utilise_le_droit_annuel_parametre(employee, solde_employe):
    solde_employe()
    SoldeExercice.objects.filter(employee=employee, exercice=ANT).delete()
    ParametreConge.objects.update_or_create(pk=1, defaults={'droit_annuel_jours': 20})
    with transaction.atomic():
        s = verrouiller_soldes(employee)
    assert s.lignes[ANT].droit == 20


# ─── Lecture et intégrité ──────────────────────────────────────────────────

def test_etat_soldes_groupes_et_totaux(employee, solde_employe):
    solde_employe(reliquat=13, annuel=20, anticipe=30, exercices={VIEUX: 2}, retrait_cs=4)
    etat = etat_soldes(employee)
    assert [(e['exercice'], e['categorie'], e['restant']) for e in etat['exercices']] == [
        (VIEUX, 'RELIQUAT', 2), (REL, 'RELIQUAT', 13), (ACT, 'ACTUEL', 20), (ANT, 'ANTICIPE', 30),
    ]
    assert (etat['reliquat'], etat['actuel'], etat['anticipe'], etat['disponible']) == (15, 20, 30, 35)
    assert etat['retrait_cs'] == 4 and etat['exercice_courant'] == ACT


def test_etat_soldes_simule_les_exercices_non_ouverts_sans_ecrire(employee, solde_employe):
    solde_employe()
    SoldeExercice.objects.filter(employee=employee, exercice=ANT).delete()
    avant = MouvementConge.objects.count()
    etat = etat_soldes(employee)
    ant = next(e for e in etat['exercices'] if e['exercice'] == ANT)
    assert ant['ouvert'] is False and ant['restant'] == 30
    assert MouvementConge.objects.count() == avant


def test_etat_soldes_non_initialise(employee):
    assert etat_soldes(employee) is None


def test_ecarts_detecte_une_modification_hors_service(employee, solde_employe):
    soldes = solde_employe(reliquat=4)
    SoldeExercice.objects.filter(employee=employee, exercice=REL).update(droit=99)
    assert ecarts_solde(soldes.entete) == {f'{REL}.droit': (99, 4)}
