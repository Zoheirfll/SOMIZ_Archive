# Auto-création des référentiels à l'import + fusion manuelle — Design

Date : 2026-09-17

## Contexte / problème

Aujourd'hui, quand une valeur texte d'un fichier importé (ex. colonne
`departement` = "Personnel") ne correspond à aucune entrée existante d'un
référentiel (ex. le référentiel a "Personnal", faute de frappe historique),
la résolution échoue silencieusement : le champ reste vide sur l'employé
créé (`EmployeeImportView`), ou la ligne est bloquée avec une erreur
(`ReferentielImportView`, cas de désambiguïsation de parent homonyme).
L'utilisateur doit ensuite corriger le fichier ou l'employé à la main.

Deux besoins :
1. Ne plus perdre l'information : créer automatiquement le référentiel
   manquant plutôt que de laisser le champ vide, dans les cas non ambigus.
2. Pouvoir corriger a posteriori les doublons ainsi créés (ex. "Personnal"
   et "Personnel" qui désignent la même chose) via une fusion manuelle
   dans `/parametres`, sans devoir réassigner les employés un par un.

## Périmètre

**Auto-création à l'import** — s'applique aux deux imports existants qui
résolvent des colonnes texte vers des référentiels :
- `EmployeeImportView` (`backend/employees/import_views.py`) — colonnes
  `direction`, `departement`, `service`, `poste`, `type_contrat`,
  `categorie`.
- `ReferentielImportView` — colonnes parent (`direction` pour Pôle/
  Département, `direction`/`departement` pour Service/Cellule/Section).

**Fusion manuelle** — tous les référentiels avec un onglet CRUD dans
`/parametres` : Direction, Pôle, Département, Service, Cellule, Section,
Poste, TypeContrat, Categorie, Echelle, MotifArchivage. Explicitement hors
scope : `TypeDocument` (hiérarchie catégorie/sous-type déjà spécifique,
gérée séparément) et `ChampPersonnalise`.

## Partie 1 — Auto-création à l'import

### Règle de résolution (remplace la résolution actuelle par nom exact)

Pour toute colonne texte à résoudre vers un référentiel :

1. **Correspondance exacte** (insensible à la casse, comportement actuel
   inchangé) → utilisée telle quelle.
2. **Aucune correspondance, parent non ambigu** → création automatique de
   l'entrée manquante, rattachée à son parent, puis utilisée. "Non
   ambigu" veut dire : soit le référentiel n'a pas de parent obligatoire
   (Direction, Poste, TypeContrat, Categorie, Echelle, MotifArchivage),
   soit son parent est lui-même résolu sans conflit (voir cascade
   ci-dessous).
3. **Aucune correspondance, parent ambigu ou manquant** → la ligne échoue
   avec une erreur explicite (comportement actuel de
   `resoudre_departement` étendu à tous les cas hiérarchiques), les
   autres lignes du fichier continuent d'être traitées normalement.

### Cascade sur les parents manquants

Si le parent nécessaire à la création (ex. Département pour un Service)
n'existe pas non plus mais est **non ambigu** (référencé par un nom qui
ne correspond à aucune entrée existante, avec son propre parent résolu
sans conflit), il est lui aussi créé automatiquement, récursivement
jusqu'à la racine de la hiérarchie (Direction n'a pas de parent).
Exemple : import de Services avec `departement=Comptabilité` (n'existe
nulle part) et `direction=Direction Générale` (résolue sans ambiguïté) →
le Département "Comptabilité" est créé sous "Direction Générale", puis
le Service est créé sous ce Département.

La désambiguïsation de parent homonyme existante (`resoudre_departement`)
reste inchangée : si le nom du parent correspond à plusieurs entrées
existantes (départements de même nom dans des directions différentes)
sans colonne permettant de trancher, la ligne échoue — l'auto-création ne
s'applique jamais pour lever une ambiguïté, seulement pour combler une
absence.

