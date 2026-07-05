# Identité visuelle plus vivante — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir l'identité visuelle de SOMIZ (perçue comme "morte") en ajoutant une touche d'accent ambre chaleureux au vert de marque existant, et remplacer les feedbacks de chargement statiques (`"Chargement..."`) par un composant `Skeleton` animé, sur l'ensemble de l'app.

**Architecture:** Ajout de tokens additifs dans `theme.js` (aucun token existant modifié), un nouveau composant `Skeleton.jsx` réutilisable, une nouvelle keyframe CSS, et des modifications ciblées de 8 pages existantes (hero headers, CTA de création, écrans de chargement).

**Tech Stack:** React 19, styles inline avec tokens `theme.js`, CSS keyframes dans `animations.css`, Jest + React Testing Library.

## Global Constraints

- Styles inline uniquement, tokens depuis `theme.js` — jamais de hex en dur dans les composants (les hex vivent dans `theme.js`).
- Le vert (`theme.primary`) reste la couleur dominante partout ; l'ambre (`theme.accent`) n'apparaît qu'en touches décoratives ou sur des CTA de création précis — jamais sur les boutons de soumission de formulaire (Enregistrer, Se connecter, Créer, Importer), qui restent verts.
- Aucun token existant n'est renommé ni supprimé.
- Aucun changement backend.
- Le composant `Skeleton` porte `data-testid="skeleton"`.

---

## Contexte fichiers

- `frontend/src/styles/theme.js` — fichier de tokens plat, à étendre (pas de structure à changer).
- `frontend/src/styles/animations.css` — classes `.card-lift:hover` et `.hover-lift:hover` définissent déjà `box-shadow` avec une teinte verte (`rgba(26,122,60,...)`) ; à remplacer par une teinte ambre (`rgba(180,131,7,...)`) en gardant la même intensité/durée.
- Chaque page a un bloc `if (loading) return (...)` (ou `{loading ? (...) : (...)}`) contenant `<div>Chargement...</div>` ou variante — à remplacer par des `<Skeleton />`.
- Chaque hero header a la forme `<div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", ... }}>` (ou variante `#166534 100%)` sans le point milieu à 50%) — nécessite `position: "relative", overflow: "hidden"` + un `<div>` décoratif superposé.

---

### Task 1: Tokens d'accent + ajustement des ombres au survol

