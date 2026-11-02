"""Visa hiérarchique des demandes de congé (2026-10-28).

Spec : docs/fonctionnel/conges-hierarchie.md. À la création, la chaîne
(conges.hierarchie) est figée en lignes VisaConge. Un niveau supérieur peut
viser sans attendre le niveau inférieur (chef absent) ; l'inverse est
impossible. Un refus, à n'importe quelle étape, rejette la demande.
"""
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounts.models import Interim

from .hierarchie import chaine_validation
from .models import DemandeConge, VisaConge
from .services import CongeError, TransitionInvalide

Statut = DemandeConge.Statut
Decision = VisaConge.Decision


def initialiser_chaine(demande) -> list[VisaConge]:
    """Fige la chaîne et passe la demande à `visa`. Sans maillon (aucun
    supérieur désigné), elle reste **bloquée** à `visa` sans ligne de visa
    (2026-10-31 : personne n'accorde à la place de la hiérarchie) — voir
    `sans_superieur` et `relancer_demandes_sans_chaine`."""
    maillons = chaine_validation(demande.employee)
    if not maillons:
        if demande.statut != Statut.VISA:
            demande.statut = Statut.VISA
            demande.save(update_fields=['statut', 'updated_at'])
        return []
    visas = [
        VisaConge(
            demande=demande, niveau=m.niveau, unite_type=m.unite_type, unite_id=m.unite_id,
            unite_nom=m.unite_nom,
            responsable_id=m.responsable_id, responsable_nom=m.responsable_nom, compte=m.compte,
        )
        for m in maillons
    ]
    VisaConge.objects.bulk_create(visas)
    demande.statut = Statut.VISA
    demande.save(update_fields=['statut', 'updated_at'])
    return visas


def sans_superieur(demande) -> bool:
    """Demande bloquée : en attente d'accord mais aucune chaîne (aucun
    responsable désigné au-dessus de l'employé)."""
    return demande.statut == Statut.VISA and not demande.visas.exists()


def relancer_demandes_sans_chaine() -> list[DemandeConge]:
    """Recalcule la chaîne des demandes bloquées faute de supérieur (après la
    désignation d'un responsable dans l'organigramme). Renvoie celles qui ont
    désormais une chaîne (à notifier)."""
    relancees = []
    for demande in (DemandeConge.objects.filter(statut=Statut.VISA, is_active=True, visas__isnull=True)
                    .select_related('employee')):
        with transaction.atomic():
            if initialiser_chaine(demande):
                relancees.append(demande)
    return relancees


def _habilite(visa, user, unites_interim) -> bool:
    """`user` est le compte du maillon, ou intérimaire actif de son unité."""
    return visa.compte_id == user.id or (visa.unite_type, visa.unite_id) in unites_interim


def q_visas_de(user, prefixe='visas__') -> Q:
    """Filtre des demandes dont un visa revient à `user` (titulaire ou
    intérimaire actif). À combiner dans UN seul `filter()` avec les autres
    conditions sur `visas__` pour qu'elles portent sur la même ligne."""
    q = Q(**{f'{prefixe}compte': user})
    for unite_type, unite_id in Interim.unites_actives(user):
        q |= Q(**{f'{prefixe}unite_type': unite_type, f'{prefixe}unite_id': unite_id})
    return q


def interimaires_actifs(visa):
    """Comptes qui assurent aujourd'hui l'intérim de l'unité de ce visa."""
    if not visa.unite_id:
        return []
    return [i.interimaire for i in Interim.actifs().filter(
        unite_type=visa.unite_type, unite_id=visa.unite_id).select_related('interimaire')]


def niveau_de(visas, user):
    """Plus haut niveau que `user` occupe dans cette chaîne (None sinon)."""
    unites = set(Interim.unites_actives(user))
    niveaux = [v.niveau for v in visas if _habilite(v, user, unites)]
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


def possibilites(demande, user):
    """(propres, remplacables) : maillons en attente que `user` peut viser **à
    son propre titre** (titulaire ou intérimaire), et maillons en attente d'un
    niveau inférieur qu'il peut viser **à la place** d'un responsable absent."""
    if demande.statut != Statut.VISA:
        return [], []
    visas = list(demande.visas.all())
    unites = set(Interim.unites_actives(user))
    a_traiter = _a_traiter(visas, user)
    propres = [v for v in a_traiter if _habilite(v, user, unites)]
    return propres, [v for v in a_traiter if v not in propres]


def viser(demande, *, auteur, niveau=None) -> DemandeConge:
    """Vise **un seul** niveau (2026-10-29) : le sien par défaut, ou, avec
    `niveau`, celui d'un responsable inférieur absent (visa « à la place de »,
    jamais automatique). Si plus aucun maillon n'est en attente, la demande
    passe à `recue`."""
    with transaction.atomic():
        demande = _verrouiller(demande)
        if demande.statut != Statut.VISA:
            raise TransitionInvalide("Cette demande n'est pas en attente de validation.")
        visas = list(demande.visas.select_for_update())
        a_traiter = _a_traiter(visas, auteur)
        if not a_traiter:
            raise CongeError("Vous n'avez aucune validation à donner sur cette demande.")
        maintenant = timezone.now()
        unites = set(Interim.unites_actives(auteur))
        if niveau is None:
            cibles = [v for v in a_traiter if _habilite(v, auteur, unites)]
            if not cibles:
                raise CongeError(
                    "Votre validation est déjà donnée. En cas d'absence d'un responsable en dessous de vous, "
                    "validez explicitement à sa place."
                )
        else:
            cibles = [v for v in a_traiter if v.niveau == niveau]
            if not cibles:
                raise CongeError("Ce niveau n'est pas en attente de validation, ou vous ne pouvez pas valider à sa place.")
        for v in cibles:
            titulaire = v.compte_id == auteur.id
            interimaire = not titulaire and (v.unite_type, v.unite_id) in unites
            v.decision = Decision.VISE if (titulaire or interimaire) else Decision.VISE_PAR_SUPERIEUR
            v.decide_par, v.date_decision = auteur, maintenant
            if interimaire:
                v.motif = f"Validé par {auteur.full_name}, intérimaire de {v.responsable_nom}"
            elif not titulaire:
                v.motif = f"Validé par {auteur.full_name} en raison de l'absence de {v.responsable_nom}"
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
            raise TransitionInvalide("Cette demande n'est pas en attente de validation.")
        visas = list(demande.visas.select_for_update())
        a_traiter = _a_traiter(visas, auteur)
        if not a_traiter:
            raise CongeError("Vous n'avez aucune validation à refuser sur cette demande.")
        unites = set(Interim.unites_actives(auteur))
        propre = next((v for v in a_traiter if _habilite(v, auteur, unites)), a_traiter[-1])
        propre.decision, propre.decide_par = Decision.REFUSE, auteur
        propre.date_decision, propre.motif = timezone.now(), motif
        propre.save()
        demande.statut = Statut.REJETEE
        demande.motif_rejet = f"Refusée par {auteur.full_name} ({propre.unite_nom}) : {motif}"
        demande.traite_par = auteur
        demande.save(update_fields=['statut', 'motif_rejet', 'traite_par', 'updated_at'])
        return demande
