# Navigation type ERP (palette Ctrl+K + breadcrumbs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une palette de commandes (`Ctrl+K`) pour sauter vers un employé, une attestation, une page ou une action fréquente, et compléter les fils d'Ariane manquants sur les fiches de détail (employé, attestation, contrat).

**Architecture:** Un état d'ouverture/fermeture partagé (étendu sur le `KeyboardShortcutsContext` déjà en place, plutôt qu'un nouveau contexte séparé — déviation mineure et volontaire par rapport au document de design, qui proposait un contexte dédié : ce contexte existant gère déjà exactement ce pattern "état de modale déclenchée par un raccourci", l'étendre évite un provider de plus à empiler dans `App.js`). Un composant `CommandPalette.jsx` autonome fait 2 appels réseau vers des endpoints déjà scopés serveur (`/employees/search/`, `/attestations/demandes/?q=`), plus un filtrage client-side sur un catalogue statique de pages/actions. Les breadcrumbs enrichis réutilisent le composant générique `Breadcrumb.jsx` déjà existant, étendu d'un variant visuel pour les hero headers à fond foncé.

**Tech Stack:** React 19, styles inline + `theme.js` (pas de Tailwind), Jest + React Testing Library.

## Global Constraints

- Styles inline uniquement, jamais de hex codé en dur — toute couleur vient de `theme.js` (`useTheme()`).
- Toute vue backend listant des employés doit déjà appliquer le scoping — **aucune vue backend n'est créée ou modifiée dans ce plan** (endpoints réutilisés tels quels).
- Pas de `window.confirm`/`window.prompt` — sans objet ici (aucune action destructive dans ce chantier).
- Après toute modification frontend, les tests Jest concernés doivent passer (`cd frontend && npm test -- <fichier>` par tâche, suite complète avant la dernière tâche).
- Aucune sidebar persistante, aucun bouton flottant séparé, aucun historique de "pages récentes", aucun nouvel endpoint backend — hors scope explicitement écarté par la spec.

---

### Task 1: Registre de raccourcis + état partagé d'ouverture de la palette

**Files:**
- Modify: `frontend/src/config/keyboardShortcuts.js`
- Modify: `frontend/src/context/KeyboardShortcutsContext.jsx`
- Modify: `frontend/src/components/icons.jsx`
- Test: `frontend/src/__tests__/KeyboardShortcutsContext.test.jsx` (nouveau fichier)

**Interfaces:**
- Consumes: rien (fondation)
- Produces: `useKeyboardShortcutsHelp()` expose désormais aussi `{ paletteOpen, openPalette, closePalette, togglePalette }` en plus de l'existant (`helpOpen`, `openHelp`, `closeHelp`, `toggleHelp`, `overrides`, `setOverride`, `resetOverride`, `resetAllOverrides`). `DEFAULT_SHORTCUTS` contient une entrée `{ id: "command-palette", combo: "Ctrl+K", label: "Recherche rapide", category: "navigation" }`. `icons.jsx` exporte `SearchIcon`.

- [ ] **Step 1: Écrire le test qui échoue pour l'état de palette**

Créer `frontend/src/__tests__/KeyboardShortcutsContext.test.jsx` :

```jsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  KeyboardShortcutsProvider,
  useKeyboardShortcutsHelp,
} from "../context/KeyboardShortcutsContext";

function Probe() {
  const { paletteOpen, openPalette, closePalette, togglePalette } = useKeyboardShortcutsHelp();
  return (
    <div>
      <span data-testid="state">{paletteOpen ? "open" : "closed"}</span>
      <button onClick={openPalette}>open</button>
      <button onClick={closePalette}>close</button>
      <button onClick={togglePalette}>toggle</button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <KeyboardShortcutsProvider>
      <Probe />
    </KeyboardShortcutsProvider>
  );

describe("KeyboardShortcutsContext — état de la palette de commandes", () => {
  test("fermée par défaut, s'ouvre et se ferme", () => {
    renderProbe();
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByTestId("state")).toHaveTextContent("open");
    fireEvent.click(screen.getByText("close"));
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
  });

  test("togglePalette inverse l'état", () => {
    renderProbe();
    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("state")).toHaveTextContent("open");
    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend && npm test -- KeyboardShortcutsContext.test.jsx`
Expected: FAIL — `paletteOpen`/`openPalette`/etc. sont `undefined`, l'assertion sur `state` échoue.

- [ ] **Step 3: Ajouter l'état de palette au contexte**

Dans `frontend/src/context/KeyboardShortcutsContext.jsx`, dans `KeyboardShortcutsProvider` :

```jsx
export function KeyboardShortcutsProvider({ children }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [overrides, setOverrides] = useState(loadOverrides);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), []);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const togglePalette = useCallback(() => setPaletteOpen((v) => !v), []);

  // ... (setOverride/resetOverride/resetAllOverrides inchangés)

  return (
    <KeyboardShortcutsContext.Provider
      value={{
        helpOpen,
        openHelp,
        closeHelp,
        toggleHelp,
        paletteOpen,
        openPalette,
        closePalette,
        togglePalette,
        overrides,
        setOverride,
        resetOverride,
        resetAllOverrides,
      }}
    >
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd frontend && npm test -- KeyboardShortcutsContext.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Ajouter l'entrée `command-palette` au registre**

Dans `frontend/src/config/keyboardShortcuts.js`, ajouter dans `DEFAULT_SHORTCUTS` (juste après `help-toggle`, avant les entrées `quick`) :

```js
  { id: "command-palette", combo: "Ctrl+K", label: "Recherche rapide (employés, attestations, pages)", category: "navigation" },