**Files:**
- Modify: `frontend/src/styles/theme.js`
- Modify: `frontend/src/styles/animations.css`
- Test: `frontend/src/__tests__/theme.test.js` (nouveau fichier — le projet n'a pas de test dédié à `theme.js` actuellement)

**Interfaces:**
- Produces: tokens `theme.accent`, `theme.accentLight`, `theme.accentBg`, `theme.accentBorder` (strings hex), consommés par les Tasks 2-5.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/__tests__/theme.test.js` :

```javascript
import { theme } from "../styles/theme";

describe("theme — tokens accent", () => {
  test("expose les tokens accent ambre", () => {
    expect(theme.accent).toBe("#F59E0B");
    expect(theme.accentLight).toBe("#FBBF24");
    expect(theme.accentBg).toBe("#FFFBEB");
    expect(theme.accentBorder).toBe("#FDE68A");
  });

  test("ne modifie pas les tokens existants", () => {
    expect(theme.primary).toBe("#166534");
    expect(theme.bg).toBe("#F1F5F9");
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd frontend && npx jest src/__tests__/theme.test.js`
Expected: FAIL — `theme.accent` est `undefined`.

- [ ] **Step 3: Ajouter les tokens dans theme.js**

Dans `frontend/src/styles/theme.js`, ajouter après le bloc `// ─── États ───` (juste après `dangerBorder: "#FECACA",`) :

```javascript
  // ─── Accent chaleureux (identité "vivante") ──────────────────────────────
  accent: "#F59E0B",        // amber-500
  accentLight: "#FBBF24",   // amber-400
  accentBg: "#FFFBEB",      // amber-50
  accentBorder: "#FDE68A",  // amber-200
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd frontend && npx jest src/__tests__/theme.test.js`
Expected: PASS — 2/2 tests passent.

- [ ] **Step 5: Ajuster la couleur des ombres au survol dans animations.css**

Dans `frontend/src/styles/animations.css`, remplacer :

```css
.card-lift:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 22px rgba(26, 122, 60, 0.15) !important;
}
```

par :

```css
.card-lift:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 22px rgba(180, 131, 7, 0.15) !important;
}
```

Et remplacer :

```css
.hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 32px rgba(26, 122, 60, 0.2) !important;
}
```

par :

```css
.hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 32px rgba(180, 131, 7, 0.2) !important;
}
```

Ne pas toucher à `.btn-lift:hover` (reste vert, c'est le style des boutons d'action générique non liés aux CTA de création).

- [ ] **Step 6: Lancer toute la suite frontend pour détecter des régressions**

Run: `cd frontend && npx jest --silent`
Expected: tous les tests passent (aucun test n'assert sur la couleur exacte du `box-shadow` CSS, donc aucune régression attendue).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/styles/theme.js frontend/src/styles/animations.css frontend/src/__tests__/theme.test.js
git commit -m "feat(design): ajoute les tokens d'accent ambre et ajuste les ombres au survol"
```

---

### Task 2: Composant Skeleton

**Files:**
- Create: `frontend/src/components/Skeleton.jsx`
- Modify: `frontend/src/styles/animations.css`
- Test: `frontend/src/__tests__/Skeleton.test.jsx`

**Interfaces:**
- Consumes: rien (composant autonome).
- Produces: `export default Skeleton` avec props `{ width = "100%", height = 16, radius = 6, style = {} }`, rendant un `<div data-testid="skeleton" style={{...}} />`. Consommé par la Task 3.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/__tests__/Skeleton.test.jsx` :

```javascript
import { render, screen } from "@testing-library/react";
import Skeleton from "../components/Skeleton";

describe("Skeleton", () => {
  test("rend un élément avec data-testid skeleton", () => {
    render(<Skeleton />);
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  test("applique les dimensions personnalisées", () => {
    render(<Skeleton width={120} height={20} />);
    const el = screen.getByTestId("skeleton");
    expect(el).toHaveStyle({ width: "120px", height: "20px" });
  });

  test("applique les dimensions par défaut", () => {
    render(<Skeleton />);
    const el = screen.getByTestId("skeleton");
    expect(el).toHaveStyle({ height: "16px" });
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd frontend && npx jest src/__tests__/Skeleton.test.jsx`
Expected: FAIL — le module `../components/Skeleton` n'existe pas.

- [ ] **Step 3: Créer le composant Skeleton**

Créer `frontend/src/components/Skeleton.jsx` :

```jsx
const Skeleton = ({ width = "100%", height = 16, radius = 6, style = {} }) => (
  <div
    data-testid="skeleton"
    style={{
      width,
      height,
      borderRadius: radius,
      background: "linear-gradient(90deg, #E2E8F0 25%, #F1F5F9 50%, #E2E8F0 75%)",
      backgroundSize: "200% 100%",
      animation: "skeletonPulse 1.4s ease-in-out infinite",
      ...style,
    }}
  />
);

export default Skeleton;
```

- [ ] **Step 4: Ajouter la keyframe skeletonPulse**

Dans `frontend/src/styles/animations.css`, ajouter à la fin du fichier :

```css
/* ─── Skeleton — feedback de chargement ──────────────────────────────── */
@keyframes skeletonPulse {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `cd frontend && npx jest src/__tests__/Skeleton.test.jsx`
Expected: PASS — 3/3 tests passent.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Skeleton.jsx frontend/src/styles/animations.css frontend/src/__tests__/Skeleton.test.jsx
git commit -m "feat(design): ajoute le composant Skeleton et sa keyframe d'animation"
```

---

### Task 3: Remplacer les écrans de chargement par des Skeleton (6 pages avec tests existants)

**Files:**
- Modify: `frontend/src/pages/Parametres.jsx`
- Modify: `frontend/src/pages/AuditLogs.jsx`
- Modify: `frontend/src/pages/Dashboard.jsx`
- Modify: `frontend/src/pages/ContratDetail.jsx`
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Modify: `frontend/src/pages/Employees.jsx`
- Test: `frontend/src/__tests__/Parametres.test.jsx`
- Test: `frontend/src/__tests__/AuditLogs.test.jsx`
- Test: `frontend/src/__tests__/Dashboard.test.jsx`
- Test: `frontend/src/__tests__/ContratDetail.test.jsx`
- Test: `frontend/src/__tests__/EmployeeDetail.test.jsx`

**Interfaces:**
- Consumes: `Skeleton` (Task 2) — `import Skeleton from "../components/Skeleton";` (ou `"./Skeleton"` selon la profondeur du fichier — toutes ces pages sont dans `frontend/src/pages/`, donc `"../components/Skeleton"`).

- [ ] **Step 1: Mettre à jour les tests existants pour attendre un skeleton au lieu du texte**

Dans `frontend/src/__tests__/Parametres.test.jsx`, remplacer (ligne ~103-107) :

```javascript
  test("affiche Chargement... pendant le fetch", () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Chargement...")).toBeInTheDocument();
  });
```

par :

```javascript
  test("affiche un skeleton pendant le fetch", () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.queryByText("Chargement...")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });
```

Appliquer exactement le même remplacement (texte du test renommé en "affiche un skeleton pendant le fetch", corps remplacé par les deux mêmes assertions `queryByText`/`getAllByTestId`) dans :
- `frontend/src/__tests__/AuditLogs.test.jsx` (ligne ~66-70)
- `frontend/src/__tests__/Dashboard.test.jsx` (ligne ~66-70)
- `frontend/src/__tests__/ContratDetail.test.jsx` (ligne ~98-102)
- `frontend/src/__tests__/EmployeeDetail.test.jsx` (ligne ~112-116)

- [ ] **Step 2: Lancer les 5 tests pour vérifier l'échec**

Run: `cd frontend && npx jest src/__tests__/Parametres.test.jsx src/__tests__/AuditLogs.test.jsx src/__tests__/Dashboard.test.jsx src/__tests__/ContratDetail.test.jsx src/__tests__/EmployeeDetail.test.jsx -t "skeleton"`
Expected: FAIL — 5 échecs, `getAllByTestId("skeleton")` ne trouve aucun élément (le composant n'est pas encore utilisé dans les pages).

- [ ] **Step 3: Remplacer l'écran de chargement de Parametres.jsx**

Ajouter l'import en haut du fichier `frontend/src/pages/Parametres.jsx` (après `import { useAuth } from "../context/AuthContext";` et la ligne d'import des icônes déjà ajoutée à la session précédente) :

```javascript
import Skeleton from "../components/Skeleton";
```

Remplacer (ligne ~139-144) :

```jsx
    {loading ? (
      <div
        style={{ color: theme.textSecondary, textAlign: "center", padding: 40 }}
      >
        Chargement...
      </div>
    ) : items.length === 0 ? (
```

par :

```jsx
    {loading ? (
      <div style={{ padding: 24 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0" }}>
            <Skeleton width={32} height={32} radius={16} />
            <Skeleton width="40%" height={14} />
          </div>
        ))}
      </div>
    ) : items.length === 0 ? (
```

- [ ] **Step 4: Remplacer l'écran de chargement de AuditLogs.jsx**

Ajouter l'import en haut de `frontend/src/pages/AuditLogs.jsx` :

```javascript
import Skeleton from "../components/Skeleton";
```

Remplacer (ligne ~148-152) :

```jsx
          {loading ? (
            <div style={{ color: theme.textSecondary, textAlign: "center", padding: 60 }}>
              Chargement...
            </div>
          ) : logs.length === 0 ? (
```

par :

```jsx
          {loading ? (
            <div style={{ padding: 24 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ padding: "10px 0" }}>
                  <Skeleton width="70%" height={14} style={{ marginBottom: 6 }} />
                  <Skeleton width="40%" height={11} />
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
```

- [ ] **Step 5: Remplacer l'écran de chargement de Dashboard.jsx**

Ajouter l'import en haut de `frontend/src/pages/Dashboard.jsx` :

```javascript
import Skeleton from "../components/Skeleton";
```

Remplacer (ligne ~117-124) :

```jsx
  if (loading)
    return (
      <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ color: theme.textSecondary, textAlign: "center", padding: 80 }}>
          Chargement...
        </div>
      </div>
    );
```

par :

```jsx
  if (loading)
    return (
      <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
          <Skeleton height={80} radius={16} style={{ marginBottom: 24 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={100} radius={16} />
            ))}
          </div>
        </div>
      </div>
    );
```

- [ ] **Step 6: Remplacer l'écran de chargement de ContratDetail.jsx**

Ajouter l'import en haut de `frontend/src/pages/ContratDetail.jsx` :

```javascript
import Skeleton from "../components/Skeleton";
```

Remplacer (ligne ~198-205) :

```jsx
  if (loading)
    return (
      <div style={{ background: theme.bg, minHeight: "100vh" }}>
        <Navbar />
        <div style={{ color: theme.textSecondary, textAlign: "center", padding: 80 }}>
          Chargement...
        </div>
      </div>
    );
```

par :

```jsx
  if (loading)
    return (
      <div style={{ background: theme.bg, minHeight: "100vh" }}>
        <Navbar />
        <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
          <Skeleton height={120} radius={16} style={{ marginBottom: 24 }} />
          <Skeleton height={300} radius={16} />
        </div>
      </div>
    );
```

Ne pas toucher au second `"Chargement..."` du même fichier (ligne ~591, dans le viewer de document — `docLoading`, hors périmètre, voir section Hors périmètre de ce plan).

- [ ] **Step 7: Remplacer l'écran de chargement de EmployeeDetail.jsx**

Ajouter l'import en haut de `frontend/src/pages/EmployeeDetail.jsx` (à côté des imports d'icônes déjà présents) :

```javascript
import Skeleton from "../components/Skeleton";
```

Remplacer (ligne ~272-282) :

```jsx
  if (loading)
    return (
      <div style={{ background: theme.bg, minHeight: "100vh" }}>
        <Navbar />
        <div
          style={{
            color: theme.textSecondary,
            textAlign: "center",
            padding: 80,
          }}
        >
          Chargement...
        </div>
      </div>
    );
```

par :

```jsx
  if (loading)
    return (
      <div style={{ background: theme.bg, minHeight: "100vh" }}>
        <Navbar />
        <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
          <Skeleton height={120} radius={16} style={{ marginBottom: 24 }} />
          <Skeleton height={300} radius={16} />
        </div>
      </div>
    );
```

Ne pas toucher au second `"Chargement..."` du même fichier (ligne ~1473, viewer de document — `docLoading`, hors périmètre).

- [ ] **Step 8: Remplacer le texte "Chargement des employés..." de Employees.jsx**

Ce fichier n'a pas de test existant sur ce texte (vérifié — aucune régression de test attendue). Ajouter l'import en haut de `frontend/src/pages/Employees.jsx` :

```javascript
import Skeleton from "../components/Skeleton";
```

Remplacer (ligne ~685-689) :

```jsx
        {loading ? (
          <div style={{ padding: 80, textAlign: "center", color: theme.textMuted }}>
            <div style={{ marginBottom: 16, opacity: 0.4 }}><IconUsers size={48} color={theme.textMuted} /></div>
            <div style={{ fontFamily: theme.fontFamily, fontWeight: 600 }}>Chargement des employés...</div>
          </div>
        ) : employees.length === 0 ? (
```

par :

```jsx
        {loading ? (
          <div style={{ padding: 24 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 0" }}>
                <Skeleton width={36} height={36} radius={18} />
                <div style={{ flex: 1 }}>
                  <Skeleton width="30%" height={13} style={{ marginBottom: 6 }} />
                  <Skeleton width="50%" height={11} />
                </div>
              </div>
            ))}
          </div>
        ) : employees.length === 0 ? (
```

- [ ] **Step 9: Lancer les 5 tests modifiés pour vérifier qu'ils passent**

Run: `cd frontend && npx jest src/__tests__/Parametres.test.jsx src/__tests__/AuditLogs.test.jsx src/__tests__/Dashboard.test.jsx src/__tests__/ContratDetail.test.jsx src/__tests__/EmployeeDetail.test.jsx -t "skeleton"`
Expected: PASS — 5/5 tests passent.

- [ ] **Step 10: Lancer toute la suite frontend pour détecter des régressions**

Run: `cd frontend && npx jest --silent`
Expected: tous les tests passent (0 échec).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/Parametres.jsx frontend/src/pages/AuditLogs.jsx frontend/src/pages/Dashboard.jsx frontend/src/pages/ContratDetail.jsx frontend/src/pages/EmployeeDetail.jsx frontend/src/pages/Employees.jsx frontend/src/__tests__/Parametres.test.jsx frontend/src/__tests__/AuditLogs.test.jsx frontend/src/__tests__/Dashboard.test.jsx frontend/src/__tests__/ContratDetail.test.jsx frontend/src/__tests__/EmployeeDetail.test.jsx
git commit -m "feat(design): remplace les écrans de chargement statiques par des Skeleton animés"
```

---

### Task 4: Remplacer les écrans de chargement de Users.jsx et EmployeeForm.jsx

**Files:**
- Modify: `frontend/src/pages/Users.jsx`
- Modify: `frontend/src/pages/EmployeeForm.jsx`

**Interfaces:**
- Consumes: `Skeleton` (Task 2).

- [ ] **Step 1: Remplacer l'écran de chargement de Users.jsx**

Ajouter l'import en haut de `frontend/src/pages/Users.jsx` (à côté des imports d'icônes déjà présents) :

```javascript
import Skeleton from "../components/Skeleton";
```

Remplacer (ligne ~358-362) :

```jsx
          {loading ? (
            <div style={{ color: theme.textSecondary, textAlign: "center", padding: 60 }}>
              Chargement...
            </div>
          ) : (
```

par :

```jsx
          {loading ? (
            <div style={{ padding: 24 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0" }}>
                  <Skeleton width={32} height={32} radius={16} />
                  <Skeleton width="35%" height={14} />
                </div>
              ))}
            </div>
          ) : (
```

- [ ] **Step 2: Remplacer l'écran de chargement de EmployeeForm.jsx**

Ajouter l'import en haut de `frontend/src/pages/EmployeeForm.jsx` :

```javascript
import Skeleton from "../components/Skeleton";
```

Remplacer (ligne ~312-321) :

```jsx
        <div
          style={{
            color: theme.textSecondary,
            textAlign: "center",
            padding: 80,
            fontSize: 14,
          }}
        >
          Chargement...
        </div>
```

par :

```jsx
        <div style={{ padding: 32, maxWidth: 800, margin: "0 auto" }}>
          <Skeleton height={40} style={{ marginBottom: 16 }} />
          <Skeleton height={40} style={{ marginBottom: 16 }} />
          <Skeleton height={40} style={{ marginBottom: 16 }} />
          <Skeleton height={120} radius={12} />
        </div>
```

- [ ] **Step 3: Lancer les suites de tests de ces deux pages**

Run: `cd frontend && npx jest src/__tests__/Users.test.jsx src/__tests__/EmployeeForm.test.jsx --silent`
Expected: PASS — tous les tests passent (aucun test existant n'assertait sur le texte "Chargement..." dans ces deux fichiers, donc pas de test à modifier).

- [ ] **Step 4: Lancer toute la suite frontend**

Run: `cd frontend && npx jest --silent`
Expected: tous les tests passent (0 échec).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Users.jsx frontend/src/pages/EmployeeForm.jsx
git commit -m "feat(design): remplace les écrans de chargement de Users et EmployeeForm par des Skeleton"
```

---

### Task 5: Cercle décoratif ambre sur les hero headers

**Files:**
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Modify: `frontend/src/pages/ContratDetail.jsx`
- Modify: `frontend/src/pages/Employees.jsx`
- Modify: `frontend/src/pages/Dashboard.jsx`
- Modify: `frontend/src/pages/Login.jsx`
- Test: `frontend/src/__tests__/EmployeeDetail.test.jsx`

**Interfaces:**
- Consumes: `theme.accent`-family tokens (Task 1) — utilisés uniquement via `rgba(251,191,36,0.18)` en dur pour la transparence (le token `accent` est `#F59E0B` opaque ; la valeur RGB `251,191,36` correspond à `accentLight`/`#FBBF24`, choisie pour sa meilleure lisibilité en overlay semi-transparent sur fond sombre).

- [ ] **Step 1: Écrire un test de non-régression sur le hero d'EmployeeDetail**

Dans `frontend/src/__tests__/EmployeeDetail.test.jsx`, ajouter dans le describe `"EmployeeDetail — rendu initial"` (après le test `"affiche le nom complet"`) :

```javascript
  test("le hero header a le cercle décoratif ambre en overlay", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText("EMP-001").length).toBeGreaterThan(0);
    });
    const decor = document.querySelector('[data-testid="hero-decor"]');
    expect(decor).toBeInTheDocument();
  });
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd frontend && npx jest src/__tests__/EmployeeDetail.test.jsx -t "cercle décoratif"`
Expected: FAIL — aucun élément avec `data-testid="hero-decor"`.

- [ ] **Step 3: Ajouter le cercle décoratif dans EmployeeDetail.jsx**

Repérer le hero header (ligne ~292, après la Task 3 son offset peut avoir légèrement changé — chercher `background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: "28px 32px 32px"`). Remplacer :

```jsx
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: "28px 32px 32px" }}>
```

par :

```jsx
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: "28px 32px 32px", position: "relative", overflow: "hidden" }}>
        <div data-testid="hero-decor" style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(251,191,36,0.18)", pointerEvents: "none" }} />
```

Le reste du contenu du hero (le `<div style={{ maxWidth: 1200, ... }}>` qui suit) reste inchangé — il devient simplement un enfant supplémentaire du même conteneur, après le cercle décoratif.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd frontend && npx jest src/__tests__/EmployeeDetail.test.jsx -t "cercle décoratif"`
Expected: PASS.

- [ ] **Step 5: Appliquer le même cercle décoratif à ContratDetail.jsx**

Repérer le hero header (ligne ~211 environ, `background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)"`). Appliquer la même transformation qu'à l'étape 3 : ajouter `position: "relative", overflow: "hidden"` au style du conteneur, et insérer `<div data-testid="hero-decor" style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(251,191,36,0.18)", pointerEvents: "none" }} />` comme premier enfant.

- [ ] **Step 6: Appliquer le même cercle décoratif à Employees.jsx**

Repérer le hero header (ligne ~865, `background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: "36px 32px 40px",`). Remplacer :

```jsx
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: "36px 32px 40px",
      }}>
```

par :

```jsx
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: "36px 32px 40px",
        position: "relative",
        overflow: "hidden",
      }}>
        <div data-testid="hero-decor" style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(251,191,36,0.18)", pointerEvents: "none" }} />
```

- [ ] **Step 7: Appliquer le même cercle décoratif à Dashboard.jsx**

Repérer le hero header (ligne ~142, `background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: "32px 32px 36px"`). Remplacer :

```jsx
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: "32px 32px 36px" }}>
```

par :

```jsx
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: "32px 32px 36px", position: "relative", overflow: "hidden" }}>
        <div data-testid="hero-decor" style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(251,191,36,0.18)", pointerEvents: "none" }} />
