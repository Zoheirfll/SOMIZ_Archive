import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn() },
}));

import api from "../services/api";
import CongesTab from "../components/employeeDetail/CongesTab";
import { exercicePour } from "../utils/conges";

const EMPLOYEE = { id: "e1", matricule: "123456", nom: "Benali", prenom: "Ali" };
const TRAITEUR = { id: 1, role: "ADMIN", can_manage_conges: true };
const DEMANDEUR = { id: 5, role: "GESTIONNAIRE", can_request_conges: true };

const SOLDE = {
  initialise: true,
  solde: {
    exercice_courant: "2026/2027", reliquat: 13, actuel: 30, anticipe: 28, disponible: 43,
    droit_initial: 210, cp_consomme: 180, retrait_cs: 4,
    exercices: [
      { exercice: "2025/2026", categorie: "RELIQUAT", droit: 13, consomme: 0, restant: 13, ouvert: true },
      { exercice: "2026/2027", categorie: "ACTUEL", droit: 30, consomme: 0, restant: 30, ouvert: true },
      { exercice: "2027/2028", categorie: "ANTICIPE", droit: 30, consomme: 2, restant: 28, ouvert: true },
    ],
  },
  mouvements: [{
    id: 1, nature: "DEBIT", nature_libelle: "Débit (validation CP)", demande_reference: "00001/26",
    exercice: "2025/2026", d_droit: 0, d_consomme: 13, d_droit_initial: 0, d_cp_consomme: 13, d_retrait_cs: 0,
    motif: "Titre 00001/26", auteur_nom: "Admin Test", created_at: "2026-10-20T09:00:00Z",
  }],
};
const DEMANDES = [{
  id: "d1", reference: "00001/26", statut: "prete", employee_nom: "Ali Benali",
  date_depart: "2026-11-01", date_retour: "2026-11-21", nb_jours: 20, demandeur_nom: "Gest Test",
  created_at: "2026-10-20T08:00:00Z",
}];

const mockApi = (solde = SOLDE) => {
  api.get.mockImplementation((url) => {
    if (url.startsWith("/conges/soldes/")) return Promise.resolve({ data: solde });
    if (url === "/conges/demandes/") return Promise.resolve({ data: { results: DEMANDES } });
    return Promise.resolve({ data: {} });
  });
};

const navigate = jest.fn();
const renderTab = (user, activeTab = "conges") =>
  rtlRender(
    <MemoryRouter>
      <CongesTab activeTab={activeTab} employee={EMPLOYEE} user={user} navigate={navigate} />
    </MemoryRouter>,
    { wrapper: ThemeProvider },
  );

beforeEach(() => { jest.resetAllMocks(); });

