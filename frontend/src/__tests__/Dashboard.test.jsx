/**
 * Tests — pages/Dashboard.jsx
 * Couvre : rendu, redirection CONSULTANT, stats, état vide, erreur API
 */

import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn() },
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
import Dashboard from "../pages/Dashboard";

const render = (ui, options) => rtlRender(ui, { wrapper: ThemeProvider, ...options });

const mockStats = {
  employes_actifs: 50,
  dossiers_complets: 40,
  taux_completude_global: 80,
  total_documents: 200,
  completude_par_type: {
    CIN: { label: "Carte Nationale", nb_employes: 45, pourcentage: 90, required: true },
  },
  activite_7_jours: [
    { action: "VIEW", count: 15 },
    { action: "UPLOAD", count: 8 },
  ],
};

const renderPage = (role = "ADMIN") => {
  useAuth.mockReturnValue({ user: { role, username: "admin" } });
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
};

beforeEach(() => jest.clearAllMocks());

describe("Dashboard — accès CONSULTANT", () => {
  test("redirige un CONSULTANT vers /employees", async () => {
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" } });
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );
    expect(mockNavigate).toHaveBeenCalledWith("/employees");
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe("Dashboard — chargement", () => {
  test("affiche un skeleton pendant le fetch", () => {
    api.get.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage("ADMIN");
    expect(screen.queryByText("Chargement...")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  test("affiche les stats après chargement", async () => {
    api.get.mockResolvedValue({ data: mockStats });
    renderPage("ADMIN");
    await waitFor(() => {
      expect(screen.getByText("Tableau de bord")).toBeInTheDocument();
    });
    expect(screen.getByText("50")).toBeInTheDocument(); // employes_actifs
    expect(screen.getByText("40")).toBeInTheDocument(); // dossiers_complets
    expect(screen.getByText("80%")).toBeInTheDocument(); // taux_completude_global
    expect(screen.getByText("200")).toBeInTheDocument(); // total_documents
  });

  test("affiche le message d'erreur si l'API échoue", async () => {
    api.get.mockRejectedValue(new Error("Network error"));
    renderPage("ADMIN");
    await waitFor(() => {
      expect(
        screen.getByText("Impossible de charger les statistiques.")
      ).toBeInTheDocument();
    });
  });
});

describe("Dashboard — contenu stats", () => {
  test("affiche les types de document dans la section complétude", async () => {
    api.get.mockResolvedValue({ data: mockStats });
    renderPage("ADMIN");
    await waitFor(() => screen.getByText("Carte Nationale"));
    expect(screen.getByText("Carte Nationale")).toBeInTheDocument();
  });

  test("affiche l'activité des 7 derniers jours", async () => {
    api.get.mockResolvedValue({ data: mockStats });
    renderPage("ADMIN");
    await waitFor(() => screen.getByText("VIEW"));
    expect(screen.getByText("VIEW")).toBeInTheDocument();
    expect(screen.getByText("UPLOAD")).toBeInTheDocument();
  });

  test("affiche le message vide si aucune activité récente", async () => {
    api.get.mockResolvedValue({
      data: { ...mockStats, activite_7_jours: [] },
    });
    renderPage("ADMIN");
    await waitFor(() =>
      screen.getByText("Aucune activité récente.")
    );
    expect(screen.getByText("Aucune activité récente.")).toBeInTheDocument();
  });

  test("affiche le message vide si aucun employé", async () => {
    api.get.mockResolvedValue({
      data: { ...mockStats, employes_actifs: 0 },
    });
    renderPage("ADMIN");
    await waitFor(() =>
      screen.getByText("Aucun employé dans la base")
    );
    expect(screen.getByText("Aucun employé dans la base")).toBeInTheDocument();
  });

  test("affiche N/A pour le taux si aucun employé", async () => {
    api.get.mockResolvedValue({
      data: { ...mockStats, employes_actifs: 0 },
    });
    renderPage("ADMIN");
    await waitFor(() => screen.getByText("N/A"));
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });
});

describe("Dashboard — labels StatCard", () => {
  test("affiche les 4 labels de cartes", async () => {
    api.get.mockResolvedValue({ data: mockStats });
    renderPage("ADMIN");
    await waitFor(() => screen.getByText("Employés actifs"));
    expect(screen.getByText("Employés actifs")).toBeInTheDocument();
    expect(screen.getByText("Dossiers complets")).toBeInTheDocument();
    expect(screen.getByText("Taux de complétude")).toBeInTheDocument();
    expect(screen.getByText("Total documents")).toBeInTheDocument();
  });
});

describe("Dashboard — navigation vers /employees (complétude cliquable)", () => {
  test("clic sur un type de document navigue vers /employees?type_manquant=<code>", async () => {
    api.get.mockResolvedValue({ data: mockStats });
    renderPage("ADMIN");
    fireEvent.click(await screen.findByText("Carte Nationale"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees?type_manquant=CIN");
  });

  test("clic sur la carte Dossiers complets navigue vers /employees?dossier_complet=true", async () => {
    api.get.mockResolvedValue({ data: mockStats });
    renderPage("ADMIN");
    fireEvent.click(await screen.findByText("Dossiers complets"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees?dossier_complet=true");
  });

  test("clic sur le lien 'incomplets' navigue vers /employees?dossier_complet=false (sans déclencher le clic de la carte)", async () => {
    api.get.mockResolvedValue({ data: mockStats });
    renderPage("ADMIN");
    fireEvent.click(await screen.findByText(/incomplets/));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/employees?dossier_complet=false");
  });

  test("le lien 'incomplets' n'est pas affiché s'il n'y a aucun employé actif", async () => {
    api.get.mockResolvedValue({ data: { ...mockStats, employes_actifs: 0 } });
    renderPage("ADMIN");
    await waitFor(() => screen.getByText("Aucun employé dans la base"));
    expect(screen.queryByText(/incomplets/)).not.toBeInTheDocument();
  });
});
