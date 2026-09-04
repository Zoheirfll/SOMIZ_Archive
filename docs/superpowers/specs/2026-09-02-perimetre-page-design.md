# Périmètre d'accès — passage de modale à page dédiée (2026-09-02)

## Contexte

Sur `/users`, le bouton "Périmètre" (visible sur un compte CONSULTANT)
ouvrait une modale de 520px de large avec 4 sections empilées
(organisationnel en cascade, types de documents, champs personnels,
employés spécifiques), chacune avec son propre scroll interne — devenue
trop saturée pour rester lisible.

## Décision

Seule cette modale devient une page dédiée : `/users/:id/perimetre`. Les
autres modales de `/users` (création/édition utilisateur, réinitialisation
mot de passe) restent inchangées — ce sont des formulaires courts sans ce
problème.

## Ce qui ne change pas

- Toute la logique métier (state, handlers, appels API, règles de cascade,
  règle OU/ET entre les 3 axes de périmètre) est reprise telle quelle,
  aucun changement de comportement fonctionnel.
- Le formulaire "Créer un compte utilisateur" garde sa propre section
  inline "Périmètre d'accès (optionnel)" dans `Users.jsx` (un nouvel
  utilisateur n'a pas encore d'id, donc pas de grants "employés
  spécifiques" possibles à la création) — ce chantier ne touche pas à ce
  bloc.

## Nouvelle page — `frontend/src/pages/UserPerimetre.jsx`

Route `/users/:id/perimetre` (`ProtectedRoute adminOnly`, ajoutée dans
`App.js`).

- Au montage : `GET /admin-users/<id>/` pour charger l'utilisateur cible
  depuis l'URL (fonctionne sur rafraîchissement ou lien direct, pas de
  dépendance à un `state` de navigation react-router). Le backend expose
  déjà ce GET (`UserUpdateView` est un `RetrieveUpdateDestroyAPIView`),
  jamais appelé par le frontend jusqu'ici.
- Les fetchs référentiels (`directions`, `poles`, `departements`,
  `services`, `cellules`, `sections`, `types-documents`,
  `champs-personnalises`, tous `?all=1` où applicable) et
  `GET /admin-users/<id>/employee-grants/` migrent tels quels depuis
  `Users.jsx`.
- Tout le state/handlers de scoping organisationnel (`scopeForm`,
  `toggleDirection`, `togglePole`, `toggleDepartement`, `toggleService`,
  `toggleCellule`, `toggleSection`, `toggleTypeDocument`,
  `isTypeDocChecked`, `toggleChampPersonnel`, `selectAllInLevel`,
  `clearLevel`, les listes `visiblePoles`/`visibleDepartements`/
  `visibleServices`/`visibleCellules`/`visibleSections`) migrent tels
  quels — copie indépendante, pas de partage d'état avec `Users.jsx`
  (chaque page a son propre cycle de vie).
- Tout le state/handlers "employés spécifiques"
  (`employeeGrants`, `grantSearch`, `grantSearchResults`,
  `grantSearchLoading`, `addEmployeeGrant`, `removeEmployeeGrant`,
  `setGrantFullDossier`, `toggleGrantTypeDoc`, `toggleGrantChampPersonnel`)
  migrent tels quels — ils n'existaient que dans la modale.
- `handleSaveScope` : mêmes 2 appels (`PATCH /admin-users/<id>/` +
  `PUT /admin-users/<id>/employee-grants/`), puis `navigate("/users")`
  avec un message de succès transmis via `location.state` (lu par
  `Users.jsx` au montage pour afficher la bannière verte existante, comme
  le message actuel `"Périmètre mis à jour."`).
- Bouton "Annuler" : `navigate("/users")` sans sauvegarder.

## UI

- Hero header standard du design system (dégradé vert, `HeroDecor`),
  breadcrumb texte "Utilisateurs / {prénom} {nom} — Périmètre d'accès",
  bouton retour vers `/users`.
- Contenu en pleine largeur (`maxWidth: 1200`, cohérent avec les autres
  pages de gestion), plus de contrainte 520px/85vh — les 4 sections
  passent d'un empilement à double-scroll à des cards pleine largeur
  (organisationnel, types de documents, champs personnels, employés
  spécifiques), chacune gardant son scroll interne pour ses listes
  longues mais sans scroll de page dans un scroll de modale.
- Barre d'actions (Annuler / Enregistrer) fixée en bas de la card
  principale ou en pied de page — pas de footer de modale.

## `Users.jsx` — retraits

- `openScopeModal(u)` → remplacé par `navigate(`/users/${u.id}/perimetre`)`.
- Retraits : `scopeModal` (state), `employeeGrants` et tout son groupe de
  state/handlers, `handleSaveScope`, le bloc JSX de la modale Périmètre.
- Conservés (réutilisés par le formulaire de création) : `scopeForm` et
  ses toggles, les listes référentielles et leurs fetchs, `visiblePoles`
  etc.
- Lecture de `location.state.message` au montage (pattern
  `useLocation()`) pour afficher la bannière de succès après retour de
  `/users/:id/perimetre`.

## Tests

- Nouveau fichier `frontend/src/__tests__/UserPerimetre.test.js` :
  chargement de l'utilisateur, cases à cocher en cascade, sauvegarde,
  annulation, recherche/ajout/retrait d'un grant employé.
- `Users.test.js` existant : les tests qui ouvraient la modale Périmètre
  sont adaptés pour vérifier la navigation vers
  `/users/:id/perimetre` à la place.
