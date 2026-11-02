"""Intérim des responsables d'unité (2026-10-29).

Règles (décidées avec le propriétaire du projet, voir
docs/fonctionnel/conges-hierarchie.md) :
- le titulaire désigne un intérimaire dans son équipe ; son supérieur direct
  doit valider (chef de service -> chef de département -> directeur) ;
- le supérieur direct, le SUPERADMIN, ou le directeur lui-même (il n'a pas de
  supérieur) désigne avec effet immédiat ;
- l'intérimaire a une période bornée : droits calculés par date
  (`Interim.actifs`), jamais nettoyés à la main ;
- le titulaire, son supérieur direct ou le SUPERADMIN peut mettre fin à un
  intérim avant l'échéance.
"""
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from audit.models import AuditLog
from notifications.models import Notification
from notifications.service import notify

from .models import Interim, User

ROLES_INTERIMAIRE = (User.Role.GESTIONNAIRE, User.Role.CONSULTANT)
LIEN = '/interims'


class InterimError(Exception):
    """Message destiné à l'utilisateur (affiché tel quel)."""


def modeles_unites():
    from employees.models import Cellule, Departement, Direction, Section, Service
    return {
        'direction': Direction, 'departement': Departement, 'service': Service,
        'cellule': Cellule, 'section': Section,
    }


def resoudre_unite(unite_type, unite_id):
    modele = modeles_unites().get(unite_type)
    if modele is None:
        raise InterimError("Type d'unité inconnu.")
    try:
        return modele.objects.select_related('responsable').get(pk=unite_id, is_active=True)
    except (modele.DoesNotExist, ValueError, TypeError):
        raise InterimError("Unité introuvable.")


def unites_dirigees_par(user):
    """[(type, unité)] dont le compte est le responsable."""
    if not user.employee_id:
        return []
    return [
        (type_unite, unite)
        for type_unite, modele in modeles_unites().items()
        for unite in modele.objects.filter(responsable_id=user.employee_id, is_active=True)
    ]


def _responsable_de(unite):
    return getattr(unite, 'responsable', None) if unite is not None else None


def superieur_direct(unite_type, unite):
    """Employé qui valide un intérim sur `unite` : le responsable de l'échelon
    supérieur le plus proche qui en a un (None pour une direction)."""
    titulaire = _responsable_de(unite)
    if unite_type == 'direction':
        return None
    departement = unite if unite_type == 'departement' else getattr(unite, 'departement', None)
    direction = (
        unite.direction if unite_type == 'departement'
        else getattr(unite, 'direction', None) or getattr(departement, 'direction', None)
    )
    etages = [departement] if unite_type != 'departement' else []
    etages.append(direction)
    for etage in etages:
        responsable = _responsable_de(etage)
        if responsable is not None and (titulaire is None or responsable.pk != titulaire.pk):
            return responsable
    return None


def candidats(unite_type, unite):
    """Comptes actifs (GESTIONNAIRE/CONSULTANT) pouvant remplacer le titulaire :
    son équipe ; pour un département ou une direction, aussi les responsables
    des unités qui en dépendent (ex. chefs de service)."""
    from employees.models import Cellule, Departement, Employee, Section, Service
    titulaire = _responsable_de(unite)
    if unite_type == 'service':
        employes = Q(service_id=unite.pk)
    elif unite_type == 'cellule':
        employes = Q(cellule_id=unite.pk)
    elif unite_type == 'section':
        employes = Q(section_id=unite.pk)
    elif unite_type == 'departement':
        employes = Q(departement_id=unite.pk)
        chefs = [
            m.objects.filter(departement_id=unite.pk, is_active=True, responsable__isnull=False)
            .values_list('responsable_id', flat=True)
            for m in (Service, Cellule, Section)
        ]
        employes |= Q(pk__in=[pk for lot in chefs for pk in lot])
    else:  # direction
        employes = Q(direction_id=unite.pk)
        chefs = Departement.objects.filter(
            direction_id=unite.pk, is_active=True, responsable__isnull=False,
        ).values_list('responsable_id', flat=True)
        employes |= Q(pk__in=list(chefs))
    ids = Employee.objects.filter(employes).values_list('pk', flat=True)
    comptes = User.objects.filter(is_active=True, role__in=ROLES_INTERIMAIRE, employee_id__in=list(ids))
    if titulaire is not None:
        comptes = comptes.exclude(employee_id=titulaire.pk)
    return comptes.order_by('nom', 'prenom')


