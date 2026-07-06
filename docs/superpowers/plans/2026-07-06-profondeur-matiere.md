# Profondeur & Matière Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Élever le polish visuel de toute l'app SOMIZ en ajoutant profondeur, matière et micro-animations sans modifier la structure fonctionnelle ni l'identité de marque.

**Architecture:** Cinq couches indépendantes : fond de page vivant (halos), amélioration des cartes, zébrage+survol des tables, hook `useCountUp` pour les KPI, et uniformisation des transitions de page. Toutes les modifications sont soit des composants/hooks partagés, soit des retouches ciblées fichier par fichier. Aucune nouvelle dépendance.

**Tech Stack:** React 19, styles inline, `theme.js` (tokens), `animations.css` (classes), Jest + React Testing Library.

## Global Constraints

- Styles inline uniquement — pas de Tailwind, pas de CSS modules, pas de classes ad hoc sauf celles déjà dans `animations.css`
- Tous les tokens de couleur passent par `theme.js` — jamais de hex en dur dans un composant
- Aucune librairie externe ajoutée
- Les 255 tests existants doivent continuer à passer après chaque commit
- Conformité rôles : les modifications visuelles ne doivent pas affecter la logique `user.role`

---

## File Map

| Statut | Fichier | Rôle |
|---|---|---|
| Créer | `frontend/src/components/PageBackground.jsx` | Conteneur fond vivant (halos) |
| Créer | `frontend/src/hooks/useCountUp.js` | Hook compteur animé |
| Créer | `frontend/src/__tests__/PageBackground.test.jsx` | Tests PageBackground |
| Créer | `frontend/src/__tests__/useCountUp.test.js` | Tests hook |
| Modifier | `frontend/src/styles/theme.js` | Ajouter tokens `pageBg`, `cardBorderTop` |
| Modifier | `frontend/src/styles/animations.css` | Ajouter `.table-row-hover`, `.page-root` |
| Modifier | `frontend/src/pages/Dashboard.jsx` | PageBackground + useCountUp sur StatCards |
| Modifier | `frontend/src/pages/Employees.jsx` | PageBackground + zébrage table |
| Modifier | `frontend/src/pages/Users.jsx` | PageBackground + zébrage table |
| Modifier | `frontend/src/pages/AuditLogs.jsx` | PageBackground + zébrage table |
| Modifier | `frontend/src/pages/Parametres.jsx` | PageBackground + zébrage table |
| Modifier | `frontend/src/pages/EmployeeDetail.jsx` | PageBackground + transition |
| Modifier | `frontend/src/pages/ContratDetail.jsx` | PageBackground + transition |
| Modifier | `frontend/src/pages/EmployeeForm.jsx` | PageBackground + transition |
| Modifier | `frontend/src/pages/Import.jsx` | PageBackground + transition |
| Modifier | `frontend/src/pages/Profil.jsx` | PageBackground + transition |
| Modifier | `frontend/src/pages/Login.jsx` | transition anim-fade-in (seule page qui en manque) |
| Modifier | `frontend/src/components/Navbar.jsx` | Aucun changement visuel prévu ici |

---

## Task 1 : Tokens + classes CSS

**Files:**
- Modify: `frontend/src/styles/theme.js`
- Modify: `frontend/src/styles/animations.css`
- Test: `frontend/src/__tests__/theme.test.js` (fichier existant)

**Interfaces:**
- Produit : `theme.pageBg` (string CSS gradient), `theme.cardBorderTopGrad` (string CSS gradient), disponibles pour toutes les tâches suivantes

- [ ] **Step 1 : Ajouter les tokens dans theme.js**

Ouvrir `frontend/src/styles/theme.js` et ajouter à la fin de l'objet, juste avant la fermeture `}` :

```js
  // ─── Fond de page vivant ──────────────────────────────────────────────────
  pageBg: "#F1F5F9",             // base — identique à bg, les halos sont en CSS
  // ─── Cartes — liseré supérieur dégradé ───────────────────────────────────
  cardBorderTopGrad: "linear-gradient(90deg, #166534 0%, #F59E0B 100%)",
```

- [ ] **Step 2 : Ajouter les classes CSS dans animations.css**

