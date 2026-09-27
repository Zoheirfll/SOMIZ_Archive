/**
 * Tests — pages/Statistiques.jsx
 * Couvre : rendu, redirection CONSULTANT, indicateurs, filtres, sections,
 * export Excel/PDF.
 */

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
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import Statistiques from "../pages/Statistiques";

const render = (ui, options) => rtlRender(ui, { wrapper: ThemeProvider, ...options });

const baseStats = {
  periode: { debut: "2026-01-01", fin: "2026-12-31" },
  indicateurs: {
    recrutements: { valeur: 12, variation_pct: 8.3 },
    archivages: { valeur: 3, variation_pct: -25 },
    dossiers_completes: { valeur: 5, variation_pct: null },
  },
  repartition_direction: [],
  repartition_departement: [],
  repartition_categorie: [],
  repartition_type_contrat: [],
  repartition_fonction: [],
  evolution_mensuelle: [],
  pyramide_age: [],
  pyramide_anciennete: [],
  contrats_echeance: [],
  completude_par_direction: [],
  completude_par_departement: [],
  mon_activite: {
    employes_crees: 4, employes_transferts: 3, employes_carriere: 2, employes_champs: 1,
    employes_photo: 0, employes_archives: 1, employes_restaures: 0, employes_supprimes: 0,
    employes_autres: 0, contrats_crees_modifies: 0, contrats_supprimes: 0,
    documents_uploades: 20, documents_supprimes: 2, documents_modifies: 5, comptes_mdp: 0,
  },
};

const renderPage = (role = "ADMIN") => {
  useAuth.mockReturnValue({ user: { role, username: "admin" } });
  return render(
    <MemoryRouter>
      <Statistiques />
    </MemoryRouter>
  );
};

beforeEach(() => jest.clearAllMocks());

describe("Statistiques — accès CONSULTANT", () => {
  test("redirige un CONSULTANT vers /employees", async () => {
    useAuth.mockReturnValue({ user: { role: "CONSULTANT" } });
    render(
      <MemoryRouter>
        <Statistiques />
      </MemoryRouter>
    );
    expect(mockNavigate).toHaveBeenCalledWith("/employees");
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe("Statistiques — chargement et indicateurs", () => {
  test("fetch stats-detail au montage et affiche les indicateurs", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/reporting/stats-detail/", expect.objectContaining({ params: expect.any(Object) })
    ));
    expect(await screen.findByText("Recrutements")).toBeInTheDocument();
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("Archivages")).toBeInTheDocument();
    expect(screen.getByText("Dossiers complétés")).toBeInTheDocument();
  });

  test("affiche un message d'erreur si l'API échoue", async () => {
    api.get.mockRejectedValueOnce(new Error("network"));
    renderPage();
    expect(await screen.findByText(/impossible de charger/i)).toBeInTheDocument();
  });
});

describe("Statistiques — filtres", () => {
  test("clic sur un préréglage refetch avec de nouveaux paramètres de date", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage();
    await screen.findByText("Recrutements");
    api.get.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "30 jours" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/reporting/stats-detail/",
      expect.objectContaining({
        params: expect.objectContaining({ date_debut: expect.any(String), date_fin: expect.any(String) }),
      })
    ));
  });

  test("changer la plage libre refetch avec les dates saisies", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage();
    await screen.findByText("Recrutements");
    api.get.mockClear();
    fireEvent.change(screen.getByLabelText("Date début"), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByLabelText("Date fin"), { target: { value: "2026-02-28" } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/reporting/stats-detail/",
      expect.objectContaining({ params: { date_debut: "2026-02-01", date_fin: "2026-02-28", echeance_jours: 90 } })
    ));
  });
});

describe("Statistiques — seuil d'échéance réglable", () => {
  test("le titre de la section reflète le seuil par défaut (90 jours)", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage();
    expect(await screen.findByText("Contrats arrivant à échéance (90 jours)")).toBeInTheDocument();
  });

  test("changer le seuil refetch avec le nouveau nombre de jours et met à jour le titre", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage();
    await screen.findByText("Recrutements");
    api.get.mockClear();
    fireEvent.change(screen.getByLabelText("Seuil"), { target: { value: "180" } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/reporting/stats-detail/",
      expect.objectContaining({ params: expect.objectContaining({ echeance_jours: 180 }) })
    ));
    expect(await screen.findByText("Contrats arrivant à échéance (180 jours)")).toBeInTheDocument();
  });

  test("un seuil personnalisé refetch avec la valeur saisie", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage();
    await screen.findByText("Recrutements");
    fireEvent.change(screen.getByLabelText("Seuil"), { target: { value: "custom" } });
    api.get.mockClear();
    fireEvent.blur(screen.getByLabelText("Seuil personnalisé (jours)"), { target: { value: "45" } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/reporting/stats-detail/",
      expect.objectContaining({ params: expect.objectContaining({ echeance_jours: 45 }) })
    ));
  });
});

