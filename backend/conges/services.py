"""Calcul et mouvements des soldes de congé, suivis PAR EXERCICE (spec v3).

Règle d'or : un solde ne se modifie QUE par les fonctions de ce module, dans
une transaction, lignes verrouillées (verrouiller_soldes). Chaque variation
écrit un MouvementConge immuable, de sorte que `valeur en base == somme des
mouvements` (vérifié par ecarts_solde / la commande verifier_soldes_conges).

Groupes d'exercices (calculés à partir de la date du jour, jamais stockés) :
  - exercice antérieur à l'exercice en cours → RELIQUAT
  - exercice en cours                         → ACTUEL
  - exercice suivant                          → ANTICIPE
Au 1er juillet rien ne se déplace : on ouvre seulement la ligne du nouvel
exercice suivant (droit annuel), cf. ouvrir_exercices.
"""
import re
from dataclasses import dataclass, field
from datetime import date

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import CategorieExercice, MouvementConge, ParametreConge, SoldeConge, SoldeExercice

COMPTEURS = ('droit_initial', 'cp_consomme', 'retrait_cs')
MOIS_DEBUT_EXERCICE = 7
FORMAT_EXERCICE = re.compile(r'^(\d{4})/(\d{4})$')


class CongeError(Exception):
    """Erreur métier : le message est destiné à l'utilisateur (français)."""


class SoldeNonInitialise(CongeError):
    pass


class SoldeInsuffisant(CongeError):
    pass


class TransitionInvalide(CongeError):
    pass


class ChevauchementError(CongeError):
    pass


# ─── Exercice : du 1er juillet au 30 juin ───────────────────────────────────

def exercice_pour(jour: date) -> str:
    debut = jour.year if jour.month >= MOIS_DEBUT_EXERCICE else jour.year - 1
    return f"{debut}/{debut + 1}"


def exercice_courant(aujourdhui: date | None = None) -> str:
    return exercice_pour(aujourdhui or timezone.localdate())


def exercice_suivant(exercice: str) -> str:
    debut = int(exercice.split('/')[0]) + 1
    return f"{debut}/{debut + 1}"


def exercice_precedent(exercice: str) -> str:
    debut = int(exercice.split('/')[0]) - 1
    return f"{debut}/{debut + 1}"


def valider_format_exercice(exercice: str) -> str:
    """« 2025/2026 » : deux années consécutives. Lève CongeError sinon."""
    m = FORMAT_EXERCICE.match(exercice or '')
    if not m or int(m.group(2)) != int(m.group(1)) + 1:
        raise CongeError(f"Exercice invalide : « {exercice} » (attendu : AAAA/AAAA, années consécutives).")
    return exercice


def categorie(exercice: str, aujourdhui: date | None = None) -> str:
    courant = exercice_courant(aujourdhui)
    if exercice < courant:
        return CategorieExercice.RELIQUAT
    if exercice == courant:
        return CategorieExercice.ACTUEL
    return CategorieExercice.ANTICIPE


def _verifier_pas_au_dela_anticipe(exercice: str) -> None:
    limite = exercice_suivant(exercice_courant())
    if exercice > limite:
        raise CongeError(f"L'exercice {exercice} est trop lointain : au plus {limite} (anticipé).")


# ─── Mouvements ─────────────────────────────────────────────────────────────

def _instantane(entete, ligne=None) -> dict:
    snap = {c: getattr(entete, c) for c in COMPTEURS}
    if ligne is not None:
        snap.update(exercice=ligne.exercice, droit=ligne.droit, consomme=ligne.consomme)
    return snap


def _mouvement(entete, nature, *, ligne=None, d_droit=0, d_consomme=0, compteurs=None,
               demande=None, auteur=None, motif='') -> MouvementConge:
    """Applique une variation (au plus une ligne d'exercice + compteurs) et
    écrit le mouvement. L'appelant tient la transaction et les verrous."""
    compteurs = compteurs or {}
    avant = _instantane(entete, ligne)
    if ligne is not None:
        ligne.droit += d_droit
        ligne.consomme += d_consomme
        if ligne.droit < 0 or ligne.consomme < 0 or ligne.consomme > ligne.droit:
            raise SoldeInsuffisant(
                f"Opération impossible : le solde de l'exercice {ligne.exercice} deviendrait incohérent."
            )
        ligne.save()
    if compteurs:
        for champ, delta in compteurs.items():
            setattr(entete, champ, getattr(entete, champ) + delta)
        entete.save()
    return MouvementConge.objects.create(
        employee=entete.employee, demande=demande, nature=nature,
        exercice=ligne.exercice if ligne is not None else '',
        d_droit=d_droit, d_consomme=d_consomme,
        **{f'd_{c}': compteurs.get(c, 0) for c in COMPTEURS},
        avant=avant, apres=_instantane(entete, ligne), motif=motif, auteur=auteur,
    )


