# Référentiels, imports et motifs

> À lire avant de toucher aux référentiels organisationnels (Direction/Pôle/Département/Service/Cellule/Section), aux slugs d'URL, aux imports CSV/xlsx, aux types de contrat ou aux motifs.
>
> Extrait de `CLAUDE.md` (découpage du 2026-10-01) — contenu déplacé tel quel, sans réécriture.
> Les renvois « voir section X » peuvent pointer vers un autre fichier de `docs/fonctionnel/` ou vers `CLAUDE.md` : voir l'index de `CLAUDE.md`.

---

## Référentiel "Section" (2026-08-30)

En plus de `Cellule`, un nouveau référentiel indépendant `Section` existe
— même règle de rattachement : exactement une Direction OU un Département
(jamais un Service, jamais les deux), avec ses propres employés
(`Employee.section`). **Coexiste** avec `Cellule` (les deux référentiels
sont indépendants, un Département peut avoir des Cellules ET des
Sections) — pas de fusion, pas de migration de données.

- `Employee` : `service`, `cellule` et `section` sont mutuellement
  exclusifs côté formulaire (`EmployeeForm.jsx`, chaque `<select>` vide
  les deux autres à la sélection) et côté backend
  (`EmployeeCreateUpdateSerializer.validate()` aligne
  direction/departement sur la Cellule ou la Section choisie et vide les
  deux autres champs) — pas de contrainte DB stricte (comme
  service/cellule déjà avant ce chantier).
- Scoping : `User.scope_sections` (M2M), `accessible_sections_qs()`,
  intégré dans `employee_scope_q()`/`can_access_employee()`/
  `accessible_directions_qs()`/`accessible_departements_qs()` exactement
  comme Cellule.
- CRUD : `/ref/sections/`, `/ref/sections/<uuid:pk>/` — onglet "Sections"
  dans `/parametres`, mêmes fonctionnalités que "Cellules" (import
  CSV/xlsx, suppression en masse, tri).
- `/employees` (drill-down) et `/organigramme` : cartes/nœuds Section au
  même niveau que Cellule (sous Direction ou Département).
- `/users` (modale Périmètre) : section "Sections" dans la cascade
  organisationnelle, même pattern Tout/Aucun/OR (Direction OU Département)
  que Cellule.

---

## URLs lisibles — slug sur les référentiels organisationnels (2026-09-27)

Les query params de filtrage/navigation sur `/employees` (`?direction=`,
`?departement=`, `?service=`, `?pole=`, `?cellule=`, `?section=`) portent
désormais un **slug lisible** (ex. `direction-administration-generale`),
plus un UUID brut — cohérent avec `/employees/010451` (déjà résolu par
matricule) et `/attestations/00001-26` (déjà résolu par référence). Seuls
les query params sont concernés : les clés primaires en base et les routes
déjà lisibles ne changent pas. `?user=`/`?categorie=` (audit) étaient déjà
du texte, `?dossier_complet=0/1` déjà lisible — non touchés.

- `Direction`, `Pole`, `Departement`, `Service`, `Cellule`, `Section`
  (`backend/employees/models.py`) portent un champ `slug`
  (`SlugField(editable=False)`), recalculé dans `save()` dès que `nom` (ou
  le parent, pour Pole/Departement/Service/Cellule/Section) change —
  `_generate_unique_slug()` désambiguïse par suffixe numérique (`-2`,
  `-3`...) en cas de collision, scopé au même périmètre que l'unicité de
  `nom` déjà en place (Direction : global ; Pole/Departement : par
  Direction ; Service : par Departement). **Cellule et Section n'ont
  toujours aucune contrainte d'unicité sur `nom`** — leur slug gère seul
  la désambiguïsation, scopé par `direction_id or departement_id` (le
  parent renseigné) via `unique_together = [['direction', 'departement', 'slug']]`.
- Backend — les filtres passent de `qs.filter(direction=direction)` à
  `qs.filter(direction__slug=direction)` (et équivalent pour les autres
  niveaux) dans `EmployeeListCreateView` (`employees/views.py`),
  `EmployeeExportView` (`employees/export_views.py`), et les vues cascade
  `PoleListCreateView`/`DepartementListCreateView`/`ServiceListCreateView`/
  `CelluleListCreateView`/`SectionListCreateView` (`employees/referentiel_views.py`).
  `ReferentielSearchMixin.filter_search()` supporte aussi `?slug=<valeur>`
  (filtre exact) sur toutes les listes référentiels — utilisé par le
  frontend pour résoudre "slug → objet complet" sans jamais repasser par
  une route détail par UUID.
