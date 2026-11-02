"""Validation du supérieur direct des demandes d'attestation (2026-10-29).

Un seul niveau : le chef direct du salarié (premier maillon de
conges.hierarchie.chaine_validation). Tant qu'il n'a pas validé, la demande est
au statut `visa` et les traiteurs ne peuvent ni générer l'aperçu PDF, ni la
marquer prête, ni la scanner. Un refus rejette la demande.

Sans chef direct, ou si celui-ci n'a pas de compte, ou s'il est lui-même le
demandeur (ou son intérimaire), il n'y a rien à attendre : la demande reste
`recue`. Les intérimaires actifs de l'unité valident à la place du titulaire
(accounts.interims).
"""
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounts.models import Interim
from conges.hierarchie import chaine_validation

from .models import DemandeAttestation, VisaAttestation

Statut = DemandeAttestation.Statut
Decision = VisaAttestation.Decision

MESSAGE_EN_VISA = (
    "Cette demande attend encore la validation de son supérieur direct : "
    "elle ne peut pas être traitée avant."
)


class VisaError(Exception):
    """Message destiné à l'utilisateur."""


def _habilite(visa, user) -> bool:
    if not user or not getattr(user, 'pk', None):
        return False
    return visa.compte_id == user.pk or (visa.unite_type, visa.unite_id) in set(Interim.unites_actives(user))


def q_visa_de(user, prefixe='visa__') -> Q:
    """Demandes dont la validation revient à `user` (titulaire ou intérimaire
    actif). À combiner dans un seul `filter()` avec les autres conditions."""
    q = Q(**{f'{prefixe}compte': user})
    for unite_type, unite_id in Interim.unites_actives(user):
        q |= Q(**{f'{prefixe}unite_type': unite_type, f'{prefixe}unite_id': unite_id})
    return q


def interimaires_actifs(visa):
    if not visa.unite_id:
        return []
    return [i.interimaire for i in Interim.actifs().filter(
        unite_type=visa.unite_type, unite_id=visa.unite_id).select_related('interimaire')]


def initialiser(demande, auteur):
    """Fige le supérieur direct. Passe la demande à `visa` s'il y a quelqu'un
    à attendre. Retourne le visa créé ou None."""
    maillons = chaine_validation(demande.employee)
    maillon = maillons[0] if maillons else None
    if maillon is None or maillon.compte is None:
        return None
    visa = VisaAttestation.objects.create(
        demande=demande, unite_type=maillon.unite_type, unite_id=maillon.unite_id, unite_nom=maillon.unite_nom,
        responsable_id=maillon.responsable_id, responsable_nom=maillon.responsable_nom, compte=maillon.compte,
    )
    if _habilite(visa, auteur):
        # Le chef (ou son intérimaire) saisit lui-même la demande : sa validation va de soi.
        visa.decision, visa.decide_par, visa.date_decision = Decision.VISE, auteur, timezone.now()
        visa.motif = "Demande saisie par le responsable"
        visa.save()
        return visa
    demande.statut = Statut.VISA
    demande.save(update_fields=['statut', 'updated_at'])
    return visa


def peut_viser(demande, user) -> bool:
    v = getattr(demande, 'visa', None)
    return bool(
        v is not None and demande.statut == Statut.VISA and v.decision == Decision.EN_ATTENTE and _habilite(v, user)
    )


def _verrouiller(demande):
    return DemandeAttestation.objects.select_for_update().select_related('employee').get(pk=demande.pk)


def _visa_attendu(demande, auteur):
    if demande.statut != Statut.VISA:
        raise VisaError("Cette demande n'est pas en attente de validation.")
    visa = VisaAttestation.objects.select_for_update().get(demande=demande)
    if visa.decision != Decision.EN_ATTENTE or not _habilite(visa, auteur):
        raise VisaError("Vous n'avez aucune validation à donner sur cette demande.")
    return visa


def viser(demande, *, auteur):
    with transaction.atomic():
        demande = _verrouiller(demande)
        visa = _visa_attendu(demande, auteur)
        visa.decision, visa.decide_par, visa.date_decision = Decision.VISE, auteur, timezone.now()
        if visa.compte_id != auteur.pk:
            visa.motif = f"Validé par {auteur.full_name}, intérimaire de {visa.responsable_nom}"
        visa.save()
        demande.statut = Statut.RECUE
        demande.save(update_fields=['statut', 'updated_at'])
        return demande


def refuser(demande, *, auteur, motif):
    motif = (motif or '').strip()
    if not motif:
        raise VisaError("Le motif du refus est obligatoire.")
    with transaction.atomic():
        demande = _verrouiller(demande)
        visa = _visa_attendu(demande, auteur)
        visa.decision, visa.decide_par = Decision.REFUSE, auteur
        visa.date_decision, visa.motif = timezone.now(), motif
        visa.save()
        demande.statut = Statut.REJETEE
        demande.motif_rejet = f"Refusée par {auteur.full_name} ({visa.unite_nom}) : {motif}"
        demande.save(update_fields=['statut', 'motif_rejet', 'updated_at'])
        return demande
