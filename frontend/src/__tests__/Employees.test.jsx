/**
 * Tests — pages/Employees.jsx
 * Couvre : rendu liste, recherche, filtre statut, sélection, bulk actions, pagination
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

jest.mock("../../frontend/src/services/api", () => ({
  default: { get: jest.fn(), post: jest.fn() },
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
import Employees from "../../frontend/src/pages/Employees";

const makeEmployee = (id, nom = "Dupont", matricule = "EMP-001", statut = "actif") => ({
  id,
  nom,
  prenom: "Jean",
  matricule,
  statut,
  direction_nom: "DG",
  departement_nom: "RH",
  service_nom: "Paie",
  poste_nom: "Ingénieur",
  type_contrat_nom: "CDI",
  dossier_complet: true,
  taux_completude: 100,
});

const mockResponse = (employees, count = employees.length) => ({
  data: { results: employees, count, next: null, previous: null },
});

const renderPage = (role = "ADMIN") => {
  useAuth.mockReturnValue({ user: { role, username: "admin" } });
  return render(
    <MemoryRouter>
      <Employees />
    </MemoryRouter>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe("Employees — rendu initial", () => {
  test("affiche la navbar", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage();
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
  });

  test("affiche le champ de recherche", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage();
    expect(
      screen.getByPlaceholderText(/rechercher par nom/i)
    ).toBeInTheDocument();
  });

  test("affiche le filtre de statut", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage();
    expect(screen.getByDisplayValue("Tous les statuts")).toBeInTheDocument();
  });

  test("affiche les boutons ADMIN (Import CSV, Nouvel employé)", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage("ADMIN");
    await waitFor(() => {
      expect(screen.getByText("+ Nouvel employé")).toBeInTheDocument();
    });
  });

  test("n'affiche pas les boutons d'action pour CONSULTANT", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage("CONSULTANT");
    await waitFor(() => {
      expect(screen.queryByText("+ Nouvel employé")).not.toBeInTheDocument();
    });
  });
});

describe("Employees — chargement de la liste", () => {
  test("affiche les employés après chargement", async () => {
    api.get.mockResolvedValue(mockResponse([makeEmployee("1")]));
    renderPage();
    jest.runAllTimers();
    await waitFor(() => {
      expect(screen.getByText("EMP-001")).toBeInTheDocument();
    });
  });

  test("affiche le message vide si aucun employé", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage();
    jest.runAllTimers();
    await waitFor(() => {
      expect(screen.getByText("Aucun employé trouvé.")).toBeInTheDocument();
    });
  });

  test("appelle l'API avec les bons params par défaut", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage();
    jest.runAllTimers();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/employees/",
        expect.objectContaining({ params: expect.objectContaining({ page: 1 }) })
      );
    });
  });

  test("affiche le compteur total", async () => {
    api.get.mockResolvedValue(mockResponse([makeEmployee("1")], 42));
    renderPage();
    jest.runAllTimers();
    await waitFor(() => {
      expect(screen.getByText(/42 employé/)).toBeInTheDocument();
    });
  });
});

describe("Employees — navigation", () => {
  test("clic sur Voir → navigue vers le détail", async () => {
    api.get.mockResolvedValue(mockResponse([makeEmployee("emp-uuid-1")]));
    renderPage();
    jest.runAllTimers();
    await waitFor(() => screen.getByText("Voir →"));
    fireEvent.click(screen.getByText("Voir →"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees/emp-uuid-1");
  });

  test("clic sur + Nouvel employé navigue vers /employees/nouveau", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage("ADMIN");
    jest.runAllTimers();
    await waitFor(() => screen.getByText("+ Nouvel employé"));
    fireEvent.click(screen.getByText("+ Nouvel employé"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees/nouveau");
  });
});

describe("Employees — sélection ADMIN", () => {
  test("affiche les checkboxes pour ADMIN", async () => {
    api.get.mockResolvedValue(mockResponse([makeEmployee("1")]));
    renderPage("ADMIN");
    jest.runAllTimers();
    await waitFor(() => {
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });

  test("n'affiche pas les checkboxes pour CONSULTANT", async () => {
    api.get.mockResolvedValue(mockResponse([makeEmployee("1")]));
    renderPage("CONSULTANT");
    jest.runAllTimers();
    await waitFor(() => screen.getByText("EMP-001"));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  test("sélectionner un employé affiche la barre d'actions", async () => {
    api.get.mockResolvedValue(mockResponse([makeEmployee("1")]));
    renderPage("ADMIN");
    jest.runAllTimers();
    await waitFor(() => screen.getAllByRole("checkbox"));
    const checkboxes = screen.getAllByRole("checkbox");
    // Le premier est "select all", le second est la ligne
    fireEvent.click(checkboxes[1]);
    await waitFor(() => {
      expect(screen.getByText(/1 employé\(s\) sélectionné/)).toBeInTheDocument();
    });
  });
});

describe("Employees — bulk actions", () => {
  test("archiver appelle l'API bulk-delete avec action=archive", async () => {
    window.confirm = jest.fn(() => true);
    api.get.mockResolvedValue(mockResponse([makeEmployee("emp-1")]));
    api.post.mockResolvedValue({ data: { nb_archives: 1 } });
    renderPage("ADMIN");
    jest.runAllTimers();
    await waitFor(() => screen.getAllByRole("checkbox"));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    await waitFor(() => screen.getByText(/Archiver \(1\)/));
    fireEvent.click(screen.getByText(/Archiver \(1\)/));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/employees/bulk-delete/",
        expect.objectContaining({ action: "archive" })
      );
    });
  });

  test("annuler la confirmation n'appelle pas l'API", async () => {
    window.confirm = jest.fn(() => false);
    api.get.mockResolvedValue(mockResponse([makeEmployee("emp-1")]));
    renderPage("ADMIN");
    jest.runAllTimers();
    await waitFor(() => screen.getAllByRole("checkbox"));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    await waitFor(() => screen.getByText(/Archiver \(1\)/));
    fireEvent.click(screen.getByText(/Archiver \(1\)/));
    expect(api.post).not.toHaveBeenCalled();
  });
});
