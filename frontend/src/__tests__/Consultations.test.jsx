import React from "react";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import Consultations from "../pages/Consultations";

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>, { wrapper: ThemeProvider });

const DEMANDE = {
  id: "1", reference: "C-00001/26", type_demande: "document", type_demande_label: "Document",
  description: "Contrat de 2019", statut: "validee", statut_effectif: "validee",
  demandeur_nom: "Ali Ben", created_at: "2026-10-08T09:00:00Z",
  date_echeance: "2099-01-01T00:00:00Z",
};

describe("Consultations", () => {
  beforeEach(() => jest.clearAllMocks());

  test("un GESTIONNAIRE voit ses demandes et le bouton Nouvelle demande", async () => {
    useAuth.mockReturnValue({ user: { role: "GESTIONNAIRE", id: "u1" } });
    api.get.mockResolvedValueOnce({ data: { results: [DEMANDE] } });
    render(<Consultations />);
    await waitFor(() => expect(screen.getByText("C-00001/26")).toBeInTheDocument());
    expect(screen.getByText("Contrat de 2019")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nouvelle demande/i })).toBeInTheDocument();
  });

  test("un traiteur voit le demandeur et pas le bouton Nouvelle demande", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", id: "u2", can_manage_consultations: true } });
    api.get.mockResolvedValueOnce({ data: { results: [DEMANDE] } });
    render(<Consultations />);
    await waitFor(() => expect(screen.getByText(/Ali Ben/)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Nouvelle demande/i })).not.toBeInTheDocument();
  });

  test("affiche l'erreur serveur plutôt qu'une liste vide muette", async () => {
    useAuth.mockReturnValue({ user: { role: "GESTIONNAIRE", id: "u1" } });
    api.get.mockRejectedValueOnce({ response: { data: { detail: "Accès refusé." } } });
    render(<Consultations />);
    await waitFor(() => expect(screen.getByText("Accès refusé.")).toBeInTheDocument());
  });
});
