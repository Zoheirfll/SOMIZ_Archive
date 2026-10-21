import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), patch: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import CongeDetail from "../pages/CongeDetail";

const TRAITEUR = { id: 1, role: "ADMIN", can_manage_conges: true };
const DEMANDEUR = { id: 5, role: "GESTIONNAIRE", can_request_conges: true };

const DEMANDE = {
  id: "d1", reference: "00001/26", statut: "recue", importance: "moyenne",
  employee: "e1", employee_nom: "Ali Benali", employee_matricule: "123456", employee_poste_nom: "Agent",
  employee_date_embauche: "2015-01-01", employee_service_nom: "Service 1",
  employee_departement_nom: "Paie", employee_direction_nom: "DRH",
  date_depart: "2026-11-01", date_retour: "2026-11-21", nb_jours: 20,
  adresse_conge: "12 rue des Oliviers", commentaire: "", motif_rejet: "",
  type_conge: "", motif_nom: null, exercice: "", observations: "", validateur_nom: "",
  motif: null, ventilation: [], categorie_exercice: "", pieces_jointes: [],
  signataire_nom: "", signataire_interim: false,
  demandeur: 5, demandeur_nom: "Gest Test", demandeur_role: "GESTIONNAIRE",
  created_at: "2026-10-20T08:00:00Z", date_prete: null, date_recuperee: null, date_document: null,
};

const PRETE = {
  ...DEMANDE, statut: "prete", type_conge: "CP", motif: 1, motif_nom: "Congé annuel", exercice: "2025/2026",
  date_etablissement: "2026-10-20", categorie_exercice: "RELIQUAT", validateur_nom: "Admin Test",
  ventilation: [{ exercice: "2025/2026", jours: 13 }, { exercice: "2026/2027", jours: 7 }],
  signataire_nom: "A.BOUSMAHA", date_prete: "2026-10-20T09:00:00Z",
};

const SOLDE = {
  initialise: true,
  solde: {
    exercice_courant: "2026/2027", reliquat: 13, actuel: 30, anticipe: 30, disponible: 43,
    droit_initial: 210, cp_consomme: 180, retrait_cs: 0,
    exercices: [
      { exercice: "2025/2026", categorie: "RELIQUAT", droit: 13, consomme: 0, restant: 13, ouvert: true },
      { exercice: "2026/2027", categorie: "ACTUEL", droit: 30, consomme: 0, restant: 30, ouvert: true },
      { exercice: "2027/2028", categorie: "ANTICIPE", droit: 30, consomme: 0, restant: 30, ouvert: true },
    ],
  },
  mouvements: [],
};
const MOTIFS = [{ id: 1, nom: "Congé annuel", type_conge: "CP", is_active: true },
  { id: 2, nom: "Mariage", type_conge: "CE", is_active: true }];

const mockApi = (demande, extra = {}) => {
  api.get.mockImplementation((url) => {
    if (extra[url]) return extra[url]();
    if (url === "/conges/demandes/00001-26/") return Promise.resolve({ data: demande });
    if (url.startsWith("/conges/soldes/")) return Promise.resolve({ data: SOLDE });
    if (url === "/conges/motifs/") return Promise.resolve({ data: MOTIFS });
    return Promise.resolve({ data: {} });
  });
};

const renderDetail = () => rtlRender(
  <MemoryRouter initialEntries={["/conges/00001-26"]}>
    <Routes><Route path="/conges/:ref" element={<CongeDetail />} /></Routes>
  </MemoryRouter>,
  { wrapper: ThemeProvider },
);

beforeEach(() => {
  jest.resetAllMocks();
  global.URL.createObjectURL = jest.fn(() => "blob:mock-url");
  global.URL.revokeObjectURL = jest.fn();
});