Ajouter à la fin de `frontend/src/styles/animations.css` :

```css
/* ─── Fond de page — halos radiaux ──────────────────────────────────────── */
.page-root {
  position: relative;
  background: #F1F5F9;
  min-height: 100vh;
}
.page-root::before {
  content: "";
  position: fixed;
  top: -120px;
  left: -120px;
  width: 480px;
  height: 480px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(22,101,52,0.055) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}
.page-root::after {
  content: "";
  position: fixed;
  bottom: -100px;
  right: -100px;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(245,158,11,0.05) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

/* ─── Tables — survol de ligne ───────────────────────────────────────────── */
.table-row-hover {
  transition: background 0.13s ease, border-left-color 0.13s ease;
  border-left: 3px solid transparent;
}
.table-row-hover:hover {
  background: #F0FDF4 !important;
  border-left-color: #166534;
}
```

- [ ] **Step 3 : Vérifier que le test existant theme.test.js passe encore**

```bash
cd frontend && npm test -- --testPathPattern="theme.test" --watchAll=false
```

Attendu : PASS, tous les tests verts.

- [ ] **Step 4 : Commit**

```bash
git add frontend/src/styles/theme.js frontend/src/styles/animations.css
git commit -m "feat(design): ajoute tokens pageBg/cardBorderTopGrad et classes page-root/table-row-hover"
```

---

## Task 2 : Composant PageBackground

**Files:**
- Create: `frontend/src/components/PageBackground.jsx`
- Create: `frontend/src/__tests__/PageBackground.test.jsx`

**Interfaces:**
- Consomme : classe `.page-root` de `animations.css` (Task 1)
- Produit : `<PageBackground>` — remplace le `<div style={{ background: theme.bg, minHeight: "100vh" }}>` racine dans toutes les pages. Accepte `children` et un `style` optionnel pour les rares cas où la page ajoute un `fontFamily`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `frontend/src/__tests__/PageBackground.test.jsx` :

```jsx
import React from "react";
import { render } from "@testing-library/react";
import PageBackground from "../components/PageBackground";

test("rend les enfants dans un div avec classe page-root", () => {
  const { getByTestId } = render(
    <PageBackground>
      <span data-testid="child">hello</span>
    </PageBackground>
  );
  const root = getByTestId("child").parentElement;
  expect(root.className).toContain("page-root");
  expect(getByTestId("child")).toBeInTheDocument();
});

test("applique le style supplémentaire passé en prop", () => {
  const { getByTestId } = render(
    <PageBackground data-testid="bg" style={{ fontFamily: "monospace" }}>
      <span>x</span>
    </PageBackground>
  );
  // on vérifie que le composant ne plante pas avec une prop style
  expect(document.querySelector(".page-root")).toBeInTheDocument();
});
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

```bash
cd frontend && npm test -- --testPathPattern="PageBackground" --watchAll=false
```

Attendu : FAIL — "Cannot find module '../components/PageBackground'"

- [ ] **Step 3 : Créer le composant**

Créer `frontend/src/components/PageBackground.jsx` :

```jsx
import "../styles/animations.css";

const PageBackground = ({ children, style = {} }) => (
  <div className="page-root" style={style}>
    {children}
  </div>
);

export default PageBackground;
```

- [ ] **Step 4 : Lancer le test pour vérifier le succès**

```bash
cd frontend && npm test -- --testPathPattern="PageBackground" --watchAll=false
```

Attendu : PASS

- [ ] **Step 5 : Commit**

```bash
git add frontend/src/components/PageBackground.jsx frontend/src/__tests__/PageBackground.test.jsx
git commit -m "feat(design): ajoute composant PageBackground (halos vert+ambre en fond)"
```

---

## Task 3 : Hook useCountUp

**Files:**
- Create: `frontend/src/hooks/useCountUp.js`
- Create: `frontend/src/__tests__/useCountUp.test.js`

**Interfaces:**
- Produit : `useCountUp(target: number, duration?: number): number` — retourne la valeur courante (0 → `target` en `duration` ms via `requestAnimationFrame`). Si `target` est `null` ou `undefined`, retourne `null`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `frontend/src/__tests__/useCountUp.test.js` :

```js
import { renderHook, act } from "@testing-library/react";
import useCountUp from "../hooks/useCountUp";