describe("Statistiques — répartitions organisation et profils", () => {
  test("affiche les sections de répartition organisationnelle et profils", async () => {
    api.get.mockResolvedValue({
      data: {
        ...baseStats,
        repartition_direction: [{ id: "d1", slug: "d1", nom: "Direction Générale", count: 10 }],
        repartition_categorie: [{ nom: "Cadre", count: 7 }],
      },
    });
    renderPage();
    expect(await screen.findByText("Direction Générale")).toBeInTheDocument();
    expect(await screen.findByText("Cadre")).toBeInTheDocument();
  });

  test("clic sur une barre Direction navigue vers /employees filtré", async () => {
    api.get.mockResolvedValue({
      data: { ...baseStats, repartition_direction: [{ id: "d1", slug: "d1", nom: "Direction Générale", count: 10 }] },
    });
    renderPage();
    const bar = await screen.findByText("Direction Générale");
    fireEvent.click(bar);
    expect(mockNavigate).toHaveBeenCalledWith("/employees?direction=d1");
  });
});

describe("Statistiques — évolution et pyramides", () => {
  test("affiche les sections évolution et pyramides démographiques", async () => {
    api.get.mockResolvedValue({
      data: {
        ...baseStats,
        evolution_mensuelle: [{ mois: "2026-01", recrutements: 4, archivages: 1 }],
        pyramide_age: [{ tranche: "25-34", count: 5 }],
        pyramide_anciennete: [{ tranche: "1-3 ans", count: 3 }],
      },
    });
    renderPage();
    expect(await screen.findByText("Évolution — recrutements, archivages, dossiers complétés")).toBeInTheDocument();
    expect(screen.getByText("Pyramide des âges")).toBeInTheDocument();
    expect(screen.getByText("Pyramide d'ancienneté")).toBeInTheDocument();
  });

  test("clic sur une barre de la pyramide des âges navigue vers /employees filtré par tranche", async () => {
    api.get.mockResolvedValue({
      data: { ...baseStats, pyramide_age: [{ tranche: "25-34", count: 5, min: 25, max: 34 }] },
    });
    const { container } = renderPage();
    await screen.findByText("Pyramide des âges");
    // Recharts (ResponsiveContainer) a besoin d'un tick supplémentaire dans
    // jsdom avant de mesurer le conteneur et rendre les barres.
    await waitFor(() => expect(container.querySelector(".recharts-bar-rectangle")).not.toBeNull());
    fireEvent.click(container.querySelector(".recharts-bar-rectangle"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees?age_min=25&age_max=34");
  });

  test("clic sur une barre de la pyramide d'ancienneté navigue vers /employees filtré par tranche", async () => {
    api.get.mockResolvedValue({
      data: { ...baseStats, pyramide_anciennete: [{ tranche: "5-10 ans", count: 4, min: 5, max: 9 }] },
    });
    const { container } = renderPage();
    await screen.findByText("Pyramide d'ancienneté");
    await waitFor(() => expect(container.querySelector(".recharts-bar-rectangle")).not.toBeNull());
    const bars = container.querySelectorAll(".recharts-bar-rectangle");
    fireEvent.click(bars[bars.length - 1]);
    expect(mockNavigate).toHaveBeenCalledWith("/employees?anciennete_min=5&anciennete_max=9");
  });
});

describe("Statistiques — contrats à échéance et complétude", () => {
  test("affiche les contrats à échéance et la complétude par unité", async () => {
    api.get.mockResolvedValue({
      data: {
        ...baseStats,
        contrats_echeance: [{ id: "c1", numero_contrat: "CTR-1", employee_id: "e1", employee_nom: "Jean Dupont", date_fin: "2026-10-01", jours_restants: 10 }],
        completude_par_departement: [{ id: "d1", nom: "Paie", direction_nom: "Direction Générale", total: 10, complets: 6, taux: 60 }],
      },
    });
    renderPage();
    expect(await screen.findByText("CTR-1")).toBeInTheDocument();
    expect(screen.getByText("Jean Dupont")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  test("badge jours restants affiché sur la ligne du contrat", async () => {
    api.get.mockResolvedValue({
      data: {
        ...baseStats,
        contrats_echeance: [{ id: "c1", numero_contrat: "CTR-1", employee_id: "e1", employee_nom: "Jean Dupont", date_fin: "2026-10-01", jours_restants: 10 }],
      },
    });
    renderPage();
    const row = (await screen.findByText("CTR-1")).closest("tr");
    const badge = row.querySelector('[data-testid="jours-restants-badge"]');
    expect(badge).toHaveTextContent("10");
  });

  test("clic sur une barre de complétude Département navigue vers /employees filtré incomplets", async () => {
    api.get.mockResolvedValue({
      data: {
        ...baseStats,
        completude_par_departement: [{ id: "dpt1", slug: "dpt1", nom: "Paie", direction_nom: "Direction Générale", total: 10, complets: 6, taux: 60 }],
      },
    });
    renderPage();
    const bar = await screen.findByText("Paie");
    fireEvent.click(bar);
    expect(mockNavigate).toHaveBeenCalledWith("/employees?departement=dpt1&dossier_complet=0");
  });

  test("clic sur une ligne de complétude Direction navigue vers /employees filtré incomplets", async () => {
    api.get.mockResolvedValue({
      data: {
        ...baseStats,
        completude_par_direction: [{ id: "dir1", slug: "dir1", nom: "Direction Générale", total: 20, complets: 15, taux: 75 }],
      },
    });
    renderPage();
    const rows = await screen.findAllByText("Direction Générale");
    fireEvent.click(rows[rows.length - 1]);
    expect(mockNavigate).toHaveBeenCalledWith("/employees?direction=dir1&dossier_complet=0");
  });
});

describe("Statistiques — export", () => {
  test("Exporter > Excel télécharge le xlsx avec les filtres courants", async () => {
    const blob = new Blob(["fake"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    api.get.mockImplementation((url) => {
      if (url === "/reporting/stats-export.xlsx/") return Promise.resolve({ data: blob });
      return Promise.resolve({ data: baseStats });
    });
    global.URL.createObjectURL = jest.fn(() => "blob:fake-url");
    global.URL.revokeObjectURL = jest.fn();
    renderPage();
    await screen.findByText("Recrutements");
    fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
    fireEvent.click(screen.getByRole("button", { name: "Excel (.xlsx)" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/reporting/stats-export.xlsx/",
      expect.objectContaining({ responseType: "blob" })
    ));
  });

  test("Exporter > PDF déclenche window.print", async () => {
    window.print = jest.fn();
    api.get.mockResolvedValue({ data: baseStats });
    renderPage();
    await screen.findByText("Recrutements");
    fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
    fireEvent.click(screen.getByRole("button", { name: "PDF (impression)" }));
    expect(window.print).toHaveBeenCalled();
  });
});

describe("Statistiques — mon activité", () => {
  test("affiche uniquement les compteurs d'activité non nuls du compte connecté", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage("ADMIN");
    await screen.findByText("Recrutements");
    expect(screen.getByText("Mon activité")).toBeInTheDocument();
    expect(screen.getByText("Employés")).toBeInTheDocument();
    expect(screen.getByText("Créés")).toBeInTheDocument();
    expect(screen.getByText("4", { selector: "a" })).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Uploadés")).toBeInTheDocument();
    expect(screen.getByText("20", { selector: "a" })).toBeInTheDocument();
  });

  test("masque un compteur à zéro (ex. employés archivés)", async () => {
    api.get.mockResolvedValue({
      data: { ...baseStats, mon_activite: { ...baseStats.mon_activite, employes_archives: 0 } },
    });
    renderPage("ADMIN");
    await screen.findByText("Recrutements");
    expect(screen.queryByText("Archivés")).not.toBeInTheDocument();
  });

  test("regroupe les compteurs par entité (Employés/Documents...)", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage("ADMIN");
    await screen.findByText("Recrutements");
    expect(screen.getByText("Employés")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Transférés (organisation)")).toBeInTheDocument();
    expect(screen.getByText("Carrière (fonction/catégorie/échelle)")).toBeInTheDocument();
  });

  test("affiche un lien vers le journal d'audit du compte connecté", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage("ADMIN");
    await screen.findByText("Recrutements");
    const link = screen.getByText("Voir mon journal d'audit →");
    expect(link.getAttribute("href")).toBe("/audit?user=admin&date_debut=2026-01-01&date_fin=2026-12-31");
  });

  test("chaque tuile d'activité est un lien vers /audit filtré par catégorie", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage("ADMIN");
    await screen.findByText("Recrutements");
    const tile = screen.getByText("4", { selector: "a" });
    expect(tile).not.toBeNull();
    expect(tile.getAttribute("href")).toBe(
      "/audit?user=admin&date_debut=2026-01-01&date_fin=2026-12-31&categorie=employes_crees"
    );
  });

  test("la tuile Documents uploadés porte une info-bulle d'avertissement", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage("ADMIN");
    await screen.findByText("Recrutements");
    const tile = screen.getByText("20").closest("a");
    expect(tile.getAttribute("title")).toMatch(/reste dans cette liste/);
  });

  test("affiche un message si aucune activité sur la période", async () => {
    api.get.mockResolvedValue({
      data: {
        ...baseStats,
        mon_activite: {
          employes_crees: 0, employes_transferts: 0, employes_carriere: 0, employes_champs: 0,
          employes_photo: 0, employes_archives: 0, employes_restaures: 0, employes_supprimes: 0,
          employes_autres: 0, contrats_crees_modifies: 0, contrats_supprimes: 0,
          documents_uploades: 0, documents_supprimes: 0, documents_modifies: 0, comptes_mdp: 0,
        },
      },
    });
    renderPage("ADMIN");
    await screen.findByText("Recrutements");
    expect(screen.getByText("Aucune activité sur cette période.")).toBeInTheDocument();
  });

  test("un ADMIN normal ne voit pas la section Activité par administrateur", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage("ADMIN");
    await screen.findByText("Recrutements");
    expect(screen.queryByText("Activité par administrateur")).not.toBeInTheDocument();
  });

  test("un SUPERADMIN voit la section Activité par administrateur avec une ligne par compte, colonnes non nulles seulement", async () => {
    api.get.mockResolvedValue({
      data: {
        ...baseStats,
        activite_par_admin: [
          {
            id: "a1", username: "jadmin", nom_complet: "Jean Admin", role: "ADMIN",
            employes_crees: 4, employes_transferts: 0, employes_carriere: 0, employes_champs: 0,
            employes_archives: 0, employes_restaures: 0, employes_supprimes: 0,
            contrats_crees_modifies: 0, contrats_supprimes: 0,
            documents_uploades: 20, documents_supprimes: 0, documents_modifies: 0, comptes_mdp: 0,
          },
          {
            id: "a2", username: "msuper", nom_complet: "Marie Super", role: "SUPERADMIN",
            employes_crees: 0, employes_transferts: 0, employes_carriere: 0, employes_champs: 0,
            employes_archives: 0, employes_restaures: 0, employes_supprimes: 0,
            contrats_crees_modifies: 0, contrats_supprimes: 0,
            documents_uploades: 0, documents_supprimes: 0, documents_modifies: 0, comptes_mdp: 0,
          },
        ],
      },
    });
    renderPage("SUPERADMIN");
    await screen.findByText("Recrutements");
    expect(screen.getByText("Activité par administrateur")).toBeInTheDocument();
    expect(screen.getByText("Jean Admin")).toBeInTheDocument();
    expect(screen.getByText("Marie Super")).toBeInTheDocument();
    // "Transférés" est nul pour toutes les lignes -> colonne masquée
    expect(screen.queryByRole("columnheader", { name: "Transférés" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Créés" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Doc. uploadés" })).toBeInTheDocument();
    // Lien "Audit →" par ligne, pré-filtré sur le compte + la période
    const links = screen.getAllByText("Audit →");
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("/audit?user=jadmin&date_debut=2026-01-01&date_fin=2026-12-31");
    // Chaque cellule de compteur est elle-même un lien filtré par catégorie
    const fourLinks = screen.getAllByText("4").map((el) => el.closest("a")).filter(Boolean);
    const createdCell = fourLinks.find((a) => a.getAttribute("href")?.includes("categorie=employes_crees") && a.getAttribute("href")?.includes("jadmin"));
    expect(createdCell).toBeTruthy();
    expect(createdCell.getAttribute("href")).toBe(
      "/audit?user=jadmin&date_debut=2026-01-01&date_fin=2026-12-31&categorie=employes_crees"
    );
  });
});