describe("CongeDetail — rôles", () => {
  test("le traiteur voit Valider et Rejeter sur une demande reçue", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi(DEMANDE);
    renderDetail();
    expect(await screen.findByRole("button", { name: "Valider" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rejeter" })).toBeInTheDocument();
  });

  test("le demandeur voit les informations mais aucune action de traitement", async () => {
    useAuth.mockReturnValue({ user: DEMANDEUR });
    mockApi(DEMANDE);
    renderDetail();
    await screen.findByText("Ali Benali");
    expect(screen.queryByRole("button", { name: "Valider" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rejeter" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Annuler la demande/i })).toBeInTheDocument();
  });

  test("affiche matricule, fonction, affectation et période de la demande", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi(DEMANDE);
    renderDetail();
    await screen.findByText("Ali Benali");
    expect(screen.getByText("123456")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("12 rue des Oliviers")).toBeInTheDocument();
    expect(screen.getByText(/20 j/)).toBeInTheDocument();
  });

  test("le traiteur voit les soldes de l'employé", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi(DEMANDE);
    renderDetail();
    expect(await screen.findByText("Soldes de congé")).toBeInTheDocument();
    expect(await screen.findByText("43")).toBeInTheDocument(); // solde actuel
  });
});

describe("CongeDetail — validation", () => {
  test("l'aperçu du débit part du reliquat le plus ancien puis déborde", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi(DEMANDE);
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Valider" }));
    expect(await screen.findByText("13 j sur l'exercice 2025/2026")).toBeInTheDocument();
    expect(screen.getByText("7 j sur l'exercice 2026/2027")).toBeInTheDocument();
    expect(screen.getByLabelText("Exercice")).toHaveValue("2025/2026");
  });

  test("type, motif et exercice choisis par le demandeur arrivent préremplis", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi({ ...DEMANDE, type_conge: "CE", motif: 2, motif_nom: "Mariage", nb_jours: 3 });
    renderDetail();
    expect(await screen.findByText("Type demandé")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Valider" }));
    await waitFor(() => expect(screen.getByLabelText("Motif")).toHaveValue("2"));
    expect(screen.getByLabelText("Type de congé")).toHaveValue("CE");
    expect(screen.getByText(/aucun jour n'est débité/)).toBeInTheDocument();
  });

  test("Valider envoie les champs du titre au serveur puis ouvre le titre", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    let appels = 0;
    mockApi(DEMANDE, {
      "/conges/demandes/00001-26/": () => {
        appels += 1;
        return Promise.resolve({ data: appels === 1 ? DEMANDE : PRETE });
      },
      "/conges/demandes/00001-26/apercu/": () => Promise.resolve({ data: new Blob(["%PDF"], { type: "application/pdf" }) }),
    });
    api.post.mockResolvedValue({ data: PRETE });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Valider" }));
    fireEvent.change(await screen.findByLabelText("Motif"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Observations"), { target: { value: "RAS" } });
    fireEvent.click(screen.getByRole("button", { name: /Valider et générer le titre/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/conges/demandes/00001-26/valider/", expect.objectContaining({
        type_conge: "CP", motif: 1, nb_jours: 20, date_depart: "2026-11-01", date_retour: "2026-11-21",
        adresse_conge: "12 rue des Oliviers", observations: "RAS", exercice: "2025/2026",
      })),
    );
    await waitFor(() => expect(screen.getByTitle("Aperçu du titre de congé")).toHaveAttribute("src", "blob:mock-url#toolbar=0"));
  });

  test("affiche l'erreur du serveur dans la modale (modale gardée ouverte)", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi(DEMANDE);
    api.post.mockRejectedValue({ response: { data: { error: "Les soldes de congé de cet employé ne sont pas initialisés." } } });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Valider" }));
    fireEvent.change(await screen.findByLabelText("Motif"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Valider et générer le titre/i }));
    expect(await screen.findByText(/ne sont pas initialisés/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Valider et générer le titre/i })).toBeInTheDocument();
  });

  test("le motif est obligatoire : pas d'appel serveur sans motif", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi(DEMANDE);
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Valider" }));
    fireEvent.click(await screen.findByRole("button", { name: /Valider et générer le titre/i }));
    expect(await screen.findByText(/Choisissez un motif/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe("CongeDetail — titre validé", () => {
  test("affiche le type, le motif, la ventilation et le validateur", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi(PRETE);
    renderDetail();
    await screen.findByText("Ali Benali");
    expect(screen.getByText("Congé annuel")).toBeInTheDocument();
    expect(screen.getByText("Admin Test")).toBeInTheDocument();
    expect(screen.getByText("13 j sur 2025/2026 · 7 j sur 2026/2027")).toBeInTheDocument();
    expect(screen.getByText("2025/2026 (Reliquat)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aperçu PDF/i })).toBeInTheDocument();
  });

  test("les pièces jointes s'ouvrent via l'API, jamais par lien direct", async () => {
    useAuth.mockReturnValue({ user: DEMANDEUR });
    window.open = jest.fn();
    mockApi({ ...DEMANDE, pieces_jointes: [{ id: 4, libelle: "Acte de mariage", nom_fichier: "acte.pdf", taille: 2048, mime_type: "application/pdf" }] }, {
      "/conges/demandes/00001-26/pieces/4/": () => Promise.resolve({ data: new Blob(["%PDF"]) }),
    });
    renderDetail();
    expect(await screen.findByText(/acte\.pdf \(2 Ko\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir Acte de mariage" }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith("blob:mock-url", "_blank", "noopener"));
    expect(api.get).toHaveBeenCalledWith("/conges/demandes/00001-26/pieces/4/", { responseType: "blob" });
  });

  test("pas d'aperçu PDF tant que la demande est seulement reçue", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi(DEMANDE);
    renderDetail();
    await screen.findByRole("button", { name: "Valider" });
    expect(screen.queryByRole("button", { name: /Aperçu PDF/i })).not.toBeInTheDocument();
  });

  test("rouvrir l'aperçu un autre jour demande confirmation de la date", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    const conflit = new Error("conflit");
    conflit.response = {
      status: 409,
      data: new Blob([JSON.stringify({ needs_confirmation: true, date_document: "2026-10-19", date_nouvelle: "2026-10-20" })], { type: "application/json" }),
    };
    mockApi(PRETE, { "/conges/demandes/00001-26/apercu/": () => Promise.reject(conflit) });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /Aperçu PDF/i }));
    expect(await screen.findByText(/déjà imprimée sur ce document/i)).toBeInTheDocument();
  });
});

describe("CongeDetail — annulation et interruption", () => {
  test("l'annulation exige de retaper la référence du titre", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi(PRETE);
    api.post.mockResolvedValue({ data: { ...PRETE, statut: "annulee" } });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Annuler le titre" }));
    const confirmer = await screen.findByRole("button", { name: "Confirmer l'annulation" });
    fireEvent.change(screen.getByLabelText("Motif de l'annulation"), { target: { value: "Annulé par l'employé" } });
    expect(confirmer).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Saisissez la référence/), { target: { value: "00002/26" } });
    expect(confirmer).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Saisissez la référence/), { target: { value: "00001/26" } });
    expect(confirmer).not.toBeDisabled();
    fireEvent.click(confirmer);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/conges/demandes/00001-26/annuler/", {
        motif: "Annulé par l'employé", reference_confirmation: "00001/26",
      }),
    );
  });

  test("l'interruption envoie la date de rappel et le motif", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi(PRETE);
    api.post.mockResolvedValue({ data: { ...PRETE, statut: "interrompue" } });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Interrompre le congé" }));
    fireEvent.change(await screen.findByLabelText("Date de rappel"), { target: { value: "2026-11-05" } });
    fireEvent.change(screen.getByLabelText("Motif de l'interruption"), { target: { value: "Rappel de l'employeur" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'interruption" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/conges/demandes/00001-26/interrompre/", {
        date_rappel: "2026-11-05", motif: "Rappel de l'employeur",
      }),
    );
  });

  test("un titre annulé n'offre plus d'action de traitement", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi({ ...PRETE, statut: "annulee", motif_annulation: "Erreur", annulee_par_nom: "Admin Test" });
    renderDetail();
    await screen.findByText("Ali Benali");
    expect(screen.queryByRole("button", { name: "Annuler le titre" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Interrompre le congé" })).not.toBeInTheDocument();
    expect(screen.getByText("Erreur")).toBeInTheDocument();
  });

  test("marquer récupéré appelle l'endpoint dédié", async () => {
    useAuth.mockReturnValue({ user: TRAITEUR });
    mockApi(PRETE);
    api.post.mockResolvedValue({ data: { ...PRETE, statut: "recuperee" } });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Marquer récupéré" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/conges/demandes/00001-26/recuperee/", {}));
  });
});
