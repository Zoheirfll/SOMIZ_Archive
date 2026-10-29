"""Visa hiérarchique des demandes de congé (2026-10-28).

Spec : docs/fonctionnel/conges-hierarchie.md. À la création, la chaîne
(conges.hierarchie) est figée en lignes VisaConge. Un niveau supérieur peut
viser sans attendre le niveau inférieur (chef absent) ; l'inverse est
impossible. Un refus, à n'importe quelle étape, rejette la demande.
"""
from django.db import transaction
from django.utils import timezone

from .hierarchie import chaine_validation
from .models import DemandeConge, VisaConge
from .services import CongeError, TransitionInvalide

Statut = DemandeConge.Statut
Decision = VisaConge.Decision


def initialiser_chaine(demande) -> list[VisaConge]:
    """Fige la chaîne. Sans maillon, la demande reste `recue` (comportement
    historique). Sinon elle passe à `visa`."""
    maillons = chaine_validation(demande.employee)
    if not maillons:
        return []
    visas = [
        VisaConge(
            demande=demande, niveau=m.niveau, unite_type=m.unite_type, unite_nom=m.unite_nom,
            responsable_id=m.responsable_id, responsable_nom=m.responsable_nom, compte=m.compte,
        )
        for m in maillons
    ]
    VisaConge.objects.bulk_create(visas)
    demande.statut = Statut.VISA
    demande.save(update_fields=['statut', 'updated_at'])
    return visas


def niveau_de(visas, user):
    """Plus haut niveau que `user` occupe dans cette chaîne (None sinon)."""
    niveaux = [v.niveau for v in visas if v.compte_id == user.id]
    return max(niveaux) if niveaux else None


def _a_traiter(visas, user):
    """Maillons en attente que `user` peut décider : le sien et tous ceux en
    dessous (délégation vers le haut uniquement)."""
    niveau = niveau_de(visas, user)
    if niveau is None:
        return []
    return [v for v in visas if v.decision == Decision.EN_ATTENTE and v.niveau <= niveau]


def peut_viser(demande, user) -> bool:
    if demande.statut != Statut.VISA:
        return False
    return bool(_a_traiter(list(demande.visas.all()), user))


def _verrouiller(demande):
    return DemandeConge.objects.select_for_update().select_related('employee').get(pk=demande.pk)


def viser(demande, *, auteur) -> DemandeConge:
    """Vise au plus haut niveau de `auteur` ; solde les niveaux inférieurs en
    attente. Si plus aucun maillon n'est en attente, la demande passe à `recue`."""
    with transaction.atomic():
        demande = _verrouiller(demande)
        if demande.statut != Statut.VISA:
            raise TransitionInvalide("Cette demande n'est pas en attente de visa.")
        visas = list(demande.visas.select_for_update())
        a_traiter = _a_traiter(visas, auteur)
        if not a_traiter:
            raise CongeError("Vous n'avez aucun visa à donner sur cette demande.")
        maintenant = timezone.now()
        for v in a_traiter:
            propre = v.compte_id == auteur.id
            v.decision = Decision.VISE if propre else Decision.VISE_PAR_SUPERIEUR
            v.decide_par, v.date_decision = auteur, maintenant
            if not propre:
                v.motif = f"Visé par {auteur.full_name} en raison de l'absence de {v.responsable_nom}"
            v.save()
        if not any(v.decision == Decision.EN_ATTENTE for v in visas):
            demande.statut = Statut.RECUE
            demande.save(update_fields=['statut', 'updated_at'])
        return demande


def refuser(demande, *, auteur, motif) -> DemandeConge:
    motif = (motif or '').strip()
    if not motif:
        raise CongeError("Le motif du refus est obligatoire.")
    with transaction.atomic():
        demande = _verrouiller(demande)
        if demande.statut != Statut.VISA:
            raise TransitionInvalide("Cette demande n'est pas en attente de visa.")
        visas = list(demande.visas.select_for_update())
        a_traiter = _a_traiter(visas, auteur)
        if not a_traiter:
            raise CongeError("Vous n'avez aucun visa à refuser sur cette demande.")
        propre = next((v for v in a_traiter if v.compte_id == auteur.id), a_traiter[-1])
        propre.decision, propre.decide_par = Decision.REFUSE, auteur
        propre.date_decision, propre.motif = timezone.now(), motif
        propre.save()
        demande.statut = Statut.REJETEE
        demande.motif_rejet = f"Refusée par {auteur.full_name} ({propre.unite_nom}) : {motif}"
        demande.traite_par = auteur
        demande.save(update_fields=['statut', 'motif_rejet', 'traite_par', 'updated_at'])
        return demande