def role_sur_unite(user, unite_type, unite):
    """'superadmin' | 'titulaire' | 'superieur' | None."""
    if user.role == User.Role.SUPERADMIN:
        return 'superadmin'
    if not user.employee_id:
        return None
    titulaire = _responsable_de(unite)
    if titulaire is not None and titulaire.pk == user.employee_id:
        return 'titulaire'
    superieur = superieur_direct(unite_type, unite)
    if superieur is not None and superieur.pk == user.employee_id:
        return 'superieur'
    return None


def peut_gerer_interim(user):
    """Affiche l'entrée « Intérim » : SUPERADMIN ou responsable d'au moins une unité."""
    return user.role == User.Role.SUPERADMIN or bool(unites_dirigees_par(user))


def _verifier_periode(debut, fin):
    if fin < debut:
        raise InterimError("La date de fin précède la date de début.")
    if fin < timezone.localdate():
        raise InterimError("La période est déjà terminée.")


def _verifier_pas_de_chevauchement(unite_type, unite, debut, fin):
    chevauche = Interim.objects.filter(
        unite_type=unite_type, unite_id=unite.pk,
        statut__in=[Interim.Statut.EN_ATTENTE, Interim.Statut.VALIDE],
        date_debut__lte=fin, date_fin__gte=debut,
    ).exists()
    if chevauche:
        raise InterimError("Un intérim est déjà prévu ou en attente de validation sur cette période.")


def proposer(request, unite_type, unite_id, interimaire_id, debut, fin):
    """Désigne un intérimaire. Retourne l'Interim créé (en_attente ou valide)."""
    unite = resoudre_unite(unite_type, unite_id)
    auteur = request.user
    role = role_sur_unite(auteur, unite_type, unite)
    if role is None:
        raise InterimError("Vous n'êtes ni le responsable de cette unité, ni son supérieur direct.")
    titulaire = _responsable_de(unite)
    if titulaire is None:
        raise InterimError("Cette unité n'a pas de responsable à remplacer.")
    _verifier_periode(debut, fin)
    try:
        interimaire = User.objects.get(pk=interimaire_id, is_active=True, role__in=ROLES_INTERIMAIRE)
    except (User.DoesNotExist, ValueError, TypeError):
        raise InterimError("Compte intérimaire introuvable.")
    if interimaire.employee_id == titulaire.pk:
        raise InterimError("Le titulaire ne peut pas être son propre intérimaire.")
    # Le SUPERADMIN peut déroger au choix dans l'équipe ; les autres non.
    if role != 'superadmin' and not candidats(unite_type, unite).filter(pk=interimaire.pk).exists():
        raise InterimError("L'intérimaire doit appartenir à l'équipe de l'unité.")
    _verifier_pas_de_chevauchement(unite_type, unite, debut, fin)

    superieur = superieur_direct(unite_type, unite)
    # Effet immédiat : le supérieur, le SUPERADMIN, ou un titulaire sans supérieur
    # (le directeur). Sinon le supérieur direct doit valider.
    direct = role in ('superadmin', 'superieur') or superieur is None
    maintenant = timezone.now()
    with transaction.atomic():
        interim = Interim.objects.create(
            unite_type=unite_type, unite_id=unite.pk, unite_nom=unite.nom,
            titulaire=titulaire, titulaire_nom=f"{titulaire.prenom} {titulaire.nom}",
            interimaire=interimaire, date_debut=debut, date_fin=fin,
            statut=Interim.Statut.VALIDE if direct else Interim.Statut.EN_ATTENTE,
            propose_par=auteur,
            decide_par=auteur if direct else None, date_decision=maintenant if direct else None,
        )
    AuditLog.log(
        request, AuditLog.Action.PROPOSE_INTERIM, target=interimaire,
        details={'unite': f"{unite_type}:{unite.nom}", 'titulaire': titulaire.matricule,
                 'du': debut.isoformat(), 'au': fin.isoformat(), 'statut': interim.statut},
    )
    if direct:
        notify([interimaire], Notification.Type.INTERIM_DECIDE,
               f"Vous assurez l'intérim de « {unite.nom} » du {debut:%d/%m/%Y} au {fin:%d/%m/%Y}", LIEN)
        _prevenir_titulaire(interim, auteur, f"Un intérim a été désigné pour « {unite.nom} »")
    else:
        valideurs = User.objects.filter(is_active=True, employee_id=superieur.pk)
        notify(valideurs, Notification.Type.INTERIM_A_VALIDER,
               f"Intérim à valider pour « {unite.nom} »", LIEN)
    return interim