describe("CongesTab", () => {
  test("ne rend rien tant que l'onglet n'est pas actif (et n'appelle pas l'API)", () => {
    mockApi();
    renderTab(TRAITEUR, "dossier");
    expect(screen.queryByText("Soldes de congé")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  test("le traiteur voit les soldes, les titres et l'historique des mouvements", async () => {
    mockApi();
    renderTab(TRAITEUR);
    expect(await screen.findByText("43")).toBeInTheDocument(); // actuel
    expect(screen.getByText("00001/26", { selector: "a *, a" })).toBeInTheDocument();
    expect(await screen.findByText("Débit (validation CP)")).toBeInTheDocument();
    expect(screen.getByText("Exercice 2025/2026 · Consommé +13 · CP +13")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Corriger les soldes/i })).toBeInTheDocument();
  });

  test("le compteur de congé sans solde n'est pas affiché avec les soldes", async () => {
    mockApi();
    renderTab(TRAITEUR);
    await screen.findByText("43");
    expect(screen.queryByText(/Retrait CS/i)).not.toBeInTheDocument();
  });

  test("interroge les titres de CET employé par matricule", async () => {
    mockApi();
    renderTab(TRAITEUR);
    await screen.findByText("43");
    expect(api.get).toHaveBeenCalledWith("/conges/demandes/", { params: { employee: "123456" } });
    expect(api.get).toHaveBeenCalledWith("/conges/soldes/123456/");
  });

  test("un demandeur voit les soldes sans l'historique ni les boutons de saisie", async () => {
    mockApi({ ...SOLDE, mouvements: [] });
    renderTab(DEMANDEUR);
    expect(await screen.findByText("43")).toBeInTheDocument();
    expect(screen.queryByText("Historique des mouvements")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Corriger les soldes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Initialiser les soldes/i })).not.toBeInTheDocument();
  });

  test("un demandeur peut demander un congé pour cet employé", async () => {
    mockApi();
    renderTab(DEMANDEUR);
    fireEvent.click(await screen.findByRole("button", { name: /Nouvelle demande/i }));
    expect(navigate).toHaveBeenCalledWith("/conges/nouvelle", { state: { employeeId: "e1" } });
  });

  test("un traiteur non demandeur n'a pas le bouton Nouvelle demande", async () => {
    mockApi();
    renderTab(TRAITEUR);
    await screen.findByText("43");
    expect(screen.queryByRole("button", { name: /Nouvelle demande/i })).not.toBeInTheDocument();
  });

  test("solde non initialisé : le traiteur peut le saisir (POST initial)", async () => {
    mockApi({ initialise: false, solde: null, mouvements: [] });
    api.post.mockResolvedValue({ data: {} });
    renderTab(TRAITEUR);
    fireEvent.click(await screen.findByRole("button", { name: /Initialiser les soldes/i }));
    const courant = exercicePour(new Date().toISOString().slice(0, 10));
    const debut = Number(courant.split("/")[0]);
    const precedent = `${debut - 1}/${debut}`;
    const ancien = `${debut - 2}/${debut - 1}`;
    fireEvent.change(await screen.findByLabelText(`Reliquat ${precedent}`), { target: { value: "13" } });
    fireEvent.change(screen.getByLabelText(`Actuel ${courant}`), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /Ajouter un exercice antérieur/i }));
    fireEvent.change(screen.getByLabelText(`Reliquat ${ancien}`), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer le solde initial/i }));
    // L'anticipé laissé vide n'est pas envoyé : le serveur l'ouvre au droit annuel.
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/conges/soldes/123456/initial/", {
        exercices: { [ancien]: 2, [precedent]: 13, [courant]: 30 },
        droit_initial: 0, cp_consomme: 0,
      }),
    );
  });

  test("solde non initialisé : un demandeur voit seulement le message", async () => {
    mockApi({ initialise: false, solde: null, mouvements: [] });
    renderTab(DEMANDEUR);
    expect(await screen.findByText(/Soldes non initialisés/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Initialiser les soldes/i })).not.toBeInTheDocument();
  });

  test("la correction exige un motif et n'envoie que les compartiments modifiés", async () => {
    mockApi();
    api.post.mockResolvedValue({ data: {} });
    renderTab(TRAITEUR);
    fireEvent.click(await screen.findByRole("button", { name: /Corriger les soldes/i }));
    fireEvent.change(await screen.findByLabelText("Reliquat 2025/2026"), { target: { value: "-2" } });
    expect(screen.getByText("Actuellement 13 j restant(s)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Appliquer la correction/i }));
    expect(await screen.findByText(/Un motif est obligatoire/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Motif"), { target: { value: "Erreur de reprise" } });
    fireEvent.click(screen.getByRole("button", { name: /Appliquer la correction/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/conges/soldes/123456/correction/", {
        exercices: { "2025/2026": -2 }, droit_initial: 0, cp_consomme: 0, motif: "Erreur de reprise",
      }),
    );
  });

  test("affiche l'erreur du serveur dans la modale de saisie", async () => {
    mockApi({ initialise: false, solde: null, mouvements: [] });
    api.post.mockRejectedValue({ response: { data: { error: "Le solde de cet employé est déjà initialisé." } } });
    renderTab(TRAITEUR);
    fireEvent.click(await screen.findByRole("button", { name: /Initialiser les soldes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Enregistrer le solde initial/i }));
    expect(await screen.findByText(/déjà initialisé/)).toBeInTheDocument();
  });
});
