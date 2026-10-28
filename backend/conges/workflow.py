"""Workflow d'un titre de congé : valider, rejeter, récupérer, annuler,
interrompre (spec : §2.3 et §4). Toutes les fonctions sont atomiques, verrouillent
la demande puis le solde, et écrivent les MouvementConge via conges.services."""
from django.db import transaction
from django.utils import timezone

from .models import DemandeConge, MouvementConge, TypeConge
from .services import (
    ChevauchementError, CongeError, TransitionInvalide, calculer_ventilation, categorie,
    debiter, mouvement_cs, restituer, verrouiller_soldes,
)

Statut = DemandeConge.Statut
STATUTS_ACTIFS = (Statut.RECUE, Statut.PRETE, Statut.RECUPEREE, Statut.INTERROMPUE)
STATUTS_ANNULABLES = (Statut.PRETE, Statut.RECUPEREE)
CHAMPS_VALIDATION = (
    'type_conge', 'motif', 'date_etablissement', 'nb_jours', 'date_depart', 'date_retour',
    'exercice', 'adresse_conge', 'observations', 'signataire_nom', 'signataire_titre',
    'signataire_interim',
)


def _verrouiller_demande(demande) -> DemandeConge:
    return DemandeConge.objects.select_for_update().select_related('employee').get(pk=demande.pk)


def _refuser_si_termine(demande, action) -> None:
    if demande.conge_termine:
        raise TransitionInvalide(
            f"Ce congé est terminé (date de retour atteinte) : il ne peut plus être {action}."
        )


def _motif_obligatoire(motif, message) -> str:
    motif = (motif or '').strip()
    if not motif:
        raise CongeError(message)
    return motif


def trouver_chevauchement(employee, depart, retour, exclude_pk=None):
    """Première demande ACTIVE de l'employé dont la période recoupe
    [depart, retour[. Rejetées, annulées et supprimées sont ignorées ; la fin
    d'un titre interrompu est sa date de rappel ; une reprise le jour d'un
    nouveau départ est acceptée."""
    candidats = DemandeConge.objects.filter(
        employee=employee, is_active=True, statut__in=STATUTS_ACTIFS, date_depart__lt=retour,
    )
    if exclude_pk is not None:
        candidats = candidats.exclude(pk=exclude_pk)
    for candidat in candidats:
        fin = candidat.date_rappel if candidat.statut == Statut.INTERROMPUE and candidat.date_rappel \
            else candidat.date_retour
        if fin > depart:
            return candidat
    return None


# ─── Validation (débit) ─────────────────────────────────────────────────────

def valider_demande(demande, *, auteur, donnees) -> DemandeConge:
    with transaction.atomic():
        demande = _verrouiller_demande(demande)
        if demande.statut != Statut.RECUE:
            raise TransitionInvalide("Seule une demande reçue peut être validée.")
        conflit = trouver_chevauchement(
            demande.employee, donnees['date_depart'], donnees['date_retour'], exclude_pk=demande.pk,
        )
        if conflit:
            raise ChevauchementError(f"Cette période chevauche la demande {conflit.reference} de cet employé.")

        nb_jours, type_conge = donnees['nb_jours'], donnees['type_conge']
        motif_mvt = f"Titre {demande.reference}"
        ventilation, cat = [], ''
        if type_conge == TypeConge.CP:
            soldes = verrouiller_soldes(demande.employee, auteur=auteur)
            ventilation = calculer_ventilation(soldes.ordonnees(), nb_jours, donnees.get('exercice') or '')
            debiter(soldes, ventilation, demande=demande, auteur=auteur, motif=motif_mvt)
            donnees = {**donnees, 'exercice': ventilation[0]['exercice']}
            cat = categorie(ventilation[0]['exercice'])
        elif type_conge == TypeConge.CS:
            soldes = verrouiller_soldes(demande.employee, auteur=auteur)
            mouvement_cs(soldes, nb_jours, nature=MouvementConge.Nature.RETRAIT_CS,
                         demande=demande, auteur=auteur, motif=motif_mvt)

        for champ in CHAMPS_VALIDATION:
            setattr(demande, champ, donnees[champ])
        if donnees.get('reference'):
            demande.reference = donnees['reference']
        demande.ventilation = ventilation
        demande.categorie_exercice = cat
        demande.statut = Statut.PRETE
        demande.date_prete = timezone.now()
        demande.traite_par = auteur
        demande.validateur_nom = auteur.full_name
        demande.save()
        return demande


# ─── Restitution commune (annulation, rejet d'un titre prêt, interruption) ──