### Cas particuliers par référentiel

- **Cellule / Section** : rattachées à exactement une Direction OU un
  Département (jamais les deux) — la même colonne `direction` sert de
  parent direct si `departement` est vide, ou de désambiguïsation du
  département sinon (logique déjà existante dans
  `ReferentielImportView`, inchangée). L'auto-création crée la Cellule/
  Section sous le parent ainsi déterminé.
- **Service** : parent Département obligatoire — pas de création d'un
  Service "orphelin".
- **Direction, Pôle, Poste, TypeContrat, Categorie, Echelle,
  MotifArchivage** : pas de parent obligatoire (Pôle a Direction comme
  parent mais suit la même règle de cascade que Département) →
  auto-création directe dès qu'aucune correspondance exacte n'existe.

### Traçabilité

Chaque création automatique déclenchée pendant un import est consignée
dans le détail de l'entrée d'audit existante pour cet import (pas de
nouveau type d'action) : `details.referentiels_crees` = liste de
`{type, nom, parent}` (ex. `{"type": "departement", "nom":
"Comptabilité", "parent": "Direction Générale"}`), pour qu'un admin qui
consulte `/audit` après un import comprenne immédiatement ce qui a été
créé automatiquement en plus des employés/lignes importées.

### Non-régression

- Le comportement pour une correspondance exacte est strictement
  inchangé.
- Les erreurs de désambiguïsation déjà couvertes par les tests existants
  (`resoudre_departement`, doublons homonymes) restent des erreurs —
  seule l'absence pure et simple (aucune correspondance, aucune
  ambiguïté) change de comportement (création au lieu de champ vide/
  erreur).
- Import de référentiels via `ReferentielImportView` : les validations
  déjà en place (`unique_together` implicite, colonnes obligatoires,
  détection de doublons scopés au parent) restent appliquées à l'entrée
  nouvellement créée comme à toute création manuelle.

## Partie 2 — Fusion manuelle dans `/parametres`

### UI

Dans chaque onglet concerné de `/parametres` (`Parametres.jsx`), les
cases à cocher déjà utilisées pour la suppression en masse servent aussi
à la fusion :
- Nouveau bouton "Fusionner la sélection (N)" à côté du bouton rouge de
  suppression, actif dès que **2 lignes ou plus** sont cochées.
- Ouvre une modale listant les entrées sélectionnées, chacune avec un
  radio pour désigner la **cible** (l'entrée qui survit ; les autres
  seront supprimées et leurs références réassignées vers elle).
