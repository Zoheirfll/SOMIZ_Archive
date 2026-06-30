/**
 * Tests — pages/Employees.jsx
 * Couvre : navigation drill-down (Directions→Depts→Services→Employés),
 *          liste employés, recherche, filtre statut, sélection ADMIN, bulk actions
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn() },
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
import Employees from "../pages/Employees";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockDirection = { id: "dir-1", nom: "Direction Générale", code: "DG", nb_departements: 2 };
const mockDept     = { id: "dept-1", nom: "Ressources Humaines", code: "RH", nb_services: 1 };
const mockService  = { id: "svc-1", nom: "Paie", code: "PAI", nb_employes: 5 };

const makeEmployee = (id, nom = "Dupont", matricule = "EMP-001", statut = "actif") => ({
  id, nom, prenom: "Jean", matricule, statut,
  direction_nom: "DG", departement_nom: "RH", service_nom: "Paie",
  poste_nom: "Ingénieur", type_contrat_nom: "CDI",
  dossier_complet: true, taux_completude: 100,
});

const mockEmployeesResponse = (employees, count = employees.length) => ({
  data: { results: employees, count, next: null, previous: null },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const renderPage = (role = "ADMIN") => {
  useAuth.mockReturnValue({ user: { role, username: "admin" } });
  return render(<MemoryRouter><Employees /></MemoryRouter>);
};

/**
 * Monte la page et configure les mocks pour le drill-down complet.
 * Retourne la config mock pour permettre aux tests de surcharger.
 */
const setupDrillDown = (employees = [makeEmployee("emp-1")]) => {
  api.get.mockImplementation((url) => {
    if (url.includes("/ref/directions/"))  return Promise.resolve({ data: [mockDirection] });
    if (url.includes("/ref/departements/")) return Promise.resolve({ data: [mockDept] });
    if (url.includes("/ref/services/"))    return Promise.resolve({ data: [mockService] });
    if (url.includes("/employees/"))       return Promise.resolve(mockEmployeesResponse(employees));
    return Promise.resolve({ data: [] });
  });
};

/**
 * Navigue jusqu'à la vue liste employees via "Voir tous les employés sans filtre".
 * À utiliser dans tous les tests qui ont besoin de la table employés.
 */
const goToEmployeesList = async (role = "ADMIN", employees = [makeEmployee("emp-1")]) => {
  api.get.mockImplementation((url) => {
    if (url.includes("/ref/directions/")) return Promise.resolve({ data: [] });
    if (url.includes("/employees/"))      return Promise.resolve(mockEmployeesResponse(employees));
    return Promise.resolve({ data: [] });
  });
  renderPage(role);
  fireEvent.click(await screen.findByText("Voir tous les employés sans filtre"));
  jest.runAllTimers();
};

/**
 * goToEmployeesList + attente que la table soit visible.
 */
const goToEmployeesListAndWait = async (role = "ADMIN", employees = [makeEmployee("emp-1")]) => {
  await goToEmployeesList(role, employees);
  await screen.findByText(employees[0]?.matricule ?? "Aucun employé trouvé");
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

// ─── Tests : Vue Directions (état initial) ───────────────────────────────────

describe("Employees — vue initiale (directions)", () => {
  test("affiche la navbar", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPage();
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
  });

  test("appelle /ref/directions/ au montage", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/ref/directions/"));
  });

  test("affiche le titre Directions", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPage();
    expect(await screen.findByText("Directions")).toBeInTheDocument();
  });

  test("affiche les cartes de directions chargées", async () => {
    api.get.mockResolvedValue({ data: [mockDirection] });
    renderPage();
    expect(await screen.findByText("Direction Générale")).toBeInTheDocument();
  });

  test("affiche le bouton Voir tous les employés sans filtre", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPage();
    expect(await screen.findByText("Voir tous les employés sans filtre")).toBeInTheDocument();
  });

  test("affiche le bouton Nouvel employé pour ADMIN", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPage("ADMIN");
    expect(await screen.findByRole("button", { name: /nouvel employé/i })).toBeInTheDocument();
  });

  test("masque le bouton Nouvel employé pour CONSULTANT", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPage("CONSULTANT");
    await screen.findByText("Directions");
    expect(screen.queryByRole("button", { name: /nouvel employé/i })).not.toBeInTheDocument();
  });
});

// ─── Tests : Navigation drill-down ──────────────────────────────────────────

