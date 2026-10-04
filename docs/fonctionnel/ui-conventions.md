# Conventions UI — design system et patterns frontend

> À lire avant d'écrire ou de modifier une page/un composant React : design system, dates, modales de confirmation, refresh silencieux, responsive.
>
> Extrait de `CLAUDE.md` (découpage du 2026-10-01) — contenu déplacé tel quel, sans réécriture.
> Les renvois « voir section X » peuvent pointer vers un autre fichier de `docs/fonctionnel/` ou vers `CLAUDE.md` : voir l'index de `CLAUDE.md`.

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
