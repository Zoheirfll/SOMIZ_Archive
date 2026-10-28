"""Propositions de compte pour les responsables d'unité (2026-10-28).

Désigner un employé sans compte comme `responsable` d'une unité crée une
PropositionCompte « en attente » ; seul un ADMIN la transforme en compte réel
(valider_proposition). Voir docs/fonctionnel/conges-hierarchie.md.
"""
import re
import secrets
import string
import unicodedata

from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone

from audit.models import AuditLog

from .models import PropositionCompte, User

ROLES_AUTORISES = (User.Role.GESTIONNAIRE, User.Role.CONSULTANT)

# Champ du modèle d'unité (clé : nom de classe) -> libellé affiché.
UNITES = {
    'Direction': 'direction', 'Departement': 'departement', 'Service': 'service',
    'Cellule': 'cellule', 'Section': 'section',
}


class PropositionError(Exception):
    """Message destiné à l'ADMIN (affiché tel quel)."""


def proposer_compte(request, employee, unite, *, source='designation'):
    """Crée une proposition si l'employé n'a ni compte ni proposition ouverte.
    Retourne la proposition créée, sinon None (rien à faire)."""
    if employee is None or unite.__class__.__name__ not in UNITES:
        return None
    if User.objects.filter(employee=employee).exists():
        return None
    if PropositionCompte.objects.filter(employee=employee, statut=PropositionCompte.Statut.EN_ATTENTE).exists():
        return None
    proposition = PropositionCompte.objects.create(
        employee=employee, unite_type=UNITES[unite.__class__.__name__], unite_id=unite.pk,
        unite_nom=getattr(unite, 'nom', str(unite)), source=source,
        propose_par=request.user if getattr(request.user, 'is_authenticated', False) else None,
    )
    AuditLog.log(
        request, AuditLog.Action.PROPOSE_COMPTE, target=proposition,
        details={'employee': employee.matricule, 'unite': f"{proposition.unite_type}:{proposition.unite_nom}",
                 'source': source},
    )
    return proposition


def _sans_accent(texte):
    return unicodedata.normalize('NFKD', texte).encode('ascii', 'ignore').decode()


def generer_username(employee):
    """prenom.nom en minuscules sans accents ; suffixe numérique si homonyme.
    Respecte max_length=50 de User.username."""
    base = re.sub(r'[^a-z0-9.]+', '', f"{_sans_accent(employee.prenom)}.{_sans_accent(employee.nom)}".lower().replace(' ', ''))
    base = (base or employee.matricule.lower())[:45]
    candidat, n = base, 1
    while User.objects.filter(username__iexact=candidat).exists():
        n += 1
        candidat = f"{base}{n}"
    return candidat


def generer_mot_de_passe(longueur=14):
    alphabet = string.ascii_letters + string.digits + '!@#$%*-_'
    while True:
        mdp = ''.join(secrets.choice(alphabet) for _ in range(longueur))
        try:
            validate_password(mdp)
        except Exception:
            continue
        return mdp


def valider_proposition(request, proposition, *, role):
    """Crée le compte. Retourne (user, mot_de_passe_temporaire) ; le mot de
    passe n'est jamais stocké en clair ni relisible ensuite."""
    if role not in ROLES_AUTORISES:
        raise PropositionError("Rôle invalide : GESTIONNAIRE ou CONSULTANT uniquement.")
    with transaction.atomic():
        proposition = PropositionCompte.objects.select_for_update().select_related('employee').get(pk=proposition.pk)
        if proposition.statut != PropositionCompte.Statut.EN_ATTENTE:
            raise PropositionError("Cette proposition a déjà été traitée.")
        employee = proposition.employee
        if User.objects.filter(employee=employee).exists():
            raise PropositionError("Cet employé possède déjà un compte.")
        mot_de_passe = generer_mot_de_passe()
        user = User.objects.create_user(
            username=generer_username(employee), password=mot_de_passe, role=role,
            nom=employee.nom, prenom=employee.prenom, employee=employee,
            peut_demander_conge=True, must_change_password=True,
            created_by=request.user,
        )
        proposition.statut = PropositionCompte.Statut.VALIDEE
        proposition.decide_par = request.user
        proposition.date_decision = timezone.now()
        proposition.role_attribue = role
        proposition.compte_cree = user
        proposition.save()
    AuditLog.log(
        request, AuditLog.Action.VALIDER_COMPTE, target=user,
        details={'proposition': str(proposition.pk), 'role': role, 'username': user.username,
                 'unite': f"{proposition.unite_type}:{proposition.unite_nom}"},
    )
    return user, mot_de_passe


def refuser_proposition(request, proposition, *, motif=''):
    with transaction.atomic():
        proposition = PropositionCompte.objects.select_for_update().get(pk=proposition.pk)
        if proposition.statut != PropositionCompte.Statut.EN_ATTENTE:
            raise PropositionError("Cette proposition a déjà été traitée.")
        proposition.statut = PropositionCompte.Statut.REFUSEE
        proposition.decide_par = request.user
        proposition.date_decision = timezone.now()
        proposition.motif_refus = (motif or '').strip()
        proposition.save()
    AuditLog.log(
        request, AuditLog.Action.REFUSER_COMPTE, target=proposition,
        details={'employee': proposition.employee.matricule, 'motif': proposition.motif_refus},
    )
    return proposition