@dataclass
class Soldes:
    """En-tête + lignes par exercice d'un employé, verrouillées."""
    entete: SoldeConge
    lignes: dict = field(default_factory=dict)  # exercice → SoldeExercice

    def ordonnees(self):
        return [self.lignes[e] for e in sorted(self.lignes)]


def _ouvrir(soldes: Soldes, exercice: str, *, droit: int, nature, auteur=None, motif='') -> SoldeExercice:
    ligne = SoldeExercice.objects.create(employee=soldes.entete.employee, exercice=exercice)
    soldes.lignes[exercice] = ligne
    _mouvement(soldes.entete, nature, ligne=ligne, d_droit=droit, auteur=auteur, motif=motif)
    return ligne


def ouvrir_exercices(soldes: Soldes, *, auteur=None) -> list[str]:
    """Crée les lignes manquantes de l'exercice en cours et de l'anticipé, au
    droit annuel. Idempotent : c'est toute la « bascule » du 1er juillet."""
    droit = ParametreConge.get().droit_annuel_jours
    courant = exercice_courant()
    ouverts = []
    for exercice in (courant, exercice_suivant(courant)):
        if exercice not in soldes.lignes:
            _ouvrir(soldes, exercice, droit=droit, nature=MouvementConge.Nature.OUVERTURE,
                    auteur=auteur, motif=f"Ouverture de l'exercice {exercice}")
            ouverts.append(exercice)
    return ouverts


def verrouiller_soldes(employee, *, auteur=None) -> Soldes:
    """Verrou de l'en-tête et des lignes + ouverture des exercices manquants.
    À appeler dans transaction.atomic()."""
    try:
        entete = SoldeConge.objects.select_for_update().select_related('employee').get(employee=employee)
    except SoldeConge.DoesNotExist:
        raise SoldeNonInitialise(
            "Les soldes de congé de cet employé ne sont pas initialisés : "
            "saisissez d'abord son solde de départ."
        )
    lignes = SoldeExercice.objects.select_for_update().filter(employee=employee)
    soldes = Soldes(entete, {ligne.exercice: ligne for ligne in lignes})
    ouvrir_exercices(soldes, auteur=auteur)
    return soldes


# ─── Ventilation d'un débit CP : le plus ancien d'abord, en cascade ────────

def calculer_ventilation(lignes, nb_jours: int, exercice_depart: str = '') -> list[dict]:
    """`lignes` : objets portant `exercice` et `restant`. Démarre à
    `exercice_depart` (par défaut le plus ancien ayant des jours), refuse de
    démarrer après un exercice plus ancien non vidé, et déborde sur les
    suivants jusqu'à l'anticipé. Renvoie [{"exercice", "jours"}]."""
    if nb_jours < 1:
        raise CongeError("Le nombre de jours doit être supérieur à zéro.")
    limite = exercice_suivant(exercice_courant())
    disponibles = sorted(
        (ligne for ligne in lignes if ligne.exercice <= limite and ligne.restant > 0),
        key=lambda ligne: ligne.exercice,
    )
    if not disponibles:
        raise SoldeInsuffisant(f"Solde insuffisant : {nb_jours} jour(s) demandé(s), aucun jour disponible.")
    plus_ancien = disponibles[0]
    depart = exercice_depart or plus_ancien.exercice
    if depart != plus_ancien.exercice:
        if depart not in {ligne.exercice for ligne in disponibles}:
            raise SoldeInsuffisant(f"L'exercice {depart} n'a plus de jours disponibles.")
        raise CongeError(
            f"L'exercice {plus_ancien.exercice} a encore {plus_ancien.restant} jour(s) : "
            f"il doit être consommé avant {depart}."
        )
    total = sum(ligne.restant for ligne in disponibles)
    if nb_jours > total:
        raise SoldeInsuffisant(
            f"Solde insuffisant : {nb_jours} jour(s) demandé(s), {total} disponible(s) (anticipé compris)."
        )
    ventilation, reste = [], nb_jours
    for ligne in disponibles:
        if reste == 0:
            break
        pris = min(ligne.restant, reste)
        ventilation.append({'exercice': ligne.exercice, 'jours': pris})
        reste -= pris
    return ventilation