```

- [ ] **Step 8: Appliquer le cercle décoratif au panneau de marque de Login.jsx**

Ce panneau a déjà deux cercles décoratifs blancs (`rgba(255,255,255,0.04)`) à des positions différentes. Repérer le second cercle dans `frontend/src/pages/Login.jsx` (celui en bas à gauche, `bottom: -60, left: -60, width: 240, height: 240`). Ajouter un troisième cercle ambre juste après lui :

```jsx
        <div
          style={{
            position: "absolute",
            bottom: -60,
            left: -60,
            width: 240,
            height: 240,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.04)",
          }}
        />
        <div
          data-testid="hero-decor"
          style={{
            position: "absolute",
            top: -40,
            right: 40,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "rgba(251,191,36,0.12)",
          }}
        />
```

Le conteneur parent (`width: "45%"`) a déjà `overflow: "hidden"` et `position: "relative"` — aucun changement structurel nécessaire.

- [ ] **Step 9: Lancer toute la suite frontend pour détecter des régressions**

Run: `cd frontend && npx jest --silent`
Expected: tous les tests passent (0 échec).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/EmployeeDetail.jsx frontend/src/pages/ContratDetail.jsx frontend/src/pages/Employees.jsx frontend/src/pages/Dashboard.jsx frontend/src/pages/Login.jsx frontend/src/__tests__/EmployeeDetail.test.jsx
git commit -m "feat(design): ajoute un cercle décoratif ambre aux hero headers"
```

