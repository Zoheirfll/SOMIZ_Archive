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

const mockDirection = { id: "dir-1", nom: "Direction Générale", code: "DG", nb_departements: 2 };
const mockDept = { id: "dept-1", nom: "Ressources Humaines", code: "RH", nb_services: 1 };
const mockService = { id: "svc-1", nom: "Paie", code: "PAI", nb_employes: 5 };

const makeEmployee = (id, nom = "Dupont", matricule = "EMP-001", statut = "actif") => ({
  id, nom, prenom: "Jean", matricule, statut,
  direction_nom: "DG", departement_nom: "RH", service_nom: "Paie",
  poste_nom: "Ingénieur", type_contrat_nom: "CDI",
  dossier_complet: true, taux_completude: 100,
});

const mockEmployeesResponse = (employees, count = employees.length) => ({
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

const setupDrillDown = () => {
  api.get.mockImplementation((url) => {
    if (url.includes("/ref/directions/")) return Promise.resolve({ data: [mockDirection] });
    if (url.includes("/ref/departements/")) return Promise.resolve({ data: [mockDept] });
    if (url.includes("/ref/services/")) return Promise.resolve({ data: [mockService] });
    if (url.includes("/employees/")) return Promise.resolve(mockEmployeesResponse([makeEmployee("emp-1")]));
    return Promise.resolve({ data: [] });
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe("Employees — rendu initial (vue directions)", () => {
  test("affiche la navbar", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPage();
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
  });

  test("charge les directions au montage", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPage();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/ref/directions/");
    });
  });

  test("affiche le titre Directions", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Directions")).toBeInTheDocument();
    });
  });

  test("affiche les cartes de directions", async () => {
    api.get.mockResolvedValue({ data: [mockDirection] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Direction Générale")).toBeInTheDocument();
    });
  });

  test("affiche le bouton Voir tous les employés sans filtre", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Voir tous les employés sans filtre")).toBeInTheDocument();
    });
  });

  test("bouton Voir tous les employés sans filtre appelle /employees/", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/ref/directions/")) return Promise.resolve({ data: [] });
      if (url.includes("/employees/")) return Promise.resolve(mockEmployeesResponse([]));
      return Promise.resolve({ data: [] });
    });
    renderPage();
    await waitFor(() => screen.getByText("Voir tous les employés sans filtre"));
    fireEvent.click(screen.getByText("Voir tous les employés sans filtre"));
    jest.runAllTimers();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/employees/",
        expect.objectContaining({ params: expect.objectContaining({ page: 1 }) })
      );
    });
  });

  test("affiche le bouton Nouvel employé pour ADMIN", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPage("ADMIN");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /nouvel employé/i })).toBeInTheDocument();
    });
  });

  test("n'affiche pas le bouton Nouvel employé pour CONSULTANT", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderPage("CONSULTANT");
    await waitFor(() => screen.getByText("Directions"));
    expect(screen.queryByRole("button", { name: /nouvel employé/i })).not.toBeInTheDocument();
  });
});

describe("Employees — drill-down navigation", () => {
  test("clic direction → affiche les départements", async () => {
    setupDrillDown();
    renderPage();
    await waitFor(() => screen.getByText("Direction Générale"));
    fireEvent.click(screen.getByText("Direction Générale"));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/ref/departements/",
        expect.objectContaining({ params: expect.objectContaining({ direction: "dir-1" }) })
      );
      expect(screen.getByText("Ressources Humaines")).toBeInTheDocument();
    });
  });

  test("clic département → affiche les services", async () => {
    setupDrillDown();
    renderPage();
    await waitFor(() => screen.getByText("Direction Générale"));
    fireEvent.click(screen.getByText("Direction Générale"));
    await waitFor(() => screen.getByText("Ressources Humaines"));
    fireEvent.click(screen.getByText("Ressources Humaines"));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/ref/services/",
        expect.objectContaining({ params: expect.objectContaining({ departement: "dept-1" }) })
      );
      expect(screen.getByText("Paie")).toBeInTheDocument();
    });
  });

  test("clic service → affiche la liste des employés", async () => {
    setupDrillDown();
    renderPage();
    await waitFor(() => screen.getByText("Direction Générale"));
    fireEvent.click(screen.getByText("Direction Générale"));
    await waitFor(() => screen.getByText("Ressources Humaines"));
    fireEvent.click(screen.getByText("Ressources Humaines"));
    await waitFor(() => screen.getByText("Paie"));
    fireEvent.click(screen.getByText("Paie"));
    jest.runAllTimers();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/employees/",
        expect.objectContaining({ params: expect.objectContaining({ service: "svc-1" }) })
      );
    });
  });
});