- `Employees.jsx` : les fetchs cascade et la construction des params
  d'appel `/employees/` envoient `.slug` (plus `.id`) ; la résolution d'un
  lien entrant (`?direction=<slug>` depuis Statistiques/Organigramme)
  passe par `GET /ref/.../?slug=<valeur>` (premier résultat) plutôt que
  par une route détail par pk. Le mécanisme de breadcrumb interne
  (`lvl`/`dir`/`dep`/`svc`, `slugify()` client-side) est indépendant et
  n'a pas été touché.
- `Statistiques.jsx` (`navigate(/employees?direction=${entry.slug})`) et
  `Organigramme.jsx` (`navigate(/employees?${niveau}=${node.slug})`)
  construisent leurs liens avec le slug reçu de l'API — `audit/stats.py`
  (`_repartition_direction`, `_repartition_departement`, `_completude_par`)
  expose désormais `slug` en plus de `id` dans ses lignes d'agrégation.
- `?employee=` sur `GET /api/attestations/demandes/` (onglet "Attestations"
  de la fiche employé, `AttestationsTab.jsx`) est passé au **matricule**
  plutôt qu'à l'UUID employé — `DemandeAttestationListCreateView` filtre
  désormais sur `employee__matricule`, même principe que
  `EmployeeDetailView.get_object` (résolution UUID-ou-matricule déjà en
  place, `employees/views.py`).
- Migration `employees/0038_alter_departement_unique_together_and_more.py` :
  ajoute les colonnes `slug` sans contrainte, backfill par script
  (`RunPython`, ordre Direction → Pole/Departement → Service →
  Cellule/Section — dépendance de scope), **puis** seulement ajoute les
  contraintes d'unicité — nécessaire sur PostgreSQL pour éviter une
  collision d'index (`AddField` avec `unique=True` direct crée déjà un
  index `_like` que l'`AlterField` suivant recrée à l'identique et fait
  échouer la migration avec `DuplicateTable`).

---

## Types de contrat à durée indéterminée (2026-09-17)

`TypeContrat.duree_indeterminee` (bool, `default=False`) marque un type
(ex. CDI, "Titulaire") comme n'ayant jamais de date de fin.

- `ContratCreateUpdateSerializer.validate()` force `date_fin=None` dès que
  le `type_contrat` résultant a `duree_indeterminee=True`, même si le
  payload en envoie une — garde-fou serveur, le champ ne peut jamais être
  contourné depuis l'API.
- Formulaires Contrat (`ContratsTab.jsx` sur la fiche employé,
  `ContratDetail.jsx` en édition) : le champ "Date de fin" est masqué (pas
  seulement désactivé) dès que le type sélectionné a `duree_indeterminee`,
  et sa valeur locale vidée au changement de type.
- `/parametres` → "Types de contrat" : select "Durée indéterminée" dans le
  formulaire (`RefForm.jsx`), même pattern `<select>` true/false que les
  autres booléens du référentiel (pas de `<input type="checkbox">` natif).
- Aucun changement à `Employee.date_fin_contrat`/
  `sync_statut_from_dernier_contrat()` — cette synchro recopie déjà
  `date_fin` du dernier contrat, qui sera `None` grâce au garde-fou
  ci-dessus.

---

## Import CSV employés — champs additionnels (2026-07-24)

`EmployeeImportView.OPTIONAL_COLS` inclut désormais `rib`, `numero_secu_sociale`, `groupe_sanguin`, `nin` (mêmes noms de colonnes que les champs modèle). Le template téléchargeable (`EmployeeImportTemplateView`) et la liste de colonnes affichée sur `/import` (`frontend/src/pages/Import.jsx`) ont été mis à jour en conséquence.

---

## Import employés/référentiels — template en .xlsx (2026-08-30)

Les templates téléchargeables (`EmployeeImportTemplateView`,
`ReferentielImportTemplateView`, `backend/employees/import_views.py`) sont
distribués en **.xlsx** (via `openpyxl`), plus en `.csv`. Raison : un CSV
`;`-délimité édité dans Excel puis ré-enregistré (`Ctrl+S`, garder le
format `.csv`) peut perdre son délimiteur au prochain enregistrement
(dépend des paramètres régionaux Windows/Excel de l'admin, et de la
présence du délimiteur dans une valeur non échappée) — à la réouverture,
toute la ligne retombe dans une seule colonne. Un classeur `.xlsx` a des
colonnes réelles, structurellement insensible à ce problème.

- `EmployeeImportView`/`ReferentielImportView` (upload) acceptent toujours
  **les deux formats**, `.csv` (délimiteur `;` ou `,` auto-détecté, comme
  avant) et `.xlsx` — via l'helper commun `_read_rows(file)`
  (`import_views.py`) qui retourne `(fieldnames, liste de dict)` quel que
  soit le format d'entrée, pour que le reste de la logique d'import
  (validation, résolution des référentiels, création en masse) reste
  identique.