def _prevenir_titulaire(interim, auteur, message):
    if interim.titulaire_id:
        notify(User.objects.filter(is_active=True, employee_id=interim.titulaire_id).exclude(pk=auteur.pk),
               Notification.Type.INTERIM_DECIDE, message, LIEN)


def peut_decider(user, interim):
    unite = resoudre_unite(interim.unite_type, interim.unite_id)
    return role_sur_unite(user, interim.unite_type, unite) in ('superadmin', 'superieur')


def decider(request, interim, *, accepter, motif=''):
    """Le supérieur direct (ou le SUPERADMIN) valide ou refuse une désignation."""
    with transaction.atomic():
        interim = Interim.objects.select_for_update().get(pk=interim.pk)
        if interim.statut != Interim.Statut.EN_ATTENTE:
            raise InterimError("Cette désignation a déjà été traitée.")
        if not peut_decider(request.user, interim):
            raise InterimError("Seul le supérieur direct (ou le SUPERADMIN) peut valider cet intérim.")
        if accepter and interim.date_fin < timezone.localdate():
            raise InterimError("La période est déjà terminée.")
        interim.statut = Interim.Statut.VALIDE if accepter else Interim.Statut.REFUSE
        interim.decide_par, interim.date_decision = request.user, timezone.now()
        interim.motif = (motif or '').strip()
        interim.save()
    AuditLog.log(
        request, AuditLog.Action.DECIDE_INTERIM, target=interim.interimaire,
        details={'unite': f"{interim.unite_type}:{interim.unite_nom}", 'decision': interim.statut,
                 'motif': interim.motif},
    )
    texte = (f"L'intérim de « {interim.unite_nom} » a été validé" if accepter
             else f"L'intérim de « {interim.unite_nom} » a été refusé")
    destinataires = [interim.propose_par_id] if interim.propose_par_id else []
    if accepter:
        destinataires.append(interim.interimaire_id)
    notify([d for d in destinataires if d != request.user.pk], Notification.Type.INTERIM_DECIDE, texte, LIEN)
    return interim


def terminer(request, interim):
    """Fin anticipée : le titulaire reprend son poste, l'intérimaire perd ses droits."""
    with transaction.atomic():
        interim = Interim.objects.select_for_update().get(pk=interim.pk)
        if interim.statut not in (Interim.Statut.VALIDE, Interim.Statut.EN_ATTENTE):
            raise InterimError("Cet intérim est déjà clos.")
        unite = resoudre_unite(interim.unite_type, interim.unite_id)
        if role_sur_unite(request.user, interim.unite_type, unite) is None:
            raise InterimError("Vous ne pouvez pas mettre fin à cet intérim.")
        interim.statut = Interim.Statut.TERMINE
        interim.decide_par, interim.date_decision = request.user, timezone.now()
        interim.save()
    AuditLog.log(
        request, AuditLog.Action.FIN_INTERIM, target=interim.interimaire,
        details={'unite': f"{interim.unite_type}:{interim.unite_nom}"},
    )
    notify([interim.interimaire_id], Notification.Type.INTERIM_DECIDE,
           f"L'intérim de « {interim.unite_nom} » est terminé", LIEN)
    return interim


def interims_visibles(user):
    """Intérims que `user` peut consulter : les siens comme intérimaire, ceux de
    ses unités et ceux qu'il doit valider ; le SUPERADMIN voit tout."""
    # SUPERADMIN : tout, avec les droits d'action ; ADMIN : tout, en lecture seule
    # (contrôle) — `role_sur_unite` ne leur donne aucun droit sur une unité.
    if user.role in (User.Role.SUPERADMIN, User.Role.ADMIN):
        return Interim.objects.all()
    filtre = Q(interimaire=user)
    if user.employee_id:
        filtre |= Q(titulaire_id=user.employee_id)
        # Supérieur direct : se calcule unité par unité (pas de champ stocké).
        ids = [
            i.pk for i in Interim.objects.exclude(Q(interimaire=user) | Q(titulaire_id=user.employee_id))
            if _est_superieur(user, i)
        ]
        filtre |= Q(pk__in=ids)
    return Interim.objects.filter(filtre)


def _est_superieur(user, interim):
    try:
        unite = resoudre_unite(interim.unite_type, interim.unite_id)
    except InterimError:
        return False
    return role_sur_unite(user, interim.unite_type, unite) == 'superieur'
