# Fiche employé — champs, carrière, archivage

> À lire avant de toucher à la fiche/au formulaire/à la liste des employés, aux champs personnalisés, à l'historique de carrière, aux transferts ou à l'archivage.
>
> Extrait de `CLAUDE.md` (découpage du 2026-10-01) — contenu déplacé tel quel, sans réécriture.
> Les renvois « voir section X » peuvent pointer vers un autre fichier de `docs/fonctionnel/` ou vers `CLAUDE.md` : voir l'index de `CLAUDE.md`.

---

## Champs personnalisés — panneau "Informations" configurable (2026-07-25)

Le panneau "Informations" de la fiche employé (`EmployeeDetail.jsx`) est
partiellement dynamique, sur le modèle EAV (`ChampPersonnalise` +
`EmployeeChampValeur`), **sans** convertir les champs structurels/relationnels
en champs dynamiques — refusé explicitement car cela casserait le scoping
CONSULTANT, la recherche, l'archivage et l'audit (voir section Scoping).

- `ChampPersonnalise` (`nom`, `code` unique, `type_champ`: texte/nombre/date,
  `ordre`, `is_active`) — CRUD ADMIN dans `/parametres` → onglet "Champs
  personnalisés" (`/ref/champs-personnalises/`), même pattern que "Types de
  documents".
- `EmployeeChampValeur` — une ligne par `(employee, champ)`, `valeur` en
  texte libre (`unique_together`). Mise à jour via `PATCH
  /api/employees/<id>/champs/` (ADMIN uniquement, payload `{champ_id: valeur}`),
  tracée dans l'audit log (`MODIFY_EMP`, détail `champs_personnalises`).
- `EmployeeDetailSerializer.champs_personnalises` expose la liste
  `[{id, code, nom, type_champ, valeur}]` pour tous les champs actifs
  (valeur vide si pas encore renseignée pour cet employé).
- **`SYSTEM_FIELDS`** (`Parametres.jsx`) : liste en dur des 12 champs
  structurels (Matricule, Nom, Prénom, Statut, Direction, Département,
  Service, Fonction, Type de contrat, Catégorie, Date de naissance, Date de
  recrutement) — affichés dans le même tableau que les champs dynamiques
  mais avec un badge "🔒 Système" à la place des boutons Modifier/Supprimer,
  fond gris (`#F1F5F9`), colonnes Ordre/Statut à "—". Purement visuel : ces
  champs restent des `ForeignKey`/colonnes fixes sur `Employee`, jamais
  migrés vers l'EAV.
- **Migration des 4 anciens champs** (2026-07-25) : `rib`,
  `numero_secu_sociale`, `groupe_sanguin`, `nin` (colonnes toujours présentes
  sur `Employee` en base, mais **plus exposées par aucun serializer**) ont
  été migrés en 4 `ChampPersonnalise` (codes `RIB`, `NUM_SECU`,
  `GROUPE_SANGUIN`, `NIN`) via script one-off (`manage.py shell`), données
  copiées dans `EmployeeChampValeur`.
- **Libellé renommable** (`SystemFieldLabel`, 2026-07-25) : un ADMIN peut
  renommer l'affichage d'un champ système (bouton ✏️ à côté du badge "🔒
  Système") sans toucher à sa structure — `code` (clé primaire, ex.
  `poste`, `date_embauche`) reste figé, seul `label` change. `PUT
  /ref/system-field-labels/<code>/` (ADMIN, `{label: '...'}` vide = reset) ;
  `GET /ref/system-field-labels/` liste les overrides existants
  (ADMIN+CONSULTANT). Purement cosmétique et **local à `/parametres` +
  fiche employé** — ne renomme pas les en-têtes du CSV d'import/template
  (ceux-ci restent le `code` technique, ex. `poste`), volontairement pour
  ne pas casser des fichiers CSV déjà distribués aux utilisateurs.
