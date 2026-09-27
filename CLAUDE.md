# SOMIZ — Guide Développeur

## Projet
**SOMIZ** = Système d'Archivage des Dossiers RH  
Application intranet pour centraliser et gérer les documents administratifs RH des employés.  
Conformité : Loi 18-07/ANPDP (Algérie) + RGPD.

**Rôles utilisateurs :**
- `SUPERADMIN` — mêmes droits qu'un ADMIN (`User.is_admin` renvoie `True` pour les deux), **plus** la visibilité complète sur `/audit` (voir ci-dessous). Ne peut être créé/attribué que via `manage.py shell`/accès direct base — jamais via l'UI ni l'API `/admin-users/` (`UserSerializer.validate_role`/`UserCreateSerializer.validate_role` rejettent toute tentative). Un ADMIN ordinaire ne voit même pas les comptes SUPERADMIN dans `/users` (404 sur leur id, exclus de la liste).
- `ADMIN` — droits complets (lecture, écriture, suppression, import, configuration), toujours accès organisation-wide
- `CONSULTANT` — lecture seule (pas de boutons d'action visibles), peut être restreint à un **périmètre organisationnel** (voir section Scoping ci-dessous) ou laissé sans restriction (comportement historique)
- `GESTIONNAIRE` — lecture seule type CONSULTANT sur son périmètre organisationnel (même mécanisme de scoping exactement), plus le droit de créer des demandes d'attestation de travail pour les employés de ce périmètre (voir section "Demandes d'attestation de travail"). `User.libelle_role` (ex. "Secrétaire", "Superviseur") est un simple libellé d'affichage par compte — aucune permission n'en dépend.

### Journal d'audit — visibilité par rôle (2026-08-30)

Un ADMIN ordinaire voit dans `/audit` **ses propres actions et celles de
tous les comptes CONSULTANT** (qu'il administre — traçabilité RGPD/Loi
18-07 sur ce qu'ils consultent), mais jamais celles d'un autre ADMIN ou
d'un SUPERADMIN — le filtre `user` de la query string reste borné à ce
périmètre côté serveur (`AuditLogListView`, `audit/views.py`), pas
seulement masqué côté UI. Seul un `SUPERADMIN` voit le journal complet
(toutes les actions, tous les comptes) ; chacune de ses consultations est
elle-même tracée (`AuditLog.Action.VIEW_AUDIT_LOG`, détail : filtres
utilisés) pour que ce pouvoir de surveillance reste lui-même auditable.
Aucun rôle ne peut modifier ou purger le journal (pas de DELETE sur
`AuditLog`).

---

## Toujours consulter avant de coder

1. **`contenu.md`** (racine) — documentation fonctionnelle complète du projet (1 000+ lignes)
2. **`frontend/src/styles/theme.js`** — tous les tokens de couleur, ombre, police. **Ne jamais hardcoder un hex dans un composant.**
3. **`frontend/src/styles/animations.css`** — classes d'animation disponibles
4. **`frontend/src/App.js`** — routes et structure de navigation
5. **`backend/employees/models.py`** — modèles de données (Direction, Departement, Service, Employé, Contrat, Document)
6. **`securite.md`** (racine) — journal des correctifs de sécurité, à jour à chaque changement touchant l'auth, les permissions ou la suppression de données
7. **`GRH_INTEGRATION.md`** (racine) — intégration entrante GRH → SOMIZ (synchronisation employés via webhook signé HMAC), voir aussi `docs/GRH_INTEGRATION_SPEC.md` (spec à transmettre à l'équipe GRH). **Non branché en production** : le code existe (`backend/employees/grh_integration.py`, route `/api/employees/grh-sync/`, tests), mais rien n'a encore été validé/activé côté GRH — ne pas considérer cette intégration comme active tant que `GRH_INTEGRATION.md` (section "Ce qui reste à faire") n'est pas soldée

---

## Exposition locale via tunnel (dev uniquement, 2026-09-15)

Le poste de dev peut avoir `ngrok`, `cloudflared` (Cloudflare Tunnel) et/ou
`Tailscale` installés pour exposer temporairement le serveur de dev React
(port 3000) sur internet à des fins de test/démo — voir `securite.md` point
35 pour le détail de l'incident/config associés (dont un correctif
`frontend/.env` : `HOST=127.0.0.1` au lieu de `localhost`, pour que le
serveur de dev écoute en IPv4 et reste joignable par ces tunnels). **Ne
jamais utiliser ces tunnels pour exposer un environnement avec de vraies
données RH** — ils ne remplacent aucun contrôle d'accès SOMIZ (JWT, RBAC,
scoping), ils exposent le port tel quel à quiconque a l'URL. Le tailnet
Tailscale de cette machine (`desktop-uek2hc8.tail9d7cd0.ts.net`) reste actif
mais son Funnel n'a pas pu être rendu réellement public (DNS renvoyant une
IP interne Tailscale non routable) — non fiable comme solution durable.

---

## Stack technique

### Backend
- Python 3, Django 5.2 LTS, Django REST Framework 3.17.2
- Authentification JWT via **httpOnly cookies** (résistant au XSS), CSRF en double-soumission (`accounts/cookie_auth.py`)
- Base de données : PostgreSQL
- Cache : Redis (`django-redis`) — rate-limiting DRF fiable en multi-worker, repli sur cache mémoire local si `REDIS_URL` absent (dev/CI)
- Anti-brute-force unifié : 5 tentatives → blocage 30 min, appliqué à `/api/auth/login/` **et** `/django-admin/login/` (`accounts/backends.py`)
- Session JWT : access 2h / refresh 10h (plafond absolu, pas de rotation glissante — voir `CookieTokenRefreshView`)
- Validation MIME : python-magic (20 Mo max par fichier), noms de fichiers régénérés en UUID (pas de path traversal)
- Soft-delete partout (`is_active` flag) — **sauf `EmployeeDocument`/`EmployeeDocumentFile`** (voir section Documents ci-dessous, suppression définitive depuis 2026-07-22)
- Audit logging complet (13 types d'actions incl. `CREATE_USER`/`MODIFY_USER`/`DELETE_USER`), y compris les mutations faites via `/django-admin/`
- Rate-limiting dédié (`consultation`, 30/min) sur la visualisation de documents, en plus du throttle global (`anon` 10/min, `user` 200/min)
- `Permissions-Policy` globale (`config/middleware.py`) désactivant caméra/micro/géoloc/paiement

### Frontend
- React 19, React Router 7, Axios
- **Styles inline uniquement** (`style={{}}`) — pas de Tailwind, pas de CSS modules
- Tokens centralisés dans `theme.js`
- Classes d'animation dans `animations.css`
- Police : **Plus Jakarta Sans** (Google Fonts, chargée dans `index.html`)

---

## Hiérarchie des données

```
Direction
  └── Departement (N par Direction)
        └── Service (N par Département)
              └── Employé (N par Service)
                    ├── Documents (dossier général)
                    └── Contrat (N par Employé)
                          └── Documents (dossier contrat)
```

---

## Scoping organisation-wide (périmètre CONSULTANT)

Un CONSULTANT peut être restreint à un périmètre : `User.scope_directions`,
`scope_poles`, `scope_departements`, `scope_services`, `scope_cellules`
(ManyToMany, sélection multiple à chaque niveau — union : un employé est
visible dès qu'il correspond à AU MOINS un élément choisi, peu importe le
niveau). **Aucune sélection nulle part = accès à AUCUN employé sur cette
dimension** (règle inversée le 2026-09-01 — l'ancien comportement,
"vide = non restreint", est désormais réservé à ADMIN/SUPERADMIN ; un
CONSULTANT sans aucune case cochée ne voit plus rien via le périmètre
organisationnel, sauf accès ponctuel via `EmployeeAccessGrant`, voir
section "Périmètre ponctuel — employés spécifiques" plus bas).
`Employee` n'a pas de FK directe vers `Pole` (seulement via
`departement.pole`) — un périmètre par Pôle se traduit donc en
`departement__pole_id__in`.

- `User.employee_scope_q(prefix='')` — Q object à utiliser dans `.filter()` (ex. `prefix='employee__'` pour un queryset `Contrat`).
- `User.can_access_employee(employee)` — équivalent objet-par-objet pour `get_object()`.
- `User.accessible_directions_qs()` / `accessible_poles_qs()` / `accessible_departements_qs()` / `accessible_services_qs()` / `accessible_cellules_qs()` — pour restreindre les listes référentiels (`/ref/*`) au périmètre (utilisé par le filtre cascade de `/employees` et par `/organigramme`).
- `/ref/directions/`, `/ref/poles/`, `/ref/departements/`, `/ref/services/`, `/ref/cellules/` acceptent `?all=1` pour ignorer le périmètre et renvoyer le référentiel complet (utilisé uniquement par `/organigramme`, qui affiche l'arbre entier mais grise les nœuds hors périmètre côté frontend plutôt que de les cacher — voir `Organigramme.jsx`).
- ADMIN toujours non restreint, quel que soit ce qui est renseigné sur son compte.
- UI d'assignation : page `/users`, bouton "Périmètre" (visible pour les comptes CONSULTANT) — cases à cocher en cascade (cocher une Direction filtre les Pôles/Départements affichés à ceux qu'elle contient, etc.), boutons "Tout"/"Aucun" par niveau.
- Toute vue qui liste/retrouve des employés, documents ou contrats doit appliquer ce scoping (voir `employees/views.py` : `EmployeeListCreateView`, `EmployeeDetailView`, `FileViewerView`, `DocumentViewerView`, `ContratListCreateView`, `ContratDetailView`, `ContratDocumentListUploadView`, `employee_search`).

