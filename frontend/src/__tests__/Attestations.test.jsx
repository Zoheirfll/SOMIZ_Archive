import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn() },
}));
jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import Attestations from "../pages/Attestations";

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>, { wrapper: ThemeProvider });

describe("Attestations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("affiche la liste des demandes reçues de l'API", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", id: "u1", full_name: "Admin Test" } });
    api.get.mockResolvedValueOnce({
      data: {
        results: [
          { id: "1", reference: "00001/26", employee_nom: "Jean Dupont", statut: "recue", demandeur_nom: "Ali Ben" },
        ],
      },
    });
    render(<Attestations />);
    await waitFor(() => expect(screen.getByText("00001/26")).toBeInTheDocument());
    expect(screen.getByText("Jean Dupont")).toBeInTheDocument();
  });

  test("un GESTIONNAIRE voit un bouton Nouvelle demande", async () => {
    useAuth.mockReturnValue({ user: { role: "GESTIONNAIRE", id: "u2", full_name: "Gest Test" } });
    api.get.mockResolvedValueOnce({ data: { results: [] } });
    render(<Attestations />);
    await waitFor(() => expect(screen.getByText(/Nouvelle demande/i)).toBeInTheDocument());
  });

  test("l'onglet Statistiques affiche le nombre de demandes par gestionnaire", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", id: "u1", full_name: "Admin Test" } });
    api.get.mockImplementation((url) => {
      if (url === "/attestations/demandes/") return Promise.resolve({ data: { results: [] } });
      if (url === "/attestations/stats/") return Promise.resolve({
        data: {
          par_gestionnaire: [{ demandeur_id: "u2", demandeur_nom: "Ali Ben", count: 4 }],
          par_employe: [], par_statut: {}, delai_moyen_jours: 2.5,
        },
      });
      return Promise.resolve({ data: {} });
    });
    render(<Attestations />);
    fireEvent.click(await screen.findByText(/Statistiques/i));
    await waitFor(() => expect(screen.getByText("Ali Ben")).toBeInTheDocument());
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
