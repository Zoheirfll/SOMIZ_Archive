// frontend/src/__tests__/Reporting.test.jsx
import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
let mockRole = "ADMIN";
let mockStats = true;
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: mockRole, username: "admin", can_view_statistiques: mockStats } }),
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../services/api";
import RapportRH from "../pages/reporting/RapportRH";

const render = (ui) => rtlRender(ui, { wrapper: ThemeProvider });
const kpi = (code, libelle, valeur, extra = {}) => ({
  code, libelle, valeur, unite: "", variation_pct: null, definition: `Définition de ${libelle}`, ...extra,
});
const periode = { debut: "2025-10-30", fin: "2026-10-30" };

const mockApi = (rapport, extra = {}) =>
  api.get.mockImplementation((url, options) => {
    if (url === "/reporting/objectifs/") return Promise.resolve({ data: { objectifs: [], indicateurs: [] } });
    if (url === "/reporting/rapports-mensuels/") return Promise.resolve({ data: [] });
    if (options?.responseType === "blob") return Promise.resolve({ data: new Blob(["x"]) });
    if (extra[url]) return Promise.resolve({ data: extra[url] });
    return Promise.resolve({ data: rapport });
  });

const renderPage = (page) =>
  render(
    <MemoryRouter initialEntries={[`/statistiques/${page}`]}>
      <Routes>
        <Route path="/statistiques/:page" element={<RapportRH />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  // mockReset vide aussi les réponses « Once » non consommées d'un test précédent.
  api.get.mockReset();
  mockRole = "ADMIN";
});

describe("Reporting RH — Synthèse", () => {
  const synthese = {
    periode,
    kpis: [kpi("effectif_actif", "Effectif actif", 42), kpi("taux_feminisation", "Taux de féminisation", 38.5, { unite: "%", variation_pct: 4.2 })],
    alertes: [{ niveau: "danger", texte: "3 contrat(s) arrivent à échéance dans les 30 jours", lien: "/statistiques/contrats" }],
  };

  test("affiche les KPI, leur définition et les alertes", async () => {
    mockApi(synthese);
    renderPage("synthese");
    expect(await screen.findByText("Effectif actif")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("38.5 %")).toBeInTheDocument();
    expect(screen.getByText("+4.2%")).toBeInTheDocument();
    expect(screen.getByTitle("Définition de Effectif actif")).toBeInTheDocument();
    // L'alerte est un vrai lien (clic droit / Ctrl+clic : nouvel onglet).
    expect(screen.getByRole("link", { name: /arrivent à échéance/ })).toHaveAttribute("href", "/statistiques/contrats");
    expect(api.get).toHaveBeenCalledWith("/reporting/rh/synthese/", expect.objectContaining({ params: expect.any(Object) }));
  });

  test("changer de période recharge sans démonter la page", async () => {
    mockApi(synthese);
    renderPage("synthese");
    await screen.findByText("Effectif actif");
    fireEvent.click(screen.getByText("30 jours"));
    await waitFor(() =>
      expect(api.get.mock.calls.filter(([u]) => u === "/reporting/rh/synthese/")).toHaveLength(2));
    expect(screen.getByText("Effectif actif")).toBeInTheDocument();
  });

  test("export Excel avec le paramètre fmt", async () => {
    mockApi(synthese);
    global.URL.createObjectURL = jest.fn(() => "blob:x");
    global.URL.revokeObjectURL = jest.fn();
    renderPage("synthese");
    await screen.findByText("Effectif actif");
    fireEvent.click(screen.getByText("Exporter"));
    fireEvent.click(screen.getByText("Excel (.xlsx)"));
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith("/reporting/rh/synthese/", expect.objectContaining({
        params: expect.objectContaining({ fmt: "xlsx" }), responseType: "blob",
      })),
    );
  });

  test("message d'erreur si l'API échoue", async () => {
    api.get.mockRejectedValue(new Error("boom"));
    renderPage("synthese");
    expect(await screen.findByText("Impossible de charger ce rapport.")).toBeInTheDocument();
  });

  test("page inconnue : redirection vers la synthèse", async () => {
    mockApi(synthese);
    renderPage("salaires");
    expect(await screen.findByText("Effectif actif")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/reporting/rh/synthese/", expect.any(Object));
  });
});