- Frontend (`Import.jsx`, `Parametres.jsx`) : `accept=".csv,.xlsx"` sur les
  inputs fichier, extension `.xlsx` sur le fichier téléchargé et sur le nom
  proposé au drop.
- Nouvelle dépendance backend : `openpyxl` (`requirements.txt`).

---

## Import référentiels — Pôles/Cellules, désambiguïsation, suppression et tri en masse (2026-08-30)

Suite du chantier ci-dessus (`ReferentielImportView`/`ReferentielImportTemplateView`,
`backend/employees/import_views.py`) :

- **`poles` et `cellules` ajoutés à l'import** — les deux référentiels
  avaient leur propre onglet dans `/parametres` mais aucun support côté
  `ReferentielImportView.MODELS`/`ReferentielImportTemplateView.TEMPLATES` :
  cliquer "Template" sur ces onglets renvoyait une erreur 400 "Modèle
  inconnu" (bug latent signalé par l'utilisateur : "le template de cellule
  ne se télécharge pas"). `poles` suit exactement le même schéma que
  `departements` (`nom` + `direction` obligatoires, `unique_together`
  direction+nom). `cellules` : `nom` obligatoire, et **au moins une** des
  colonnes `direction`/`departement` doit être renseignée (jamais aucune
  des deux) — reflète `Cellule.clean()` (rattachée à exactement une
  Direction OU un Département, jamais les deux en base).
- **Désambiguïsation du nom de département** (`services` et `cellules`) —
  `Departement.nom` n'est unique qu'au sein de sa Direction
  (`unique_together`), donc deux départements de directions différentes
  peuvent porter le même nom. `resoudre_departement()` dans
  `ReferentielImportView.post()` résout par nom seul si un seul département
  porte ce nom ; sinon bloque avec une erreur explicite demandant de
  remplir la colonne `direction` (optionnelle) pour trancher. **Piège
  corrigé en cours d'implémentation** : sur `cellules`, la colonne
  `direction` sert à *deux* usages différents selon le contexte — le parent
  direct de la Cellule (si `departement` est vide) OU juste la
  désambiguïsation du département (si `departement` est rempli). Une
  première version traitait "les deux colonnes remplies" comme une erreur
  ("Cellule rattachée à Direction ET Département"), ce qui rendait la
  désambiguïsation elle-même impossible à exprimer — corrigé : `departement`
  rempli prime toujours, `direction` n'est alors qu'une aide de résolution,
  jamais un second parent.
- **Doublons scopés à leur parent** — `departements`/`services`/`cellules`
  n'ont pas de nom globalement unique (contrairement à
  `directions`/`postes`/`types-contrat`/`categories`) ; la détection de
  doublon dans l'import compare désormais `(parent_id, nom)` et non plus
  `nom` seul (l'ancien code aurait bloqué à tort la création d'un
  "Service Paie" dans un département différent d'un "Service Paie"
  existant ailleurs).
- **Suppression en masse** — `POST /api/ref/bulk-delete/{model}/` (body
  `{"ids": [...]}`, `ReferentielBulkDeleteView`, ADMIN only, max 500 ids/
  requête) sur tous les référentiels de `/parametres` (y compris
  `types-documents`, qui réutilise la même logique de purge que la
  suppression unitaire — factorisée dans `_delete_type_document()`).
  Traite chaque id indépendamment (un Pôle avec départements rattachés
  reste bloqué sans faire échouer le reste du lot) et retourne
  `{nb_supprimes, nb_erreurs, erreurs: [{id, nom, erreur}]}`. Frontend
  (`Parametres.jsx`) : cases à cocher par ligne (`RefTable`, absentes sur
  les lignes `system: true`) + case "tout sélectionner" dans l'en-tête,
  bouton rouge "Supprimer la sélection (N)" qui n'apparaît que si au moins
  un élément est coché, avec confirmation (`useConfirm()`).
- **Tri par colonne** — clic sur un en-tête de `RefTable` trie les lignes
  affichées (asc/desc, indicateur ▲/▼), tri client-side sur la page
  courante (pas de nouveau paramètre serveur). Désactivé sur
  `types-documents` (hiérarchie catégorie/sous-type imposée) et
  `champs-personnalises` (champs système toujours en tête) — géré par le
  flag `sortableTab` dans `Parametres.jsx`, et par colonne via
  `column.sortable === false` (utilisé pour la colonne pseudo-champ
  "Rattachée à" de `cellules`, qui n'a pas de clé réelle sur l'objet).
