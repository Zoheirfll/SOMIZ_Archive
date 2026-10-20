# Complétude des dossiers par type de contrat — spec à valider (2026-10-19)

**Statut : NON IMPLÉMENTÉ — en attente de validation.** Choix de principe déjà fait (2026-10-19) :
pièces obligatoires **par type de contrat**. Cette spec précise l'extension, car l'existant est plus
avancé que prévu.

## Existant (ne pas redévelopper)

- `TypeDocument.obligatoire` (booléen **global**) + types feuilles actifs. `Employee.dossier_complet`,
  `taux_completude` (modèle), `nb_types_obligatoires_presents` (annotation SQL de la liste), filtres
  `?dossier_complet=`, `?type_manquant=`, radars par direction/département, dashboard.
- `TypeContrat` (CDI, CDD…) existe, `Employee.type_contrat` et `Contrat.type_contrat` aussi.

## Problème

Un CDD n'exige pas les mêmes pièces qu'un CDI : la liste globale surévalue l'incomplétude de l'un ou
sous-évalue celle de l'autre.

## Proposition (additive, rétrocompatible)

- Nouveau M2M `TypeDocument.obligatoire_pour` → `TypeContrat` (vide par défaut).
- **Règle** : un type est requis pour un employé si `obligatoire=True` (comme aujourd'hui, pour tous)
  **ou** si le `type_contrat` de l'employé figure dans `obligatoire_pour`. Aucune donnée existante ne
  change de sens tant que le M2M est vide.
- Type de contrat pris en compte : `Employee.type_contrat` (à confirmer : est-il synchronisé avec le
  dernier contrat dans `sync_statut_from_dernier_contrat` ?).
- Édition dans /parametres > Types de documents : champ « Obligatoire pour les contrats : … ».

## Impact (pourquoi c'est structurant)

Le calcul est dupliqué à **7 endroits** : `Employee.dossier_complet`/`taux_completude`,
`EmployeeListCreateView` (annotation + filtres), `EmployeeListSerializer`, `AdminStatsView`,
`audit/stats.py` (`_employes_complets`, `_completude_par`, `_indicateurs`). Avant d'y toucher il faut
**centraliser** en une fonction `types_requis(employee_ou_queryset)` — sinon les chiffres du dashboard, de
la liste et des statistiques divergeront. Le total requis varie désormais par employé (plus un total
global unique) : annotation par `Case/When` ou sous-requête corrélée.

## Décisions à prendre

1. Employé **sans** type de contrat : seuls les types `obligatoire=True` s'appliquent ? (proposé : oui)
2. Migration de l'existant : décocher l'actuel `obligatoire` global d'un type et le rattacher aux seuls
   CDI ? (proposé : non, action manuelle dans /parametres)
3. Audit : tracer la modification de `obligatoire_pour` comme les autres changements de référentiel ?
   (proposé : oui, `MODIFY_REF`)

## Plan (si validé)

1. Centraliser le calcul (refactor sans changement de comportement, tests existants verts).
2. Migration + M2M + serializer/référentiel + UI /parametres.
3. Brancher `types_requis` aux 7 endroits ; tests de parité et de non-N+1.
4. Documenter (`employes.md`, `statistiques-audit.md`) ; `securite.md` non concerné.