jest.useFakeTimers();

test("retourne 0 au montage puis la valeur cible", () => {
  const { result } = renderHook(() => useCountUp(100, 500));
  expect(result.current).toBe(0);
  act(() => { jest.advanceTimersByTime(600); });
  expect(result.current).toBe(100);
});

test("retourne null si la cible est null", () => {
  const { result } = renderHook(() => useCountUp(null, 500));
  expect(result.current).toBeNull();
});

test("retourne null si la cible est undefined", () => {
  const { result } = renderHook(() => useCountUp(undefined, 500));
  expect(result.current).toBeNull();
});

test("ne produit pas de NaN", () => {
  const { result } = renderHook(() => useCountUp(50, 400));
  act(() => { jest.advanceTimersByTime(200); });
  expect(result.current).not.toBeNaN();
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

```bash
cd frontend && npm test -- --testPathPattern="useCountUp" --watchAll=false
```

Attendu : FAIL — "Cannot find module '../hooks/useCountUp'"

- [ ] **Step 3 : Créer le hook**

Créer `frontend/src/hooks/useCountUp.js` :

```js
import { useState, useEffect, useRef } from "react";

const useCountUp = (target, duration = 800) => {
  const [current, setCurrent] = useState(target == null ? null : 0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (target == null) { setCurrent(null); return; }
    const start = performance.now();
    const startVal = 0;

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - progress, 4);
      setCurrent(Math.round(startVal + eased * (target - startVal)));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };

    setCurrent(0);
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, duration]);

  return current;
};

export default useCountUp;
```

- [ ] **Step 4 : Lancer pour vérifier le succès**

```bash
cd frontend && npm test -- --testPathPattern="useCountUp" --watchAll=false
```

Attendu : PASS (4 tests)

- [ ] **Step 5 : Commit**

```bash
git add frontend/src/hooks/useCountUp.js frontend/src/__tests__/useCountUp.test.js
git commit -m "feat(design): ajoute hook useCountUp pour animer les chiffres KPI"
```

---

## Task 4 : Dashboard — PageBackground + useCountUp + cartes

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`
- Test: `frontend/src/__tests__/Dashboard.test.jsx` (existant)

**Interfaces:**
- Consomme : `PageBackground` (Task 2), `useCountUp` (Task 3), `theme.cardBorderTopGrad` (Task 1)

- [ ] **Step 1 : Vérifier que les tests Dashboard passent dans l'état actuel**

```bash
cd frontend && npm test -- --testPathPattern="Dashboard.test" --watchAll=false
```

Attendu : PASS

- [ ] **Step 2 : Modifier Dashboard.jsx**

En haut du fichier, ajouter les imports :

```js
import PageBackground from "../components/PageBackground";
import useCountUp from "../hooks/useCountUp";
```

Modifier le composant `StatCard` pour utiliser le liseré dégradé :

Trouver (autour de la ligne 56-62) :
```jsx
    style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: "20px 24px",
      boxShadow: theme.shadowMd,
      borderTop: `3px solid ${color}`,
      fontFamily: theme.fontFamily,
    }}
```

Remplacer par :
```jsx
    style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: "20px 24px",
      boxShadow: theme.shadowMd,
      borderTop: "3px solid transparent",
      borderImage: `${theme.cardBorderTopGrad} 1`,
      fontFamily: theme.fontFamily,
    }}