### Périmètre indépendant — Types de documents (2026-07-24)

En plus du périmètre organisationnel ci-dessus, un CONSULTANT peut être
restreint à certains **types de documents** (`User.scope_types_documents`,
ManyToMany vers `TypeDocument`). Ce périmètre est **indépendant** et se
combine en **ET** avec le périmètre organisationnel (qui vs quoi) — un
CONSULTANT restreint aux deux ne voit que les documents des types
autorisés, pour les employés de son périmètre organisationnel. Aucune
sélection = aucun type de document visible sur cet axe (règle inversée
le 2026-09-01, même règle que le périmètre organisationnel ci-dessus).

- `User.document_type_scope_q(prefix='type_doc_id')` — Q object pour `.filter()` sur un queryset `EmployeeDocument` (adapter le prefix, ex. `'document__type_doc_id'`, pour un queryset `EmployeeDocumentFile`).
- `User.can_access_document_type(type_doc_id)` — équivalent objet-par-objet.
- `User.accessible_types_documents_qs()` — restreint `/ref/types-documents/` (GET) au périmètre.
- Appliqué dans `DocumentListUploadView`, `ContratDocumentListUploadView`, `FileViewerView`, `DocumentViewerView`, et dans `EmployeeDetailSerializer.get_documents()` / `get_documents_manquants()`.
- UI d'assignation : même modal "Périmètre" (page `/users`), section séparée "Types de documents" (pas de cascade, juste Tout/Aucun).

### Périmètre ponctuel — employés spécifiques (2026-08-30, étendu 2026-09-01)

En plus des deux périmètres ci-dessus, un CONSULTANT peut recevoir un
accès ponctuel à un ou plusieurs **employés précis**
(`EmployeeAccessGrant`, `user` + `employee` + `type_doc` optionnel +
`champ_personnel` optionnel — une ligne par `(employé, type)` ou par
`(employé, champ personnel)`, jamais les deux sur la même ligne) —
combiné en **OU** avec le périmètre organisationnel (l'employé devient
visible en plus de son périmètre normal, pas à la place). Trois niveaux
de grant, par employé :
- Aucune ligne `type_doc` NI `champ_personnel` (ou toutes retirées) —
  **dossier complet** de cet employé : documents + contrats + **tous les
  champs personnels**, sans exception.
- Une ou plusieurs lignes `type_doc=<X>` — uniquement les documents de ces
  types précis, dans le dossier général de l'employé (jamais les
  documents de contrat — un grant dossier complet est nécessaire pour
  couvrir aussi les contrats).
- Une ou plusieurs lignes `champ_personnel=<Y>` — uniquement ces champs
  personnels précis (`ChampPersonnalise.categorie=PERSONNEL`) pour cet
  employé. Un grant `type_doc=<X>` seul ne débloque aucun champ
  personnel, et symétriquement un grant `champ_personnel=<Y>` seul ne
  débloque aucun document — seul le grant dossier complet (les deux
  colonnes `None`) couvre les deux axes à la fois.

Contrairement au périmètre "types de documents"/"champs personnels"
global, ces grants sont **indépendants** de `scope_types_documents`/
`scope_champs_personnels` — un grant ponctuel donne accès même si
l'élément n'est pas dans le périmètre global de l'utilisateur. Un
type/champ déjà couvert par le périmètre global n'a pas besoin d'un grant
séparé — l'UI l'affiche automatiquement coché (non modifiable) dans la
liste par employé, pour éviter toute confusion sur ce qui est déjà
accessible.

- `User.accessible_type_doc_ids_for_employee(employee, contrat_scope=False)`
  — `None` (tous les types visibles) ou `set` d'ids de `TypeDocument`
  autorisés pour CET employé, tenant compte du périmètre organisationnel +
  global + des grants. `contrat_scope=True` ignore les grants type_doc
  précis (utilisé par `ContratDocumentListUploadView`).
