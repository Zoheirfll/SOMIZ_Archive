import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { role: "CONSULTANT" } }) }));

import api from "../services/api";
import Interims from "../pages/Interims";

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>, { wrapper: ThemeProvider });

const UNITE = {
  type: "service", id: "u1", nom: "Service Paie", role: "titulaire", titulaire_nom: "Kheira FERGOUG",
  validation_requise: true,
};
const A_VALIDER = {
  id: "i1", unite_type: "service", unite_id: "u1", unite_nom: "Service Paie", titulaire_nom: "Kheira FERGOUG",
  interimaire_id: "c1", interimaire_nom: "Amine Equipe", date_debut: "2026-11-01", date_fin: "2026-11-10",
  statut: "en_attente", actif: false, propose_par_nom: "Kheira FERGOUG", decide_par_nom: null, motif: "",
  peut_decider: true, peut_terminer: true,
};

beforeEach(() => {
  jest.resetAllMocks();
  api.get.mockImplementation((url) => {
    if (url === "/interims/") return Promise.resolve({ data: { peut_gerer: true, unites: [UNITE], interims: [A_VALIDER] } });
    if (url === "/interims/candidats/") return Promise.resolve({ data: [{ id: "c1", nom: "Amine Equipe", username: "amine" }] });
    return Promise.resolve({ data: {} });
  });
  api.post.mockResolvedValue({ data: { statut: "en_attente" } });
});

describe("Interims", () => {
  test("liste les désignations à valider et permet de valider", async () => {
    render(<Interims />);
    expect(await screen.findByText("À valider (1)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/interims/i1/decider/", { accepter: true, motif: "" }));
  });

  test("le formulaire désigne un intérimaire choisi dans l'équipe de l'unité", async () => {
    render(<Interims />);
    fireEvent.change(await screen.findByLabelText("Unité"), { target: { value: "service:u1" } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/interims/candidats/", { params: { unite_type: "service", unite_id: "u1" } }));
    expect(screen.getByText(/soumise à la validation de votre supérieur direct/)).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("Intérimaire"), { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("Au (inclus)"), { target: { value: "2026-11-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Désigner" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/interims/", {
      interimaire: "c1", date_debut: "2026-11-01", date_fin: "2026-11-10", unite_type: "service", unite_id: "u1",
    }));
  });
});
