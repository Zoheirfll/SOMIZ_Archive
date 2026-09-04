# Division du panneau "Informations" — Personnel / Administratif

Date : 2026-09-01

## Contexte

Le panneau "Informations" de la fiche employé (`EmployeeDetail.jsx`) liste
aujourd'hui à plat les 12 champs système (Matricule, Nom, Prénom, Statut,
Direction, Département, Service, Fonction, Type de contrat, Catégorie, Date
de naissance, Date de recrutement) et tous les champs personnalisés actifs
(RIB, NIN, Groupe sanguin, N° Sécu Sociale, et tout futur champ ajouté dans
`/parametres`).

Objectif : diviser cet affichage en deux catégories — **Informations
personnelles** et **Informations administratives** — avec une répartition
configurable par un ADMIN, et permettre de restreindre l'accès d'un
CONSULTANT à des champs personnels précis (nouveau périmètre indépendant,
sur le modèle de `scope_types_documents`).

## 1. Modèle de données — catalogue unifié de champs

`ChampPersonnalise` (`backend/employees/models.py`) est étendu de deux
champs :

- `is_systeme` (`BooleanField`, default `False`) — marque les 12 champs
  structurels de `SYSTEM_FIELDS`. Seedé une fois via une migration de
  données (une ligne par champ système, `code` = le code technique existant
  ex. `date_naissance`, `poste`). Ces lignes ne sont **jamais** créables,
  renommables (structure) ou supprimables via l'UI/API — mêmes garde-fous
  que le badge "🔒 Système" actuel dans `Parametres.jsx`.
- `categorie` (`CharField`, choix `PERSONNEL` / `ADMINISTRATIF`) — assigné
  par défaut selon l'heuristique ci-dessous au moment du seed, modifiable
  ensuite par un ADMIN pour n'importe quel champ (système ou personnalisé).

**Contrainte importante** : cette extension ne change **pas** le stockage
des champs système — ils restent des colonnes réelles sur `Employee`
(conforme à la règle existante : les champs système "restent des
`ForeignKey`/colonnes fixes sur `Employee`, jamais migrés vers l'EAV", voir
CLAUDE.md section "Champs personnalisés"). Les lignes `is_systeme=True`
dans `ChampPersonnalise` servent uniquement de **registre de métadonnées**
(catégorie + permission), jamais de stockage de valeur — aucune
`EmployeeChampValeur` n'est créée pour un champ `is_systeme=True`.

**Effets de bord à traiter** :
- `RESERVED_CHAMP_CODES` (`referentiel_views.py`) continue de bloquer la
  création d'un champ personnalisé dont le code collisionne avec un champ
  système — les lignes seedées `is_systeme=True` sont insérées hors
  serializer (migration directe), donc cette validation n'a pas besoin
  d'exception.
- `champs_actifs` (`import_views.py`, import CSV dynamique) doit filtrer
  `is_systeme=False` — un champ système ne doit jamais être traité comme
  une colonne EAV à importer (il a déjà son propre traitement dédié dans
  `EmployeeImportView`/`EmployeeImportTemplateView`).
- Tout endpoint qui liste aujourd'hui "les champs personnalisés actifs"
  pour les exposer sur la fiche employé (`EmployeeDetailSerializer.champs_personnalises`)
  doit continuer à exclure `is_systeme=True` de cette liste précise (elle
  reste réservée aux vraies valeurs EAV) — la catégorisation Personnel/Admin
  de l'UI fiche employé se fait séparément, voir section 4.

## 2. Répartition par défaut (heuristique, modifiable ensuite)

| Personnel | Administratif |
|---|---|
| Date de naissance | Matricule |
| NIN | Nom |
| RIB | Prénom |
| N° Sécurité Sociale | Statut |
| Groupe sanguin | Direction |
| | Département |
| | Service |
| | Fonction |
| | Type de contrat |
| | Catégorie |
| | Date de recrutement |

