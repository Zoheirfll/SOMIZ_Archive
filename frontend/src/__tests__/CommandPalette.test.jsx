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