```

- [ ] **Step 6: Ajouter `SearchIcon` à `icons.jsx`**

Dans `frontend/src/components/icons.jsx`, ajouter (même style que les autres icônes du fichier) :

```jsx
export const SearchIcon = ({ size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/config/keyboardShortcuts.js frontend/src/context/KeyboardShortcutsContext.jsx frontend/src/components/icons.jsx frontend/src/__tests__/KeyboardShortcutsContext.test.jsx
git commit -m "feat(navbar): ajoute l'état partagé et le raccourci Ctrl+K de la palette de commandes"
```

---

### Task 2: Catalogue statique "Pages & actions"

**Files:**
- Create: `frontend/src/config/commandPaletteActions.js`
- Test: `frontend/src/__tests__/commandPaletteActions.test.js`

**Interfaces:**
- Consumes: `DEFAULT_SHORTCUTS` (Task 1, déjà existant) depuis `../config/keyboardShortcuts`.
- Produces: `getPageActions(user)` → `Array<{ id: string, label: string, path: string }>`, utilisé par `CommandPalette.jsx` (Task 3).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/__tests__/commandPaletteActions.test.js` :

```js
import { getPageActions } from "../config/commandPaletteActions";

describe("getPageActions", () => {
  test("un CONSULTANT ne voit ni les pages admin ni les actions réservées", () => {
    const items = getPageActions({ role: "CONSULTANT" });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Employés");
    expect(labels).toContain("Organigramme");
    expect(labels).not.toContain("Utilisateurs");
    expect(labels).not.toContain("Nouvel employé");
    expect(labels).not.toContain("Nouvelle demande d'attestation");
  });

  test("un ADMIN voit les pages admin et \"Nouvel employé\", pas \"Nouvelle demande d'attestation\"", () => {
    const items = getPageActions({ role: "ADMIN" });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Utilisateurs");
    expect(labels).toContain("Configuration");
    expect(labels).toContain("Nouvel employé");
    expect(labels).not.toContain("Nouvelle demande d'attestation");
  });

  test("un GESTIONNAIRE voit \"Nouvelle demande d'attestation\", pas \"Nouvel employé\" ni les pages admin", () => {
    const items = getPageActions({ role: "GESTIONNAIRE" });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Nouvelle demande d'attestation");
    expect(labels).not.toContain("Nouvel employé");
    expect(labels).not.toContain("Utilisateurs");
  });

  test("chaque entrée a un id, un label et un chemin uniques", () => {
    const items = getPageActions({ role: "SUPERADMIN" });
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    items.forEach((i) => {
      expect(typeof i.label).toBe("string");
      expect(i.path.startsWith("/")).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend && npm test -- commandPaletteActions.test.js`
Expected: FAIL — le module `../config/commandPaletteActions` n'existe pas.

- [ ] **Step 3: Créer le catalogue**

Créer `frontend/src/config/commandPaletteActions.js` :

```js
import { DEFAULT_SHORTCUTS } from "./keyboardShortcuts";

const isAdmin = (role) => ["ADMIN", "SUPERADMIN"].includes(role);

// Pages du menu "Administration" (Navbar.jsx#adminMenuLinks) — dupliquées
// ici plutôt qu'importées de Navbar.jsx pour ne pas coupler la palette de
// commandes au composant Navbar (éviter un import croisé components→config).
const ADMIN_MENU_PAGES = [
  { id: "page-import", label: "Import", path: "/import" },
  { id: "page-users", label: "Utilisateurs", path: "/users" },
  { id: "page-parametres", label: "Configuration", path: "/parametres" },
  { id: "page-audit", label: "Journal", path: "/audit" },
];

// Actions de création rapide — chacune avec sa propre règle de visibilité,
// identique aux boutons "+" déjà existants sur les pages concernées (voir
// Employees.jsx pour "Nouvel employé", Attestations.jsx/DossierTab.jsx pour
// "Nouvelle demande d'attestation").
const QUICK_ACTIONS = [
  {
    id: "action-new-employee",
    label: "Nouvel employé",
    path: "/employees/nouveau",
    isVisible: (user) => isAdmin(user?.role),
  },
  {
    id: "action-new-attestation",
    label: "Nouvelle demande d'attestation",
    path: "/attestations/nouvelle",
    isVisible: (user) => ["SUPERADMIN", "GESTIONNAIRE"].includes(user?.role),
  },
];

/**
 * Catalogue "Pages & actions" de la palette de commandes (CommandPalette.jsx)
 * — combine les raccourcis de navigation rapide déjà enregistrés
 * (DEFAULT_SHORTCUTS, catégorie "quick"), les pages du menu Administration,
 * et les actions de création rapide. Filtré une seule fois par rôle ; le
 * filtrage texte de la recherche est fait par l'appelant.
 */
export function getPageActions(user) {
  const admin = isAdmin(user?.role);

  const quickPages = DEFAULT_SHORTCUTS
    .filter((s) => s.category === "quick" && (!s.adminOnly || admin))
    .map((s) => ({ id: s.id, label: s.label, path: s.path }));

  const adminPages = admin
    ? ADMIN_MENU_PAGES.map((p) => ({ id: p.id, label: p.label, path: p.path }))
    : [];

  const actions = QUICK_ACTIONS
    .filter((a) => a.isVisible(user))
    .map((a) => ({ id: a.id, label: a.label, path: a.path }));

  return [...quickPages, ...adminPages, ...actions];
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd frontend && npm test -- commandPaletteActions.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/config/commandPaletteActions.js frontend/src/__tests__/commandPaletteActions.test.js
git commit -m "feat(navbar): ajoute le catalogue de pages/actions de la palette de commandes"
```

---

### Task 3: Composant `CommandPalette`

**Files:**
- Create: `frontend/src/components/CommandPalette.jsx`
- Test: `frontend/src/__tests__/CommandPalette.test.jsx`

**Interfaces:**
- Consumes: `getPageActions(user)` (Task 2) ; `SearchIcon`, `XIcon` depuis `../components/icons` ; `api` (`../services/api`) ; `useAuth()` (`../context/AuthContext`) ; `useTheme()` (`../context/ThemeContext`) ; `useIsMobile()` (`../hooks/useIsMobile`) ; `useShortcut` (`../hooks/useKeyboardShortcuts`).
- Produces: `export default function CommandPalette({ isOpen, onClose })` — composant autonome, rendu conditionnellement par l'appelant (Task 4 : `GlobalShortcuts.jsx`).

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `frontend/src/__tests__/CommandPalette.test.jsx` :

```jsx
import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import CommandPalette from "../components/CommandPalette";

const render = (ui) => rtlRender(ui, { wrapper: ThemeProvider });

const mockEmployee = {
  id: "emp-1",
  matricule: "MAT-001",
  nom: "Dupont",
  prenom: "Jean",
  service_nom: "Paie",
  numero_contrat_actif: "CTR-2024-007",
};

const mockDemande = {
  id: "dem-1",
  reference: "00001/26",
  employee_nom: "Dupont Jean",
  statut: "recue",
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { role: "ADMIN", can_manage_attestations: true } });
  api.get.mockImplementation((url) => {
    if (url === "/employees/search/") return Promise.resolve({ data: [mockEmployee] });
    if (url === "/attestations/demandes/") return Promise.resolve({ data: { results: [mockDemande] } });
    return Promise.resolve({ data: [] });
  });
});

describe("CommandPalette", () => {
  test("ne rend rien si isOpen=false", () => {
    render(<CommandPalette isOpen={false} onClose={jest.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("affiche le catalogue Pages & actions dès l'ouverture, sans appel réseau", () => {
    render(<CommandPalette isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText("Employés")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  test("recherche employés + attestations dès 2 caractères, puis navigue au clic", async () => {
    render(<CommandPalette isOpen={true} onClose={jest.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "du" } });

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/employees/search/", { params: { q: "du" } }
    ));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/attestations/demandes/", { params: { q: "du" } }
    ));

    await waitFor(() => screen.getByText("Dupont Jean"));
    fireEvent.click(screen.getByText("Dupont Jean"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees/MAT-001");
  });

  test("ne cherche pas les attestations si l'utilisateur n'y a pas accès", async () => {
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" } });
    render(<CommandPalette isOpen={true} onClose={jest.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "du" } });

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/employees/search/", { params: { q: "du" } }
    ));
    expect(api.get).not.toHaveBeenCalledWith(
      "/attestations/demandes/", expect.anything()
    );
  });

  test("Échap ferme la palette", () => {
    const onClose = jest.fn();
    render(<CommandPalette isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  test("clic sur l'overlay ferme la palette", () => {
    const onClose = jest.fn();
    render(<CommandPalette isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd frontend && npm test -- CommandPalette.test.jsx`
Expected: FAIL — le module `../components/CommandPalette` n'existe pas.

- [ ] **Step 3: Créer le composant**

Créer `frontend/src/components/CommandPalette.jsx` :

```jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import { useShortcut } from "../hooks/useKeyboardShortcuts";
import { getPageActions } from "../config/commandPaletteActions";
import { SearchIcon, XIcon } from "./icons";
import StatutBadge from "./attestations/StatutBadge";

const normalize = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const canSeeAttestations = (user) =>
  user?.role === "GESTIONNAIRE" || !!user?.can_manage_attestations;

export default function CommandPalette({ isOpen, onClose }) {
  const theme = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const inputRef = useRef(null);

  const [query, setQuery] = useState("");
  const [employeeResults, setEmployeeResults] = useState([]);
  const [attestationResults, setAttestationResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const showAttestations = canSeeAttestations(user);

  // Réinitialise la recherche à chaque ouverture/fermeture — pas de
  // persistance de la dernière recherche entre deux ouvertures.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setEmployeeResults([]);
    setAttestationResults([]);
    setSelectedIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Recherche debouncée dès 2 caractères — 2 appels indépendants
  // (Promise.allSettled implicite via .catch séparés) : l'échec de l'un ne
  // doit pas effacer les résultats de l'autre.
  useEffect(() => {
    if (!isOpen) return undefined;
    const q = query.trim();
    if (q.length < 2) {
      setEmployeeResults([]);
      setAttestationResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get("/employees/search/", { params: { q } })
        .then((res) => { if (!cancelled) setEmployeeResults(res.data || []); })
        .catch(() => { if (!cancelled) setEmployeeResults([]); });

      if (showAttestations) {
        api.get("/attestations/demandes/", { params: { q } })
          .then((res) => {
            if (cancelled) return;
            setAttestationResults(res.data?.results || res.data || []);
          })
          .catch(() => { if (!cancelled) setAttestationResults([]); });
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, isOpen, showAttestations]);

  const pageActions = useMemo(() => getPageActions(user), [user]);
  const filteredPageActions = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return pageActions;
    return pageActions.filter((a) => normalize(a.label).includes(q));
  }, [pageActions, query]);

  // Liste aplatie (ordre d'affichage : Employés, Attestations, Pages &
  // actions) pour que la navigation ↑/↓ déplace un simple index.
  const flatResults = useMemo(() => {
    const items = [];
    employeeResults.forEach((e) =>
      items.push({ kind: "employee", key: `emp-${e.id}`, data: e })
    );
    if (showAttestations) {
      attestationResults.forEach((d) =>
        items.push({ kind: "attestation", key: `att-${d.id}`, data: d })
      );
    }
    filteredPageActions.forEach((a) =>
      items.push({ kind: "page", key: `page-${a.id}`, data: a })
    );
    return items;
  }, [employeeResults, attestationResults, filteredPageActions, showAttestations]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [flatResults.length]);

  const activate = (item) => {
    if (!item) return;
    if (item.kind === "employee") navigate(`/employees/${item.data.matricule}`);
    else if (item.kind === "attestation") navigate(`/attestations/${item.data.reference.replace("/", "-")}`);
    else navigate(item.data.path);
    onClose();
  };

  useShortcut("ArrowDown", () => {
    setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
  }, { enabled: isOpen, allowInInputs: true });
  useShortcut("ArrowUp", () => {
    setSelectedIndex((i) => Math.max(i - 1, 0));
  }, { enabled: isOpen, allowInInputs: true });
  useShortcut("Enter", () => {
    activate(flatResults[selectedIndex]);
  }, { enabled: isOpen, allowInInputs: true });
  useShortcut("Escape", onClose, { enabled: isOpen, allowInInputs: true });

  if (!isOpen) return null;

  const trimmedQuery = query.trim();
  const showHint = trimmedQuery.length > 0 && trimmedQuery.length < 2;
  const showNoResults =
    trimmedQuery.length >= 2 &&
    employeeResults.length === 0 &&
    attestationResults.length === 0 &&
    filteredPageActions.length === 0;

  const rowStyle = (isSelected) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 8,
    cursor: "pointer",
    background: isSelected ? theme.primaryBg : "transparent",
  });

  let cursor = -1;

  return (
    <div
      role="dialog"
      aria-label="Recherche rapide"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: isMobile ? 0 : "10vh",
        zIndex: 2000,
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        className="anim-scale-in"
        style={{
          background: theme.surface,
          borderRadius: isMobile ? 0 : 16,
          width: isMobile ? "100%" : 560,
          maxWidth: "94vw",
          height: isMobile ? "100%" : "auto",
          maxHeight: isMobile ? "100%" : "70vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: theme.shadowLg,
          border: `1px solid ${theme.border}`,
          fontFamily: theme.fontFamily,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${theme.borderLight}` }}>
          <SearchIcon size={17} style={{ color: theme.textMuted, flexShrink: 0 }} />
          <input
            ref={inputRef}
            role="textbox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un employé, une attestation, une page…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 15,
              color: theme.text,
              fontFamily: theme.fontFamily,
            }}
          />
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{ background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer", padding: 4, display: "flex" }}
          >
            <XIcon size={16} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: 8 }}>
          {showHint && (
            <div style={{ padding: "8px 12px", fontSize: 12, color: theme.textMuted }}>
              Tapez au moins 2 caractères…
            </div>
          )}

          {employeeResults.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: theme.textMuted }}>
                Employés
              </div>
              {employeeResults.map((e) => {
                cursor += 1;
                const idx = cursor;
                return (
                  <div
                    key={e.id}
                    style={rowStyle(idx === selectedIndex)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => activate({ kind: "employee", data: e })}
                  >
                    <span style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>
                      {e.prenom} {e.nom}
                      <span style={{ color: theme.textMuted, fontWeight: 400 }}> · {e.matricule}</span>
                    </span>
                    {e.numero_contrat_actif && (
                      <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: "monospace" }}>
                        N° {e.numero_contrat_actif}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {showAttestations && attestationResults.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: theme.textMuted }}>
                Attestations
              </div>
              {attestationResults.map((d) => {
                cursor += 1;
                const idx = cursor;
                return (
                  <div
                    key={d.id}
                    style={rowStyle(idx === selectedIndex)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => activate({ kind: "attestation", data: d })}
                  >
                    <span style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>
                      {d.employee_nom}
                      <span style={{ color: theme.textMuted, fontWeight: 400, fontFamily: "monospace" }}> · {d.reference}</span>
                    </span>
                    <StatutBadge statut={d.statut} />
                  </div>
                );
              })}
            </div>
          )}

          {filteredPageActions.length > 0 && (
            <div>
              <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: theme.textMuted }}>
                Pages & actions
              </div>
              {filteredPageActions.map((a) => {
                cursor += 1;
                const idx = cursor;
                return (
                  <div
                    key={a.id}
                    style={rowStyle(idx === selectedIndex)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => activate({ kind: "page", data: a })}
                  >
                    <span style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>{a.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {showNoResults && (
            <div style={{ padding: "16px 12px", fontSize: 13, color: theme.textMuted, textAlign: "center" }}>
              Aucun résultat.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd frontend && npm test -- CommandPalette.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CommandPalette.jsx frontend/src/__tests__/CommandPalette.test.jsx
git commit -m "feat(navbar): ajoute le composant de palette de commandes (Ctrl+K)"
```

---

### Task 4: Câblage dans `GlobalShortcuts`

**Files:**
- Modify: `frontend/src/components/GlobalShortcuts.jsx`
- Test: `frontend/src/__tests__/GlobalShortcuts.test.jsx` (nouveau fichier)

**Interfaces:**
- Consumes: `paletteOpen`/`togglePalette`/`closePalette` (Task 1) ; `CommandPalette` (Task 3).
- Produces: `Ctrl+K` ouvre/ferme la palette depuis n'importe quelle page (sauf `/login`/`/consentement`, même garde-fou que les autres raccourcis).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/__tests__/GlobalShortcuts.test.jsx` :

```jsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { KeyboardShortcutsProvider } from "../context/KeyboardShortcutsContext";

jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../components/CommandPalette", () => ({ isOpen, onClose }) =>
  isOpen ? <div data-testid="palette" onClick={onClose}>palette</div> : null
);

import { useAuth } from "../context/AuthContext";
import GlobalShortcuts from "../components/GlobalShortcuts";

const renderAt = (path = "/employees") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <KeyboardShortcutsProvider>
        <GlobalShortcuts />
      </KeyboardShortcutsProvider>
    </MemoryRouter>
  );

describe("GlobalShortcuts — palette de commandes", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { role: "ADMIN" } });
  });

  test("Ctrl+K ouvre la palette", () => {
    renderAt();
    expect(screen.queryByTestId("palette")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("palette")).toBeInTheDocument();
  });

  test("désactivé sur /login", () => {
    renderAt("/login");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.queryByTestId("palette")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend && npm test -- GlobalShortcuts.test.jsx`
Expected: FAIL — `Ctrl+K` ne fait rien, `data-testid="palette"` absent.

- [ ] **Step 3: Câbler la palette dans `GlobalShortcuts.jsx`**

Remplacer le contenu de `frontend/src/components/GlobalShortcuts.jsx` par :

```jsx
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useKeyboardShortcutsHelp } from "../context/KeyboardShortcutsContext";
import { useShortcut } from "../hooks/useKeyboardShortcuts";
import { DEFAULT_SHORTCUTS, resolveCombo } from "../config/keyboardShortcuts";
import KeyboardShortcutsHelp from "./KeyboardShortcutsHelp";
import CommandPalette from "./CommandPalette";

const isAdmin = (role) => ["ADMIN", "SUPERADMIN"].includes(role);

// Fixe (filtré par catégorie, pas par rôle) : le nombre de hooks appelés
// doit rester constant à chaque rendu — voir règle des Hooks React.
const NAV_SHORTCUTS = DEFAULT_SHORTCUTS.filter((s) => s.category !== "pagination");

/**
 * Raccourcis clavier globaux (navigation rapide + aide + palette de
 * commandes) — monté une seule fois dans App.js, à l'intérieur du
 * BrowserRouter (a besoin de useNavigate). Désactivé sur /login et
 * /consentement pour ne pas court-circuiter ces flux.
 */
export default function GlobalShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { helpOpen, toggleHelp, closeHelp, paletteOpen, togglePalette, closePalette, overrides } = useKeyboardShortcutsHelp();

  const disabled = !user || location.pathname === "/login" || location.pathname === "/consentement";

  NAV_SHORTCUTS.forEach((s) => {
    const combo = resolveCombo(s, overrides);
    const enabled = !disabled && (!s.adminOnly || isAdmin(user?.role));
    let handler;
    if (s.id === "nav-back") handler = () => navigate(-1);
    else if (s.id === "nav-forward") handler = () => navigate(1);
    else if (s.id === "help-toggle") handler = toggleHelp;
    else if (s.id === "command-palette") handler = togglePalette;
    else handler = () => navigate(s.path);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useShortcut(combo, handler, { enabled });
  });

  useShortcut("Escape", closeHelp, { enabled: helpOpen, allowInInputs: true });

  return (
    <>
      {helpOpen && <KeyboardShortcutsHelp onClose={closeHelp} />}
      <CommandPalette isOpen={paletteOpen} onClose={closePalette} />
    </>
  );
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd frontend && npm test -- GlobalShortcuts.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/GlobalShortcuts.jsx frontend/src/__tests__/GlobalShortcuts.test.jsx
git commit -m "feat(navbar): câble Ctrl+K sur la palette de commandes dans GlobalShortcuts"
```

---

### Task 5: Icône de recherche dans le drawer mobile

**Files:**
- Modify: `frontend/src/components/Navbar.jsx`
- Test: `frontend/src/__tests__/Navbar.test.jsx` (nouveau fichier, mobile uniquement)

**Interfaces:**
- Consumes: `useKeyboardShortcutsHelp()` (Task 1, `openPalette`), `SearchIcon` (Task 1).
- Produces: un bouton loupe visible uniquement en layout mobile (`useIsMobile()`), à côté du bouton hamburger existant.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/__tests__/Navbar.test.jsx` :

```jsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";
import { KeyboardShortcutsProvider, useKeyboardShortcutsHelp } from "../context/KeyboardShortcutsContext";

jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: [] })) } }));
jest.mock("../hooks/useIsMobile", () => () => true);

import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";

function Probe() {
  const { paletteOpen } = useKeyboardShortcutsHelp();
  return <span data-testid="palette-state">{paletteOpen ? "open" : "closed"}</span>;
}

const renderNavbar = () =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <KeyboardShortcutsProvider>
          <Navbar />
          <Probe />
        </KeyboardShortcutsProvider>
      </ThemeProvider>
    </MemoryRouter>
  );