describe("Reporting RH — pages", () => {
  test("Parité : pyramide par sexe et cellule masquée", async () => {
    api.get.mockResolvedValue({ data: {
      periode, kpis: [kpi("taux_feminisation", "Taux de féminisation", 40, { unite: "%" })],
      repartition: [{ nom: "Hommes", count: 6 }, { nom: "Femmes", count: 4 }],
      pyramide_age_sexe: [{ tranche: "25-34", hommes: 2, femmes: 3, non_renseigne: 0 }],
      encadrement: [], recrutements: [], anciennete_par_sexe: [],
      par_direction: [
        { nom: "DG", hommes: 4, femmes: 3, non_renseigne: 0, total: 7, taux_feminisation: 42.9, masque: false },
        { nom: "Isolée", hommes: null, femmes: null, non_renseigne: null, total: 1, taux_feminisation: null, masque: true },
      ],
      par_departement: [], par_categorie: [], par_type_contrat: [], par_fonction: [],
    } });
    renderPage("parite");
    expect((await screen.findAllByText("Hommes")).length).toBeGreaterThan(0);
    expect(screen.getByText("25-34")).toBeInTheDocument();
    expect(screen.getByText("42.9 %")).toBeInTheDocument();
    expect(screen.getByTitle(/Effectif trop faible/)).toBeInTheDocument();
  });

  test("Démographie : changer l'horizon recharge avec horizon", async () => {
    api.get.mockResolvedValue({ data: {
      periode, horizon: 5, deja_atteint: 0, kpis: [], pyramide_age: [], pyramide_anciennete: [],
      previsions: [{ annee: 1, fin: "2027-10-30", departs: 2, fins_cdd: 1, effectif_projete: 40 }],
      par_direction: [],
      postes_a_risque: [{ poste: "Comptable", nb_titulaires: 1, premiere_retraite: "2027-03-01",
        titulaires: [{ matricule: "M1", nom: "Ali Ben", date_retraite: "2027-03-01" }] }],
    } });
    renderPage("demographie");
    expect(await screen.findByText("Comptable")).toBeInTheDocument();
    expect(screen.getByText(/Ali Ben/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Horizon"), { target: { value: "3" } });
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith("/reporting/rh/demographie/", { params: expect.objectContaining({ horizon: 3 }) }),
    );
  });

  test("Contrats : un contrat échu ouvre la fiche par matricule", async () => {
    api.get.mockResolvedValue({ data: {
      periode, kpis: [], echeance_jours: 90, contrats_echeance: [], cdd_enchaines: [], repartition_type_contrat: [],
      contrats_echus: [{ id: "c1", numero_contrat: "C-9", employee_matricule: "020782", employee_nom: "Luc Martin", date_fin: "2026-10-01", jours_depasses: 29 }],
    } });
    renderPage("contrats");
    fireEvent.click(await screen.findByText("C-9"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees/020782");
  });

  test("Qualité : la donnée « Sexe » manquante mène à la liste filtrée", async () => {
    api.get.mockResolvedValue({ data: {
      periode, kpis: [], completude_par_direction: [], completude_par_departement: [], incoherences: [],
      champs_manquants: [{ champ: "sexe", libelle: "Sexe", nb: 12, taux: 30 }],
    } });
    renderPage("qualite");
    fireEvent.click(await screen.findByText("Sexe"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees?sexe=non_renseigne");
  });

  test("Activité : tableau par administrateur réservé au SUPERADMIN", async () => {
    mockRole = "SUPERADMIN";
    api.get.mockResolvedValue({ data: {
      periode, kpis: [], mon_activite: { employes_crees: 3 },
      activite_par_admin: [{ id: "u1", username: "a1", nom_complet: "Amine K", role: "ADMIN", employes_crees: 3 }],
    } });
    renderPage("activite");
    expect(await screen.findByText("Amine K")).toBeInTheDocument();
  });
});


describe("Reporting RH — pages ajoutées", () => {
  test("Synthèse : faits marquants et objectif affiché sur la tuile", async () => {
    mockApi({
      periode,
      kpis: [kpi("completude", "Complétude des dossiers", 80, { unite: "%", cible: 95, sens: "au_moins", atteint: false })],
      alertes: [],
      faits_marquants: [{ texte: "Les sorties ont augmenté de 60 %", lien: "/statistiques/mouvements" }],
    });
    renderPage("synthese");
    expect(await screen.findByText("cible ≥ 95")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Les sorties ont augmenté/));
    expect(mockNavigate).toHaveBeenCalledWith("/statistiques/mouvements");
  });

  test("Comparaison des unités : cellule défavorable colorée, ligne Organisation", async () => {
    mockApi({
      periode, kpis: [], horizon: 5,
      colonnes: [{ code: "completude", libelle: "Complétude", definition: "d", sens: "haut" }],
      lignes: [{ nom: "DG", total: 5, completude: 40, masque: false }],
      organisation: { completude: 80 },
    });
    renderPage("unites");
    expect(await screen.findByText("Organisation")).toBeInTheDocument();
    expect(screen.getByText("40").style.background).not.toBe("");
    expect(screen.getByText("80").style.background).toBe("");
  });

  test("Mouvements : rétention par promotion", async () => {
    mockApi({
      periode, kpis: [], evolution: [], par_motif: [], sorties_par_sexe: [], par_direction: [],
      retention: [{ annee: 2022, recrutes: 10, inconnus: 0, a_1_an: 90, a_3_an: 70, a_5_an: null }],
    });
    renderPage("mouvements");
    expect(await screen.findByText("2022")).toBeInTheDocument();
    expect(screen.getByText("90 %")).toBeInTheDocument();
  });

  test("Congés : page refusée à un ADMIN non chargé des congés", async () => {
    mockApi({ periode, kpis: [], alertes: [] });
    renderPage("conges");
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/reporting/rh/synthese/", expect.any(Object)));
    expect(api.get).not.toHaveBeenCalledWith("/reporting/rh/conges/", expect.any(Object));
  });
});


describe("Reporting RH — droit acces_statistiques", () => {
  afterEach(() => { mockStats = true; });

  test("un ADMIN sans le droit n'appelle aucun rapport et ne voit aucune page", async () => {
    mockStats = false;
    mockApi({ periode, kpis: [], alertes: [] });
    renderPage("effectifs");
    await new Promise((r) => setTimeout(r, 50));
    expect(api.get).not.toHaveBeenCalledWith("/reporting/rh/effectifs/", expect.any(Object));
    expect(api.get).not.toHaveBeenCalledWith("/reporting/rh/synthese/", expect.any(Object));
  });
});