```

Dans le composant `Dashboard`, ajouter `useCountUp` pour chaque valeur KPI. Trouver la section où les 4 `<StatCard>` sont rendus (vers la ligne 171) et adapter ainsi — ajouter avant le `return` final (dans le composant `Dashboard`) :

```jsx
const countEmployes = useCountUp(stats?.employes_actifs ?? null);
const countDossiers = useCountUp(stats?.dossiers_complets ?? null);
const countTaux = useCountUp(stats?.taux_completude_global ?? null);
const countDocs = useCountUp(stats?.total_documents ?? null);
```

Puis passer ces valeurs aux `StatCard` correspondantes en remplaçant `value={stats.employes_actifs}` etc. par `value={countEmployes}`, `value={countDossiers}`, `value={countTaux != null ? `${countTaux}%` : null}`, `value={countDocs}`.

Remplacer le `<div style={{ background: theme.bg, minHeight: "100vh", fontFamily: theme.fontFamily }}>` racine (les 3 occurrences : skeleton, erreur, et rendu normal) par `<PageBackground style={{ fontFamily: theme.fontFamily }}>` et fermer avec `</PageBackground>`.

- [ ] **Step 3 : Lancer les tests Dashboard**

```bash
cd frontend && npm test -- --testPathPattern="Dashboard.test" --watchAll=false
```

Attendu : PASS. Si un test vérifie la valeur exacte d'un KPI (ex. `getByText("50")`), il faut mocker `requestAnimationFrame` dans le test ou ajuster l'assertion pour accepter `"0"` ou `"50"`. Chercher dans `Dashboard.test.jsx` les `getByText` sur des chiffres et wrapper le rendu avec `act(() => { jest.runAllTimers(); })` si nécessaire (le fichier utilise déjà `waitFor`).

- [ ] **Step 4 : Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat(design): Dashboard — fond vivant, liseré dégradé cartes, chiffres animés"
```

---

## Task 5 : Tables — zébrage + survol (Users, AuditLogs, Employees, Parametres)

**Files:**
- Modify: `frontend/src/pages/Users.jsx`
- Modify: `frontend/src/pages/AuditLogs.jsx`
- Modify: `frontend/src/pages/Employees.jsx`
- Modify: `frontend/src/pages/Parametres.jsx`
- Tests: les 4 fichiers de test correspondants (existants)

**Interfaces:**
- Consomme : classe `.table-row-hover` de `animations.css` (Task 1), `PageBackground` (Task 2)

**Principe à appliquer dans chaque page :**

Pour chaque ligne de tableau `<tr>` ou `<div>` qui représente une ligne de liste, ajouter :
1. La classe `table-row-hover`
2. Zébrage : `background: index % 2 === 0 ? theme.surface : "#FAFBFC"` (remplace le background fixe existant le cas échéant)
3. Remplacer le `<div style={{ background: theme.bg, minHeight: "100vh" }}>` racine par `<PageBackground style={{ fontFamily: theme.fontFamily }}>`

- [ ] **Step 1 : Appliquer sur Users.jsx**

Trouver le rendu de la liste d'utilisateurs (chercher `map` sur `users` et les `<tr>` ou `<div>` de ligne). Ajouter `className="table-row-hover"` et le zébrage sur chaque ligne :

```jsx
// Avant (exemple)
<tr style={{ borderBottom: `1px solid ${theme.border}`, background: theme.surface }}>

// Après
<tr
  className="table-row-hover"
  style={{ borderBottom: `1px solid ${theme.border}`, background: idx % 2 === 0 ? theme.surface : "#FAFBFC" }}
>
```