---

### Task 6: CTA de création en ambre

**Files:**
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Modify: `frontend/src/pages/Employees.jsx`
- Modify: `frontend/src/pages/Parametres.jsx`

**Interfaces:**
- Consumes: `theme.accent`, `theme.text` (Task 1 et token existant).

- [ ] **Step 1: Changer le bouton "+ Nouveau contrat" dans EmployeeDetail.jsx**

Repérer le bouton (ligne ~510-525, à l'intérieur du bloc `{user?.role === "ADMIN" && (`, texte `+ Nouveau contrat`). Remplacer :

```jsx
                  style={{
                    background: theme.primary,
                    border: "none",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + Nouveau contrat
```

par :

```jsx
                  style={{
                    background: theme.accent,
                    border: "none",
                    color: theme.text,
                    borderRadius: 6,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + Nouveau contrat
```

- [ ] **Step 2: Changer le bouton "Nouvel employé" dans Employees.jsx**

Repérer le bouton (ligne ~923-925). Remplacer :

```jsx
                  <button onClick={() => navigate("/employees/nouveau")} className="btn-lift" style={{ background: "#FFFFFF", border: "none", borderRadius: 10, padding: "10px 20px", color: theme.primary, fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                    <IconPlus size={15} />
                    Nouvel employé
```

par :

```jsx
                  <button onClick={() => navigate("/employees/nouveau")} className="btn-lift" style={{ background: theme.accent, border: "none", borderRadius: 10, padding: "10px 20px", color: theme.text, fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                    <IconPlus size={15} />
                    Nouvel employé
```

- [ ] **Step 3: Changer le bouton "+ Ajouter" dans Parametres.jsx**

Repérer le bouton (ligne ~1107-1119). Remplacer :

```jsx
                    style={{
                      background: theme.primary,
                      border: "none",
                      color: "#fff",
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: `0 2px 8px ${theme.primary}44`,
                    }}
                  >
                    + Ajouter
```

par :

```jsx
                    style={{
                      background: theme.accent,
                      border: "none",
                      color: theme.text,
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: `0 2px 8px ${theme.accent}44`,
                    }}
                  >
                    + Ajouter
```

- [ ] **Step 4: Lancer toute la suite frontend pour détecter des régressions**

Run: `cd frontend && npx jest --silent`
Expected: tous les tests passent (0 échec — aucun test n'assert sur la couleur de fond de ces boutons, seulement sur leur présence/texte/comportement au clic).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/EmployeeDetail.jsx frontend/src/pages/Employees.jsx frontend/src/pages/Parametres.jsx
git commit -m "feat(design): applique l'accent ambre aux CTA de création (Nouveau contrat, Nouvel employé, Ajouter)"
```

---

## Hors périmètre (rappel du spec)

- Les écrans de chargement secondaires `docLoading` (viewer de document PDF/image dans `EmployeeDetail.jsx` et `ContratDetail.jsx`) ne sont pas remplacés — ce sont des attentes courtes (chargement d'un seul fichier), pas des écrans pleine page, et le spec ne les mentionne pas explicitement.
- Aucune animation de compteur progressif sur le Dashboard.
- Aucun changement des boutons de soumission de formulaire (restent verts).
- Aucun changement backend.

## Vérification finale

- [ ] **Step 1: Lancer toute la suite frontend**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: tous les tests passent (0 échec).

- [ ] **Step 2: Vérification manuelle rapide (recommandée)**

Lancer le frontend (`npm start`), ouvrir successivement : Dashboard, Employees, un EmployeeDetail, un ContratDetail, Parametres, AuditLogs, la page Login. Vérifier :
- Le cercle décoratif ambre est visible en haut à droite de chaque hero header (subtil, pas criard).
- Les listes/pages affichent des barres animées (skeleton) pendant le chargement au lieu du texte "Chargement...".
- Les boutons "+ Nouveau contrat", "Nouvel employé", "+ Ajouter" sont ambre avec texte sombre lisible.
- Les boutons "Enregistrer", "Se connecter", "Créer le contrat", "Importer" sont toujours verts.
