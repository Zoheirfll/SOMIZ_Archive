"""Chaîne de validation hiérarchique d'une demande de congé (2026-10-28).

Chef direct (section / cellule / service) -> chef de département -> directeur.
Voir docs/fonctionnel/conges-hierarchie.md. Fonction pure : ne modifie rien.

Règles :
- un maillon sans responsable (vacant) est sauté ;
- l'employé n'est jamais son propre valideur (le congé d'un chef monte
  directement à son supérieur) ;
- une même personne qui tient plusieurs maillons ne signe qu'une fois, au
  niveau le plus haut (son visa solde alors les niveaux inférieurs) ;
- le Pôle est ignoré.
"""
from dataclasses import dataclass
from typing import Optional

NIVEAU_DIRECT = 1
NIVEAU_DEPARTEMENT = 2
NIVEAU_DIRECTION = 3

LIBELLES = {
    NIVEAU_DIRECT: "Chef direct",
    NIVEAU_DEPARTEMENT: "Chef de département",
    NIVEAU_DIRECTION: "Directeur",
}


@dataclass(frozen=True)
class Maillon:
    niveau: int
    unite_type: str          # section | cellule | service | departement | direction
    unite_nom: str
    responsable_id: object   # Employee.pk
    responsable_nom: str
    compte: Optional[object]  # User lié au responsable, ou None (« sans compte »)

    @property
    def libelle(self):
        return LIBELLES[self.niveau]


def _compte_de(employee):
    # `user_account` est le related_name de User.employee (OneToOne).
    return getattr(employee, 'user_account', None)


def _maillon(niveau, unite_type, unite, employee):
    responsable = getattr(unite, 'responsable', None) if unite is not None else None
    if responsable is None or responsable.pk == employee.pk:
        return None
    return Maillon(
        niveau=niveau, unite_type=unite_type, unite_nom=unite.nom,
        responsable_id=responsable.pk,
        responsable_nom=f"{responsable.prenom} {responsable.nom}",
        compte=_compte_de(responsable),
    )


def chaine_validation(employee) -> list[Maillon]:
    """Maillons à viser, du plus bas au plus haut."""
    section, cellule, service = employee.section, employee.cellule, employee.service
    # Département et direction : celui de la fiche, sinon déduit de l'unité
    # (cellules/sections peuvent dépendre directement d'une Direction).
    departement = employee.departement
    for unite in (service, cellule, section):
        if departement is None and unite is not None:
            departement = getattr(unite, 'departement', None)
    direction = employee.direction
    for unite in (departement, cellule, section):
        if direction is None and unite is not None:
            direction = getattr(unite, 'direction', None)

    # Chef direct : l'unité terminale la plus basse qui a un responsable.
    direct = None
    for type_unite, unite in (('section', section), ('cellule', cellule), ('service', service)):
        direct = _maillon(NIVEAU_DIRECT, type_unite, unite, employee)
        if direct:
            break

    candidats = [
        direct,
        _maillon(NIVEAU_DEPARTEMENT, 'departement', departement, employee),
        _maillon(NIVEAU_DIRECTION, 'direction', direction, employee),
    ]
    # Une personne = un visa, au niveau le plus haut qu'elle occupe.
    dernier_niveau = {}
    for m in candidats:
        if m:
            dernier_niveau[m.responsable_id] = m.niveau
    return [m for m in candidats if m and dernier_niveau[m.responsable_id] == m.niveau]
