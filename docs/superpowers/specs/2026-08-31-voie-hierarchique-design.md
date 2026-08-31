# Voie hiérarchique (responsables par unité) — design

Date : 2026-08-31

## Objectif

Permettre de désigner un responsable pour chaque unité organisationnelle
(Direction, Pôle, Département, Service, Cellule, Section) et afficher, pour
chaque employé, sa chaîne hiérarchique complète (de son unité directe
jusqu'à la Direction), ainsi que le responsable de chaque nœud dans
l'organigramme.

## 1. Modèle de données

Un champ `responsable` est ajouté à chacun des 6 modèles référentiels
(`backend/employees/models.py`) :

```python
responsable = models.ForeignKey(
    "Employee", on_delete=models.SET_NULL, null=True, blank=True,
    related_name="+", verbose_name="Responsable",
)
```

- `related_name="+"` : pas besoin d'accès inverse (`employee.directions_dirigees`
  etc.) pour l'instant — YAGNI.
- Aucune contrainte d'appartenance : le responsable peut être n'importe quel
  employé actif du système, y compris un employé qui n'appartient pas à
  l'unité (couvre les intérims/nominations exceptionnelles).
- Libellé du rôle selon le niveau (constante `ROLE_LABEL` réutilisée
  backend et frontend) :
  - `Direction` → **Directeur**
  - `Pole` → **Directeur**
  - `Departement` → **Chef de département**
  - `Service` → **Chef de service**
  - `Cellule` → **Chef de cellule**
  - `Section` → **Chef de section**

Migration Django standard (`makemigrations`/`migrate`), un champ par modèle,
tous nullable — aucun backfill nécessaire.

## 2. Résolution de la chaîne hiérarchique

Une méthode `Employee.voie_hierarchique()` (dans `backend/employees/models.py`)
construit la liste ordonnée des niveaux hiérarchiques au-dessus de l'unité de
rattachement direct de l'employé, jusqu'à la Direction incluse :

- Employé de **Service** : `[Service, Departement, Pole?, Direction]`
  (Pôle inclus seulement si `departement.pole` est renseigné).
- Employé de **Cellule/Section rattachée à un Département** : même chaîne
  que ci-dessus, en remplaçant le premier niveau par la Cellule/Section.
- Employé de **Cellule/Section rattachée directement à une Direction** :
  `[Cellule/Section, Direction]`.
- Employé sans unité de rattachement (`service`, `cellule`, `section` tous
  vides) : chaîne vide.

Pour chaque niveau de la chaîne :
- Si `responsable` n'est pas renseigné sur ce niveau : le niveau est omis
  du résultat (pas de placeholder "Non défini").
- Si `responsable_id == employee.id` (l'employé est lui-même le responsable
  de ce niveau) : le niveau est omis (confirmé — on ne veut pas qu'un chef
  de service se voie comme son propre supérieur).

Retourne une liste de dicts :
```python
[{"role": "Chef de département", "employee_id": "...", "nom": "...",
  "prenom": "...", "matricule": "...", "has_photo": True}, ...]
```

Réutilise le pattern déjà en place pour `dossier_complet`/`taux_completude`
(logique métier centralisée sur le modèle, pas dans les vues/serializers).

## 3. API référentiels

Chaque serializer référentiel (`backend/employees/referentiel_views.py` :
`DirectionSerializer`, `PoleSerializer`, `DepartementSerializer`,
`ServiceSerializer`, `CelluleSerializer`, `SectionSerializer`) gagne :
- `responsable` (UUID, writable) — même règle d'écriture que le reste du
  référentiel (ADMIN only, déjà appliqué au niveau vue).
- `responsable_nom` (`SerializerMethodField`, readonly) — `"Prénom Nom"` ou
  `None`, même pattern que les `direction_nom`/`departement_nom` déjà
  présents dans ce fichier.

`EmployeeDetailSerializer` (`backend/employees/serializers.py`) gagne
`voie_hierarchique` (`SerializerMethodField`, readonly) — appelle
`obj.voie_hierarchique()` et sérialise la liste telle quelle (déjà sous
forme de primitives JSON-compatibles).

## 4. UI — assignation (`/parametres`)

Dans le formulaire d'édition de chaque référentiel concerné (`Parametres.jsx`),
un champ "Responsable" utilisant une recherche serveur par nom/matricule
(même pattern que la recherche de grant ponctuel dans `Users.jsx` —
debounce + appel à `employee_search`), pas un `<select>` listant tous les
employés. Le champ affiche le nom actuellement sélectionné avec un bouton
pour le retirer (repasser à vide).

## 5. UI — affichage

- **Fiche employé** (`EmployeeDetail.jsx`) : nouvelle section "Voie
  hiérarchique" sous le panneau "Informations", listant chaque niveau
  (rôle en libellé discret + nom, avatar via `EmployeeAvatar` si le
  responsable a une photo). Section absente si la chaîne est vide (aucun
  niveau avec responsable renseigné).
- **Organigramme** (`Organigramme.jsx`) : dans `OrgCard`, une ligne
  discrète sous le compteur d'enfants (`{childCount} {CHILD_LABEL[level]}`)
  affichant `"{rôle} : {nom}"` (ex. "Directeur : Karim Benali"),
  affichée uniquement si `responsable_nom` est renseigné pour ce nœud.

## Hors scope

- Pas de notification à l'employé désigné responsable.
- Pas d'historique dédié des changements de responsable — l'audit log
  générique déjà en place sur les mutations `MODIFY_*` des référentiels
  couvre déjà ce changement de champ comme n'importe quel autre.
- Pas d'accès inverse `employee.unites_dirigees` — non nécessaire pour ce
  chantier (YAGNI, `related_name="+"`).
- Pas de contrainte d'appartenance organisationnelle sur le choix du
  responsable (décision explicite).
