/**
 * Tests — pages/EmployeeForm.jsx
 * Couvre : rendu création, rendu édition, chargement référentiels, validation, soumission
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../services/api";
import EmployeeForm from "../pages/EmployeeForm";

const emptyRefs = {
  directions: [],
  departements: [],
  services: [],
  postes: [],
  types_contrat: [],
  categories: [],
};

const mockRefs = {
  directions: [{ id: "dir-1", nom: "Direction Générale", is_active: true }],
  departements: [{ id: "dep-1", nom: "RH", direction: "dir-1", is_active: true }],
  services: [{ id: "svc-1", nom: "Paie", departement: "dep-1", is_active: true }],
  postes: [{ id: "pos-1", nom: "Ingénieur", is_active: true }],
  types_contrat: [{ id: "tc-1", nom: "CDI", is_active: true }],
  categories: [{ id: "cat-1", nom: "Cadre", is_active: true }],
};

const mockEmployee = {
  id: "emp-uuid",
  matricule: "EMP-001",
  nom: "Dupont",
  prenom: "Jean",
  statut: "actif",
  date_naissance: "1990-01-15",
  date_embauche: "2020-06-01",
  direction: "dir-1",
  departement: "dep-1",
  service: "svc-1",
  poste: "pos-1",
  type_contrat: "tc-1",
  categorie: "cat-1",
};

// Route création
const renderCreate = () =>
  render(
    <MemoryRouter initialEntries={["/employees/nouveau"]}>
      <Routes>
        <Route path="/employees/nouveau" element={<EmployeeForm />} />
      </Routes>
    </MemoryRouter>
  );

// Route édition
const renderEdit = () =>
  render(
    <MemoryRouter initialEntries={["/employees/emp-uuid/modifier"]}>
      <Routes>
        <Route path="/employees/:id/modifier" element={<EmployeeForm />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url.includes("/ref/directions/")) return Promise.resolve({ data: mockRefs.directions });
    if (url.includes("/ref/departements/")) return Promise.resolve({ data: mockRefs.departements });
    if (url.includes("/ref/services/")) return Promise.resolve({ data: mockRefs.services });
    if (url.includes("/ref/postes/")) return Promise.resolve({ data: mockRefs.postes });
    if (url.includes("/ref/types-contrat/")) return Promise.resolve({ data: mockRefs.types_contrat });
    if (url.includes("/ref/categories/")) return Promise.resolve({ data: mockRefs.categories });
    return Promise.resolve({ data: mockEmployee });
  });
});

describe("EmployeeForm — rendu création", () => {
  test("affiche le titre Nouvel employé", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderCreate();
    await waitFor(() => {
      expect(screen.getByText(/Nouvel employé/)).toBeInTheDocument();
    });
  });

  test("affiche le champ Matricule", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderCreate();
    await waitFor(() => {
      expect(screen.getByText("Matricule")).toBeInTheDocument();
    });
  });

  test("affiche le champ Nom", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderCreate();
    await waitFor(() => {
      expect(screen.getByText("Nom")).toBeInTheDocument();
    });
  });

  test("affiche le champ Prénom", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderCreate();
    await waitFor(() => {
      expect(screen.getByText("Prénom")).toBeInTheDocument();
    });
  });

  test("affiche le bouton Créer l'employé", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderCreate();
    await waitFor(() => {
      expect(screen.getByText(/Créer l'employé/)).toBeInTheDocument();
    });
  });

  test("affiche le bouton Annuler", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderCreate();
    await waitFor(() => {
      expect(screen.getByText("Annuler")).toBeInTheDocument();
    });
  });
});

describe("EmployeeForm — rendu édition", () => {
  test("affiche le titre Modifier l'employé", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/ref/")) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: mockEmployee });
    });
    renderEdit();
    await waitFor(() => {
      expect(screen.getByText(/Modifier l'employé/)).toBeInTheDocument();
    });
  });

  test("pré-remplit le matricule en mode édition", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/ref/")) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: mockEmployee });
    });
    renderEdit();
    await waitFor(() => {
      const input = screen.getByDisplayValue("EMP-001");
      expect(input).toBeInTheDocument();
    });
  });

  test("pré-remplit le nom en mode édition", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/ref/")) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: mockEmployee });
    });
    renderEdit();
    await waitFor(() => {
      expect(screen.getByDisplayValue("Dupont")).toBeInTheDocument();
    });
  });
});

describe("EmployeeForm — référentiels", () => {
  test("charge et affiche les directions dans le select", async () => {
    // beforeEach already sets up per-endpoint mocks with mockRefs data
    renderCreate();
    await waitFor(() => {
      expect(screen.getByText("Direction Générale")).toBeInTheDocument();
    });
  });

  test("charge et affiche les postes", async () => {
    renderCreate();
    await waitFor(() => {
      expect(screen.getByText("Ingénieur")).toBeInTheDocument();
    });
  });
});

describe("EmployeeForm — navigation", () => {
  test("clic Annuler navigue en arrière", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderCreate();
    await waitFor(() => screen.getByText("Annuler"));
    fireEvent.click(screen.getByText("Annuler"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees");
  });
});

describe("EmployeeForm — soumission création", () => {
  test("soumission réussie navigue vers le détail de l'employé", async () => {
    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValue({ data: { id: "new-emp-uuid" } });
    renderCreate();
    await waitFor(() => screen.getByText(/Créer l'employé/));

    // Remplir les champs obligatoires
    fireEvent.change(screen.getByPlaceholderText("EMP-001"), {
      target: { name: "matricule", value: "EMP-999" },
    });
    fireEvent.change(screen.getByPlaceholderText("FILALI"), {
      target: { name: "nom", value: "Martin" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ahmed"), {
      target: { name: "prenom", value: "Paul" },
    });

    fireEvent.click(screen.getByText(/Créer l'employé/));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/employees/",
        expect.objectContaining({ matricule: "EMP-999" })
      );
    });
  });
});
