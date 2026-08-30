/**
 * Tests — Sécurité frontend
 * Vérifie que les pages ADMIN-only sont inaccessibles ou limitées pour les CONSULTANT,
 * et que les routes protégées redirigent les utilisateurs non-authentifiés.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";
import Dashboard from "../pages/Dashboard";
import Users from "../pages/Users";
import Import from "../pages/Import";
import AuditLogs from "../pages/AuditLogs";
import Parametres from "../pages/Parametres";
import EmployeeForm from "../pages/EmployeeForm";

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: { results: [] } });
});

// ─── Helper ──────────────────────────────────────────────────────────────────

const renderWithAuth = (Component, { role, authenticated = true, authChecked = true, adminOnly = false } = {}) => {
  useAuth.mockReturnValue({ user: { role, username: "test" }, authenticated, authChecked });
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute adminOnly={adminOnly}>
              <Component />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Page Login</div>} />
        <Route path="/employees" element={<div>Page Employees</div>} />
      </Routes>
    </MemoryRouter>
  );
};

// ─── ProtectedRoute — utilisateurs non authentifiés ─────────────────────────

describe("Sécurité — ProtectedRoute", () => {
  test("redirige vers /login si non-authentifié", () => {
    renderWithAuth(Dashboard, { authenticated: false, authChecked: true });
    expect(screen.getByText("Page Login")).toBeInTheDocument();
    expect(screen.queryByTestId("navbar")).not.toBeInTheDocument();
  });

  test("n'affiche rien tant que authChecked est false", () => {
    renderWithAuth(Dashboard, { authenticated: false, authChecked: false });
    expect(screen.queryByText("Page Login")).not.toBeInTheDocument();
    expect(screen.queryByTestId("navbar")).not.toBeInTheDocument();
  });

  test("affiche le contenu si authentifié", () => {
    useAuth.mockReturnValue({
      user: { role: "ADMIN", username: "admin" },
      authenticated: true,
      authChecked: true,
    });
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Contenu protégé</div>
        </ProtectedRoute>
      </MemoryRouter>
    );
    expect(screen.getByText("Contenu protégé")).toBeInTheDocument();
  });

  test("adminOnly redirige un CONSULTANT vers /employees (au niveau route)", () => {
    renderWithAuth(() => <div>Contenu admin</div>, { role: "CONSULTANT", adminOnly: true });
    expect(screen.getByText("Page Employees")).toBeInTheDocument();
    expect(screen.queryByText("Contenu admin")).not.toBeInTheDocument();
  });

  test("adminOnly laisse passer un ADMIN", () => {
    renderWithAuth(() => <div>Contenu admin</div>, { role: "ADMIN", adminOnly: true });
    expect(screen.getByText("Contenu admin")).toBeInTheDocument();
  });
});

// ─── Dashboard — redirection CONSULTANT ──────────────────────────────────────

describe("Sécurité — Dashboard", () => {
  test("redirige un CONSULTANT vers /employees", async () => {
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" }, authenticated: true, authChecked: true });
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );
    expect(mockNavigate).toHaveBeenCalledWith("/employees");
    expect(api.get).not.toHaveBeenCalled();
  });

  test("un ADMIN voit le dashboard", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", username: "admin" }, authenticated: true, authChecked: true });
    api.get.mockResolvedValue({
      data: {
        employes_actifs: 10,
        dossiers_complets: 8,
        taux_completude_global: 80,
        total_documents: 40,
        completude_par_type: {},
        activite_7_jours: [],
      },
    });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText("Tableau de bord")).toBeInTheDocument();
  });
});

// ─── Users — actions ADMIN masquées pour CONSULTANT ─────────────────────────

describe("Sécurité — Users", () => {
  test("CONSULTANT peut voir la liste des utilisateurs", async () => {
    api.get.mockResolvedValue({
      data: { results: [{ id: "1", username: "admin", nom: "A", prenom: "B", role: "ADMIN", is_active: true, last_login: null }] },
    });
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" }, authenticated: true, authChecked: true });
    render(<MemoryRouter><Users /></MemoryRouter>);
    expect(await screen.findByText("admin")).toBeInTheDocument();
  });

  test("CONSULTANT ne voit pas le bouton Nouvel utilisateur", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" }, authenticated: true, authChecked: true });
    render(<MemoryRouter><Users /></MemoryRouter>);
    await waitFor(() => screen.getByText("Gestion des utilisateurs"));
    expect(screen.queryByRole("button", { name: /nouvel utilisateur/i })).not.toBeInTheDocument();
  });

  test("CONSULTANT ne voit pas les boutons Reset MDP", async () => {
    api.get.mockResolvedValue({
      data: { results: [{ id: "1", username: "user1", nom: "A", prenom: "B", role: "CONSULTANT", is_active: true, last_login: null }] },
    });
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" }, authenticated: true, authChecked: true });
    render(<MemoryRouter><Users /></MemoryRouter>);
    await waitFor(() => screen.getByText("user1"));
    expect(screen.queryByRole("button", { name: /reset mdp/i })).not.toBeInTheDocument();
  });

  test("CONSULTANT ne voit pas les boutons Désactiver", async () => {
    api.get.mockResolvedValue({
      data: { results: [{ id: "1", username: "user1", nom: "A", prenom: "B", role: "CONSULTANT", is_active: true, last_login: null }] },
    });
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" }, authenticated: true, authChecked: true });
    render(<MemoryRouter><Users /></MemoryRouter>);
    await waitFor(() => screen.getByText("user1"));
    expect(screen.queryByText("Désactiver")).not.toBeInTheDocument();
  });
});

// ─── Import — inaccessible pour CONSULTANT ──────────────────────────────────

describe("Sécurité — Import", () => {
  test("CONSULTANT ne voit pas le bouton Lancer l'import", async () => {
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" }, authenticated: true, authChecked: true });
    render(<MemoryRouter><Import /></MemoryRouter>);
    await waitFor(() => screen.getByText(/Import employés/i));
    expect(screen.queryByRole("button", { name: /lancer l'import|importer/i })).not.toBeInTheDocument();
  });
});

// ─── AuditLogs — accessible uniquement aux ADMIN ────────────────────────────

describe("Sécurité — AuditLogs", () => {
  test("ADMIN peut accéder au journal d'audit", async () => {
    api.get.mockResolvedValue({ data: { results: [], total: 0, total_pages: 1 } });
    useAuth.mockReturnValue({ user: { role: "ADMIN" }, authenticated: true, authChecked: true });
    render(<MemoryRouter><AuditLogs /></MemoryRouter>);
    expect(await screen.findByText("Journal d'audit")).toBeInTheDocument();
  });

  test("les tokens ne sont jamais stockés dans localStorage ou sessionStorage", () => {
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(sessionStorage.getItem("access_token")).toBeNull();
    expect(sessionStorage.getItem("refresh_token")).toBeNull();
  });
});

// ─── Parametres — actions ADMIN masquées pour CONSULTANT ────────────────────

describe("Sécurité — Parametres", () => {
  test("CONSULTANT ne voit pas le bouton + Ajouter", async () => {
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" }, authenticated: true, authChecked: true });
    render(<MemoryRouter><Parametres /></MemoryRouter>);
    await waitFor(() => screen.getByText(/Paramètres/i));
    expect(screen.queryByText(/\+ Ajouter/i)).not.toBeInTheDocument();
  });

  test("CONSULTANT ne voit pas les boutons Template / Import CSV", async () => {
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" }, authenticated: true, authChecked: true });
    render(<MemoryRouter><Parametres /></MemoryRouter>);
    await waitFor(() => screen.getByText(/Paramètres/i));
    expect(screen.queryByText(/Template/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Import CSV/i)).not.toBeInTheDocument();
  });

  test("CONSULTANT ne voit pas les boutons d'édition/suppression", async () => {
    api.get.mockResolvedValue({ data: { results: [{ id: "dir-1", nom: "Direction Générale", code: "DG", is_active: true }] } });
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" }, authenticated: true, authChecked: true });
    render(<MemoryRouter><Parametres /></MemoryRouter>);
    await waitFor(() => screen.getByText("Direction Générale"));
    expect(screen.queryByTitle("Modifier")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Supprimer")).not.toBeInTheDocument();
  });

  test("ADMIN voit tous les boutons d'action", async () => {
    api.get.mockResolvedValue({ data: { results: [{ id: "dir-1", nom: "Direction Générale", code: "DG", is_active: true }] } });
    useAuth.mockReturnValue({ user: { role: "ADMIN" }, authenticated: true, authChecked: true });
    render(<MemoryRouter><Parametres /></MemoryRouter>);
    await waitFor(() => screen.getByText("Direction Générale"));
    expect(screen.getByText(/\+ Ajouter/i)).toBeInTheDocument();
    expect(screen.getAllByTitle("Modifier").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Supprimer").length).toBeGreaterThan(0);
  });
});

// ─── EmployeeForm — inaccessible pour CONSULTANT ────────────────────────────

describe("Sécurité — EmployeeForm", () => {
  test("CONSULTANT est redirigé vers /employees", async () => {
    api.get.mockResolvedValue({ data: [] });
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" }, authenticated: true, authChecked: true });
    render(
      <MemoryRouter initialEntries={["/employees/nouveau"]}>
        <Routes>
          <Route path="/employees/nouveau" element={<EmployeeForm />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/employees");
    });
  });

  test("ADMIN n'est pas redirigé", async () => {
    api.get.mockResolvedValue({ data: [] });
    useAuth.mockReturnValue({ user: { role: "ADMIN" }, authenticated: true, authChecked: true });
    render(
      <MemoryRouter initialEntries={["/employees/nouveau"]}>
        <Routes>
          <Route path="/employees/nouveau" element={<EmployeeForm />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => screen.getByText(/Nouvel employé/));
    expect(mockNavigate).not.toHaveBeenCalledWith("/employees");
  });
});
