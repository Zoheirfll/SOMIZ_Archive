import React from "react";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
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
  beforeEach(() => jest.resetAllMocks());

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

  test("un traiteur sélectionne des demandes en cours et peut les rejeter en masse", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", id: "u2", can_manage_consultations: true } });
    const enCours = { ...DEMANDE, id: "9", reference: "C-00009/26", statut: "en_cours", statut_effectif: "en_cours" };
    api.get.mockResolvedValue({ data: { results: [enCours] } });
    render(<Consultations />);
    await userEvent.click(await screen.findByLabelText("Sélectionner C-00009/26"));
    expect(screen.getByText("1 sélectionnée(s)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rejeter \(1\)/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Révoquer \(1\)/ })).toBeDisabled();   // pas validée
  });

  test("sélection mixte : aucune action groupée et explication affichée", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", id: "u2", can_manage_consultations: true } });
    const enCours = { ...DEMANDE, id: "9", reference: "C-00009/26", statut: "en_cours", statut_effectif: "en_cours" };
    api.get.mockResolvedValue({ data: { results: [DEMANDE, enCours] } });
    render(<Consultations />);
    await userEvent.click(await screen.findByLabelText("Tout sélectionner"));
    expect(screen.getByRole("button", { name: /Rejeter \(2\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Révoquer \(2\)/ })).toBeDisabled();
    expect(screen.getByText(/Sélection mixte/)).toBeInTheDocument();
  });

  test("un demandeur n'a ni cases à cocher ni actions groupées", async () => {
    useAuth.mockReturnValue({ user: { role: "GESTIONNAIRE", id: "u1" } });
    api.get.mockResolvedValue({ data: { results: [DEMANDE] } });
    render(<Consultations />);
    await screen.findByText("C-00001/26");
    expect(screen.queryByText("Tout sélectionner")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  test("l'onglet Statistiques est réservé au traiteur et affiche les indicateurs", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", id: "u2", can_manage_consultations: true } });
    api.get.mockImplementation((url) => {
      if (url === "/consultations/stats/") return Promise.resolve({
        data: {
          total: 7, par_statut: [{ id: "en_cours", nom: "En cours de validation", count: 2 }],
          par_demandeur: [{ id: "u1", nom: "Ali Ben", count: 7 }], par_employe: [],
          evolution_mensuelle: [], delai_moyen_heures: 3.5,
        },
      });
      return Promise.resolve({ data: { results: [] } });
    });
    render(<Consultations />);
    await userEvent.click(await screen.findByText("Statistiques"));
    expect(await screen.findByText("Total demandes")).toBeInTheDocument();
    expect(screen.getByText("3.5 h")).toBeInTheDocument();
    expect(screen.getByText("Délai moyen de validation")).toBeInTheDocument();
  });

  test("un demandeur ne voit pas l'onglet Statistiques", async () => {
    useAuth.mockReturnValue({ user: { role: "GESTIONNAIRE", id: "u1" } });
    api.get.mockResolvedValue({ data: { results: [] } });
    render(<Consultations />);
    await screen.findByText(/Aucune demande/);
    expect(screen.queryByText("Statistiques")).not.toBeInTheDocument();
  });

  test("affiche l'erreur serveur plutôt qu'une liste vide muette", async () => {
    useAuth.mockReturnValue({ user: { role: "GESTIONNAIRE", id: "u1" } });
    api.get.mockRejectedValueOnce({ response: { data: { detail: "Accès refusé." } } });
    render(<Consultations />);
    await waitFor(() => expect(screen.getByText("Accès refusé.")).toBeInTheDocument());
  });
});