Tout champ personnalisé existant ou futur (hors les 5 ci-dessus) est seedé/
créé en `ADMINISTRATIF` par défaut (choix neutre), modifiable par un ADMIN
à tout moment dans `/parametres`.

## 3. UI Parametres — assignation de catégorie

Le tableau existant de l'onglet "Champs personnalisés" (`Parametres.jsx`,
qui affiche déjà les champs système avec badge "🔒 Système" en lecture
seule) gagne une colonne **"Catégorie"** : un `<select>` Personnel/
Administratif, éditable pour **tous** les champs listés, y compris les
champs système. Le badge "🔒 Système" reste inchangé pour les colonnes
Structure/Ordre/Statut — seuls Modifier(structure)/Supprimer restent
bloqués pour `is_systeme=True`, la catégorie devient le seul attribut
modifiable pour ces lignes.

`ChampPersonnaliseSerializer` expose `categorie` (write autorisé même sur
une instance `is_systeme=True`, tout le reste du `validate()` continue de
bloquer les autres mutations sur ces lignes).

## 4. UI fiche employé — affichage en 2 colonnes

`EmployeeDetail.jsx`, panneau "Informations" : passage d'une liste à plat à
une grille 2 colonnes.

- `gridTemplateColumns: "1fr 1fr"`, `gap: 24px` — colonne gauche
  "Informations personnelles", colonne droite "Informations
  administratives". Chaque colonne est une card indépendante
  (`borderRadius: 16`, `border: theme.border`, `boxShadow: theme.shadowMd`,
  en-tête barre verte 4px + label uppercase 11px — pattern standard du
  design system).
- `useIsMobile()` → `gridTemplateColumns: "1fr"` sous 768px, la colonne
  Personnel s'affiche en premier (empilée au-dessus de Administratif).
- La répartition des champs (système + personnalisés) dans chaque colonne
  suit `categorie`, en respectant le scoping décrit en section 5 pour un
  CONSULTANT.
- Les champs cliquables vers le document source (`champToDoc`, feature du
  2026-08-31) continuent de fonctionner à l'identique, quelle que soit la
  colonne où le champ atterrit.

## 5. Scoping CONSULTANT — champs personnels

Nouveau périmètre indépendant, sur le modèle de `scope_types_documents` :

- `User.scope_champs_personnels` (M2M vers `ChampPersonnalise`, filtré
  implicitement à `categorie=PERSONNEL` au niveau de l'UI de sélection —
  pas de contrainte DB stricte, cohérent avec le reste du scoping).
- Aucune sélection = accès non restreint (règle constante du projet, tous
  les comptes existants restent inchangés après migration).
- `User.accessible_champs_personnels_qs()` — queryset des champs
  personnels visibles (tous si aucune sélection, sinon la sélection).
- `EmployeeDetailSerializer` filtre la colonne "Personnel" retournée selon
  ce périmètre — un champ personnel non autorisé est **absent** de la
  réponse API (pas seulement masqué côté frontend), même traitement que
  `scope_types_documents` pour les documents.
- UI : section "Champs personnels" dans la modale "Périmètre" existante de
  `/users` — liste à cocher des champs `categorie=PERSONNEL` uniquement
  (système + personnalisés confondus), boutons "Tout"/"Aucun", même pattern
  que la section "Types de documents" déjà présente dans cette modale.
- Ce périmètre est indépendant des périmètres organisationnel et "types de
  documents" existants — il s'applique uniquement à l'affichage du panneau
  "Informations", pas aux documents/contrats.

## Hors périmètre

- Pas de granularité par champ pour la colonne Administrative (toujours
  visible en entier pour tout compte ayant accès à l'employé — cohérent
  avec le comportement actuel, ces champs sont déjà tous visibles
  aujourd'hui).
- Pas de 3ᵉ catégorie ni de sous-catégories.
- Le renommage de libellé (`SystemFieldLabel`, existant) n'est pas affecté
  — reste indépendant de `categorie`.