describe("Employees — liste des employés", () => {
  const goToEmployeesList = async (role = "ADMIN") => {
    api.get.mockImplementation((url) => {
      if (url.includes("/ref/directions/")) return Promise.resolve({ data: [] });
      if (url.includes("/employees/")) return Promise.resolve(mockEmployeesResponse([makeEmployee("emp-1")]));
      return Promise.resolve({ data: [] });
    });
    renderPage(role);
    await waitFor(() => screen.getByText("Voir tous les employés sans filtre"));
    fireEvent.click(screen.getByText("Voir tous les employés sans filtre"));
    jest.runAllTimers();
  };

  test("affiche le champ de recherche", async () => {
    await goToEmployeesList();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Rechercher par nom/i)).toBeInTheDocument();
    });
  });

  test("affiche le filtre de statut", async () => {
    await goToEmployeesList();
    await waitFor(() => {
      expect(screen.getByDisplayValue("Tous les statuts")).toBeInTheDocument();
    });
  });

  test("affiche les employés après chargement", async () => {
    await goToEmployeesList();
    await waitFor(() => {
      expect(screen.getByText("EMP-001")).toBeInTheDocument();
    });
  });

  test("affiche le message vide si aucun employé", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/ref/directions/")) return Promise.resolve({ data: [] });
      if (url.includes("/employees/")) return Promise.resolve(mockEmployeesResponse([]));
      return Promise.resolve({ data: [] });
    });
    renderPage();
    await waitFor(() => screen.getByText("Voir tous les employés sans filtre"));
    fireEvent.click(screen.getByText("Voir tous les employés sans filtre"));
    jest.runAllTimers();
    await waitFor(() => {
      expect(screen.getByText("Aucun employé trouvé")).toBeInTheDocument();
    });
  });

  test("clic Voir → navigue vers le détail", async () => {
    await goToEmployeesList();
    await waitFor(() => screen.getByText("Voir →"));
    fireEvent.click(screen.getByText("Voir →"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees/emp-1");
  });

  test("clic Nouvel employé navigue vers /employees/nouveau", async () => {
    await goToEmployeesList("ADMIN");
    await waitFor(() => screen.getByRole("button", { name: /nouvel employé/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouvel employé/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/employees/nouveau");
  });
});

describe("Employees — sélection ADMIN (vue employees)", () => {
  const setupEmployeeView = async (role = "ADMIN", employees = [makeEmployee("emp-1")]) => {
    api.get.mockImplementation((url) => {
      if (url.includes("/ref/directions/")) return Promise.resolve({ data: [] });
      if (url.includes("/employees/")) return Promise.resolve(mockEmployeesResponse(employees));
      return Promise.resolve({ data: [] });
    });
    renderPage(role);
    await waitFor(() => screen.getByText("Voir tous les employés sans filtre"));
    fireEvent.click(screen.getByText("Voir tous les employés sans filtre"));
    jest.runAllTimers();
    await waitFor(() => screen.getByText("EMP-001"));
  };

  test("affiche les checkboxes pour ADMIN", async () => {
    await setupEmployeeView("ADMIN");
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  test("n'affiche pas les checkboxes pour CONSULTANT", async () => {
    await setupEmployeeView("CONSULTANT");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  test("sélectionner un employé affiche la barre d'actions", async () => {
    await setupEmployeeView("ADMIN");
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1].closest("td") || checkboxes[1]);
    await waitFor(() => {
      expect(screen.getByText(/employé\(s\) sélectionné/)).toBeInTheDocument();
    });
  });
});

describe("Employees — bulk actions", () => {
  const setupAndSelect = async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/ref/directions/")) return Promise.resolve({ data: [] });
      if (url.includes("/employees/")) return Promise.resolve(mockEmployeesResponse([makeEmployee("emp-1")]));
      return Promise.resolve({ data: [] });
    });
    api.post.mockResolvedValue({ data: { nb_archives: 1 } });
    renderPage("ADMIN");
    await waitFor(() => screen.getByText("Voir tous les employés sans filtre"));
    fireEvent.click(screen.getByText("Voir tous les employés sans filtre"));
    jest.runAllTimers();
    await waitFor(() => screen.getAllByRole("checkbox"));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1].closest("td") || checkboxes[1]);
    await waitFor(() => screen.getByText(/Archiver/));
  };

  test("archiver appelle l'API bulk-delete avec action=archive", async () => {
    window.confirm = jest.fn(() => true);
    await setupAndSelect();
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
    await setupAndSelect();
    fireEvent.click(screen.getByText(/Archiver \(\d+\)/));
    expect(api.post).not.toHaveBeenCalled();
  });
});
