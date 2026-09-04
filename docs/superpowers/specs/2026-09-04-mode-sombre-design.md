# Mode sombre — Design

## Contexte

SOMIZ est stylé 100% en `style={{}}` inline, avec des valeurs de couleur
importées statiquement depuis `frontend/src/styles/theme.js` (un objet
figé `theme`). Il n'y a pas de CSS variables. Pour un mode sombre
cohérent sur toute l'application, `theme` doit devenir réactif.

## Portée

Toute l'application (Employés, fiche employé, Dashboard, Statistiques,
Users, Audit, Paramètres, Import, Login, Consentement, Profil...).

## Architecture

### 1. `theme.js` — deux thèmes figés

`theme.js` exporte `lightTheme` et `darkTheme` (mêmes clés que l'actuel
`theme`), plus `getTheme(mode)` qui retourne l'un ou l'autre.
`lightTheme` = valeurs actuelles inchangées. `darkTheme` : fonds/textes/
bordures inversés (`bg`/`surface` foncés, `text` clair, `border` foncé
mais visible), couleurs de marque (`primary`, `accent`, `danger`,
`success`, `warning`) légèrement éclaircies pour rester lisibles et
suffisamment contrastées (WCAG AA) sur fond sombre, ombres assombries/
plus prononcées. Les dégradés hero (`directionGrad`, `departementGrad`,
`serviceGrad`) restent globalement identiques (déjà sombres) — ajustés
seulement si le contraste avec le texte blanc du hero le demande.

`heroPadding`/`contentPadding` (fonctions pures, pas de couleurs) ne
changent pas.

L'export nommé historique `theme` (compat) est retiré — remplacé
partout par l'usage du contexte (voir ci-dessous), pas de double
maintenance d'un objet "par défaut".

### 2. `context/ThemeContext.jsx`

- `ThemeProvider` — état `mode` (`'light'|'dark'`) :
  - lecture initiale : `localStorage.getItem('somiz_theme_mode')` si
    `'light'` ou `'dark'`, sinon `'light'` par défaut (ne suit pas
    `prefers-color-scheme` — décision prise en cours de chantier : un
    utilisateur dont l'OS est en sombre ne doit pas se retrouver en mode
    sombre sur SOMIZ sans l'avoir explicitement activé).
  - pose `document.documentElement.dataset.theme = mode` (effet), pour
    que `color-scheme` CSS natif (scrollbars, `<select>`, inputs) suive
    aussi — une règle CSS globale minimale (`animations.css` ou nouveau
    petit bloc) : `:root[data-theme="dark"] { color-scheme: dark; }` /
    `:root[data-theme="light"] { color-scheme: light; }`.
  - `toggleMode()` bascule et persiste dans `localStorage`.
  - ne réagit pas aux changements ultérieurs de `prefers-color-scheme`
    une fois qu'un choix manuel existe dans `localStorage` (le choix
    explicite de l'utilisateur prime toujours).
- `useTheme()` — hook retournant `getTheme(mode)` (l'objet thème
  courant, mêmes clés qu'avant, donc aucune page n'a besoin de changer
  sa logique de style, seulement sa source de `theme`).
- `useThemeMode()` — hook retournant `{ mode, toggleMode }`, pour le
  bouton toggle uniquement.

`ThemeProvider` enveloppe `<App />` au point d'entrée le plus haut
possible (dans `index.js`, au-dessus de `AuthProvider`/`BrowserRouter`
selon l'ordre actuel — aucune dépendance entre les deux, donc l'ordre
exact n'a pas d'importance).

### 3. Migration des 43 fichiers consommateurs

Deux cas :

- **Composants React** (41 fichiers, y compris pages et
  sous-composants) : `import theme from '../styles/theme'` (ou chemin
  relatif équivalent) → supprimé, remplacé par
  `import { useTheme } from '../context/ThemeContext'` et, en tête du
  corps du composant, `const theme = useTheme();`. Le reste du fichier
  (toutes les références `theme.xxx`) ne change pas — mêmes clés.
- **Modules non-composants** (`formStyles.js`, `employeeDocsDisplay.js`)
  qui exportent aujourd'hui des styles/constantes calculés au niveau
  module à partir de `theme` importé statiquement : convertis en
  fonctions prenant `theme` en paramètre (ex. `folderHeaderStyle(couleur, theme)`,
  les objets de style de `formStyles.js` deviennent des fonctions
  `getXxxStyle(theme)`). Les composants appelants (qui ont déjà
  `const theme = useTheme()`) passent leur `theme` local à ces
  fonctions. `FALLBACK_FOLDER_COLOR` (actuellement `theme.warning`,
  utilisé comme valeur par défaut hors composant) devient une constante
  hex neutre indépendante du thème, ou une fonction `getFallbackFolderColor(theme)`
  si elle doit rester alignée sur `theme.warning`.

`frontend/src/__tests__/theme.test.js` est mis à jour pour tester
`lightTheme`/`darkTheme` (parité de clés entre les deux) plutôt que
l'ancien export `theme`.

### 4. Toggle UI

Bouton icône (soleil/lune, nouveau composant `components/icons.jsx` ou
inline SVG) dans `Navbar.jsx`, visible en desktop (barre du haut) et
dans le tiroir mobile — utilise `useThemeMode()`.

### 5. Tests

- Tout test qui monte un composant consommant `useTheme()` doit être
  enveloppé dans `ThemeProvider` — un helper `renderWithProviders(ui)`
  (nouveau, `frontend/src/testUtils.js` ou ajout à `setupTests.js`) qui
  englobe `ThemeProvider` (+ tout provider déjà requis par les tests
  existants, ex. `AuthContext` mocké, `MemoryRouter`) est introduit et
  utilisé pour les tests qui échoueraient sinon. Les tests existants qui
  ne rendent pas de composant connecté au thème ne changent pas.
- Nouveaux tests `ThemeContext` : persistance `localStorage`, fallback
  `prefers-color-scheme`, priorité au choix explicite, `toggleMode`.

## Hors scope

- Pas de thème "auto" qui re-suit `prefers-color-scheme` après un choix
  manuel (le choix manuel prime définitivement une fois posé).
- Pas de personnalisation de couleur au-delà de clair/sombre.
- Pas de changement de `animations.css` (indépendant des couleurs) sauf
  la règle `color-scheme` minimale mentionnée en 2.
