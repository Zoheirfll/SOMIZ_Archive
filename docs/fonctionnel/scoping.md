# Scoping — périmètres d'accès CONSULTANT/GESTIONNAIRE

> À lire avant de toucher à une vue/serializer qui liste ou retrouve des employés, documents, contrats ou champs personnels, ou au modal « Périmètre » de /users.
>
> Extrait de `CLAUDE.md` (découpage du 2026-10-01) — contenu déplacé tel quel, sans réécriture.
> Les renvois « voir section X » peuvent pointer vers un autre fichier de `docs/fonctionnel/` ou vers `CLAUDE.md` : voir l'index de `CLAUDE.md`.

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
