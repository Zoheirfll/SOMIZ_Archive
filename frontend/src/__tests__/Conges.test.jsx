import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import Conges from "../pages/Conges";

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>, { wrapper: ThemeProvider });

const LIGNE = {
  id: "d1", reference: "00001/26", statut: "recue", importance: "moyenne",
  employee_nom: "Ali Benali", employee_matricule: "123456",
  date_depart: "2026-11-01", date_retour: "2026-11-11", nb_jours: 10,
  demandeur_nom: "Gest Test", created_at: "2026-10-20T08:00:00Z",
};

const STATS = {
  total: 1, par_statut: [{ id: "recue", nom: "Reçue", count: 1 }],
  par_gestionnaire: [], par_employe: [], evolution_mensuelle: [], delai_moyen_jours: null,
};

beforeEach(() => {
  jest.resetAllMocks();
  api.get.mockImplementation((url) => {
    if (url === "/conges/stats/") return Promise.resolve({ data: STATS });
    return Promise.resolve({ data: { results: [LIGNE] } });
  });
});

describe("Conges — liste", () => {
  test("affiche référence, employé, période et nombre de jours", async () => {
    useAuth.mockReturnValue({ user: { id: 1, role: "ADMIN", can_manage_conges: true } });
    render(<Conges />);
    expect(await screen.findByText("00001/26")).toBeInTheDocument();
    expect(screen.getByText("Ali Benali")).toBeInTheDocument();
    expect(screen.getByText(/10 j/)).toBeInTheDocument();
    expect(screen.getByText(/1 nov\.\s*→\s*11 nov\./)).toBeInTheDocument();
  });

  test("un demandeur autorisé voit le lien Nouvelle demande", async () => {
    useAuth.mockReturnValue({ user: { id: 5, role: "GESTIONNAIRE", can_request_conges: true } });
    render(<Conges />);
    expect(await screen.findByRole("link", { name: /Nouvelle demande/i })).toBeInTheDocument();
  });

  test("un traiteur non demandeur ne voit pas le lien Nouvelle demande", async () => {
    useAuth.mockReturnValue({ user: { id: 1, role: "ADMIN", can_manage_conges: true } });
    render(<Conges />);
    await screen.findByText("00001/26");
    expect(screen.queryByRole("link", { name: /Nouvelle demande/i })).not.toBeInTheDocument();
  });

  test("le lien d'une ligne utilise la référence encodée", async () => {
    useAuth.mockReturnValue({ user: { id: 1, role: "ADMIN", can_manage_conges: true } });
    render(<Conges />);
    const lien = (await screen.findByText("00001/26")).closest("a");
    expect(lien).toHaveAttribute("href", "/conges/00001-26");
  });

  test("filtre par statut : relance la requête avec le statut choisi", async () => {
    useAuth.mockReturnValue({ user: { id: 1, role: "ADMIN", can_manage_conges: true } });
    render(<Conges />);
    await screen.findByText("00001/26");
    fireEvent.click(screen.getByRole("button", { name: "Annulée" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/conges/demandes/", { params: expect.objectContaining({ statut: "annulee" }) }),
    );
  });

  test("filtre par importance et trie : relance la requête avec ces paramètres", async () => {
    useAuth.mockReturnValue({ user: { id: 1, role: "ADMIN", can_manage_conges: true } });
    render(<Conges />);
    await screen.findByText("00001/26");
    fireEvent.click(screen.getByRole("button", { name: "Haute" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/conges/demandes/", { params: expect.objectContaining({ importance: "haute", tri: "-created_at" }) },
    ));
    fireEvent.click(screen.getByRole("button", { name: "Trier par Employé" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/conges/demandes/", { params: expect.objectContaining({ tri: "employee" }) },
    ));
  });

  test("état vide pour un demandeur sans demande", async () => {
    useAuth.mockReturnValue({ user: { id: 5, role: "GESTIONNAIRE", can_request_conges: true } });
    api.get.mockResolvedValue({ data: { results: [] } });
    render(<Conges />);
    expect(await screen.findByText(/Aucune demande/i)).toBeInTheDocument();
  });
});

describe("Conges — statistiques", () => {
  test("l'onglet Statistiques n'est proposé qu'au traiteur", async () => {
    useAuth.mockReturnValue({ user: { id: 5, role: "GESTIONNAIRE", can_request_conges: true } });
    render(<Conges />);
    await screen.findByText("00001/26");
    expect(screen.queryByRole("button", { name: "Statistiques" })).not.toBeInTheDocument();
  });

  test("le traiteur ouvre Statistiques : appelle /conges/stats/ et affiche le total", async () => {
    useAuth.mockReturnValue({ user: { id: 1, role: "ADMIN", can_manage_conges: true } });
    render(<Conges />);
    await screen.findByText("00001/26");
    fireEvent.click(screen.getByRole("button", { name: "Statistiques" }));
    expect(await screen.findByText("Total demandes")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/conges/stats/", expect.anything());
  });
});