describe("Navbar (mobile) — icône de recherche", () => {
  test("ouvre la palette de commandes au clic", () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", prenom: "A", nom: "B" }, logoutSuccess: jest.fn() });
    renderNavbar();
    expect(screen.getByTestId("palette-state")).toHaveTextContent("closed");
    fireEvent.click(screen.getByLabelText("Recherche rapide"));
    expect(screen.getByTestId("palette-state")).toHaveTextContent("open");
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend && npm test -- Navbar.test.jsx`
Expected: FAIL — aucun élément avec le label "Recherche rapide".

- [ ] **Step 3: Ajouter le bouton dans `Navbar.jsx`**

Dans `frontend/src/components/Navbar.jsx`, ajouter l'import :

```js
import { KeyboardIcon, SunIcon, MoonIcon, SearchIcon } from "./icons";
```

Ajouter `openPalette` à la déstructuration du contexte (ligne existante) :

```js
const { openHelp, openPalette } = useKeyboardShortcutsHelp();
```

Dans le bloc `{isMobile && (...)}` (section "Profil (desktop) / hamburger (mobile)"), juste avant le bouton `ThemeToggleButton` :

```jsx
<button
  onClick={openPalette}
  aria-label="Recherche rapide"
  title="Recherche rapide"
  style={{
    background: "transparent",
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    color: theme.text,
    width: 38,
    height: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  }}
>
  <SearchIcon size={17} />
</button>
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd frontend && npm test -- Navbar.test.jsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Navbar.jsx frontend/src/__tests__/Navbar.test.jsx
git commit -m "feat(navbar): ajoute l'icône de recherche rapide au drawer mobile"
```

---

### Task 6: Variant `hero` de `Breadcrumb`

**Files:**
- Modify: `frontend/src/components/employees/Breadcrumb.jsx`
- Test: `frontend/src/__tests__/Breadcrumb.test.jsx` (nouveau fichier)

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `<Breadcrumb items={[...]} variant="hero" />` — texte blanc translucide adapté à un fond vert foncé (hero header), en plus du variant par défaut (fond clair) déjà utilisé par `Employees.jsx`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/__tests__/Breadcrumb.test.jsx` :

```jsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import Breadcrumb from "../components/employees/Breadcrumb";

const renderBc = (props) =>
  render(<Breadcrumb {...props} />, { wrapper: ThemeProvider });

describe("Breadcrumb — variant hero", () => {
  test("variant par défaut : dernier item non cliquable, les autres appellent onClick", () => {
    const onClick = jest.fn();
    renderBc({ items: [{ label: "Personnel", onClick }, { label: "Jean Dupont" }] });
    fireEvent.click(screen.getByText("Personnel"));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByText("Jean Dupont").closest("button")).toBeDisabled();
  });

  test("variant hero : rend un fond translucide blanc, comportement clic identique", () => {
    const onClick = jest.fn();
    renderBc({ items: [{ label: "Personnel", onClick }, { label: "Jean Dupont" }], variant: "hero" });
    const first = screen.getByText("Personnel").closest("button");
    expect(first).toHaveStyle({ color: "rgba(255,255,255,0.8)" });
    fireEvent.click(first);
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend && npm test -- Breadcrumb.test.jsx`
Expected: FAIL sur la 2ᵉ assertion — `variant="hero"` ignoré, couleur par défaut (`theme.primary`) rendue à la place.

- [ ] **Step 3: Ajouter le variant**

Remplacer `frontend/src/components/employees/Breadcrumb.jsx` par :

```jsx
import { useTheme } from "../../context/ThemeContext";
import { IconChevronRight } from "./icons";

const Breadcrumb = ({ items, variant = "default" }) => {
  const theme = useTheme();
  const isHero = variant === "hero";
  const colors = isHero
    ? {
        link: "rgba(255,255,255,0.8)",
        current: "rgba(255,255,255,0.95)",
        separator: "rgba(255,255,255,0.4)",
        hoverBg: "rgba(255,255,255,0.12)",
      }
    : {
        link: theme.primary,
        current: theme.text,
        separator: theme.textMuted,
        hoverBg: theme.primaryBg,
      };
  return (
  <nav
    style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}
  >
    {items.map((item, idx) => (
      <span key={idx} style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {idx > 0 && (
          <span
            style={{
              color: colors.separator,
              display: "flex",
              alignItems: "center",
            }}
          >
            <IconChevronRight size={11} />
          </span>
        )}
        <button
          onClick={item.onClick}
          disabled={!item.onClick || idx === items.length - 1}
          style={{
            background: isHero ? "rgba(255,255,255,0.12)" : "none",
            border: isHero ? "none" : "none",
            padding: isHero ? "5px 12px" : "3px 8px",
            borderRadius: isHero ? 6 : 6,
            color: idx === items.length - 1 ? colors.current : colors.link,
            fontWeight: idx === items.length - 1 ? 700 : 500,
            fontSize: isHero ? 12 : 13,
            cursor: idx === items.length - 1 ? "default" : "pointer",
            fontFamily: theme.fontFamily,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            if (idx < items.length - 1)
              e.currentTarget.style.background = colors.hoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isHero ? "rgba(255,255,255,0.12)" : "none";
          }}
        >
          {item.label}
        </button>
      </span>
    ))}
  </nav>
  );
};

export default Breadcrumb;
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd frontend && npm test -- Breadcrumb.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/employees/Breadcrumb.jsx frontend/src/__tests__/Breadcrumb.test.jsx
git commit -m "feat(breadcrumb): ajoute un variant hero (fond fonce) au composant generique"
```

---

### Task 7: Fil d'Ariane sur `EmployeeDetail.jsx`

**Files:**
- Modify: `frontend/src/pages/EmployeeDetail.jsx:1053-1055`
- Modify: `frontend/src/__tests__/EmployeeDetail.test.jsx:445-451`

**Interfaces:**
- Consumes: `Breadcrumb` (Task 6) depuis `../components/employees/Breadcrumb`.
- Produces: rien de nouveau côté interface — remplace uniquement l'affichage.

- [ ] **Step 1: Mettre à jour le test existant (il doit échouer avec l'ancien code, puis passer avec le nouveau)**

Dans `frontend/src/__tests__/EmployeeDetail.test.jsx`, remplacer (lignes 445-451) :

```jsx
describe("EmployeeDetail — navigation", () => {
  test("bouton ← Retour navigue en arrière", async () => {
    renderPage();
    await waitFor(() => screen.getByText("← Retour"));
    fireEvent.click(screen.getByText("← Retour"));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
```

par :

```jsx
describe("EmployeeDetail — navigation", () => {
  test("le fil d'Ariane navigue vers /employees au clic sur \"Personnel\"", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Personnel"));
    fireEvent.click(screen.getByText("Personnel"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees");
  });
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend && npm test -- EmployeeDetail.test.jsx -t "fil d'Ariane"`
Expected: FAIL — le texte "Personnel" n'existe pas encore dans la page.

- [ ] **Step 3: Remplacer le bouton "← Retour" par le fil d'Ariane**

Dans `frontend/src/pages/EmployeeDetail.jsx`, ajouter l'import :

```js
import Breadcrumb from "../components/employees/Breadcrumb";
```

Remplacer (lignes 1053-1055) :

```jsx
          <button onClick={() => navigate(-1)} title="Retour (Alt+←)" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", marginBottom: 16, fontFamily: "inherit" }}>
            ← Retour
          </button>
```

par :

```jsx
          <div style={{ marginBottom: 16 }}>
            <Breadcrumb
              variant="hero"
              items={[
                { label: "Personnel", onClick: () => navigate("/employees") },
                { label: `${employee.prenom} ${employee.nom}` },
              ]}
            />
          </div>
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd frontend && npm test -- EmployeeDetail.test.jsx`
Expected: PASS (toute la suite — vérifier qu'aucun autre test ne référençait "← Retour")

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/EmployeeDetail.jsx frontend/src/__tests__/EmployeeDetail.test.jsx
git commit -m "feat(employe): remplace le bouton Retour par un fil d'Ariane cliquable"
```

---

### Task 8: Fil d'Ariane sur `AttestationDetail.jsx`

**Files:**
- Modify: `frontend/src/pages/AttestationDetail.jsx:271-273`
- Test: `frontend/src/__tests__/AttestationDetail.test.jsx` (ajout, fichier existant — vérifier avec `ls frontend/src/__tests__/AttestationDetail.test.jsx` avant d'éditer ; s'il n'existe pas, créer un fichier minimal comme ci-dessous)

**Interfaces:**
- Consumes: `Breadcrumb` (Task 6).
- Produces: rien de nouveau côté interface.

- [ ] **Step 1: Écrire le test qui échoue**

Si `frontend/src/__tests__/AttestationDetail.test.jsx` existe déjà, ajouter le bloc `describe` ci-dessous à la fin du fichier (en réutilisant ses mocks/`renderPage` existants). S'il n'existe pas, créer le fichier avec au minimum :

```jsx
import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useParams: () => ({ ref: "00001-26" }),
  useNavigate: () => mockNavigate,
}));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import AttestationDetail from "../pages/AttestationDetail";

const render = (ui) => rtlRender(ui, { wrapper: ThemeProvider });

const mockDemande = {
  id: "dem-1",
  reference: "00001/26",
  employee_nom: "Jean Dupont",
  employee_matricule: "MAT-001",
  statut: "recue",
  demandeur: "user-1",
};

describe("AttestationDetail — fil d'Ariane", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: "user-1", role: "ADMIN" } });
    api.get.mockResolvedValue({ data: mockDemande });
  });

  test("le fil d'Ariane navigue vers /attestations au clic sur \"Attestations\"", async () => {
    render(<AttestationDetail />);
    await waitFor(() => screen.getByText("Attestations"));
    fireEvent.click(screen.getByText("Attestations"));
    expect(mockNavigate).toHaveBeenCalledWith("/attestations");
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend && npm test -- AttestationDetail.test.jsx -t "fil d'Ariane"`
Expected: FAIL — "Attestations" n'apparaît pas comme élément cliquable (seul un lien "← Retour aux demandes" existe).

- [ ] **Step 3: Remplacer le lien par le fil d'Ariane**

Dans `frontend/src/pages/AttestationDetail.jsx`, ajouter l'import :

```js
import Breadcrumb from "../components/employees/Breadcrumb";
```

Remplacer (lignes 271-273) :

```jsx
          <Link to="/attestations" style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
            ← Retour aux demandes
          </Link>
```

par :

```jsx
          <Breadcrumb
            variant="hero"
            items={[
              { label: "Attestations", onClick: () => navigate("/attestations") },
              { label: demande.reference },
            ]}
          />
```

Si `Link` n'est plus utilisé ailleurs dans le fichier après ce changement, retirer `Link` de l'import `react-router-dom` (sinon laisser tel quel).

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd frontend && npm test -- AttestationDetail.test.jsx`
Expected: PASS (toute la suite)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AttestationDetail.jsx frontend/src/__tests__/AttestationDetail.test.jsx
git commit -m "feat(attestations): remplace le lien Retour par un fil d'Ariane cliquable"
```

---

### Task 9: Fil d'Ariane sur `ContratDetail.jsx` (consolidation)

**Files:**
- Modify: `frontend/src/pages/ContratDetail.jsx:534-545`
- Modify: `frontend/src/__tests__/ContratDetail.test.jsx:154-155`

**Interfaces:**
- Consumes: `Breadcrumb` (Task 6).
- Produces: rien de nouveau côté interface — remplace le breadcrumb codé en dur par le composant générique, supprime la duplication de style.

- [ ] **Step 1: Mettre à jour le test existant**

Dans `frontend/src/__tests__/ContratDetail.test.jsx`, remplacer (lignes 154-155) :

```jsx
    await waitFor(() => screen.getByText("← Employés"));
    fireEvent.click(screen.getByText("← Employés"));
```

par :

```jsx
    await waitFor(() => screen.getByText("Employés"));
    fireEvent.click(screen.getByText("Employés"));
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend && npm test -- ContratDetail.test.jsx`
Expected: FAIL — le texte exact affiché est encore "← Employés" (avec la flèche), pas "Employés" seul.

- [ ] **Step 3: Remplacer le breadcrumb codé en dur**

Dans `frontend/src/pages/ContratDetail.jsx`, ajouter l'import :

```js
import Breadcrumb from "../components/employees/Breadcrumb";
```

Remplacer (lignes 534-545) :

```jsx
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
            <button onClick={() => navigate("/employees")} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "rgba(255,255,255,0.8)", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
              ← Employés
            </button>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>›</span>
            <button onClick={() => navigate(`/employees/${employeeSlug(contrat)}`)} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "rgba(255,255,255,0.8)", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
              {contrat.employee_matricule} — {contrat.employee_nom}
            </button>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>›</span>
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>{contrat.numero_contrat}</span>
          </div>
```

par :

```jsx
          {/* Breadcrumb */}
          <div style={{ marginBottom: 24 }}>
            <Breadcrumb
              variant="hero"
              items={[
                { label: "Employés", onClick: () => navigate("/employees") },
                { label: `${contrat.employee_matricule} — ${contrat.employee_nom}`, onClick: () => navigate(`/employees/${employeeSlug(contrat)}`) },
                { label: contrat.numero_contrat },
              ]}
            />
          </div>
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd frontend && npm test -- ContratDetail.test.jsx`
Expected: PASS (toute la suite)

- [ ] **Step 5: Lancer toute la suite frontend avant de commit**

Run: `cd frontend && npm test`
Expected: PASS (toutes les suites — vérifie qu'aucun autre test ne dépendait des textes remplacés dans ce plan)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ContratDetail.jsx frontend/src/__tests__/ContratDetail.test.jsx
git commit -m "refactor(contrat): remplace le breadcrumb code en dur par le composant Breadcrumb generique"
```

---

## Self-Review (fait par l'auteur du plan)

**1. Couverture de la spec** :
- Palette Ctrl+K → Tasks 1-5.
- Recherche employés/contrats (via même canal) → Task 3 (section "Employés", limite du n° de contrat documentée dans le composant et dans la spec).
- Recherche attestations → Task 3.
- Pages/actions + 2 actions rapides → Task 2, Task 3.
- Icône mobile → Task 5.
- Breadcrumbs enrichis (EmployeeDetail, AttestationDetail) + consolidation (ContratDetail) → Tasks 6-9.
- Hors scope explicitement respecté : aucune Task ne touche à une sidebar, un FAB, un historique de pages, ou un endpoint backend.

**2. Placeholders** : aucun — toutes les étapes contiennent du code exécutable complet.

**3. Cohérence des types/signatures** : `getPageActions(user)` (Task 2) retourne `{id,label,path}[]`, consommé tel quel par `CommandPalette.jsx` (Task 3). `useKeyboardShortcutsHelp()` expose `paletteOpen/openPalette/closePalette/togglePalette` (Task 1), consommés à l'identique dans `GlobalShortcuts.jsx` (Task 4) et `Navbar.jsx` (Task 5). `Breadcrumb` accepte `variant` (Task 6), utilisé avec `variant="hero"` dans les 3 pages de détail (Tasks 7-9) — signature identique partout.

**Risque connu à surveiller pendant l'exécution** : `EmployeeDetail.test.jsx` et `AttestationDetail.test.jsx` peuvent contenir d'autres assertions non repérées ici qui référencent indirectement les anciens textes ("← Retour") — la Task 7/8 demande explicitement de lancer *toute* la suite du fichier concerné (pas seulement le test ciblé) avant de commit, et Task 9 lance toute la suite frontend en dernier lieu pour rattraper tout effet de bord manqué.