- **Import CSV entièrement dynamique** (2026-07-25) : `EmployeeImportView`
  et `EmployeeImportTemplateView` (`import_views.py`) ne mappent plus une
  liste figée de 4 colonnes historiques (`LEGACY_CHAMP_CODES`, supprimé) —
  ils construisent `champs_actifs = {code.lower(): champ}` à partir de
  **tous** les `ChampPersonnalise.objects.filter(is_active=True)` à chaque
  requête. Toute colonne CSV dont le nom correspond au `code` (minuscule)
  d'un champ personnalisé actif est automatiquement importée dans
  `EmployeeChampValeur` — un champ ajouté/désactivé dans `/parametres` est
  pris en compte immédiatement, sans changement de code. Le frontend
  (`Import.jsx`) reflète la même liste dynamiquement (`GET
  /ref/champs-personnalises/`) dans la section "Colonnes optionnelles" et
  le template téléchargeable.
- **Codes réservés** (`RESERVED_CHAMP_CODES`, `referentiel_views.py`,
  2026-07-25) : `ChampPersonnaliseSerializer.validate_code()` refuse la
  création/modification d'un champ personnalisé dont le `code` (insensible
  à la casse) collision avec un des 13 champs structurels (`matricule`,
  `numero_contrat`, `nom`, `prenom`, `date_naissance`, `date_embauche`,
  `statut`, `direction`, `departement`, `service`, `poste`, `type_contrat`,
  `categorie`) — sans ce garde-fou, un champ personnalisé nommé par erreur
  `statut` ou `poste` serait aussi capté par l'import CSV dynamique
  (`champs_actifs` dans `import_views.py`, matché par `code.lower()`) et
  entrerait en conflit silencieux avec la colonne structurelle du même nom.

---

## Champ personnalisé conditionnel (2026-09-17)

Un `ChampPersonnalise` peut être rattaché à un autre via
`condition_champ` (FK vers `self`, `SET_NULL`) + `condition_valeur`
(`CharField`) : il n'est alors affiché (fiche, formulaire d'édition, liste
`/employees`) que si l'employé a exactement cette valeur sur le champ
référencé. Cas d'usage type : "Salaire unique" (montant) visible
seulement si "Situation familiale" = "Marié" (champ de type `liste`, voir
section "Champ personnalisé liste" plus haut).

- `ChampPersonnaliseSerializer.validate()` refuse qu'un champ dépende de
  lui-même, et force `condition_valeur=''` dès que `condition_champ` est
  vide (jamais de valeur requise orpheline).
- `champ_condition_remplie(champ, valeurs_par_champ_id)`
  (`employees/serializers.py`) — fonction partagée, utilisée par
  `EmployeeDetailSerializer.get_champs_personnalises()` (fiche + pré-remplissage
  du formulaire d'édition) et `EmployeeListSerializer.get_champs_personnalises()`
  (colonnes configurables `/employees`) : un champ dont la condition n'est
  pas remplie est **absent** de la réponse API, pas seulement masqué côté
  frontend — la valeur (ex. un salaire) n'est jamais renvoyée à un
  utilisateur pour qui la condition ne tient pas.
- `EmployeeForm.jsx` : `champConditionMet(champ, champsValues)` réévalue la
  condition en direct pendant la saisie (avant tout enregistrement), en
  s'appuyant sur `champsDefinitions` (qui reçoit toutes les définitions,
  condition incluse, via `/ref/champs-personnalises/`) et le state
  `champsValues` du formulaire.
- UI `/parametres` → "Champs personnalisés" : select "Champ conditionnel"
  (n'importe quel autre champ non système) + "Valeur requise" (select des
  options actives si le champ choisi est de type `liste`, sinon texte
  libre).
