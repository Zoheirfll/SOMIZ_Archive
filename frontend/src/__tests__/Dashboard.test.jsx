/**
 * Tests — pages/Dashboard.jsx
 * Couvre : rendu, redirection CONSULTANT, stats, état vide, erreur API
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../../frontend/src/services/api", () => ({
  default: { get: jest.fn() },
}));
jest.mock("../../frontend/src/components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../../frontend/src/context/AuthContext", () => ({
  useAuth: jest.fn(),
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../../frontend/src/services/api";
import { useAuth } from "../../frontend/src/context/AuthContext";
import Dashboard from "../../frontend/src/pages/Dashboard";

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
  test("affiche Chargement... pendant le fetch", () => {
    api.get.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage("ADMIN");
    expect(screen.getByText("Chargement...")).toBeInTheDocument();
  });

  test("affiche les stats après chargement", async () => {
    api.get.mockResolvedValue({ data: mockStats });
    renderPage("ADMIN");
    await waitFor(() => {
      expect(screen.getByText("Dashboard Admin")).toBeInTheDocument();
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
