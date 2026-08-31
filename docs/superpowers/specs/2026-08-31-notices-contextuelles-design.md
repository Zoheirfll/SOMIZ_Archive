# Notices contextuelles (aide in-app) — design

Date : 2026-08-31

## Objectif

Ajouter une aide contextuelle discrète sur chaque page de SOMIZ : un bouton
`(i)` qui, au clic, ouvre un popover expliquant à quoi sert la page ou un
champ/fonctionnalité complexe. Pas de documentation externe à maintenir —
le texte vit dans l'app, à côté de ce qu'il explique.

## Composant réutilisable — `InfoNotice`

`frontend/src/components/InfoNotice.jsx`

- Bouton rond contenant une icône `(i)` (nouvelle icône `InfoIcon` dans
  `components/icons.jsx`, même style que les autres : SVG, `stroke="currentColor"`,
  `strokeWidth="2"`).
- Ouverture **au clic** (pas au survol seul, pour rester utilisable au
  clavier/tactile) ; se ferme au clic en dehors du popover (pattern déjà
  utilisé pour les menus comme "Colonnes" sur `/employees`).
- Popover flottant positionné à côté du bouton (`position: absolute`,
  calculé via un `ref` sur le bouton), carte `borderRadius: 12`,
  `boxShadow: theme.shadowMd`, `border: theme.border`, fond `theme.surface`,
  largeur max ~280px, texte `theme.textSecondary` en 13px.
- Props : `{ text, size = 18, variant = 'hero' | 'field' }`.
  - `variant="hero"` : bouton sur fond `theme.primaryBg`, icône
    `theme.primary` — utilisé à côté d'un titre `<h1>` dans le hero header
    (fond vert foncé), donc contraste suffisant.
  - `variant="field"` : bouton discret, icône `theme.textSecondary` —
    utilisé à côté d'un label de champ/section dans le contenu de page
    (fond clair).
- Pas de dépendance externe ; positionnement simple sans librairie de
  popover (déjà le pattern du reste du projet, ex. menus de `Employees.jsx`).

## Contenu centralisé — `frontend/src/config/notices.js`

Suit le pattern déjà en place pour `frontend/src/config/keyboardShortcuts.js`
(fichier config dédié, pas de texte dispersé dans chaque page) :

```js
export const PAGE_NOTICES = {
  employees: "...",
  employeeDetail: "...",
  employeeForm: "...",
  contratDetail: "...",
  dashboard: "...",
  users: "...",
  audit: "...",
  parametres: "...",
  import: "...",
  profil: "...",
  consentement: "...", // notice courte, page déjà auto-explicative
  login: null, // pas de notice sur /login
};

export const FIELD_NOTICES = {
  parametres: {
    hierarchieCelluleSection: "...", // distinction Cellule vs Section
    typesDocumentsCategories: "...", // catégories vs types feuilles
  },
  employeeForm: {
    affectationExclusive: "...", // service/cellule/section mutuellement exclusifs
  },
  users: {
    perimetre: "...", // combinaison organisationnel (OR) + types de documents (ET) + grants ponctuels (OR)
  },
};
```

Chaque valeur est une chaîne simple (pas de JSX), en français, 1 à 3
phrases. Une clé absente ou `null` = pas de bouton `(i)` affiché (permet
d'omettre `/login`, page déjà minimale).

## Portée v1

**Notice de page** (bouton `(i)` `variant="hero"` à côté du titre `<h1>`
dans le hero header) sur les pages suivantes :
`/employees`, `/employees/:id`, `/employees/nouveau` &
`/employees/:id/modifier` (même notice `employeeForm`), `/contrats/:id`,
`/dashboard`, `/users`, `/audit`, `/parametres`, `/import`, `/profil`,
`/consentement`.

`/login` n'a pas de notice (page publique minimale, pas de logique à expliquer).

**Notice de champ** (bouton `(i)` `variant="field"` à côté d'un label ou
d'un en-tête de section) sur 3 points identifiés comme les plus piégeux :
1. `Parametres.jsx` — distinction Cellule/Section (référentiels
   coexistants, rattachement Direction OU Département) et distinction
   catégorie/type feuille dans l'onglet "Types de documents".
2. `EmployeeForm.jsx` — exclusivité mutuelle Service/Cellule/Section lors
   de l'affectation d'un employé.
3. `Users.jsx` — logique de combinaison des 3 niveaux de périmètre
   (organisationnel en OR entre niveaux, types de documents en ET avec
   l'organisationnel, grants ponctuels en OR au-dessus des deux).

Toute notice de champ supplémentaire pourra être ajoutée plus tard en
suivant le même pattern (ajouter une clé dans `FIELD_NOTICES`, poser un
`<InfoNotice variant="field" text={FIELD_NOTICES.page.cle} />`).

## Hors scope

- Pas de système de notices dynamiques/éditables depuis l'UI (texte en
  dur dans le code, comme le reste des libellés de l'app).
- Pas de tracking "notice vue/masquée" ni de préférence persistée.
- Pas de traduction (l'app est en français uniquement).