- `User.accessible_champs_personnels_for_employee(employee)` — même
  principe, symétrique, pour les champs personnels (`None` ou `set`
  d'ids de `ChampPersonnalise`). Utilisé par
  `EmployeeDetailSerializer.get_champs_categories()` (calculé une seule
  fois par employé, pas par champ).
- `User.can_access_document(employee, type_doc_id, contrat_scope=False)`
  — équivalent objet-par-objet, combine `can_access_employee()` (étendu
  pour inclure les employés avec grant) et la méthode ci-dessus.
- UI : même modale "Périmètre" (`/users`), section "Employés spécifiques"
  — recherche (nom, prénom, matricule, **n° contrat** — `employee_search`
  cherche aussi sur `contrats__numero_contrat`) + deux listes à cocher par
  employé : "Dossier complet" / un-ou-plusieurs types de documents, et
  "Champs personnels" / un-ou-plusieurs champs précis. Cocher un champ
  personnel précis sort naturellement du mode "Dossier complet" (même
  mécanique que les types de documents : le dossier complet correspond à
  `type_docs` ET `champs_personnels` vides tous les deux).
  `GET/PUT /api/admin-users/<id>/employee-grants/` (ADMIN only, PUT
  remplace l'ensemble des lignes de ce compte). Badge "Employés
  spécifiques" dans la colonne Périmètre de `/users`
  (`UserSerializer.employee_grants_count`, nombre d'employés distincts —
  pas de lignes de grant).
- Un grant ne peut jamais référencer un `TypeDocument` catégorie
  (`is_categorie`), même garde-fou que le reste du système. Une ligne ne
  peut jamais cibler `type_doc` ET `champ_personnel` en même temps
  (`EmployeeAccessGrantSerializer.validate()`, 400 sinon).

### Référentiel "Section" (2026-08-30)

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

## Hiérarchie des types de documents — sous-dossiers (2026-07-24)

`TypeDocument` supporte 2 niveaux via un champ auto-référent `parent`
(`FK('self', null=True, on_delete=SET_NULL, related_name='sous_types')`) :
une **catégorie** (ex. "État civil", `parent=None`) regroupe des types
**feuilles** réellement uploadables (ex. "Acte de naissance", "Acte de
mariage", `parent=<catégorie>`). Une catégorie ne peut pas elle-même avoir
un parent (validé dans `TypeDocumentSerializer.validate_parent`, 2 niveaux
max) et n'est jamais rattachable à un `EmployeeDocument`.

- `TypeDocument.is_categorie` (property) — True si le type a des `sous_types` (donc non uploadable).
- Toute requête qui compte/valide des types "réels" (complétude, `documents_manquants`, queryset d'upload) doit filtrer `sous_types__isnull=True` pour exclure les catégories — voir `Employee.dossier_complet`/`taux_completude`, `DocumentUploadSerializer.type_doc`, `EmployeeListCreateView.get_serializer_context`, `employee_search`.
- `EmployeeDocumentSerializer.type_document_parent` / `documents_manquants[].parent_nom` — exposent le nom de la catégorie parente pour permettre au frontend de regrouper visuellement.
- Frontend (`EmployeeDetail.jsx`, `ContratDetail.jsx`) : la sidebar "Documents" regroupe les documents (présents et manquants) par catégorie via `groupDocsByParent()` — un en-tête 📁 précède le premier document de chaque catégorie, les items sont légèrement indentés. Le `<select>` "Ajouter un document" liste les types racine puis les types groupés par `<optgroup>` (catégorie), et exclut toujours les catégories elles-mêmes (`typesDocumentsList` filtré sur `!t.is_categorie`).
- UI de gestion : `/parametres` → onglet "Types de documents" → champ "Catégorie parente" (optionnel) dans le formulaire d'ajout/édition — désactivé (obligatoire forcé à "Optionnel") dès que le type a des sous-types, avec une note explicative.
- **Piège "obligatoire" sur une catégorie** : une catégorie n'étant jamais uploadable, son propre `obligatoire=True` ne compte plus dans aucune statistique (voir `sous_types__isnull=True` ci-dessus) — si un type obligatoire existant reçoit des sous-types (devient une catégorie), l'exigence "disparaît" silencieusement sauf à la reporter explicitement sur au moins un des sous-types. `TypeDocumentSerializer.validate()` force `obligatoire=False` côté serveur dès que l'instance a des `sous_types`, pour qu'on ne puisse pas laisser une catégorie affichée "Obligatoire" par erreur (incident réel du 2026-07-24 : "Expériences professionnelles" et "Sécurité Sociale" étaient devenues des catégories sans que leurs nouveaux enfants soient marqués obligatoires, cassant le taux de complétude partout — dashboard, liste employés, fiche employé).
- **Ordre d'affichage stable** : `EmployeeDocument.Meta.ordering = ['type_doc__ordre', 'type_doc__nom']` (plus `-uploaded_at`) — un document qui passe de "manquant" à "présent" (ou est ré-uploadé en nouvelle version) ne doit pas sauter en tête de liste. Sur `EmployeeDetail.jsx`/`ContratDetail.jsx`, les documents présents et manquants sont fusionnés en une seule séquence triée par l'`ordre` du type (celui de la catégorie parente si groupé) et positionnés via CSS `order` (flex) — pas de réordonnancement DOM — pour qu'un document garde exactement sa place visuelle en changeant de statut.

---

## Champs cliquables vers le document source (2026-08-31)

Sur la fiche employé, un champ du panneau "Informations" (ex. "Date de
naissance") peut être associé à un type de document précis (ex. "Acte de
naissance") : cliquer dessus bascule sur l'onglet "Dossier" et ouvre
directement ce document — ou, s'il est manquant, scroll + surligne
temporairement (2s) sa ligne dans la liste des documents manquants.

- `TypeDocument.champ_source` (`CharField`, blank=True) — code d'un champ
  système (`date_naissance`, `nin`...) ou d'un `ChampPersonnalise.code`.
  Pas de FK, pas de contrainte d'unicité en base. Une catégorie
  (`is_categorie`) ne peut jamais en avoir un —
  `TypeDocumentSerializer.validate()` le force à vide dès que l'instance a
  des `sous_types`, même garde-fou que pour `obligatoire`.
- UI `/parametres` → "Types de documents" : select "Champ source"
  (optionnel), options = les 12 champs de `SYSTEM_FIELDS` + les champs
  personnalisés actifs (chargés une fois au montage de `Parametres.jsx`,
  indépendamment de l'onglet actif).
- `EmployeeDetail.jsx` : `champToDoc` (map `{champ_source → type_doc}`,
  dérivée de `typesDocumentsList` déjà chargé) rend chaque `infoFields`
  correspondant cliquable. `handleFieldClick(code)` cherche d'abord un
  document présent (`documentsAffiches`, par `type_doc_id`) — sinon
  cherche l'entrée `documents_manquants` correspondante (par `id`) et la
  surligne via `missingRowRefs` (map de refs DOM indexée par `code`,
  attachée aux lignes "manquant" existantes).
- **Piège jsdom** : `Element.scrollIntoView` n'existe pas dans jsdom (tests
  Jest) — l'appel doit être `?.scrollIntoView?.(...)`  (chaînage optionnel
  sur la méthode elle-même, pas seulement sur l'élément), sinon une
  `TypeError` différée (dans un `setTimeout`) fait planter toute la suite
  de tests quand elle tourne aux côtés d'autres fichiers — confirmé en
  observant le nombre de tests en échec passer de 55 (baseline connue,
  pré-existante, sans rapport avec ce chantier) à 56 avant ce correctif.

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

## Limites d'upload — fichiers/taille/pages (2026-09-15)

| Canal | Fichiers max | Taille/fichier | Pages max au total | Fusion en 1 PDF |
|---|---|---|---|---|
| Dossier employé (`DocumentListUploadView`) | 50 | 20 Mo | 50 | Oui |
| Documents de contrat (`ContratDocumentListUploadView`) | 50 | 20 Mo | 50 | Oui (aligné le 2026-09-15) |
| Scanner un dossier (`ScanImportView`) | 100 | 20 Mo | 100 | Oui (natif) |

Constantes : `MAX_UPLOAD_SIZE_MB`, `MAX_UPLOAD_PAGES`,
`MAX_SCAN_IMPORT_SIZE_MB` (`backend/config/settings.py`). Toute limite
dépassée renvoie une erreur 400 explicite (`{'error': '...'}` ou
`non_field_errors`) — **jamais silencieuse** : chaque page frontend
concernée (`EmployeeDetail.jsx`, `ContratDetail.jsx`, `ScanImportModal.jsx`)
doit lire `error` en priorité puis les fallbacks DRF (`non_field_errors`,
`files[0]`, `plan`) avant d'afficher un message générique — deux bugs de
ce type (message générique masquant la vraie erreur) corrigés le
2026-09-15 sur `ContratDetail.jsx` et `ScanImportModal.jsx`. Détail complet
: `securite.md` points 34-35.

---

## Documents employés — suppression définitive (2026-07-22)

**Changement de politique** (demande explicite utilisateur, dérogation au soft-delete standard) : la suppression d'un fichier (`FileDeleteView`) ou d'un document (`DocumentDeleteView`) est désormais un **hard delete** — ligne DB + fichier physique supprimés immédiatement, irréversible. Avant ce changement, `EmployeeDocument`/`EmployeeDocumentFile` étaient soft-deleted (`is_active=False`), y compris les anciennes versions remplacées par un ré-upload (mécanisme de versioning dans `EmployeeDocument.save()`) — cet historique de versions a été purgé en même temps (voir incident ci-dessous).

Chaque suppression reste tracée dans l'audit log (`AuditLog.Action.DELETE_DOC`), mais celui-ci ne conserve qu'un **snapshot texte** (nom fichier, type, version) — le contenu du document n'est plus récupérable une fois supprimé.

### Suppression de `TypeDocument` (`/parametres`, onglet "Types de documents")
- Le champ **Code** est modifiable en édition (n'est plus verrouillé après création).
- `TypeDocumentDetailView.destroy` (`employees/referentiel_views.py`) : bloque la suppression avec un message clair (400, pas de 500) s'il reste des documents **actifs** de ce type ; si seuls des documents déjà supprimés/archivés existent, ils sont purgés automatiquement (fichiers + lignes) avant de supprimer le type.

### ⚠️ Incident du 2026-07-22 — script de purge des orphelins media/
Un script one-off pour purger les fichiers orphelins de `backend/media/employees/` (fichiers sans ligne DB correspondante, ~184 fichiers) a mal comparé les chemins (bug de normalisation) et a supprimé **aussi les 7 fichiers activement référencés**. Les fichiers physiques n'ont pas pu être récupérés (pas de git, pas de corbeille — `os.remove()` est définitif) ; 3 d'entre eux (uploadés dans la même session) ont pu être ré-associés car les fichiers physiques n'avaient en fait pas été touchés par une suppression DB séparée juste avant.
- **Leçon** : ne jamais exécuter de script de suppression en masse sur `media/` sans (1) lister précisément les chemins concernés et les faire valider un par un ou par échantillon par l'utilisateur, (2) vérifier la normalisation de chemin (relatif vs absolu) avant tout `os.remove()`, (3) faire une copie de sauvegarde du dossier avant toute purge.
- `media/` est gitignored → aucune récupération possible via git en cas d'erreur.

### Renommage de fichier (2026-07-24)
- `FileDetailView` (`employees/views.py`, ex-`FileDeleteView`) gère désormais `PATCH /api/files/{id}/` (renomme, ADMIN only, log `MODIFY_DOC`) en plus de `DELETE`.
- Frontend : pas d'édition inline (source de bugs — un champ texte ouvert pour un fichier pouvait se fermer sans sauvegarder si on cliquait sur un autre fichier avant que le blur ne se résolve). Utilise `usePrompt()` (`components/ConfirmDialog.jsx`) — une modale avec champ texte, remplace `window.prompt()`. Le nom proposé dans la modale est **sans l'extension** (`.pdf`, `.png`...) ; elle est automatiquement réattachée au nom final envoyé au serveur.
- Affichage : partout où un `file_name` est montré (sidebar, onglets multi-fichiers, en-tête du viewer), l'extension est masquée via un helper local `stripExt()` (dupliqué dans `EmployeeDetail.jsx` et `ContratDetail.jsx`) — cosmétique uniquement, le nom stocké en base garde son extension.

---

## Photo de profil employé (2026-07-24)

- `Employee.photo` (`ImageField`, upload_to `employee_photo_upload_path`, régénéré en UUID).
- `EmployeePhotoView` (`GET`/`POST`/`DELETE` sur `/api/employees/{id}/photo/`) : GET ouvert à ADMIN+CONSULTANT (respecte le scoping via `can_access_employee`), POST/DELETE réservés ADMIN. Upload restreint à JPEG/PNG/WebP, 5 Mo max (`settings.ALLOWED_PHOTO_MIME_TYPES`/`MAX_PHOTO_SIZE_MB` — distinct des réglages documents qui acceptent aussi PDF/TIFF).
- `has_photo` (bool) exposé dans `EmployeeListSerializer`/`EmployeeDetailSerializer` — jamais l'URL/le chemin brut du fichier.
- Frontend : `components/EmployeeAvatar.jsx` — récupère la photo via un fetch blob authentifié (comme les documents, pas de lien direct vers `/media/`), fallback sur les initiales. `shape="square"` (coins arrondis, façon photo d'identité) utilisé sur la fiche employé (grand format, upload via crayon) et dans la liste `/employees` (petit format).

### Ajouter/modifier/supprimer + cadrage à l'upload (2026-09-14)

- Sur `EmployeeDetail.jsx`, le crayon (upload/remplacement) ouvre désormais `components/PhotoCropModal.jsx` (`react-easy-crop`, zoom + déplacement) avant l'envoi — le fichier posté à `/photo/` est toujours le JPEG recadré côté client (canvas), jamais le fichier original. Une icône poubelle séparée (visible seulement si `has_photo`) appelle `DELETE /photo/` via `useConfirm()` (pas de `window.confirm`, voir section dédiée plus bas).
- L'input accepte aussi `application/pdf` (scan de photo d'identité) : `utils/pdfToImage.js` (`pdfFirstPageToImageUrl`, réutilise pdf.js déjà chargé pour `ScanImportModal`) rend la première page du PDF en image PNG côté client avant d'ouvrir la même modale de cadrage — le PDF lui-même n'est jamais envoyé au serveur.
- Aucun changement backend : `EmployeePhotoView` continue de valider JPEG/PNG/WebP, 5 Mo max, quelle que soit la source (image directe ou page de PDF convertie).
- Toute erreur (upload refusé par le serveur, PDF illisible, échec du cadrage) affiche le texte réel — jamais un message vide (convention générale du projet, voir aussi le piège categorie/sous-type documenté ailleurs) : `PhotoCropModal` a son propre encart d'erreur, et `EmployeeDetail.jsx` ferme la modale puis réutilise le bandeau `message` existant en cas d'échec serveur.

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

## Format d'affichage des dates — DD/MM/YYYY (2026-09-17)

Toute date affichée à l'écran (pas les `<input type="date">` de saisie,
qui gardent le format natif du navigateur, non personnalisable en HTML
standard) utilise le format `DD/MM/YYYY`.

- `frontend/src/utils/formatDate.js` (`formatDateFR(isoString)`) — parsing
  manuel de la chaîne ISO (`YYYY-MM-DD` ou avec heure), pas
  `new Date().toLocaleDateString()`, pour éviter tout décalage de fuseau
  horaire sur une date sans heure. Retourne `—` pour une valeur vide/
  invalide. Appliqué partout où une date structurelle (naissance,
  recrutement, contrat, historique de carrière...) était affichée brute en
  ISO — `EmployeesTable.jsx`, `EmployeeDetail.jsx`, `ContratDetail.jsx`,
  `ContratsTab.jsx`, `CarriereTab.jsx`.
- Les `formatDateTime()` locaux qui combinent déjà date+heure via
  `toLocaleString("fr-FR", {...})` (upload de fichiers, audit) étaient
  déjà en `DD/MM/YYYY` par construction de la locale `fr-FR` — non touchés.
- Export xlsx `/api/reporting/stats-export.xlsx/` (`audit/views.py`,
  `_stats_sheet(..., date_cols=[...])`) : les colonnes date sont écrites
  comme objets `date` Python (pas des chaînes) avec
  `cell.number_format = 'DD/MM/YYYY'` — lisible quel que soit le
  paramètre régional Excel de l'admin qui l'ouvre.
- Non concerné, volontairement : le parsing des imports CSV/xlsx en
  entrée (reste au format ISO `YYYY-MM-DD` actuellement accepté) et les
  exemples de valeurs dans les templates d'import téléchargeables
  (`EmployeeImportTemplateView`) — ils doivent rester au format que
  l'import sait effectivement relire, pas au format d'affichage écran.

---

## Rotation par défaut des documents (2026-09-17)

Dans `SecureDocViewer.jsx`, le bouton ⟳ (pivoter de 90°) reste disponible
pour tout le monde mais ne modifie qu'un état React local (jamais persisté,
comme avant ce chantier). Un ADMIN/SUPERADMIN dispose en plus d'un bouton
**💾 Enregistrer** (absent pour CONSULTANT) qui enregistre la rotation
courante comme **valeur par défaut affichée à tous** les utilisateurs qui
ouvriront ensuite ce document — un CONSULTANT peut toujours pivoter pour
lui-même, mais ça n'écrit jamais cette valeur par défaut.

- `EmployeeDocumentFile.rotation` (image/fichier entier) et
  `EmployeeDocumentFilePage.rotation` (page de PDF, une valeur par page —
  même granularité que le nommage de page déjà existant), choix
  `{0, 90, 180, 270}`.
- `PATCH /api/files/{id}/` et `PATCH /api/files/{id}/pages/{page_id}/`
  (mêmes vues ADMIN only que le renommage) acceptent un champ `rotation`
  optionnel en plus des champs existants.
- `SecureDocViewer` : props `savedRotation` (image), `canSaveRotation`
  (bool, calculé depuis `user.role` par la page appelante),
  `onSaveRotation(rotation, pageId?)`. Câblé sur `EmployeeDetail.jsx`/
  `DossierTab.jsx` (fichier ou page PDF) et `ContratDetail.jsx` (fichier
  uniquement — `pages` n'y est pas encore câblé, un contrat n'a pas le
  panneau de gestion de pages).

---

## Confirmations & saisies — plus de popups navigateur (2026-07-24)

`window.confirm()` et `window.prompt()` sont bannis du code — remplacés par des modales stylées cohérentes avec le design system, définies dans `components/ConfirmDialog.jsx` :
- `useConfirm()` → `{ confirm, ConfirmDialog }` : `if (!(await confirm("Supprimer ?"))) return;`, puis rendre `{ConfirmDialog}` quelque part dans le JSX du composant.
- `usePrompt()` → `{ prompt, PromptDialog }` : `const v = await prompt("Nouveau nom :", valeurActuelle); if (v === null) return;`, puis rendre `{PromptDialog}`.
- Utilisés dans `Employees.jsx`, `EmployeeDetail.jsx`, `ContratDetail.jsx`, `Parametres.jsx`, `Users.jsx`. Toute nouvelle confirmation/saisie doit passer par ces hooks, pas par les globales navigateur (tests Jest : simuler le clic sur le bouton "Confirmer"/"Renommer" de la modale plutôt que mocker `window.confirm`).

---

## Rafraîchissement de données après action — pas de flash "page qui recharge" (2026-08-27)

Une page de détail (`EmployeeDetail.jsx`, `ContratDetail.jsx`) ou de liste
avec panneau ouvert (`Users.jsx`, `Parametres.jsx`) a typiquement un
`fetch*()` qui fait `setLoading(true)` avant l'appel API, avec un
early-return `if (loading) return <div>Chargement...</div>` (ou un
skeleton) qui remplace tout le contenu tant que `loading` est vrai. Ce
`fetch*()` est appelé une première fois au montage (`useEffect`), **et**
réutilisé après chaque action mutante (renommer, supprimer, upload,
modifier, activer/désactiver, import CSV) pour rafraîchir les données
affichées. Si l'appel post-action refait `setLoading(true)`, toute la page
se démonte brièvement (perte du scroll, du fichier/onglet sélectionné, du
viewer ouvert) — visuellement indiscernable d'un rechargement de page,
alors qu'aucun `window.location.reload()` n'est en cause.

**Convention** : tout `fetch*()` de ce genre doit accepter un paramètre
`silent` (dernier argument, défaut `false`) qui saute `setLoading(true)`/
`setLoading(false)` (et toute réinitialisation de sélection qui va avec,
ex. re-sélection du premier document) quand `true`. Seul l'appel initial
au montage reste non-silencieux ; tous les rafraîchissements déclenchés
par une action mutante doivent passer `fetch*(true)` (ou
`fetch*(..., true)` si la fonction a déjà des paramètres, voir
`Parametres.jsx#fetchTab`).

- Déjà appliqué à : `EmployeeDetail.jsx#fetchEmployee`,
  `ContratDetail.jsx#fetchContrat`, `Users.jsx#fetchUsers`,
  `Parametres.jsx#fetchTab`.
- Ne s'applique **pas** aux listes qui rechargent normalement sur
  changement de filtre/page (ex. `Employees.jsx#fetchEmployees` sur
  `useEffect([search, page, ...])`) — ce loading-là est attendu, tant
  qu'il ne démonte pas un panneau/une sélection sans rapport ouverte
  ailleurs sur la page.
- Toute nouvelle page de détail avec actions mutantes (renommer,
  supprimer, modifier...) qui rafraîchit ses données doit suivre ce
  pattern dès l'écriture, pas après coup.

---

## Gestion des utilisateurs — suppression de compte (2026-07-24)

`UserUpdateView` (`accounts/admin_views.py`) est passée de `UpdateAPIView` à `RetrieveUpdateDestroyAPIView` — `DELETE /api/admin-users/{id}/` supprime définitivement un compte (hard delete, ADMIN only), avec garde-fous dans `perform_destroy` :
- Un ADMIN ne peut pas se supprimer lui-même.
- Impossible de supprimer le dernier compte ADMIN actif.
- Loggé en `AuditLog.Action.DELETE_USER`.
Le formulaire de création (`/users`) inclut directement la section "Périmètre d'accès" (visible si rôle CONSULTANT) — le périmètre est sauvegardé juste après la création du compte, plus besoin de rouvrir "Périmètre" après coup.

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

## Scanner et import complet — documents scannés (2026-08-27/28)

Bouton **"Scanner un dossier"** sur la fiche employé (`EmployeeDetail.jsx`,
sidebar Documents, à côté de "Ajouter un document") : permet d'importer en
une seule opération un lot de fichiers scannés (PDF multi-pages et/ou
images) et de répartir leurs pages entre plusieurs types de documents, au
lieu d'uploader chaque document séparément. **Toujours attaché au dossier
général de l'employé** — jamais à un contrat spécifique (un contrat a sa
propre page dédiée, `ContratDetail.jsx`, pour ses documents ; voir aussi
ci-dessous "Ajouter un document" qui a le même comportement).

- Backend : `POST /api/employees/{id}/documents/scan-import/`
  (`ScanImportView`, `employees/views.py`, ADMIN only). Reçoit `files`
  (multipart, fichiers uniques) + `plan` (JSON décrivant des groupes
  `{type_doc, parts: [{file_index, pages}|{file_index, is_image}]}`).
  Un fichier PDF entièrement couvert par une seule part est réutilisé tel
  quel (pas de ré-encodage) ; sinon `pypdf` (`employees/pdf_utils.py`,
  `extract_pdf_pages`/`pdf_page_count`) découpe les pages demandées. Un
  groupe qui échoue (page hors limites, etc.) n'annule pas les autres —
  réponse `{created: [...], failed: [...]}`.
- **Nom de fichier** : garde le nom du fichier scanné original (cohérent
  avec l'upload normal, traçabilité si le même type est réimporté plus
  tard) — une part obtenue par découpage de pages ajoute juste la plage
  entre parenthèses (`_scan_import_file_name()`, ex. `"scan (p2).pdf"`).
  Ne **pas** renommer d'après le type de document ici (essayé puis
  abandonné : perd la diversité/traçabilité entre imports successifs).
- **Fusion automatique quand plusieurs pages/fichiers rejoignent le même
  type** (2026-09-15) : dans `ScanImportModal.jsx`, glisser plusieurs pages
  (d'un même PDF source ou de fichiers différents, ex. recto + verso) sur
  le même "dossier" 📁 produit un seul `EmployeeDocument` avec un seul
  fichier fusionné (`ScanImportView.post`, `pdf_utils.merge_group_parts`)
  — jamais plusieurs `EmployeeDocumentFile` séparés pour le même groupe.
  Chaque page interne garde le nom de sa source (recto/verso, ou "<nom>
  page N" pour une source multi-page), gérable ensuite individuellement
  via `EmployeeDocumentFilePage` (renommer/réorganiser/remplacer/
  supprimer, panneau "Modifier") — même règle et même mécanisme que
  l'upload manuel multi-fichiers (`DocumentListUploadView.post`, voir plus
  haut "on doit pouvoir renommer les pages"). Un groupe à une seule part
  garde le comportement existant (fichier stocké tel quel ou pages
  extraites, aucune fusion nécessaire).
- Frontend : `components/ScanImportModal.jsx` — pdf.js (`react-pdf`, déjà
  utilisé par `SecureDocViewer`) génère une grille de miniatures. Chaque
  page est **glissée-déposée** (`draggable`) sur un "dossier" 📁 (un par
  type de document, barre au-dessus de la grille) pour l'assigner — pas de
  select+bouton "Assigner". Clic sur une page = bascule sa sélection
  seule (pas de sélection auto de tout le fichier) ; Shift-clic = plage ;
  double-clic = sélectionne tout le fichier source d'un coup ; cliquer un
  dossier avec des pages sélectionnées les assigne aussi (sans drag).
- **`EmployeeDocument.save()` — bug de versioning corrigé** (découvert en
  testant cette feature) : la condition `if not self.pk:` pour détecter
  une insertion ne fonctionnait jamais, car `id` a un
  `default=uuid.uuid4` (le pk est déjà rempli à l'instanciation, avant le
  premier `save()`) — la logique de versioning (un nouvel upload du même
  type désactive l'ancien) ne se déclenchait donc jamais. Corrigé avec
  `self._state.adding` (le bon test pour un modèle à PK UUID avec
  default). Affecte tout le code existant qui crée un `EmployeeDocument`,
  pas seulement le scan-import.
- **Piège Content-Length** : `EmployeeDocumentFile.file_size` doit être la
  taille du fichier réellement enregistré (`file_to_save.size`), jamais
  celle du fichier source original avant découpage — sinon
  `FileViewerView` envoie un `Content-Length` trop grand par rapport aux
  octets transmis, et le navigateur reste bloqué à attendre indéfiniment
  ("Chargement..." qui ne finit jamais) sur les pages extraites d'un PDF.
- **"Ajouter un document" (upload classique) ne s'attribue plus au contrat
  sélectionné** : avant, avec un contrat actif dans la sidebar, l'upload
  partait vers `/contrats/{id}/documents/` ; désormais toujours
  `/employees/{id}/documents/` (le pill de contrat ne sert plus qu'à
  filtrer l'affichage, pas à choisir la destination d'un nouvel upload) —
  comportement volontairement aligné sur "Scanner un dossier".
- Taille de fichier affichée en **Mo** (pas Ko brut) via `formatSizeMo()`
  (dupliqué dans `EmployeeDetail.jsx`/`ContratDetail.jsx`, même pattern que
  `stripExt`), accompagnée de la date/heure d'upload (`formatDateTime()`,
  `EmployeeDocumentFile.uploaded_at`) — affiché à **un seul endroit** (en-tête
  du viewer, span de droite) pour éviter la répétition.
- Bouton "étiquette" (`TagIcon`, `components/icons.jsx`) à côté du crayon
  de renommage manuel : renomme le fichier sélectionné d'après le libellé
  de son type de document en un clic (`handleAutoRenameFile`).
- Sidebar Documents élargie 300px → 340px (icônes d'action 12px → 16px)
  pour laisser la place aux 3 boutons par fichier (renommer d'après le
  type, renommer manuellement, supprimer).

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

---

## OCR des documents (2026-09-06)

Chaque fichier uploadé (upload classique, "Scanner un dossier", upload
contrat) déclenche automatiquement une analyse OCR **locale** (Tesseract,
jamais d'API cloud — conformité Loi 18-07/RGPD), en tâche de fond via
Celery + Redis (broker déjà utilisé par SOMIZ comme cache/rate-limit).
Objectifs : recherche plein texte des documents et suggestions de
remplissage de champs employé — **jamais d'écriture automatique**. Spec
complète : `docs/superpowers/specs/2026-09-06-ocr-documents-design.md`.

- **App `ocr`** (`backend/ocr/`) : modèle `OcrResult` (`OneToOneField`
  vers `EmployeeDocumentFile`, `on_delete=CASCADE` — supprimé avec le
  fichier), champs `status` (`pending`/`done`/`failed`), `raw_text`,
  `confidence`, `extracted_fields` (JSON, liste de `{champ_code, valeur,
  confiance, statut}`).
- **Extraction de champs** — `ocr/extractors.py`, un registre
  `CHAMP_SOURCE_EXTRACTORS` indexé par le même code que
  `TypeDocument.champ_source` (voir section "Champs cliquables vers le
  document source") : seuls les types de document ayant un
  `champ_source` renseigné déclenchent une extraction (pas de règles
  génériques bruitées sur tout document).
- **Déclenchement** — `employees/views.py`, helper `_enqueue_ocr(file_obj)`
  appelé après chaque création de `EmployeeDocumentFile`
  (`DocumentListUploadView`, `ScanImportView`,
  `ContratDocumentListUploadView`) ; encapsule `run_ocr.delay(...)` dans
  un try/except pour qu'un broker Redis indisponible ne bloque jamais un
  upload — l'OCR est une fonctionnalité annexe, pas un pré-requis.
- **Suggestions — validation manuelle ADMIN uniquement** —
  `GET /api/ocr/employees/<id>/suggestions/`,
  `POST /api/ocr/suggestions/<ocr_result_id>/<field_index>/{appliquer,ignorer}/`
  (`ocr/views.py`, `IsAdmin`). "Appliquer" écrit dans `Employee` (champs
  système) ou `EmployeeChampValeur` (champs personnalisés) et trace
  l'action dans l'audit log existant (`MODIFY_EMP`, `details.transfer`,
  même format que le transfert organisationnel/carrière/archivage) —
  aucune suggestion n'est jamais appliquée automatiquement, quelle que
  soit la confiance Tesseract.
- **UI** — panneau "Suggestions OCR" (`components/OcrSuggestionsPanel.jsx`,
  monté sur `EmployeeDetail.jsx`, ADMIN/SUPERADMIN only) : liste les
  suggestions en attente, boutons Appliquer (avec confirmation
  `useConfirm()`) / Ignorer. Badge de statut (⏳/✓/✗) sur le fichier
  sélectionné dans `DossierTab.jsx` (`EmployeeDocumentFileSerializer.
  ocr_status`).
- **Recherche plein texte** — paramètre `?q_contenu=` sur
  `GET /api/employees/` (`EmployeeListCreateView.get_queryset()`), filtre
  sur `OcrResult.raw_text__icontains` via
  `documents__fichiers__ocr_result__raw_text`.
- **Infra à prévoir hors pip** : binaires système `tesseract-ocr` et
  `poppler` (rendu PDF→image via `pdf2image`), et un worker Celery dédié
  (`celery -A config worker -l info`) à superviser en plus de
  Django/Postgres/Redis — `CELERY_TASK_ALWAYS_EAGER=True` en `.env`
  permet un traitement synchrone en dev sans worker séparé.

---

## Page Statistiques (2026-09-02)

`/statistiques` (ADMIN/SUPERADMIN, distincte de `/dashboard`) : analyse RH
détaillée — répartitions Direction/Département/Catégorie/Type de
contrat/Fonction, évolution mensuelle recrutements vs archivages,
pyramides âge/ancienneté, contrats arrivant à échéance (seuil réglable,
90 jours par défaut), complétude par unité, filtres de date (préréglages
+ plage libre) avec comparaison à la période précédente, export Excel
(`.xlsx`) et PDF (impression navigateur). Logique de calcul centralisée
dans `backend/audit/stats.py` (`build_stats_detail()`), consommée par
`GET /api/reporting/stats-detail/` (JSON) et
`GET /api/reporting/stats-export.xlsx/` (export).

### "Mon activité" — décompte des actions par compte

Les statistiques principales (répartitions, évolution, pyramides,
échéances, complétude) restent **toujours organisation-wide**, pour
ADMIN comme SUPERADMIN — pas de restriction de périmètre sur cette
partie de la page (essayé puis abandonné : un ADMIN doit garder la vue
d'ensemble complète, exactement comme avant ce chantier).

En complément, une section **"Mon activité"** donne à chaque compte
ADMIN/SUPERADMIN le décompte de ses propres actions sur la période
sélectionnée (mêmes filtres de date que le reste de la page) :
employés créés/modifiés/archivés (`AuditLog` du compte, types
`CREATE_EMP`/`MODIFY_EMP`, archivage = `MODIFY_EMP` avec
`details.transfer.statut.vers` dans les libellés d'archivage),
documents supprimés/modifiés (`AuditLog` `DELETE_DOC`/`MODIFY_DOC`), et
**documents uploadés** — ce dernier compte les `EmployeeDocument`
**actuellement présents** (`uploaded_by`, `is_active=True`,
`uploaded_at` dans la période), pas les entrées `UPLOAD` du journal
d'audit : celles-ci persistent après une suppression définitive (hard
delete, voir section "Documents employés"), ce qui gonflerait
indéfiniment ce compteur avec des documents qui n'existent plus. Upload
manuel et "Scanner un dossier" (scan-import) sont comptés ensemble, sans
distinction (même type d'objet créé).

Un `SUPERADMIN` reçoit en plus **"Activité par administrateur"** — la
même ventilation pour tous les comptes ADMIN/SUPERADMIN actifs, en
tableau comparatif (`audit.stats._activite_par_admin()`). Logique
commune dans `audit.stats._activity_counts(user, date_debut, date_fin)`,
réutilisée par `_mon_activite()` (le compte connecté) et
`_activite_par_admin()` (tous les comptes).

Côté UI (`Statistiques.jsx`), un compteur/une colonne à zéro est
masqué·e — seuls les indicateurs "présents" (valeur > 0) s'affichent,
pour ne pas polluer la page de zéros sans intérêt sur une période donnée.

Ce mécanisme est propre à `/statistiques` — il ne touche pas au scoping
CONSULTANT (`employee_scope_q`/`can_access_employee`, voir section
Scoping) ni à la visibilité du journal d'audit par rôle (voir en-tête de
ce fichier), qui restent des mécanismes indépendants.

### Recherche, seuil réglable, drill-down et liens de preuve (2026-09-27)

- **Recherche dans les donuts** — `StatDonutChart.jsx` affiche un champ de
  recherche au-dessus de la légende dès que la répartition dépasse 8
  entrées (filtre la légende, grise les tranches non correspondantes sans
  changer le total affiché au centre). `repartition_fonction` n'agrège
  plus au-delà d'un Top 10 (`TOP_FONCTIONS`/`_repartition_fonction()`
  supprimés côté backend) — toutes les fonctions sont renvoyées, sinon la
  recherche ne pourrait jamais retrouver une fonction cachée dans
  "Autres".
- **Seuil d'échéance réglable** — `_contrats_echeance(jours=90)` et
  `build_stats_detail(..., echeance_jours=90)` acceptent désormais un
  nombre de jours ; `GET /api/reporting/stats-detail/` et
  `stats-export.xlsx/` lisent `?echeance_jours=` (1-365, 400 sinon). UI :
  sélecteur de seuil (30/60/90/120/180/365 jours + valeur personnalisée)
  au-dessus du tableau "Contrats arrivant à échéance".
- **Drill-down complétude** — cliquer sur une barre de département ou une
  ligne de la liste sous le radar Direction navigue vers
  `/employees?direction=<id>&dossier_complet=0` (ou `?departement=`),
  réutilisant le filtre `dossier_complet` déjà existant sur
  `EmployeeListCreateView`.
- **Liens de preuve catégorisés** — chaque tuile de "Mon activité" et
  chaque cellule de "Activité par administrateur" est un lien vers
  `/audit?user=...&categorie=<clé>&date_debut=...&date_fin=...`.
  `AuditLogListView` (`backend/audit/views.py`) accepte `?categorie=`,
  qui réutilise `_categorize_emp_log`/`_ACTIVITY_KEYS` de
  `audit/stats.py` (seule source de vérité de cette classification) pour
  les catégories issues de `CREATE_EMP`/`MODIFY_EMP`/`DELETE_EMP`, et
  mappe directement `documents_supprimes`/`documents_modifies`/
  `documents_uploades` sur `DELETE_DOC`/`MODIFY_DOC`/`UPLOAD`. Le lien
  `documents_uploades` est une approximation (best effort sur le journal
  `UPLOAD`, jamais parfaitement aligné avec le compteur qui ne compte que
  les documents encore présents) — signalée par une info-bulle sur la
  tuile côté UI. Une catégorie inconnue est ignorée silencieusement,
  comme les autres paramètres invalides de cette vue.

---

## Consentement Loi 18-07 (2026-08-27)

Tout accès à SOMIZ (ADMIN comme CONSULTANT, y compris les comptes créés
avant ce chantier) est bloqué tant que l'utilisateur n'a pas explicitement
consenti au traitement des données personnelles conformément à la Loi
n°18-07. Consentement unique à vie par compte (pas de versionnage du
texte) — spec complète : `docs/superpowers/specs/2026-08-27-consentement-loi1807-design.md`.

- `User.consent_loi1807_accepted_at` (`accounts/models.py`, `DateTimeField`
  `null=True`) — `null` = jamais consenti.
- `POST /api/auth/consent/` (`ConsentView`, `accounts/views.py`) enregistre
  la date et journalise `AuditLog.Action.CONSENT`. `LoginView`/`UserMeView`
  exposent `needs_consent: bool` dans leur réponse.
- **Le blocage réel est intégré dans `IsAdmin`/`IsAdminOrConsultant`**
  (`accounts/permissions.py`), pas seulement dans
  `REST_FRAMEWORK['DEFAULT_PERMISSION_CLASSES']` — piège identifié en
  cours d'implémentation : la quasi-totalité des vues métier déclarent
  `permission_classes` explicitement, ce qui **remplace** entièrement le
  défaut global DRF plutôt que de s'y ajouter. Une permission `HasConsented`
  ajoutée seulement au défaut global n'aurait donc protégé que les vues
  sans `permission_classes` propre (voir `securite.md` point 27). Toute
  nouvelle permission "transversale" censée s'appliquer à toute l'API doit
  être vérifiée de la même façon (test d'intégration sur une vraie route
  métier, pas seulement sur le défaut global).
- Frontend : page `/consentement` (`frontend/src/pages/Consentement.jsx`)
  — texte structuré comme un **engagement de confidentialité sur les
  données d'autrui** (et non "vos données personnelles") : la plupart des
  comptes consultent des données d'employés tiers (un directeur voit toute
  son équipe, un chef de département/service ses subordonnés, un cadre
  restreint à un type de document — ex. Sécurité Sociale — le voit pour
  l'ensemble du personnel indépendamment du périmètre organisationnel,
  voir section Scoping). `ProtectedRoute.jsx` redirige systématiquement
  vers `/consentement` si `user.needs_consent` est vrai (sauf sur la page
  elle-même) ; `AuthContext.refreshUser()` recharge `needs_consent` après
  acceptation.

---

## Demandes d'attestation de travail (2026-09-22)

Un compte `GESTIONNAIRE` (libellé d'affichage "Secrétaire"/"Superviseur"
possible, voir en-tête de ce fichier) peut demander une attestation de
travail pour un employé de son périmètre organisationnel — traitée par un
ADMIN/SUPERADMIN via un workflow de statuts, jusqu'à récupération physique
du document signé. Spec complète :
`docs/superpowers/specs/2026-09-22-demandes-attestation-travail-design.md`.

- **App dédiée `attestations`** (`backend/attestations/`) : modèle
  `DemandeAttestation` (`employee`, `contrat` optionnel, `motif` — FK vers
  `employees.MotifArchivage` (catégorie Attestation), voir section "Motifs
  — référentiel générique" —, `commentaire`, `statut`, `motif_rejet`,
  `scan_document` optionnel, `demandeur`, `traite_par`, `reference` unique
  format `NNNNN/AA`, `date_prete`/`date_recuperee`) ; `ReferenceCounter`
  (compteur annuel, incrémenté sous `select_for_update()` — voir
  `attestations/reference.py`) ; `AttestationTemplateConfig` (singleton
  `pk=1`, champs du modèle papier : adresse, ville, signataire, en-tête,
  pied de page, logo).
- **Workflow des statuts (simplifié le 2026-09-23)** : `Reçue → Prête →
  Récupérée`, plus `Rejetée` (terminal, motif obligatoire, atteignable
  depuis n'importe quel statut avant `Récupérée`) — transitions
  séquentielles uniquement, validées côté serveur
  (`DemandeAttestationStatutSerializer.ORDRE`). Seul un ADMIN/SUPERADMIN
  change un statut (`PATCH /api/attestations/demandes/<id>/statut/`), y
  compris `Récupérée` — le gestionnaire n'est pas devant l'écran au
  moment où il vient chercher le document physique. Les anciens statuts
  intermédiaires `Imprimée`/`Signée` ont été supprimés (pas seulement
  masqués) — migration `attestations/migrations/0004_motif_dates.py` :
  les demandes qui s'y trouvaient sont retombées sur `Reçue`.
  `DemandeAttestationStatutView.patch()` horodate le passage à `Prête`
  (`date_prete`) et `Récupérée` (`date_recuperee`) — `created_at` sert
  déjà de date "Reçue". `AttestationDetail.jsx#StatutStepper` affiche ces
  3 dates sous chaque cercle du stepper.
- **Périmètre** : `DemandeAttestationCreateSerializer.validate_employee()`
  réutilise `User.can_access_employee()` — un GESTIONNAIRE ne peut créer
  de demande que pour un employé de son périmètre (mêmes champs
  `scope_*` que CONSULTANT, voir section Scoping). Un GESTIONNAIRE ne
  voit que ses propres demandes (`GET /api/attestations/demandes/`), un
  ADMIN voit tout.
- **Annulation** : le demandeur peut supprimer sa propre demande
  uniquement tant qu'elle est au statut `Reçue`
  (`DemandeAttestationDetailView.perform_destroy`).
- **Onglet "Attestations" sur la fiche employé** (2026-09-23,
  `components/employeeDetail/AttestationsTab.jsx`, à côté de "Carrière")
  — historique des demandes pour CET employé précis
  (`GET /attestations/demandes/?employee=<id>`, `employee_id` combiné avec
  le scoping demandeur/admin habituel dans
  `DemandeAttestationListCreateView.get_queryset()`). Onglet visible
  uniquement si `user.can_manage_attestations || role === "GESTIONNAIRE"`
  (même condition que l'accès à `/attestations`) — masqué du tout pour
  CONSULTANT et pour un ADMIN non chargé des attestations, pas seulement
  vidé. Un GESTIONNAIRE n'y voit que ses propres demandes pour cet
  employé (jamais celles d'un collègue) ; bouton "+ Nouvelle demande"
  affiché pour SUPERADMIN/GESTIONNAIRE uniquement, même règle que le
  bouton déjà présent dans la sidebar Documents (`DossierTab.jsx`).
- **Document PDF** : `GET /api/attestations/demandes/<id>/apercu/`
  (ADMIN only) renvoie un **PDF** (`application/pdf`, généré par
  `attestations/pdf.py` avec **ReportLab** — nouvelle dépendance,
  `requirements.txt`) reproduisant la mise en page du modèle papier :
  logo + en-tête société, titre encadré, bloc REF/MATRICULE/CONTRAT aux
  deux-points alignés, corps du texte, lieu/date, bloc signataire (espace
  laissé libre pour la signature et le cachet apposés à la main), pied de
  page avec coordonnées et mention "Édité le". Le frontend récupère le
  PDF via axios puis l'ouvre en blob dans un onglet (lecteur PDF du
  navigateur = impression et téléchargement directs) — **jamais** par
  navigation directe vers `/api/...` : le proxy CRA de dev ne relaie pas
  les requêtes de navigation (`Accept: text/html`) et la page
  atterrissait sur le 404 du routeur React.
  - **Date imprimée figée au premier aperçu (2026-09-23)** — la date "Arzew
    le :"/"Édité le :" imprimée sur le document (`demande.date_document`,
    `DateField` distinct de `date_prete`/`date_recuperee` qui tracent le
    workflow de statut) se fige à la toute première génération plutôt que
    d'être recalculée à chaque ouverture de l'aperçu : entre l'impression
    et la signature effective, un jour ou deux peuvent s'écouler (imprimé
    le 23, signé le 24) — rouvrir l'aperçu le lendemain ne doit pas
    silencieusement dater le document différemment de ce qui a été
    réellement imprimé/signé. `AttestationApercuView.get` renvoie **409**
    (`{needs_confirmation, date_document, date_nouvelle}`, pas le PDF) si
    la date du jour diffère de celle déjà figée et que
    `?confirmer_date=1` n'est pas passé ; le frontend
    (`AttestationDetail.jsx#ouvrirApercu`) intercepte ce 409, affiche une
    modale `useConfirm()` avec les deux dates, et ne relance la requête
    avec `confirmer_date=1` (qui met à jour `date_document` et régénère)
    que si l'ADMIN confirme explicitement.
    - **Piège jsdom** : `Blob.text()` n'est pas implémentée par le
      polyfill `Blob` de jsdom (tests Jest) — `err.response.data.text()`
      échouerait silencieusement en test alors que ça fonctionne dans un
      vrai navigateur. `lireBlobEnTexte()` (`AttestationDetail.jsx`) lit
      le corps JSON de la réponse 409 via `FileReader.readAsText()` à la
      place, supportée par jsdom comme par tout navigateur.
  - **Typographie calée sur le papier (2026-09-23)** — le rendu doit être
    identique au modèle papier en vigueur, pas seulement contenir les
    mêmes informations. Trois règles, toutes constatées sur un exemplaire
    signé : (1) **rien n'est en gras dans le corps**, seuls le titre
    encadré et l'en-tête société le sont (une première version mettait
    tous les libellés en `Helvetica-Bold`, donnant un document
    visiblement plus lourd que l'original) ; (2) les **valeurs saisies
    sont dans un corps plus petit que les libellés** (`TAILLE_VALEUR`
    9.5 vs `TAILLE_LABEL` 11.5) — le texte fixe du formulaire et les
    données de l'employé ne sont pas à la même taille sur le papier ;
    (3) l'interligne du corps est resserré (~13 mm) avec un intervalle
    volontairement plus large avant "Et occupe le poste de" — le papier
    n'a pas un pas régulier, d'où les constantes `Y_*` relevées une à une
    plutôt qu'une boucle à pas fixe. `Helvetica` est utilisée comme
    équivalent métrique de l'Arial du papier (police de base ReportLab,
    pas de fichier de fontes à embarquer).
  - **Piège `setCharSpace`** : l'espacement inter-lettres du titre ne se
    règle que sur un objet texte (`Canvas` n'expose pas `setCharSpace`),
    et il fait partie de l'**état graphique PDF** — sans
    `saveState()`/`restoreState()` autour, il reste actif sur tout le
    reste du document : texte étiré et, surtout, valeurs qui chevauchent
    leur libellé (les positions dynamiques de `_label_valeur()` sont
    calculées avec `stringWidth()`, qui ignore la chasse et sous-estime
    donc la largeur réellement rendue).
  - Le "lieu de naissance" (champ personnalisé, pas de colonne directe
    sur `Employee`) est résolu par recherche approximative du nom du champ
    (`EmployeeChampValeur`, voir `AttestationApercuView.get`).
  - Le N° de contrat figure toujours sur le document : si la demande ne
    vise pas un contrat précis, le dernier contrat de l'employé est repris.
  - **Aucune valeur n'est codée en dur dans le PDF** — tout l'en-tête, le
    signataire et le pied de page viennent de `AttestationTemplateConfig`
    (testé : `test_apercu_reprend_la_configuration_du_modele`). Les
    `default` du modèle reprennent simplement les valeurs du document
    papier en vigueur pour qu'une attestation soit correcte sans
    configuration préalable.
- **Scan du document signé** : optionnel, jamais bloquant pour avancer un
  statut (`POST /api/attestations/demandes/<id>/scan/`, ADMIN only) — un
  simple aide-mémoire, pas un document RH permanent du dossier employé.
- **Configuration du modèle** : `/parametres` → onglet "Attestation de
  travail" (`AttestationConfigPanel` dans `Parametres.jsx`, pas de
  `RefTable`/`RefForm` générique — un seul enregistrement). `GET/PUT
  /api/attestations/config/`, ADMIN only ; le logo s'envoie séparément en
  `PATCH` multipart (le `PUT` des champs texte exclut volontairement
  `logo`, sinon l'URL de lecture renvoyée par l'API serait resoumise comme
  valeur et rejetée par l'`ImageField`).
- **Audit** : nouvelles valeurs `AuditLog.Action`
  (`CREATE_ATTESTATION`, `STATUT_ATTESTATION`, `DELETE_ATTESTATION`).
  `AuditLogListView` étend la règle de visibilité déjà en place pour
  CONSULTANT (un ADMIN voit ses propres actions + celles des comptes
  qu'il administre) aux comptes GESTIONNAIRE.
- **Reporting** : `GET /api/attestations/stats/?date_debut=&date_fin=`
  (ADMIN only) — nombre de demandes par gestionnaire demandeur, par
  employé, répartition par statut, délai moyen `Reçue → Récupérée`.
  Affiché dans un onglet "Statistiques" sur `/attestations` elle-même
  (pas dans `/statistiques`, qui reste dédiée aux indicateurs RH
  globaux).
- **URL par référence, pas par UUID** : `/attestations/<ref>` (et les
  endpoints `/api/attestations/demandes/<ref>/...`) utilisent la
  référence (`00001/26`) plutôt que l'UUID technique — plus lisible/
  partageable. Le `/` de la référence est illisible dans un segment
  d'URL : encodé en `-` côté frontend (`00001-26`, voir les `Link`/
  `navigate` dans `Attestations.jsx`/`AttestationNouvelle.jsx`) et
  reconverti côté serveur par `ReferenceLookupMixin`
  (`attestations/views.py`, `reference.replace('-', '/', 1)` — un seul
  remplacement, le format `NNNNN/AA` ne contient qu'un seul `/`).
- **Qui peut demander** (2026-09-22, révisé après première livraison) :
  seuls GESTIONNAIRE et **SUPERADMIN** créent des demandes
  (`CanRequestAttestation`, `attestations/permissions.py`) — un ADMIN
  ordinaire reste **uniquement traiteur**. Décision volontaire : le
  laisser aussi créer ses propres demandes casserait la séparation
  demandeur/traiteur utile à l'audit (un même compte auteur et
  validateur de la même demande). Un ADMIN garde tout accès en
  lecture/traitement (`/attestations`, `/attestations/:ref`, statuts,
  aperçu PDF, config, reporting) — seul le bouton "Nouvelle demande" lui
  est masqué (`Attestations.jsx`, `DossierTab.jsx`), et la route
  `/attestations/nouvelle` lui est fermée côté client
  (`ProtectedRoute allowedRoles`) comme côté serveur.
- **UI** : `/attestations` (liste + reporting, ADMIN/SUPERADMIN/
  GESTIONNAIRE), `/attestations/nouvelle` (formulaire, SUPERADMIN/
  GESTIONNAIRE uniquement — recherche employé via `/employees/search/`
  déjà scopée serveur), `/attestations/:ref` (détail, actions de statut,
  aperçu, scan, annulation). Bouton "Demander une attestation" sur la
  fiche employé (`DossierTab.jsx`, sidebar Documents), pré-remplit
  l'employé via `location.state`. Badge navbar "N en attente" — compte
  uniquement les demandes au statut `Reçue` (pas encore prises en charge ;
  dès qu'un ADMIN passe une demande à `Imprimée`, elle n'est plus
  comptée même si le document n'est pas encore récupéré), visible
  ADMIN/SUPERADMIN, rechargé à chaque navigation (`Navbar.jsx`, effet
  dépendant de `location.pathname`).

---

## Design System (v2 — actuel)

Le design a été entièrement refondu. Chaque page suit ce pattern :

### Hero header (toutes les pages)
```jsx
<div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: "40px 32px 32px" }}>
  {/* breadcrumb + titre + actions ADMIN */}
</div>
<div style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>
  {/* contenu */}
</div>
```

### Cards
- `borderRadius: 16`, `border: theme.border` (jamais `primaryBorder` pour structurel)
- `boxShadow: theme.shadowMd`
- En-tête de section : barre verte 4px + label uppercase 11px

### Hiérarchie — couleurs par niveau
| Niveau | Couleur | Token gradient |
|---|---|---|
| Direction | Vert `#166534` | `theme.directionGrad` |
| Département | Bleu `#1e40af` | `theme.departementGrad` |
| Service | Violet `#6d28d9` | `theme.serviceGrad` |

### `theme.border` vs `theme.primaryBorder`
- `theme.border` (`#E2E8F0`) → bordures **structurelles** (cards, tables, inputs)
- `theme.primaryBorder` (`#bbf7d0`) → éléments **de marque** (badges actif, avatars)

---

## Conventions UI

### Règle absolue — tokens
```js
import theme from '../styles/theme';

// ✅ Correct
style={{ color: theme.primary, background: theme.primaryBg }}

// ❌ Interdit
style={{ color: '#1A7A3C', background: '#E8F5EE' }}
```

### Classes d'animation disponibles
```css
.anim-fade-in       /* opacité 0→1, 250ms */
.anim-slide-up      /* translateY(12px)→0, 280ms */
.anim-slide-down    /* translateY(-12px)→0, 220ms */
.anim-scale-in      /* scale(0.96)→1, 220ms */
.anim-pop           /* scale(0.8)→1.05→1, 300ms — spring cubic-bezier */
.delay-1 … .delay-8 /* délais en cascade (35ms par palier) */
.btn-lift           /* hover: translateY(-2px) sur boutons */
.card-lift          /* hover: translateY(-3px) + shadow sur cartes */
.input-focus        /* focus: ring vert 3px */
.nav-link           /* transitions de navigation */
.hover-lift         /* hover: translateY(-4px) + shadow plus forte */
```

### Permissions dans les composants
```js
import { useAuth } from '../context/AuthContext';
const { user } = useAuth();

// Afficher uniquement pour ADMIN
{user?.role === 'ADMIN' && <button>Supprimer</button>}
```

### Pattern loading / erreur
```jsx
if (loading) return <div style={{ textAlign: 'center', padding: 40, color: theme.textSecondary }}>Chargement...</div>;
if (error) return <div style={{ color: theme.danger, padding: 20 }}>{error}</div>;
```

---

## Responsivité mobile (2026-08-16)

Les styles étant 100% inline (`style={{}}`), les media queries CSS ne sont
pas utilisables directement pour les changements de layout structurels
(grille → colonne unique, drawer de navigation, etc.). Convention établie :

- **`useIsMobile(breakpoint = 768)`** (`frontend/src/hooks/useIsMobile.js`)
  — hook basé sur `window.matchMedia`, réactif au redimensionnement. À
  utiliser dans tout composant qui a besoin d'adapter son layout sous
  768px : `const isMobile = useIsMobile();` puis
  `padding: isMobile ? "16px" : "40px 32px 32px"`,
  `gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr"`,
  `flexWrap: isMobile ? "wrap" : "nowrap"`, etc. — pas de nouvelle
  approche par page, réutiliser ce hook partout.
- `theme.heroPadding(isMobile)` / `theme.contentPadding(isMobile)`
  (`frontend/src/styles/theme.js`) — helpers pour le pattern hero
  header / contenu de page documenté plus haut, à préférer aux valeurs
  codées en dur quand on ajoute une nouvelle page.
- `Navbar.jsx` bascule en menu hamburger + tiroir coulissant (overlay,
  même pattern que `ConfirmDialog.jsx`) sous 768px — la liste `navLinks`
  et son filtre ADMIN restent inchangés, seul l'affichage change.
- Tout `<table>` doit être enveloppé dans un conteneur
  `overflowX: "auto"` (scroll horizontal) — pas de redesign en cartes
  pour l'instant.
- `frontend/src/setupTests.js` fournit un polyfill `window.matchMedia`
  (absent de jsdom) qui retourne `matches: false` par défaut — les tests
  s'exécutent donc en layout desktop sauf override explicite.

---

## Routes principales

| Route | Page | Accès |
|---|---|---|
| `/login` | Login | Public |
| `/consentement` | Consentement Loi 18-07 (bloquant si non consenti) | Tous (authentifié) |
| `/employees` | Liste employés (drill-down Direction→Dept→Service→Employé) | Tous |
| `/employees/nouveau` | Créer employé | ADMIN |
| `/employees/:id` | Détail employé + documents + contrats | Tous |
| `/employees/:id/modifier` | Modifier employé | ADMIN |
| `/contrats/:id` | Détail contrat | Tous |
| `/dashboard` | Tableau de bord (indicateurs instantanés) | ADMIN |
| `/statistiques` | Statistiques RH détaillées (filtres, périmètre, export) | ADMIN |
| `/attestations` | Demandes d'attestation de travail (liste ADMIN, "mes demandes" GESTIONNAIRE, reporting) | ADMIN, GESTIONNAIRE |
| `/attestations/nouvelle` | Nouvelle demande d'attestation | ADMIN, GESTIONNAIRE |
| `/attestations/:ref` | Détail, traitement (statuts, aperçu, scan) | ADMIN (lecture pour le demandeur) |
| `/users` | Gestion utilisateurs | ADMIN |
| `/audit` | Logs d'audit | ADMIN |
| `/parametres` | CRUD référentiels (Directions, Depts, Services, Postes...) | ADMIN |
| `/import` | Import CSV employés | ADMIN |
| `/profil` | Profil utilisateur | Tous |

---

## Endpoints API clés

### Référentiels organisationnels
```
GET /ref/directions/
GET /ref/departements/?direction=<uuid>
GET /ref/services/?departement=<uuid>
```

### Employés
```
GET  /api/employees/?service=<uuid>&q=<search>&statut=<statut>&page=<n>
POST /api/employees/
GET  /api/employees/<uuid>/
PATCH /api/employees/<uuid>/
DELETE /api/employees/<uuid>/
```

### Documents & Contrats
```
GET  /api/employees/<uuid>/documents/
POST /api/employees/<uuid>/documents/
POST /api/employees/<uuid>/documents/scan-import/
GET  /api/contrats/<uuid>/
PATCH /api/contrats/<uuid>/
```

---

## Sécurité — règles impératives

- **Ne jamais stocker de token en localStorage** — JWT uniquement via httpOnly cookies
- **Vérifier `user.role`** avant d'afficher tout bouton d'action destructive
- **Pas de deep links vers des documents** — utiliser `SecureDocViewer` qui passe par l'API
- **CORS configuré côté Django** — ne pas modifier sans consulter le backend
- **Les uploads sont validés côté backend** — le frontend n'a pas à valider le MIME type
- **Toute nouvelle vue listant des employés/documents/contrats doit appliquer le scoping** — `request.user.employee_scope_q()` ou `can_access_employee()` (voir section Scoping ci-dessus)
- **Les mutations de mot de passe passent par `django.contrib.auth.password_validation.validate_password()`**, pas juste un check de longueur
- **Journal complet d'audit sécurité** : voir [`securite.md`](securite.md) (racine du projet) — 24 points vérifiés/corrigés, à mettre à jour à chaque nouveau point de sécurité traité

---

## Tests

- Backend : `pytest` (188 tests dans `backend/tests/`)
- Frontend : Jest + React Testing Library (261+ tests dans `frontend/src/__tests__/`)
- Lancer les tests backend : `cd backend && pytest`
- Lancer les tests frontend : `cd frontend && npm test`
- **Après toute modification touchant `accounts`/`employees` (permissions, scoping, modèles) : lancer la suite complète avant de commit** — l'app dépend de PostgreSQL + Redis actifs localement (`REDIS_URL` dans `.env`, repli automatique sur cache mémoire si absent)