def debiter(soldes: Soldes, ventilation, *, demande, auteur, motif) -> None:
    for part in ventilation:
        _mouvement(
            soldes.entete, MouvementConge.Nature.DEBIT, ligne=soldes.lignes[part['exercice']],
            d_consomme=part['jours'], compteurs={'cp_consomme': part['jours']},
            demande=demande, auteur=auteur, motif=motif,
        )


def restituer(soldes: Soldes, ventilation, jours: int, *, nature, demande, auteur, motif) -> list[dict]:
    """Rend `jours` vers les exercices débités, le plus ancien d'abord.
    Renvoie la ventilation effectivement restituée."""
    rendu, reste = [], jours
    for part in sorted(ventilation, key=lambda p: p['exercice']):
        if reste == 0:
            break
        n = min(part['jours'], reste)
        ligne = soldes.lignes.get(part['exercice'])
        if ligne is None:
            raise CongeError(f"Exercice {part['exercice']} introuvable : restitution impossible.")
        _mouvement(soldes.entete, nature, ligne=ligne, d_consomme=-n, compteurs={'cp_consomme': -n},
                   demande=demande, auteur=auteur, motif=motif)
        rendu.append({'exercice': part['exercice'], 'jours': n})
        reste -= n
    return rendu


def mouvement_cs(soldes: Soldes, jours: int, *, nature, demande, auteur, motif) -> None:
    """Variation signée du compteur « retrait CS » (congé sans solde)."""
    _mouvement(soldes.entete, nature, compteurs={'retrait_cs': jours},
               demande=demande, auteur=auteur, motif=motif)


# ─── Saisie initiale et correction (traiteur) ──────────────────────────────

def _entiers(valeurs, *, positifs: bool) -> dict:
    sortie = {}
    for cle, v in (valeurs or {}).items():
        n = int(v or 0)
        if positifs and n < 0:
            raise CongeError("Les soldes ne peuvent pas être négatifs.")
        sortie[cle] = n
    return sortie


def _compteurs(valeurs, *, positifs: bool) -> dict:
    return _entiers({c: v for c, v in (valeurs or {}).items() if c in COMPTEURS}, positifs=positifs)


def initialiser_solde(employee, *, exercices, compteurs=None, auteur, motif='') -> Soldes:
    """`exercices` : {"2024/2025": jours restants, ...}. L'exercice en cours et
    l'anticipé non saisis sont ouverts au droit annuel."""
    exercices = _entiers(exercices, positifs=True)
    compteurs = _compteurs(compteurs, positifs=True)
    for exercice in exercices:
        valider_format_exercice(exercice)
        _verifier_pas_au_dela_anticipe(exercice)
    motif = motif or "Saisie initiale"
    with transaction.atomic():
        if SoldeConge.objects.select_for_update().filter(employee=employee).exists():
            raise CongeError("Le solde de cet employé est déjà initialisé : utilisez une correction.")
        entete = SoldeConge.objects.create(employee=employee)
        soldes = Soldes(entete)
        if any(compteurs.values()):
            _mouvement(entete, MouvementConge.Nature.INITIAL, compteurs=compteurs, auteur=auteur, motif=motif)
        for exercice in sorted(exercices):
            _ouvrir(soldes, exercice, droit=exercices[exercice], nature=MouvementConge.Nature.INITIAL,
                    auteur=auteur, motif=motif)
        ouvrir_exercices(soldes, auteur=auteur)
        return soldes


def corriger_solde(employee, *, exercices=None, compteurs=None, auteur, motif) -> Soldes:
    """`exercices` : {exercice: variation des jours restants} ; `compteurs` :
    {compteur: variation}. Un exercice absent est créé (variation positive)."""
    motif = (motif or '').strip()
    if not motif:
        raise CongeError("Un motif est obligatoire pour corriger un solde.")
    exercices = {e: v for e, v in _entiers(exercices, positifs=False).items() if v}
    compteurs = {c: v for c, v in _compteurs(compteurs, positifs=False).items() if v}
    if not exercices and not compteurs:
        raise CongeError("Aucune correction à appliquer.")
    for exercice in exercices:
        valider_format_exercice(exercice)
        _verifier_pas_au_dela_anticipe(exercice)
    with transaction.atomic():
        soldes = verrouiller_soldes(employee, auteur=auteur)
        for champ, delta in compteurs.items():
            if getattr(soldes.entete, champ) + delta < 0:
                raise SoldeInsuffisant(f"La correction rendrait le compteur « {champ} » négatif.")
        if compteurs:
            _mouvement(soldes.entete, MouvementConge.Nature.CORRECTION, compteurs=compteurs,
                       auteur=auteur, motif=motif)
        for exercice in sorted(exercices):
            _corriger_exercice(soldes, exercice, exercices[exercice], auteur=auteur, motif=motif)
        return soldes