- Avant validation, récapitulatif explicite : "X élément(s) seront
  réaffectés de 'Personnal' vers 'Personnel'" (et un élément par source
  fusionnée s'il y en a plusieurs), avec confirmation renforcée
  (`useConfirm()`), cohérent avec les autres actions irréversibles du
  projet (suppression en masse, suppression définitive d'employé).
- Après fusion réussie : rafraîchissement de l'onglet (`fetchTab(...,
  true)`, silencieux — voir convention existante sur les refresh
  post-action) et message de confirmation.

### Backend

Nouvel endpoint générique : `POST /api/ref/merge/{model}/`
(`ReferentielMergeView`, `backend/employees/referentiel_views.py`, ADMIN
only, même dict `MODELS`-like que `ReferentielBulkDeleteView` pour
mapper le slug d'URL au modèle Django).

Body : `{"target_id": "<uuid>", "source_ids": ["<uuid>", ...]}`
(`target_id` ne doit pas apparaître dans `source_ids`).

Traitement, dans une transaction :
1. Charger `target` et tous les `sources` (404 si un id n'existe pas
   dans ce modèle).
2. Pour chaque `source`, réassigner vers `target` toutes les références
   qui le pointent, via introspection générique
   (`Model._meta.get_fields()`, en ne retenant que les relations
   entrantes — `ForeignKey`/`ManyToManyField` d'autres modèles vers le
   modèle fusionné) :
   - Relations `ForeignKey` (ex. `Employee.direction`,
     `Departement.direction`, `Service.departement`,
     `Contrat.type_contrat`, `Employee.categorie`, etc. — toute FK
     d'un autre modèle vers le modèle fusionné, trouvée par
     introspection) : `UPDATE` en masse de `source` vers `target`.
   - Relations `ManyToManyField` (ex. `User.scope_directions`,
     `User.scope_departements`, etc.) : ajouter `target` à la relation
     partout où `source` était présent, puis retirer `source`.
3. Supprimer `source` (hard delete — un référentiel fusionné n'a plus de
   raison d'exister ; pas de soft-delete ici, cohérent avec le fait que
   ces référentiels n'ont pas de mécanisme de corbeille comme les
   employés/documents).
4. Consigner une entrée d'audit `AuditLog.Action.MERGE_REFERENTIEL`
   (nouveau type d'action), détail `{model, target: {id, nom}, sources:
   [{id, nom}], nb_reassignes}` (`nb_reassignes` = nombre total de
   références FK+M2M réassignées, tous types confondus).
5. Si une contrainte métier bloque une réassignation (ex. la fusion
   rendrait une Cellule rattachée à la fois à une Direction et à un
   Département, ou casse `clean()`/une validation de modèle existante),
   toute la fusion est annulée (rollback transaction) et l'erreur
   explicite renvoyée — aucune fusion partielle.

### Garde-fous

- ADMIN only (comme le reste de `/parametres`).
- `target_id` doit appartenir au même modèle que les `source_ids` — pas
  de fusion inter-référentiels (on ne fusionne pas un Département dans
  une Direction).
- Un référentiel marqué `system` (le cas échéant, ex. lignes système de
  `ChampPersonnalise` — non applicable ici puisque ce modèle est hors
  scope) ne serait de toute façon pas concerné puisque ce champ n'existe
  pas sur les modèles inclus dans ce chantier.
- Max raisonnable de `source_ids` par requête (aligné sur le max déjà en
  place pour `ReferentielBulkDeleteView`, 500) — usage réel attendu très
  inférieur (fusion de 2-5 doublons à la fois).

### Hors scope

- Pas de correspondance floue automatique (Levenshtein, suggestions) —
  ni à l'import, ni dans l'UI de fusion. La fusion manuelle sert de filet
  de rattrapage volontaire, pas de détection automatique de doublons
  potentiels.
- Pas de fusion pour `TypeDocument` (hiérarchie catégorie/sous-type
  spécifique) ni `ChampPersonnalise`.
- L'auto-création à l'import ne s'applique pas rétroactivement aux
  imports déjà effectués — seulement aux imports futurs après ce
  chantier.

## Tests à prévoir

- Backend (`pytest`) :
  - `EmployeeImportView` : auto-création Direction/Département/Service/
    Poste/TypeContrat/Categorie manquants (cas simple), cascade
    Département+Service tous deux manquants, blocage si parent ambigu
    (test existant à conserver), non-régression correspondance exacte.
  - `ReferentielImportView` : mêmes cas pour Pôle/Service/Cellule/
    Section (cascade sur Direction/Département), non-régression
    désambiguïsation homonyme existante.
  - `ReferentielMergeView` : fusion simple (2 entrées, réassignation FK
    employés), fusion avec réassignation M2M (`User.scope_*`), fusion de
    3+ sources vers 1 cible, échec sur modèles différents, échec sur
    contrainte métier (ex. incompatibilité Cellule Direction/Département
    si applicable), audit log créé avec le bon détail, ADMIN only (403
    pour CONSULTANT).
- Frontend (Jest) :
  - `Parametres.jsx` : bouton "Fusionner" apparaît dès 2 sélections,
    modale de choix de cible, confirmation avant appel API, refresh
    silencieux après succès, affichage d'erreur en cas d'échec serveur.