describe("Employees — drill-down navigation", () => {
  test("clic direction → charge et affiche les départements", async () => {
    setupDrillDown();
    renderPage();
    fireEvent.click(await screen.findByText("Direction Générale"));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/ref/departements/",
        expect.objectContaining({ params: expect.objectContaining({ direction: "dir-1" }) })
      );
    });
    expect(await screen.findByText("Ressources Humaines")).toBeInTheDocument();
  });

  test("clic département → charge et affiche les services", async () => {
    setupDrillDown();
    renderPage();
    fireEvent.click(await screen.findByText("Direction Générale"));
    fireEvent.click(await screen.findByText("Ressources Humaines"));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/ref/services/",
        expect.objectContaining({ params: expect.objectContaining({ departement: "dept-1" }) })
      );
    });
    expect(await screen.findByText("Paie")).toBeInTheDocument();
  });

  test("clic service → appelle /employees/ filtré par service", async () => {
    setupDrillDown();
    renderPage();
    fireEvent.click(await screen.findByText("Direction Générale"));
    fireEvent.click(await screen.findByText("Ressources Humaines"));
    fireEvent.click(await screen.findByText("Paie"));
    jest.runAllTimers();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/employees/",
        expect.objectContaining({ params: expect.objectContaining({ service: "svc-1" }) })
      );
    });
  });

  test("Voir tous les employés sans filtre appelle /employees/ sans filtre service", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/ref/directions/")) return Promise.resolve({ data: [] });
      if (url.includes("/employees/"))      return Promise.resolve(mockEmployeesResponse([]));
      return Promise.resolve({ data: [] });
    });
    renderPage();
    fireEvent.click(await screen.findByText("Voir tous les employés sans filtre"));
    jest.runAllTimers();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/employees/",
        expect.objectContaining({ params: expect.not.objectContaining({ service: expect.anything() }) })
      );
    });
  });
});

// ─── Tests : Table des employés ──────────────────────────────────────────────

describe("Employees — liste des employés", () => {
  test("affiche le champ de recherche", async () => {
    await goToEmployeesList();
    expect(await screen.findByPlaceholderText(/Rechercher par nom/i)).toBeInTheDocument();
  });

  test("affiche le filtre de statut", async () => {
    await goToEmployeesList();
    expect(await screen.findByDisplayValue("Tous les statuts")).toBeInTheDocument();
  });

  test("affiche les employés après chargement", async () => {
    await goToEmployeesListAndWait();
    expect(screen.getByText("EMP-001")).toBeInTheDocument();
  });

  test("affiche le message vide si aucun employé", async () => {
    await goToEmployeesList("ADMIN", []);
    expect(await screen.findByText("Aucun employé trouvé")).toBeInTheDocument();
  });

  test("clic Voir → navigue vers la fiche détail", async () => {
    await goToEmployeesListAndWait();
    fireEvent.click(screen.getByText("Voir →"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees/emp-1");
  });

  test("clic Nouvel employé navigue vers /employees/nouveau (ADMIN)", async () => {
    await goToEmployeesListAndWait("ADMIN");
    fireEvent.click(screen.getByRole("button", { name: /nouvel employé/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/employees/nouveau");
  });
});

// ─── Tests : Sélection ADMIN ─────────────────────────────────────────────────

describe("Employees — sélection (ADMIN)", () => {
  test("affiche les checkboxes pour ADMIN", async () => {
    await goToEmployeesListAndWait("ADMIN");
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  test("masque les checkboxes pour CONSULTANT", async () => {
    await goToEmployeesListAndWait("CONSULTANT");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  test("cocher un employé affiche la barre d'actions bulk", async () => {
    await goToEmployeesListAndWait("ADMIN");
    const [, firstRow] = screen.getAllByRole("checkbox");
    fireEvent.click(firstRow.closest("td") || firstRow);
    expect(await screen.findByText(/employé\(s\) sélectionné/)).toBeInTheDocument();
  });
});

// ─── Tests : Bulk actions ─────────────────────────────────────────────────────

describe("Employees — bulk actions", () => {
  const selectFirstEmployee = async () => {
    await goToEmployeesListAndWait("ADMIN");
    const [, firstRow] = screen.getAllByRole("checkbox");
    fireEvent.click(firstRow.closest("td") || firstRow);
    await screen.findByText(/Archiver/);
  };

  test("archiver appelle /employees/bulk-delete/ avec action=archive", async () => {
    window.confirm = jest.fn(() => true);
    api.post.mockResolvedValue({ data: { nb_archives: 1 } });
    await selectFirstEmployee();
    fireEvent.click(screen.getByText(/Archiver \(\d+\)/));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/employees/bulk-delete/",
        expect.objectContaining({ action: "archive" })
      );
    });
  });

  test("annuler la confirmation n'appelle pas l'API", async () => {
    window.confirm = jest.fn(() => false);
    await selectFirstEmployee();
    fireEvent.click(screen.getByText(/Archiver \(\d+\)/));
    expect(api.post).not.toHaveBeenCalled();
  });

  test("Désélectionner vide la sélection", async () => {
    await selectFirstEmployee();
    fireEvent.click(screen.getByText("Désélectionner"));
    await waitFor(() => {
      expect(screen.queryByText(/employé\(s\) sélectionné/)).not.toBeInTheDocument();
    });
  });
});