def _rendre(demande, jours, *, nature, auteur, motif) -> list[dict]:
    """Rend `jours` à l'employé selon le type du titre. CP : vers les exercices
    débités, le plus ancien d'abord (les exercices ne bougent jamais, donc
    aucun décalage à gérer après le 1er juillet). CE : rien à rendre."""
    if demande.type_conge == TypeConge.CP:
        soldes = verrouiller_soldes(demande.employee, auteur=auteur)
        return restituer(soldes, demande.ventilation, jours, nature=nature,
                         demande=demande, auteur=auteur, motif=motif)
    if demande.type_conge == TypeConge.CS:
        soldes = verrouiller_soldes(demande.employee, auteur=auteur)
        mouvement_cs(soldes, -jours, nature=nature, demande=demande, auteur=auteur, motif=motif)
    return []


def _rendre_tout(demande, *, nature, auteur, motif) -> list[dict]:
    return _rendre(demande, demande.nb_jours, nature=nature, auteur=auteur, motif=motif)


# ─── Rejet, récupération ────────────────────────────────────────────────────

def rejeter_demande(demande, *, auteur, motif) -> DemandeConge:
    motif = _motif_obligatoire(motif, "Motif de rejet requis.")
    with transaction.atomic():
        demande = _verrouiller_demande(demande)
        if demande.statut not in (Statut.RECUE, Statut.PRETE):
            raise TransitionInvalide("Cette demande ne peut plus être rejetée.")
        if demande.statut == Statut.PRETE:
            _refuser_si_termine(demande, "rejeté")
            _rendre_tout(
                demande, nature=MouvementConge.Nature.RESTITUTION_ANNULATION, auteur=auteur,
                motif=f"Rejet du titre {demande.reference} : {motif}",
            )
        demande.statut = Statut.REJETEE
        demande.motif_rejet = motif
        demande.traite_par = auteur
        demande.save()
        return demande


def marquer_recuperee(demande, *, auteur) -> DemandeConge:
    with transaction.atomic():
        demande = _verrouiller_demande(demande)
        if demande.statut != Statut.PRETE:
            raise TransitionInvalide("Seul un titre prêt peut être marqué comme récupéré.")
        demande.statut = Statut.RECUPEREE
        demande.date_recuperee = timezone.now()
        demande.traite_par = auteur
        demande.save()
        return demande


# ─── Annulation (même après signature) ──────────────────────────────────────

def annuler_demande(demande, *, auteur, motif) -> DemandeConge:
    motif = _motif_obligatoire(motif, "Motif d'annulation requis.")
    with transaction.atomic():
        demande = _verrouiller_demande(demande)
        if demande.statut not in STATUTS_ANNULABLES:
            raise TransitionInvalide(
                "Seul un titre prêt ou récupéré peut être annulé (un titre interrompu ne l'est pas)."
            )
        _refuser_si_termine(demande, "annulé")
        _rendre_tout(
            demande, nature=MouvementConge.Nature.RESTITUTION_ANNULATION, auteur=auteur,
            motif=f"Annulation du titre {demande.reference} : {motif}",
        )
        demande.statut = Statut.ANNULEE
        demande.motif_annulation = motif
        demande.annulee_par = auteur
        demande.date_annulation = timezone.now()
        demande.save()
        return demande


# ─── Interruption (rappel de l'employé) ─────────────────────────────────────

def interrompre_demande(demande, *, auteur, date_rappel, motif) -> DemandeConge:
    motif = _motif_obligatoire(motif, "Motif d'interruption requis.")
    with transaction.atomic():
        demande = _verrouiller_demande(demande)
        if demande.statut not in STATUTS_ANNULABLES:
            raise TransitionInvalide(
                "Seul un titre prêt ou récupéré peut être interrompu, une seule fois."
            )
        _refuser_si_termine(demande, "interrompu")
        if not (demande.date_depart < date_rappel < demande.date_retour):
            raise CongeError(
                "La date de rappel doit être postérieure à la date de départ et antérieure à la date de retour."
            )
        jours_effectifs = (date_rappel - demande.date_depart).days
        a_rendre = demande.nb_jours - jours_effectifs
        if a_rendre < 1:
            raise CongeError("Aucun jour à restituer pour cette date de rappel.")

        _rendre(
            demande, a_rendre, nature=MouvementConge.Nature.RESTITUTION_INTERRUPTION, auteur=auteur,
            motif=f"Interruption du congé {demande.reference} : {motif}",
        )

        demande.statut = Statut.INTERROMPUE
        demande.date_rappel = date_rappel
        demande.jours_effectifs = jours_effectifs
        demande.motif_interruption = motif
        demande.interrompue_par = auteur
        demande.date_interruption = timezone.now()
        demande.save()
        return demande