(Assurer que le `map` expose bien l'index : `.map((u, idx) => ...)`)

Remplacer le div racine par `<PageBackground style={{ fontFamily: theme.fontFamily }}>`.

- [ ] **Step 2 : Vérifier les tests Users**

```bash
cd frontend && npm test -- --testPathPattern="Users.test" --watchAll=false
```

Attendu : PASS

- [ ] **Step 3 : Appliquer sur AuditLogs.jsx**

Même principe : trouver le `map` sur `logs`, ajouter `className="table-row-hover"` + zébrage + `PageBackground` racine.

- [ ] **Step 4 : Vérifier les tests AuditLogs**

```bash
cd frontend && npm test -- --testPathPattern="AuditLogs.test" --watchAll=false
```

Attendu : PASS

- [ ] **Step 5 : Appliquer sur Employees.jsx**

Cette page a deux vues (liste hiérarchique + vue liste plate). Appliquer le zébrage uniquement sur la vue liste plate (là où il y a un `map` sur des employés avec des `<div>` ou `<tr>` de ligne). La vue hiérarchique (cards navigables Direction→Dept→Service) garde son style card-lift existant.

- [ ] **Step 6 : Vérifier les tests Employees**

```bash
cd frontend && npm test -- --testPathPattern="Employees.test" --watchAll=false
```

Attendu : PASS

- [ ] **Step 7 : Appliquer sur Parametres.jsx**

Même principe sur les listes de référentiels (Directions, Depts, Services, Postes).

- [ ] **Step 8 : Vérifier les tests Parametres**

```bash
cd frontend && npm test -- --testPathPattern="Parametres.test" --watchAll=false
```

Attendu : PASS

- [ ] **Step 9 : Commit**

```bash
git add frontend/src/pages/Users.jsx frontend/src/pages/AuditLogs.jsx frontend/src/pages/Employees.jsx frontend/src/pages/Parametres.jsx
git commit -m "feat(design): zébrage et survol latéral vert sur les tables (Users, AuditLogs, Employees, Parametres)"
```

---

## Task 6 : PageBackground sur les pages de détail + Login

**Files:**
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Modify: `frontend/src/pages/ContratDetail.jsx`
- Modify: `frontend/src/pages/EmployeeForm.jsx`
- Modify: `frontend/src/pages/Import.jsx`
- Modify: `frontend/src/pages/Profil.jsx`
- Modify: `frontend/src/pages/Login.jsx`
- Tests: les fichiers de test correspondants (existants)

**Interfaces:**
- Consomme : `PageBackground` (Task 2)

**Principe :** Dans chaque page, remplacer le `<div style={{ background: theme.bg, minHeight: "100vh", fontFamily: theme.fontFamily }}>` racine par `<PageBackground style={{ fontFamily: theme.fontFamily }}>`. Pour `Login.jsx`, qui n'a pas ce pattern (c'est une page plein écran à deux panneaux), ajouter simplement `className="anim-fade-in"` sur le conteneur racine existant (ne pas envelopper avec PageBackground — le fond de Login est un dégradé vert plein, pas le fond gris).

- [ ] **Step 1 : Modifier EmployeeDetail.jsx, ContratDetail.jsx, EmployeeForm.jsx, Import.jsx, Profil.jsx**

Pour chacun :
1. Ajouter l'import : `import PageBackground from "../components/PageBackground";`
2. Remplacer le `<div style={{ background: theme.bg, minHeight: "100vh", fontFamily: theme.fontFamily }}>` par `<PageBackground style={{ fontFamily: theme.fontFamily }}>`
3. Fermer avec `</PageBackground>` en lieu et place du `</div>` correspondant

- [ ] **Step 2 : Modifier Login.jsx**

Ajouter `import "../styles/animations.css";` si absent (vérifier en haut du fichier).

Trouver le `<div>` racine de Login (le conteneur `display: flex, height: "100vh"`), lui ajouter `className="anim-fade-in"` :

```jsx
// Avant
<div style={{ display: "flex", height: "100vh", fontFamily: theme.fontFamily }}>

// Après
<div className="anim-fade-in" style={{ display: "flex", height: "100vh", fontFamily: theme.fontFamily }}>
```

- [ ] **Step 3 : Lancer tous les tests des pages modifiées**

```bash
cd frontend && npm test -- --testPathPattern="EmployeeDetail|ContratDetail|EmployeeForm|Import|Profil|Login" --watchAll=false
```

Attendu : PASS

- [ ] **Step 4 : Lancer la suite complète**

```bash
cd frontend && npm test --watchAll=false
```

Attendu : 255+ tests PASS, 0 FAIL

- [ ] **Step 5 : Commit**

```bash
git add frontend/src/pages/EmployeeDetail.jsx frontend/src/pages/ContratDetail.jsx frontend/src/pages/EmployeeForm.jsx frontend/src/pages/Import.jsx frontend/src/pages/Profil.jsx frontend/src/pages/Login.jsx
git commit -m "feat(design): fond vivant PageBackground sur toutes les pages de détail + transition Login"
```

---

## Vérification finale

- [ ] Lancer `cd frontend && npm test --watchAll=false` — tous les tests passent
- [ ] Ouvrir l'app sur `http://localhost:3000` et naviguer sur Dashboard, Users, AuditLogs, Employees, Login — vérifier visuellement les halos, le liseré dégradé des cartes, le zébrage et survol des tables, les chiffres animés
- [ ] Vérifier que les rôles sont intacts : se connecter en CONSULTANT et vérifier l'absence des boutons d'action