def _corriger_exercice(soldes: Soldes, exercice: str, delta: int, *, auteur, motif) -> None:
    ligne = soldes.lignes.get(exercice)
    if ligne is None:
        if delta < 0:
            raise SoldeInsuffisant(f"L'exercice {exercice} n'a aucun jour à retirer.")
        _ouvrir(soldes, exercice, droit=delta, nature=MouvementConge.Nature.CORRECTION,
                auteur=auteur, motif=motif)
        return
    if ligne.restant + delta < 0:
        raise SoldeInsuffisant(
            f"La correction rendrait l'exercice {exercice} négatif ({ligne.restant} jour(s) restant(s))."
        )
    _mouvement(soldes.entete, MouvementConge.Nature.CORRECTION, ligne=ligne, d_droit=delta,
               auteur=auteur, motif=motif)


# ─── Lecture (sans écriture : les lignes manquantes sont simulées) ──────────

def etat_soldes(employee) -> dict | None:
    """État affichable : lignes par exercice (groupe, droit, consommé,
    restant) et totaux. None si le solde n'est pas initialisé. L'exercice en
    cours et l'anticipé non encore ouverts apparaissent au droit annuel
    (`ouvert: False`) : ils le seront à la prochaine opération."""
    entete = SoldeConge.objects.filter(employee=employee).first()
    if entete is None:
        return None
    lignes = {
        ligne.exercice: {'exercice': ligne.exercice, 'droit': ligne.droit, 'consomme': ligne.consomme,
                         'restant': ligne.restant, 'ouvert': True}
        for ligne in SoldeExercice.objects.filter(employee=employee)
    }
    droit = ParametreConge.get().droit_annuel_jours
    courant = exercice_courant()
    for exercice in (courant, exercice_suivant(courant)):
        lignes.setdefault(exercice, {'exercice': exercice, 'droit': droit, 'consomme': 0,
                                     'restant': droit, 'ouvert': False})
    exercices = []
    totaux = {'reliquat': 0, 'actuel': 0, 'anticipe': 0}
    for exercice in sorted(lignes):
        cat = categorie(exercice)
        exercices.append({**lignes[exercice], 'categorie': cat})
        totaux[cat.lower()] += lignes[exercice]['restant']
    return {
        'exercice_courant': courant,
        'exercices': exercices,
        **totaux,
        'disponible': totaux['reliquat'] + totaux['actuel'],
        **{c: getattr(entete, c) for c in COMPTEURS},
    }


# ─── Contrôle d'intégrité ───────────────────────────────────────────────────

def ecarts_solde(entete) -> dict:
    """{cle: (valeur_en_base, somme_des_mouvements)} — vide si cohérent. Clés :
    compteurs (« cp_consomme ») et lignes (« 2025/2026.droit »)."""
    employee = entete.employee
    mouvements = MouvementConge.objects.filter(employee=employee)
    sommes = mouvements.aggregate(**{c: Sum(f'd_{c}') for c in COMPTEURS})
    ecarts = {
        c: (getattr(entete, c), sommes[c] or 0)
        for c in COMPTEURS if getattr(entete, c) != (sommes[c] or 0)
    }
    par_exercice = {
        r['exercice']: r
        # order_by() vide : sinon le tri par défaut s'ajoute au GROUP BY.
        for r in mouvements.exclude(exercice='').order_by().values('exercice')
        .annotate(droit=Sum('d_droit'), consomme=Sum('d_consomme'))
    }
    lignes = {ligne.exercice: ligne for ligne in SoldeExercice.objects.filter(employee=employee)}
    for exercice in sorted(set(par_exercice) | set(lignes)):
        ligne, attendu = lignes.get(exercice), par_exercice.get(exercice, {})
        for champ in ('droit', 'consomme'):
            en_base = getattr(ligne, champ) if ligne else 0
            somme = attendu.get(champ) or 0
            if en_base != somme:
                ecarts[f'{exercice}.{champ}'] = (en_base, somme)
    return ecarts