- "Situation familiale" et "Salaire unique" sont deux champs personnalisés
  ordinaires (pas de code système dédié) — comme "Lieu de naissance"
  (voir section "Champs personnalisés — panneau Informations
  configurable"), ils sont extraits par nom dans `EmployeeForm.jsx`
  (`champSituationFamiliale`/`champSalaireUnique`) pour s'afficher dans la
  section "Identité" plutôt que "Informations complémentaires" — même
  limite que `champLieuNaissance` (pas de code stable garanti pour un
  champ créé dynamiquement).

### Ordre des champs — fiche vs formulaire d'édition

- **Fiche employé (lecture)** : l'ordre est entièrement piloté par
  `ChampPersonnalise.ordre` (mélangé avec les champs système via les
  flèches ↑/↓ de `/parametres` → "Champs personnalisés", voir section
  "Liste employés — colonnes configurables") — pas de code à changer pour
  réordonner l'affichage de la fiche, y compris la position de
  "Situation familiale"/"Salaire unique" ou d'"Échelle" par rapport à
  "Catégorie".
- **Formulaire de création/édition** (`EmployeeForm.jsx`) : la disposition
  des champs structurels (section "Identité" : Matricule, N° Contrat,
  Nom, Prénom, Statut, Date de naissance, Lieu de naissance, Type de
  contrat, Date de recrutement, Date de fin de contrat, Situation
  familiale, Salaire unique ; section "Organisation" : Direction →
  Cellule/Section, Fonction, Catégorie) reste **codée en dur dans le
  JSX**, indépendante de l'ordre configuré côté fiche — `Échelle` n'y
  figure jamais (pas de champ direct sur `Employee`, voir "Historique de
  carrière", seule la gestion manuelle depuis l'onglet Carrière permet de
  la renseigner).
- "Type de contrat" a été déplacé de la section "Organisation" vers
  "Identité" (juste après "Lieu de naissance") pour rester adjacent à
  "Date de fin de contrat" (masquée si le type sélectionné a
  `duree_indeterminee=True`, voir section "Types de contrat à durée
  indéterminée").

---

## Panneau "Informations" — colonnes Personnel/Administratif (2026-09-01)

Le panneau "Informations" de la fiche employé est divisé en 2 colonnes
côte à côte (1 colonne empilée sous 768px) : "Informations personnelles"
à gauche, "Informations administratives" à droite.

- `ChampPersonnalise` (`backend/employees/models.py`) sert désormais de
  **catalogue unifié** pour tous les champs de ce panneau : `is_systeme`
  (bool, seedé une fois pour les 19 champs structurels, jamais
  créable/supprimable via l'UI) et `categorie` (`PERSONNEL`/
  `ADMINISTRATIF`, modifiable pour tout champ y compris système). Les
  champs système restent des colonnes réelles sur `Employee` — ces lignes
  ne servent que de registre de métadonnées, jamais de stockage EAV
  (`is_systeme=True` exclu de `champs_actifs`/`champs_personnalises`).
- UI `/parametres` → "Champs personnalisés" : colonne "Catégorie" (select),
  éditable pour toutes les lignes.
- Scoping CONSULTANT indépendant : `User.scope_champs_personnels` (M2M,
  vide = aucun champ personnel visible sur cet axe, règle inversée le
  2026-09-01) restreint quels champs `categorie=PERSONNEL` sont
  visibles — la colonne Administrative n'est jamais restreinte. UI : section
  "Champs personnels" dans la modale "Périmètre" de `/users`.
- `EmployeeDetailSerializer.champs_categories` — dict `{code: categorie}`
  déjà filtré selon le périmètre de l'utilisateur courant ; un champ
  personnel non autorisé est absent du dict (donc du panneau), pas
  seulement masqué côté frontend.

---

## Liste employés — colonnes configurables (2026-07-25)

Le tableau `/employees` a un bouton "Colonnes" (à côté du filtre "Statut")
ouvrant un menu à cocher, avec une ligne "Tout"/"Aucun" en haut et une zone
scrollable (même pattern que les listes "Périmètre" de `/users`) :

- Colonnes fixes déjà présentes avant ce chantier (N° Contrat, Direction,
  Département, Service, Fonction, Statut, Dossier) restent **affichées par
  défaut** — rien ne change dans la vue par défaut d'un utilisateur qui n'a
  jamais touché au filtre.
- Colonnes ajoutées par ce chantier (Date de naissance, Date de
  recrutement, Type de contrat, Catégorie) et les champs personnalisés
  actifs (RIB, NIN, etc., et tout futur champ ajouté dans `/parametres`)
  sont proposées dans le même menu mais **masquées par défaut** — activées
  volontairement par l'utilisateur.
- Persistance : `localStorage` (`somiz_employees_column_overrides`), un
  objet `{code: true|false}` qui ne stocke que les écarts par rapport au
  défaut (`defaultColumnVisible()` dans `Employees.jsx`) — pas par
  utilisateur côté serveur, juste par navigateur.
- Backend : `EmployeeListSerializer` expose désormais aussi
  `date_naissance`, `date_embauche`, `categorie_nom` et
  `champs_personnalises` (dict `{code: valeur}`, réutilise
  `valeurs_personnalisees.all()` déjà prefetché dans
  `EmployeeListCreateView.get_queryset()` — pas de N+1). Le libellé "Poste"
  a été renommé "Fonction" dans l'en-tête/le filtre pour rester cohérent
  avec le reste de l'app (le champ modèle/l'API restent `poste`).

---

## Fiche employé — champs additionnels (2026-07-22)

En plus des champs historiques, `Employee` porte désormais :
- `rib` (RIP/RIB), `numero_secu_sociale`, `groupe_sanguin`, `nin` — tous `CharField` optionnels, exposés tels quels par l'API (`rib`, `numero_secu_sociale`, `groupe_sanguin`, `nin`)
- Renommage d'affichage uniquement (le nom technique du champ/API ne change pas, pour ne rien casser côté intégrations) :
  - `date_embauche` → libellé **"Date de recrutement"**
  - `poste` → libellé **"Fonction"**

---

## Champ personnalisé "liste" (2026-09-17)

En plus de texte/nombre/date/booléen, `ChampPersonnalise.type_champ`
supporte `liste` (choix unique parmi des valeurs prédéfinies, éditables).

- Nouveau modèle `ChampPersonnaliseOption` (`champ` FK, `valeur`, `ordre`,
  `is_active`) — une valeur possible pour un champ de type liste. Retrait
  toujours en soft-delete (`is_active=False`, jamais de suppression
  définitive) : une valeur déjà enregistrée dans `EmployeeChampValeur`
  pour une option désactivée reste affichée telle quelle, sans lien cassé
  (`EmployeeChampValeur.valeur` reste un `CharField` texte libre, pas une
  FK vers l'option).
- `PATCH /api/employees/<id>/champs/` valide, pour un champ `type_champ=
  liste`, que la valeur soumise correspond à une `ChampPersonnaliseOption`
  `is_active=True` de ce champ (sinon 400) — une valeur déjà enregistrée
  mais devenue orpheline n'est pas resoumise automatiquement.
- Endpoints CRUD (ADMIN only) : `GET/POST /api/ref/champs-personnalises/
  <id>/options/`, `PATCH /api/ref/champs-personnalises/options/<option_id>/`
  (pas de `DELETE` — la désactivation est le seul mécanisme de retrait).
- `ChampPersonnaliseSerializer` expose `options` (toutes, actives et
  inactives) en lecture — c'est au consommateur (frontend) de filtrer sur
  `is_active` selon le contexte (formulaire d'édition d'un champ vs.
  saisie d'une valeur pour un employé).
- `EmployeeDetailSerializer.get_champs_personnalises()` inclut, pour un
  champ liste, la liste des options actives + l'option courante même si
  elle est devenue inactive depuis (pour ne pas la faire disparaître du
  select tant qu'elle reste la valeur enregistrée de cet employé).
- UI : `/parametres` → "Champs personnalisés", sous-panneau
  `ChampListeOptions.jsx` (ajouter/activer/désactiver une option, affiché
  uniquement une fois le champ déjà enregistré — un champ pas encore créé
  n'a pas d'id pour rattacher des options). `EmployeeForm.jsx` rend un
  `<select>` pour un champ liste (au lieu d'un input texte), alimenté par
  `champ.options` reçu de `/ref/champs-personnalises/`.

---

## Transferts d'employé — historique + confirmation (2026-08-28)

Déplacer un employé d'un service à un autre se fait via le formulaire
d'édition existant (`/employees/:id/modifier`, cascade
Direction→Département→Service/Cellule) — pas de flux dédié.

- `EmployeeDetailView.perform_update` (`employees/views.py`) capture les
  libellés de `TRANSFER_FIELDS = ['direction', 'departement', 'service',
  'cellule']` **avant** `serializer.save()` (il mute l'instance en place,
  donc illisible après coup) et ajoute une clé `transfer` au détail JSON
  de l'entrée d'audit `MODIFY_EMP` existante pour chaque champ
  effectivement modifié : `{champ: {de: ancien_nom, vers: nouveau_nom}}`.
  Pas de nouveau type d'action — réutilise l'audit log existant.
- Frontend `AuditLogs.jsx` : colonne "Détails" affichant ce transfert de
  façon lisible (`formatTransfer()`, ex. `"Service : Paie → Comptabilité"`).
- Frontend `EmployeeForm.jsx` : avant d'enregistrer, si la Direction/le
  Département/le Service/la Cellule ont changé par rapport à la valeur
  chargée (`originalAffectation`, snapshot pris dans `fetchEmployee`), une
  modale `useConfirm()` récapitule chaque changement et bloque la
  sauvegarde tant qu'elle n'est pas validée.
- **Bug corrigé en même temps** : en mode édition, Département/Service (et
  toute liste filtrée par cascade) pouvaient rester bloqués sur
  "-- Sélectionner --" au chargement, obligeant à tout resélectionner
  manuellement. Deux causes combinées dans `EmployeeForm.jsx` : (1)
  `fetchEmployee()` appelait `setDepartementsFiltres((dept) =>
  dept.filter(...))` avec un updater fonctionnel qui lit l'**ancien état**
  de `departementsFiltres` (vide au chargement), pas la liste complète des
  départements ; (2) l'effet de secours qui recalcule ces listes quand les
  référentiels arrivent n'avait pas `form.direction`/`form.departement`
  dans ses dépendances, donc ne se redéclenchait jamais si les référentiels
  arrivaient *avant* les données de l'employé. `fetchEmployee()` et
  `fetchReferentiels()` partent en parallèle au montage — l'ordre d'arrivée
  n'est pas garanti, donc l'effet doit réagir aux deux.

---

## Historique de carrière — Fonction/Catégorie/Échelle/Contrats (2026-08-31)

En plus du transfert organisationnel (section ci-dessus), la fiche employé
a un onglet **"Carrière"** qui retrace la progression dans le temps sur 4
axes : Fonction, Catégorie, Échelle et Contrats — utile pour un employé
dont la carrière précède l'usage de SOMIZ (ex. recruté en 2000, plusieurs
changements de poste/catégorie depuis). Spec complète :
`docs/superpowers/specs/2026-08-31-historique-carriere-design.md`.

- **Référentiel `Echelle`** (`backend/employees/models.py`) — nouveau
  référentiel simple (`nom`, `description`, `is_active`), même pattern que
  `Categorie`/`TypeContrat` : CRUD `/ref/echelles/`, onglet "Échelles" dans
  `/parametres`, import/template xlsx. **Pas de champ `Employee.echelle`
  direct** — volontairement, pour ne pas dupliquer d'état : la valeur
  actuelle d'Échelle d'un employé se lit uniquement via son historique
  (voir plus bas).
- **3 modèles d'historique dédiés** — `HistoriqueFonction`,
  `HistoriqueCategorie`, `HistoriqueEchelle`, partageant un mixin abstrait
  `HistoriquePeriode` (`employee`, `date_debut`, `date_fin` nullable = période
  en cours, `commentaire`, `created_by`, `created_at`). Pas de
  `GenericForeignKey` — 3 modèles concrets, un par axe. Les contrats ne
  sont **pas** dupliqués dans un 4ᵉ modèle : la timeline "Carrière"
  réutilise directement `employee.contrats.all()` (le modèle `Contrat`
  existant gère déjà plusieurs contrats par employé avec leurs dates).
- **Auto-tracking** — `EmployeeDetailView.perform_update`
  (`backend/employees/views.py`, `CARRIERE_AXES = {'poste':
  HistoriqueFonction, 'categorie': HistoriqueCategorie}`) : un changement
  de `poste`/`categorie` via `PATCH /api/employees/<id>/` clôture
  automatiquement la période ouverte existante (`date_fin = aujourd'hui`)
  et en ouvre une nouvelle. Ajouté au même dict `details['transfer']` de
  l'audit log `MODIFY_EMP` que le transfert organisationnel (`{champ: {de,
  vers}}`), lisible dans `/audit` via les mêmes libellés génériques
  (`TRANSFER_FIELD_LABELS` dans `AuditLogs.jsx`, entrées `poste`→"Fonction"
  et `categorie`→"Catégorie"). Échelle n'ayant pas de champ direct sur
  `Employee`, elle n'a **pas** d'auto-tracking — uniquement la gestion
  manuelle ci-dessous.
- **Gestion manuelle des périodes** (rattrapage de l'historique antérieur
  à SOMIZ) — `GET/POST /api/employees/<id>/historique/<axe>/` et
  `GET/PATCH/DELETE /api/historique/<axe>/<periode_id>/` (`axe` ∈
  `fonctions|categories|echelles`, vues génériques
  `HistoriqueListCreateView`/`HistoriqueDetailView` dans
  `employees/views.py`, dict `HISTORIQUE_AXES`). Écriture ADMIN only,
  lecture ADMIN+CONSULTANT scopée (`can_access_employee`). Validation de
  chevauchement (`_check_no_overlap`) : deux périodes du même axe pour le
  même employé ne peuvent pas se recouvrir. Chaque action est tracée dans
  l'audit log existant (`MODIFY_EMP`, `details.action =
  'historique_<axe>_create/update/delete'`) — pas de nouveau type d'action
  `AuditLog.Action`.
- **UI fiche employé** (`EmployeeDetail.jsx`, onglet "Carrière") — 4
  timelines verticales en lecture seule (Fonction/Catégorie/Échelle/
  Contrats), période en cours mise en évidence. Boutons "Gérer
  l'historique <Axe>" (ADMIN only) ouvrent une modale de CRUD manuel par
  axe (ajouter/supprimer une période).
- **Piège "valeur actuelle" sans période ouverte** : un employé peut avoir
  une Fonction/Catégorie connue (`employee.poste_nom`/`categorie_nom`)
  sans qu'aucune `HistoriqueFonction`/`HistoriqueCategorie` avec
  `date_fin=None` n'existe — soit parce qu'aucun changement n'a encore été
  fait depuis l'usage de SOMIZ (aucun historique du tout), soit parce que
  toutes les périodes saisies manuellement sont déjà closes (rattrapage
  d'un historique 100% passé, sans période "en cours" explicitement
  ajoutée). Dans les deux cas, l'onglet Carrière affiche quand même cette
  valeur actuelle en plus des périodes listées, avec comme date de départ
  la fin de la dernière période connue (ou la date de recrutement de
  l'employé s'il n'y a aucun historique) — sinon la valeur "réelle" de
  l'employé semblait disparaître dès qu'on consultait son historique.
- **Piège pagination DRF** — `HistoriqueListCreateView` n'a pas de
  `pagination_class` custom (contrairement à `ReferentielSearchMixin`
  utilisé par les référentiels) : elle renvoie donc la pagination globale
  par défaut (`{count, next, previous, results}`), jamais un tableau brut.
  Le frontend doit lire `response.data.results || response.data` comme
  partout ailleurs pour ce type d'endpoint — l'oublier fait planter le
  rendu (`"X.map is not a function"` / `"is not iterable"`) dès qu'un
  employé a au moins une période enregistrée.

---

## Archivage employé (2026-09-02)

Un employé Inactif/Archivé/Démobilisé (`Employee.statut`) sort du
drill-down organisationnel de `/employees` (Direction → Département →
Service) et vit dans un onglet séparé **"Archivés (N)"** sur la même
page — l'onglet "Organisation" ne montre implicitement que les employés
Actif (plus de filtre "Statut" à ce niveau). Spec complète :
`docs/superpowers/specs/2026-09-02-archivage-employes-design.md`.

- **`MotifArchivage`** — référentiel simple (`nom`, `description`,
  `is_active`), même pattern que `Categorie`/`TypeContrat`. `Employee.motif_archivage`
  (FK nullable, `SET_NULL`) est **toujours facultatif**. Depuis 2026-09-23,
  ce modèle sert de référentiel générique "Motifs" (voir section "Motifs —
  référentiel générique" plus bas) : `nom` n'est plus unique globalement
  mais scopé par `categorie`.
- **Un employé Actif n'a jamais de motif** — `EmployeeCreateUpdateSerializer.validate()`
  force `motif_archivage=None` dès que `statut` résultant vaut `actif`,
  même si le payload en envoie un (garde-fou serveur, pas seulement
  côté formulaire).
- **Trois actions**, toutes ADMIN only :
  - **Archiver** (remplace l'ancien comportement de "Supprimer" tant que
    l'employé est Actif) — `PATCH /api/employees/<id>/`
    `{statut: 'archive', motif_archivage: <id|null>}`, réversible. Tracé
    dans l'audit log existant (`MODIFY_EMP`, même clé `details.transfer`
    que le transfert organisationnel/carrière — `TRANSFER_FIELD_LABELS`
    dans `AuditLogs.jsx` inclut désormais `statut`/`motif_archivage`).
  - **Restaurer** — `PATCH` `{statut: 'actif', motif_archivage: null}`,
    réversible.
  - **Supprimer définitivement** — `DELETE /api/employees/<id>/` ou
    `POST /api/employees/bulk-delete/` (`action=delete`). **Changement de
    politique (2026-09-02)** : ce n'est plus un soft-delete (l'ancien
    commentaire "on archive, on ne supprime pas" ne s'applique plus) —
    l'employé, ses contrats, documents et fichiers physiques sont
    supprimés définitivement et irréversiblement. **Bloqué (400) tant que
    l'employé est encore `statut=actif`** — il faut d'abord l'archiver,
    jamais un clic direct depuis la vue organisationnelle
    (`EmployeeDetailView.perform_destroy`/`EmployeeBulkDeleteView`,
    `backend/employees/views.py`). Confirmation renforcée côté frontend
    (saisie du mot "SUPPRIMER" via `usePrompt()`, `Employees.jsx`) en plus
    du garde-fou serveur.
- **Liste `/api/employees/`** : sans `?vue=archives` ni `?statut=`
  explicite, ne renvoie désormais que les employés Actif par défaut
  (`EmployeeListCreateView.get_queryset()`) — `?vue=archives` renvoie les
  3 statuts non-Actif, combinable avec `?statut=` pour n'en garder qu'un.
  `employee_search` (autocomplete) reste inchangé, volontairement limité
  aux Actif comme avant ce chantier.
- **Badges "N employé(s)"** sur les cartes Service/Cellule/Section
  (`ServiceSerializer`/`CelluleSerializer`/`SectionSerializer.get_nb_employes`,
  `referentiel_views.py`) ne comptent plus que les employés Actif — un
  employé archivé "sort" visuellement de l'organisation, y compris dans
  ces compteurs.
- Colonne "Motif" ajoutée à la liste des colonnes configurables de
  `/employees` (masquée par défaut, comme les autres colonnes ajoutées
  récemment — voir section "Liste employés — colonnes configurables").
- Dashboard **non modifié** par ce chantier (continue de compter tous les
  statuts) — laissé hors scope volontairement.

## Date de fin de contrat — synchronisation Employé ↔ Contrat (2026-10-05)

**Symptôme** : un contrat arrivant à échéance dans l'année (ex. fiche de
011927, fin au 27/08/2027) n'apparaissait pas dans « Contrats arrivant à
échéance » de `/statistiques`, alors que la fiche affichait bien la date.

**Cause** : deux sources pour la même information. `/statistiques`
(`audit.stats._contrats_echeance`) lit `Contrat.date_fin` ; la fiche affiche
`Employee.date_fin_contrat`. Le sens Contrat → Employé existait
(`Employee.sync_statut_from_dernier_contrat`, appelé à chaque
`Contrat.save()/delete()`), mais **pas le sens inverse** : modifier la date
de fin depuis le formulaire employé (`PATCH /employees/<id>/`) ne touchait
jamais le contrat. Risque associé : le prochain enregistrement du contrat
écrasait la date de l'employé par celle, vide, du contrat.

**Règle actuelle (bidirectionnelle)** :
- Contrat → Employé : inchangé (statut + date de fin du contrat au plus
  grand `numero_contrat`).
- Employé → Contrat : `EmployeeCreateUpdateSerializer.update` reporte
  `date_fin_contrat` sur ce même « dernier contrat » quand le champ est
  présent dans le PATCH. Passe par `Contrat.save()`, donc la synchro inverse
  s'exécute sans boucle (idempotente).
- Date de **début** : rien à synchroniser, `Employee` n'a pas de champ
  `date_debut_contrat` ; la fiche lit `contrats[0].date_debut`. À la création
  d'un employé, le formulaire envoie déjà `date_embauche` → `date_debut` et
  `date_fin_contrat` → `date_fin` du premier contrat.

**Correction de données (2026-10-05)** : 5 contrats avaient `date_fin` vide
alors que l'employé avait une date (011927, 012277, 013049, 010584, 010451) ;
la date de l'employé a été copiée sur le contrat (shell Django, après
vérification en lecture seule des écarts).

**Test** : `TestDateFinEmployeeVersContrat` dans `tests/test_contrat_views.py`.
Suite complète : 635 tests OK.

**À retenir** : toute nouvelle écriture directe sur `Employee.date_fin_contrat`
(import, script) doit aussi passer par le dernier contrat, sinon l'écart
réapparaît.