- **Colonnes obligatoires/optionnelles affichées dans la modale d'import**
  de `/parametres` (`REF_COLUMNS_INFO` dans `Parametres.jsx`), même principe
  que la page `/import` employés — évite à l'admin de deviner le format du
  fichier. Les onglets `types-documents`/`champs-personnalises`, qui n'ont
  jamais eu de support d'import référentiel générique (trop spécifiques :
  hiérarchie catégorie/sous-type, type de champ), n'affichent plus du tout
  les boutons Template/Import plutôt que d'échouer silencieusement
  (`IMPORT_UNSUPPORTED_TABS`).
- **Bug corrigé au passage — badge "N employé(s)" manquant sur les cartes
  Service** (`/employees`, vue drill-down Direction→Département→Service) :
  `ServiceSerializer` (`referentiel_views.py`) n'exposait pas `nb_employes`
  (contrairement à `CelluleSerializer`, qui l'a toujours eu), alors que le
  frontend (`Employees.jsx`, `TYPE_META.service.countKey`) l'attendait
  déjà — le badge de comptage restait donc silencieusement vide sur les
  cartes Service uniquement (Cellule l'affichait correctement). Ajouté
  `nb_employes = SerializerMethodField()` (même pattern que Cellule).

---

## Motifs — référentiel générique (2026-09-23)

`MotifArchivage` (`backend/employees/models.py`) n'est plus réservé à
l'archivage employé malgré son nom historique (conservé pour ne pas casser
la FK `Employee.motif_archivage` et les migrations existantes) : un champ
`categorie` (`archivage` / `attestation`) distingue désormais deux espaces
indépendants, chacun avec son propre onglet dans `/parametres` — sous-menu
**"Motifs"** (nouveau groupe de la sidebar, séparé de "Dossier RH") →
**"Archivage"** et **"Attestation"**. `nom` n'est plus unique globalement,
seulement au sein d'une catégorie (`unique_together = [('nom', 'categorie')]`)
— deux usages différents peuvent légitimement partager le même libellé.

- **Deux endpoints, un seul modèle** : `/ref/motifs-archivage/` et
  `/ref/motifs-attestation/` (`MotifArchivageListCreateView`/
  `MotifAttestationListCreateView`, `referentiel_views.py`) filtrent tous
  les deux `MotifArchivage` par `categorie` — `MotifAttestationListCreateView`
  hérite de `MotifArchivageListCreateView` et ne change que l'attribut
  `categorie`. Import CSV/xlsx (`ReferentielImportView.MOTIF_CATEGORIES`),
  suppression en masse et fusion (`ReferentielBulkDeleteView`/
  `ReferentielMergeView.MODELS`) suivent le même principe — la fusion
  vérifie explicitement que cible et sources appartiennent à la même
  catégorie (garde-fou contre un mélange Archivage/Attestation par erreur
  d'id).
- **Suppression protégée pour les motifs d'attestation** :
  `DemandeAttestation.motif` est en `on_delete=PROTECT` (contrairement à
  `Employee.motif_archivage`, `SET_NULL`) — une demande doit garder la
  trace exacte du motif utilisé. `MotifDestroyMixin` (`referentiel_views.py`)
  intercepte `ProtectedError` et renvoie un 400 explicite plutôt qu'un 500,
  dans une transaction (l'entrée d'audit "suppression" déjà écrite est
  annulée avec le reste si `.delete()` échoue).
- **`DemandeAttestation.motif`** — FK vers `MotifArchivage` (catégorie
  Attestation), plus un champ texte libre. Le formulaire
  `AttestationNouvelle.jsx` propose un `<select>` alimenté par
  `GET /ref/motifs-attestation/` (actifs uniquement), plus une option
  **"Autre..."** qui affiche un champ texte libre (`motifAutre`) — un
  GESTIONNAIRE n'a pas accès en écriture au référentiel (`POST
  /ref/motifs-attestation/` est ADMIN only) mais peut quand même faire
  apparaître un motif inédit : `motif_autre` est envoyé à la place de
  `motif`, et `DemandeAttestationCreateSerializer.create()` fait le
  `get_or_create` (insensible à la casse) du `MotifArchivage` correspondant
  côté serveur, en dehors du contrôle d'accès référentiel normal.
- **Migration de données** (`attestations/migrations/0004_motif_dates.py`) :
  l'ancien champ texte `motif` de `DemandeAttestation` a été converti en FK
  — chaque valeur texte distincte déjà en base a été transformée en (ou
  rattachée à) un `MotifArchivage` catégorie Attestation, via un champ FK
  intermédiaire (`motif_fk`) le temps de la bascule.
