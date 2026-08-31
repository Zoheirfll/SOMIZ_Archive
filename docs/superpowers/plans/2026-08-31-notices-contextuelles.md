# Notices contextuelles (aide in-app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small clickable `(i)` info button on every page's hero header (and on 3 high-complexity field areas) that opens a popover explaining what the page/field does, using text centralized in a single config file.

**Architecture:** One reusable `InfoNotice` component (button + click-to-open popover, closes on outside click) rendered next to page titles and section labels. All copy lives in `frontend/src/config/notices.js`, keyed by page/field name, so the component itself carries zero page-specific text.

**Tech Stack:** React 19, inline styles only (`theme.js` tokens), Jest + React Testing Library.

## Global Constraints

- Styles inline only (`style={{}}`), tokens from `frontend/src/styles/theme.js` — never hardcode hex colors in components.
- No new npm dependency — reuse the existing "absolute popover + fixed full-screen overlay to catch outside clicks" pattern already used by the "Colonnes" menu in `frontend/src/pages/Employees.jsx:1697-1737`.
- Copy is French, plain strings (no JSX) in `frontend/src/config/notices.js`, matching the pattern of `frontend/src/config/keyboardShortcuts.js`.
- A page/field with no entry (or `null`) in the config renders no `(i)` button at all.
- `/login` gets no notice. `/consentement` is dropped from scope (already a self-explanatory legal text page — YAGNI).
- After all edits: run the full frontend test suite (`cd frontend && npm test -- --watchAll=false`) and fix any regression before considering the work done.

---

### Task 1: `InfoIcon` + `InfoNotice` component

**Files:**
- Modify: `frontend/src/components/icons.jsx` (append `InfoIcon`)
- Create: `frontend/src/components/InfoNotice.jsx`
- Test: `frontend/src/__tests__/InfoNotice.test.js`

**Interfaces:**
- Produces: `InfoIcon({ size = 14, ...props })` (SVG icon, same shape as siblings in `icons.jsx`).
- Produces: `InfoNotice({ text, variant = "hero", size = 18 })` — default export from `frontend/src/components/InfoNotice.jsx`. Renders nothing (`null`) when `text` is falsy. Renders a round button with `aria-label="Aide"` that toggles a popover containing `text` on click; a full-screen transparent overlay behind the popover closes it on outside click (same pattern as `colsMenuOpen` in `Employees.jsx`).
- Consumes: `theme` from `../styles/theme`.

- [ ] **Step 1: Add `InfoIcon` to `icons.jsx`**

Append at the end of `frontend/src/components/icons.jsx` (after the `Spinner` export, before end of file):

```jsx
export const InfoIcon = ({ size = 14, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="11" />
    <line x1="12" y1="8" x2="12" y2="8" />
  </svg>
);
```

- [ ] **Step 2: Write the failing test for `InfoNotice`**

Create `frontend/src/__tests__/InfoNotice.test.js`:

```jsx
import { render, screen, fireEvent } from "@testing-library/react";
import InfoNotice from "../components/InfoNotice";

describe("InfoNotice", () => {
  it("renders nothing when text is not provided", () => {
    const { container } = render(<InfoNotice text={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the popover text on click and hides it on outside click", () => {
    render(<InfoNotice text="Ceci explique la page." />);
    expect(screen.queryByText("Ceci explique la page.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aide" }));
    expect(screen.getByText("Ceci explique la page.")).toBeInTheDocument();

    fireEvent.click(document.body);
    expect(screen.queryByText("Ceci explique la page.")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx jest InfoNotice --watchAll=false`
Expected: FAIL — `Cannot find module '../components/InfoNotice'`

- [ ] **Step 4: Implement `InfoNotice`**

Create `frontend/src/components/InfoNotice.jsx`:

```jsx
import { useState } from "react";
import { theme } from "../styles/theme";
import { InfoIcon } from "./icons";

const VARIANTS = {
  hero: {
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
  },
  field: {
    background: theme.bg,
    color: theme.textSecondary,
  },
};

export default function InfoNotice({ text, variant = "hero", size = 18 }) {
  const [open, setOpen] = useState(false);

  if (!text) return null;

  const colors = VARIANTS[variant] || VARIANTS.hero;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Aide"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "none",
          background: colors.background,
          color: colors.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
          flexShrink: 0,
        }}
      >
        <InfoIcon size={Math.round(size * 0.6)} />
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 10 }}
          />
          <div
            className="anim-scale-in"
            style={{
              position: "absolute",
              left: 0,
              top: "calc(100% + 8px)",
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              boxShadow: theme.shadowMd,
              padding: "12px 14px",
              zIndex: 11,
              width: 260,
              color: theme.textSecondary,
              fontSize: 13,
              lineHeight: 1.5,
              fontWeight: 400,
              textTransform: "none",
              letterSpacing: "normal",
            }}
          >
            {text}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx jest InfoNotice --watchAll=false`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/icons.jsx frontend/src/components/InfoNotice.jsx frontend/src/__tests__/InfoNotice.test.js
git commit -m "feat(ui): ajoute le composant InfoNotice (aide contextuelle (i))"
```

---

### Task 2: Config centralisé des textes de notices

**Files:**
- Create: `frontend/src/config/notices.js`

**Interfaces:**
- Produces: `PAGE_NOTICES` (object, keys: `employees`, `employeeDetail`, `employeeForm`, `contratDetail`, `dashboard`, `users`, `audit`, `parametres`, `import`, `profil` — each a string).
- Produces: `FIELD_NOTICES` (object, shape `{ parametres: { cellulesEtSections, typesDocumentsCategories }, employeeForm: { affectationExclusive }, users: { perimetre } }` — each leaf a string).
- Consumed by: Task 3 and Task 4.

- [ ] **Step 1: Create the config file**

Create `frontend/src/config/notices.js`:

```js
// Textes des notices contextuelles ("(i)") affichées sur chaque page.
// Une clé absente ou à `null` = pas de bouton (i) affiché pour cette page/ce champ.

export const PAGE_NOTICES = {
  employees: "Parcourez les employés par Direction, puis Département, puis Service, Cellule ou Section. Utilisez la recherche ou le filtre Statut pour retrouver un employé directement, et le bouton Colonnes pour choisir les informations affichées dans le tableau.",
  employeeDetail: "Fiche complète d'un employé : informations, documents (classés par type, avec historique des versions) et contrats. Le bouton \"Scanner un dossier\" permet d'importer plusieurs documents scannés en une seule fois.",
  employeeForm: "Créez ou modifiez un employé. L'affectation (Direction/Département/Service ou Cellule ou Section) détermine qui peut voir cet employé selon le périmètre des comptes Consultant. Un changement d'affectation vous sera demandé de confirmer avant l'enregistrement.",
  contratDetail: "Détail d'un contrat et de ses documents propres (distincts du dossier général de l'employé). Modifiable uniquement par un Administrateur.",
  dashboard: "Vue d'ensemble des effectifs et de la complétude des dossiers RH sur l'ensemble de l'organisation.",
  users: "Gérez les comptes Administrateur et Consultant. Le bouton \"Périmètre\" restreint un compte Consultant à une partie de l'organisation, à certains types de documents, et/ou à des employés précis.",
  audit: "Historique de toutes les actions effectuées dans SOMIZ (traçabilité RGPD / Loi 18-07). Un Administrateur voit ses propres actions et celles des comptes Consultant qu'il gère ; seul un compte Super-administrateur voit le journal complet.",
  parametres: "Gérez les référentiels organisationnels (Directions, Départements, Services, Cellules, Sections...), les types de documents et les champs personnalisés utilisés dans toute l'application.",
  import: "Importez plusieurs employés en une fois depuis un fichier Excel (.xlsx) ou CSV. Téléchargez le modèle pour connaître les colonnes attendues avant de préparer votre fichier.",
  profil: "Consultez vos informations de compte et modifiez votre mot de passe.",
};

export const FIELD_NOTICES = {
  parametres: {
    cellulesEtSections: "Cellules et Sections sont deux référentiels indépendants qui coexistent : chacun est rattaché à exactement une Direction OU un Département (jamais un Service, jamais les deux). Un même Département peut avoir à la fois des Cellules et des Sections.",
    typesDocumentsCategories: "Une catégorie (ex. \"État civil\") regroupe des types de documents réellement uploadables (ex. \"Acte de naissance\"). Une catégorie elle-même n'est jamais uploadable et ne peut pas être marquée \"Obligatoire\" — reportez cette exigence sur ses sous-types.",
  },
  employeeForm: {
    affectationExclusive: "Un employé est rattaché à un seul de ces trois champs à la fois : Service, Cellule ou Section. Choisir l'un vide automatiquement les deux autres.",
  },
  users: {
    perimetre: "Trois niveaux de périmètre se combinent : le périmètre organisationnel (Direction/Département/Service/Cellule/Section, en OU entre les cases cochées), le périmètre \"Types de documents\" (combiné en ET avec l'organisationnel), et les accès ponctuels par employé (en OU en plus des deux autres). Aucune case cochée nulle part = accès non restreint.",
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/config/notices.js
git commit -m "feat(ui): ajoute les textes des notices contextuelles par page"
```

---

### Task 3: Notices de page (hero header) sur les 9 pages à hero vert

**Files:**
- Modify: `frontend/src/pages/Employees.jsx:2685-2695`
- Modify: `frontend/src/pages/EmployeeDetail.jsx:614-617`
- Modify: `frontend/src/pages/EmployeeForm.jsx:433-443`
- Modify: `frontend/src/pages/ContratDetail.jsx:430-434`
- Modify: `frontend/src/pages/Dashboard.jsx:161-164`
- Modify: `frontend/src/pages/Users.jsx:587-590`
- Modify: `frontend/src/pages/AuditLogs.jsx:148-151`
- Modify: `frontend/src/pages/Import.jsx:106-117`
- Modify: `frontend/src/pages/Profil.jsx:139-142`

**Interfaces:**
- Consumes: `InfoNotice` (default export, Task 1), `PAGE_NOTICES` (Task 2).

- [ ] **Step 1: `Employees.jsx` — wrap the `h1` in a flex row with `InfoNotice`**

Add the import near the other local imports (after line 17, `import { slugify } from "../utils/slugify";`):

```js
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES } from "../config/notices";
```

Replace (around line 2685-2695):

```jsx
                <h1
                  style={{
                    color: "#FFFFFF",
                    margin: 0,
                    fontSize: 26,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Dossiers Employés
                </h1>
```

with:

```jsx
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h1
                    style={{
                      color: "#FFFFFF",
                      margin: 0,
                      fontSize: 26,
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Dossiers Employés
                  </h1>
                  <InfoNotice text={PAGE_NOTICES.employees} />
                </div>
```

- [ ] **Step 2: `EmployeeDetail.jsx` — wrap the dynamic `h1` in a flex row**

Add the import after line 14 (`import PageBackground from "../components/PageBackground";`):

```js
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES } from "../config/notices";
```

Replace (around line 614-617):

```jsx
            <div>
              <h1 style={{ color: "#fff", fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: "-0.02em" }}>
                {employee.prenom} {employee.nom}
              </h1>
```

with:

```jsx
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1 style={{ color: "#fff", fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: "-0.02em" }}>
                  {employee.prenom} {employee.nom}
                </h1>
                <InfoNotice text={PAGE_NOTICES.employeeDetail} />
              </div>
```

- [ ] **Step 3: `EmployeeForm.jsx` — wrap the static `h1`**

Add the import after line 9 (`import PageBackground from "../components/PageBackground";`):

```js
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES } from "../config/notices";
```

Replace (around line 433-443):

```jsx
          <h1
            style={{
              color: "#FFFFFF",
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            {isEdit ? "Modifier l'employé" : "Nouvel employé"}
          </h1>
```

with:

```jsx
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1
              style={{
                color: "#FFFFFF",
                margin: 0,
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              {isEdit ? "Modifier l'employé" : "Nouvel employé"}
            </h1>
            <InfoNotice text={PAGE_NOTICES.employeeForm} />
          </div>
```

- [ ] **Step 4: `ContratDetail.jsx` — add `InfoNotice` next to the contract number**

Add the import after line 11 (`import PageBackground from "../components/PageBackground";`):

```js
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES } from "../config/notices";
```

Replace (around line 430-434):

```jsx
              <div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Contrat</div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em", fontFamily: "monospace" }}>{contrat.numero_contrat}</div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 4 }}>{contrat.employee_prenom || ""} {contrat.employee_nom} · {contrat.employee_matricule}</div>
              </div>
```

with:

```jsx
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Contrat</div>
                  <InfoNotice text={PAGE_NOTICES.contratDetail} />
                </div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em", fontFamily: "monospace" }}>{contrat.numero_contrat}</div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 4 }}>{contrat.employee_prenom || ""} {contrat.employee_nom} · {contrat.employee_matricule}</div>
              </div>
```

- [ ] **Step 5: `Dashboard.jsx` — wrap the `h1`**

Add the import after line 10 (`import PageBackground from "../components/PageBackground";`):

```js
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES } from "../config/notices";
```

Replace (around line 161-164):

```jsx
          <div>
            <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
              Tableau de bord
            </h1>
```

with:

```jsx
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
                Tableau de bord
              </h1>
              <InfoNotice text={PAGE_NOTICES.dashboard} />
            </div>
```

- [ ] **Step 6: `Users.jsx` — wrap the `h1`**

Add the import after line 7 (`import HeroDecor from "../components/HeroDecor";`):

```js
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES, FIELD_NOTICES } from "../config/notices";
```

(`FIELD_NOTICES` is imported here too since Task 4 also edits this file.)

Replace (around line 587-590):

```jsx
          <div>
            <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
              Gestion des utilisateurs
            </h1>
```

with:

```jsx
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
                Gestion des utilisateurs
              </h1>
              <InfoNotice text={PAGE_NOTICES.users} />
            </div>
```

- [ ] **Step 7: `AuditLogs.jsx` — wrap the `h1`**

Add the import after line 8 (`import PageBackground from "../components/PageBackground";`):

```js
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES } from "../config/notices";
```

Replace (around line 148-151):

```jsx
          <div>
            <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
              Journal d'audit
            </h1>
```

with:

```jsx
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
                Journal d'audit
              </h1>
              <InfoNotice text={PAGE_NOTICES.audit} />
            </div>
```

- [ ] **Step 8: `Import.jsx` — wrap the `h1`**

Add the import after line 8 (`import PageBackground from "../components/PageBackground";`):

```js
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES } from "../config/notices";
```

Replace (around line 106-117):

```jsx
          <div>
            <h1
              style={{
                color: "#FFFFFF",
                margin: 0,
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              Import employés
            </h1>
```

with:

```jsx
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1
                style={{
                  color: "#FFFFFF",
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                Import employés
              </h1>
              <InfoNotice text={PAGE_NOTICES.import} />
            </div>
```

- [ ] **Step 9: `Profil.jsx` — wrap the `h1`**

Add the import after line 8 (`import PageBackground from "../components/PageBackground";`):

```js
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES } from "../config/notices";
```

Replace (around line 139-142):

```jsx
          <div>
            <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
              Mon profil
            </h1>
```

with:

```jsx
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
                Mon profil
              </h1>
              <InfoNotice text={PAGE_NOTICES.profil} />
            </div>
```

- [ ] **Step 10: Manually verify in the browser**

Run: `cd frontend && npm start`
Visit `/employees`, `/dashboard`, `/users`, `/audit`, `/import`, `/profil`, an employee detail page, an employee edit form, and a contract detail page. On each, confirm a small `(i)` button appears next to the title/label, click opens a popover with the expected French text, and clicking outside closes it.

- [ ] **Step 11: Run the frontend test suite**

Run: `cd frontend && npx jest Employees EmployeeDetail EmployeeForm ContratDetail Dashboard Users AuditLogs Import Profil --watchAll=false`
Expected: all existing suites for these 9 pages still PASS (no snapshot/text-query regressions from the added `(i)` button). Fix any assertion that broke because of the new wrapping `<div>` (e.g. a test that asserted the title's immediate DOM parent) by updating the test to the new (still equivalent) structure — do not change the intended behavior to make a test pass.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/pages/Employees.jsx frontend/src/pages/EmployeeDetail.jsx frontend/src/pages/EmployeeForm.jsx frontend/src/pages/ContratDetail.jsx frontend/src/pages/Dashboard.jsx frontend/src/pages/Users.jsx frontend/src/pages/AuditLogs.jsx frontend/src/pages/Import.jsx frontend/src/pages/Profil.jsx
git commit -m "feat(ui): ajoute la notice contextuelle de page sur les 9 pages à hero vert"
```

---

### Task 4: Notices de champ (Parametres, EmployeeForm, Users)

**Files:**
- Modify: `frontend/src/pages/Parametres.jsx:1907-1923` (page title, light background) and `:2003-2006` (per-tab notice)
- Modify: `frontend/src/pages/EmployeeForm.jsx:76-106` (`SectionHeader`) and `:630-632` (call site)
- Modify: `frontend/src/pages/Users.jsx:1249-1252` (modal title)

**Interfaces:**
- Consumes: `InfoNotice` (Task 1), `PAGE_NOTICES` / `FIELD_NOTICES` (Task 2).

- [ ] **Step 1: `Parametres.jsx` — page title notice (light background, so `variant="field"`)**

Add the import after line 12 (`import useIsMobile from "../hooks/useIsMobile";`):

```js
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES, FIELD_NOTICES } from "../config/notices";
```

Replace (around line 1908-1918):

```jsx
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              color: theme.text,
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            Paramètres
          </h1>
```

with:

```jsx
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1
              style={{
                color: theme.text,
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              Paramètres
            </h1>
            <InfoNotice text={PAGE_NOTICES.parametres} variant="field" />
          </div>
```

- [ ] **Step 2: `Parametres.jsx` — per-tab field notice next to the element count**

Add a helper right above the `return (` of the component (find it near the top of the component body, alongside other derived values like `pageMeta`) — insert this line directly before the `return (` at line 1904:

```jsx
  const tabFieldNotice =
    activeTab === "cellules" || activeTab === "sections"
      ? FIELD_NOTICES.parametres.cellulesEtSections
      : activeTab === "types-documents"
      ? FIELD_NOTICES.parametres.typesDocumentsCategories
      : null;

```

Replace (around line 2003-2006):

```jsx
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 200 }}>
                <div style={{ color: theme.textSecondary, fontSize: 13, whiteSpace: "nowrap" }}>
                  {pageMeta.count} élément(s)
                </div>
```

with:

```jsx
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 200 }}>
                <div style={{ color: theme.textSecondary, fontSize: 13, whiteSpace: "nowrap" }}>
                  {pageMeta.count} élément(s)
                </div>
                <InfoNotice text={tabFieldNotice} variant="field" />
```

- [ ] **Step 3: `EmployeeForm.jsx` — `SectionHeader` accepts an optional `notice`**

Add the import after line 9 (`import PageBackground from "../components/PageBackground";`, from Task 3 Step 3 this now also needs `FIELD_NOTICES`) — update the import line added in Task 3 Step 3 to:

```js
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES, FIELD_NOTICES } from "../config/notices";
```

Replace `SectionHeader` (around line 76-106):

```jsx
const SectionHeader = ({ label }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 20,
    }}
  >
    <div
      style={{
        width: 4,
        height: 18,
        background: theme.primary,
        borderRadius: 2,
        flexShrink: 0,
      }}
    />
    <div
      style={{
        color: theme.text,
        fontSize: 13,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {label}
    </div>
  </div>
);
```

with:

```jsx
const SectionHeader = ({ label, notice }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 20,
    }}
  >
    <div
      style={{
        width: 4,
        height: 18,
        background: theme.primary,
        borderRadius: 2,
        flexShrink: 0,
      }}
    />
    <div
      style={{
        color: theme.text,
        fontSize: 13,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {label}
    </div>
    <InfoNotice text={notice} variant="field" size={16} />
  </div>
);
```

- [ ] **Step 4: `EmployeeForm.jsx` — pass the notice to the "Organisation" section**

Replace (around line 632):

```jsx
            <SectionHeader label="Organisation" />
```

with:

```jsx
            <SectionHeader label="Organisation" notice={FIELD_NOTICES.employeeForm.affectationExclusive} />
```

- [ ] **Step 5: `Users.jsx` — modal title notice**

(The import for `FIELD_NOTICES` was already added to `Users.jsx` in Task 3 Step 6.)

Replace (around line 1250-1252):

```jsx
            <h2 style={{ color: theme.text, margin: "0 0 6px", fontSize: 17, fontWeight: 800 }}>
              Périmètre d'accès
            </h2>
```

with:

```jsx
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <h2 style={{ color: theme.text, margin: 0, fontSize: 17, fontWeight: 800 }}>
                Périmètre d'accès
              </h2>
              <InfoNotice text={FIELD_NOTICES.users.perimetre} variant="field" />
            </div>
```

- [ ] **Step 6: Manually verify in the browser**

Run: `cd frontend && npm start`
Visit `/parametres` — check the page-level `(i)` next to "Paramètres", then switch to the "Cellules", "Sections" and "Types de documents" tabs and confirm the field-level `(i)` appears only on those tabs (not on e.g. "Directions"). Visit `/employees/nouveau`, confirm an `(i)` appears next to "Organisation". Visit `/users`, open "Périmètre" on a Consultant account, confirm an `(i)` appears next to the modal title.

- [ ] **Step 7: Run the frontend test suite**

Run: `cd frontend && npx jest Parametres EmployeeForm Users --watchAll=false`
Expected: all existing suites PASS. Fix any regression the same way as Task 3 Step 11.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Parametres.jsx frontend/src/pages/EmployeeForm.jsx frontend/src/pages/Users.jsx
git commit -m "feat(ui): ajoute les notices de champ (Parametres, EmployeeForm, Users)"
```

---

### Task 5: Suite de tests complète

**Files:**
- None (verification only)

**Interfaces:**
- None.

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: PASS (0 failing). If anything fails outside the files touched in Tasks 3-4, investigate before proceeding — it signals an unrelated pre-existing issue, not something this plan should paper over.

- [ ] **Step 2: Update `securite.md` if applicable**

This feature adds no new permission, data exposure, or auth-adjacent behavior (pure static UI text), so no entry in `securite.md` is required. Confirm this by re-reading the "Sécurité — règles impératives" section of `CLAUDE.md` — nothing there is touched by `InfoNotice`.

- [ ] **Step 3: Final commit (only if Step 1 required fixes)**

```bash
git add -A
git commit -m "test(ui): corrige les tests affectés par l'ajout des notices contextuelles"
```
