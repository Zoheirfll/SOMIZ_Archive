import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "GESTIONNAIRE", id: "u1", can_request_conges: true } }),
}));

import api from "../services/api";
import CongeNouvelle from "../pages/CongeNouvelle";

const EMPLOYE = {
  id: "e1", prenom: "Ali", nom: "Benali", matricule: "123456",
  poste_nom: "Agent", direction_nom: "DRH", departement_nom: "Paie", service_nom: "Service 1",
  date_embauche: "2015-01-01",
};

const MOTIFS = [
  { id: 1, nom: "Congé annuel", type_conge: "CP", nb_jours_fixe: null, is_active: true, pieces: [] },
  {
    id: 2, nom: "Mariage", type_conge: "CE", nb_jours_fixe: 3, is_active: true,
    pieces: [{ id: 7, libelle: "Acte de mariage", is_active: true }, { id: 8, libelle: "Ancienne", is_active: false }],
  },
  { id: 3, nom: "Désactivé", type_conge: "CP", nb_jours_fixe: null, is_active: false, pieces: [] },
];

const SOLDE = {
  initialise: true,
  solde: {
    exercices: [
      { exercice: "2025/2026", categorie: "RELIQUAT", restant: 13 },
      { exercice: "2026/2027", categorie: "ACTUEL", restant: 30 },
      { exercice: "2027/2028", categorie: "ANTICIPE", restant: 30 },
    ],
  },
};

function Detail() {
  const location = useLocation();
  return <div>DETAIL {location.state?.avertissement}</div>;
}

const renderPage = () =>
  rtlRender(
    <MemoryRouter initialEntries={[{ pathname: "/conges/nouvelle", state: { employeeId: "e1" } }]}>
      <Routes>
        <Route path="/conges/nouvelle" element={<CongeNouvelle />} />
        <Route path="/conges/:ref" element={<Detail />} />
      </Routes>
    </MemoryRouter>,
    { wrapper: ThemeProvider },
  );

const choisirMotif = (id) => fireEvent.change(screen.getByLabelText(/^Motif$/i), { target: { value: String(id) } });

const remplir = async () => {
  await screen.findByText(/Ali Benali/);
  await screen.findByRole("option", { name: "Congé annuel" });
  choisirMotif(1);
  fireEvent.change(screen.getByLabelText(/Date de départ/i), { target: { value: "2026-11-01" } });
  fireEvent.change(screen.getByLabelText(/Date de retour/i), { target: { value: "2026-11-11" } });
  fireEvent.change(screen.getByLabelText(/Adresse durant le congé/i), { target: { value: "12 rue des Oliviers" } });
};

let solde;

beforeEach(() => {
  jest.resetAllMocks();
  solde = SOLDE;
  api.get.mockImplementation((url) => {
    if (url === "/employees/search/") return Promise.resolve({ data: [EMPLOYE] });
    if (url === "/conges/motifs/") return Promise.resolve({ data: MOTIFS });
    if (url.startsWith("/conges/soldes/")) return Promise.resolve({ data: solde });
    if (url.endsWith("/contrats/")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: EMPLOYE });
  });
});

describe("CongeNouvelle — employé et dates", () => {
  test("affiche les infos de l'employé en lecture seule dès la sélection", async () => {
    renderPage();
    expect(await screen.findByText(/Ali Benali/)).toBeInTheDocument();
    expect(screen.getByText(/123456/)).toBeInTheDocument();
    expect(screen.getByText(/Agent/)).toBeInTheDocument();
    expect(screen.getByText(/DRH › Paie › Service 1/)).toBeInTheDocument();
    expect(screen.getByText(/Recruté\(e\) le 01\/01\/2015/)).toBeInTheDocument();
  });

  test("préremplit le nombre de jours depuis les dates et respecte une saisie manuelle", async () => {
    renderPage();
    await screen.findByText(/Ali Benali/);
    fireEvent.change(screen.getByLabelText(/Date de départ/i), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText(/Date de retour/i), { target: { value: "2026-11-11" } });
    expect(screen.getByLabelText(/Nombre de jours/i).value).toBe("10");
    fireEvent.change(screen.getByLabelText(/Nombre de jours/i), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText(/Date de retour/i), { target: { value: "2026-11-12" } });
    expect(screen.getByLabelText(/Nombre de jours/i).value).toBe("8");
  });
});

describe("CongeNouvelle — type, motif, exercice", () => {
  test("les motifs sont filtrés par type et les inactifs masqués", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Congé annuel" });
    const motif = screen.getByLabelText(/^Motif$/i);
    expect(within(motif).queryByText("Désactivé")).not.toBeInTheDocument();
    expect(within(motif).queryByText(/Mariage/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Type de congé/i), { target: { value: "CE" } });
    expect(within(motif).getByText("Mariage (3 j)")).toBeInTheDocument();
    expect(within(motif).queryByText("Congé annuel")).not.toBeInTheDocument();
  });

  test("un motif à durée fixe verrouille le nombre de jours et calcule la date de retour", async () => {
    renderPage();
    await screen.findByText(/Ali Benali/);
    fireEvent.change(screen.getByLabelText(/Type de congé/i), { target: { value: "CE" } });
    fireEvent.change(screen.getByLabelText(/Date de départ/i), { target: { value: "2026-11-01" } });
    await screen.findByRole("option", { name: "Mariage (3 j)" });
    choisirMotif(2);
    expect(screen.getByLabelText(/Nombre de jours/i)).toHaveValue(3);
    expect(screen.getByLabelText(/Nombre de jours/i)).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/Date de retour/i)).toHaveValue("2026-11-04");
    fireEvent.change(screen.getByLabelText(/Date de départ/i), { target: { value: "2026-11-10" } });
    expect(screen.getByLabelText(/Date de retour/i)).toHaveValue("2026-11-13");
    expect(screen.getByText(/Durée fixée par le motif « Mariage » : 3 jour/)).toBeInTheDocument();
  });

  test("l'exercice est une liste groupée qui propose d'office le reliquat le plus ancien", async () => {
    renderPage();
    const liste = await screen.findByLabelText(/^Exercice$/i);
    await waitFor(() => expect(liste).toHaveValue("2025/2026"));
    expect(within(liste).getByRole("option", { name: "2025/2026 — 13 j restants" })).not.toBeDisabled();
    expect(within(liste).getByRole("option", { name: "2026/2027 — 30 j restants" })).toBeDisabled();
    expect(liste.querySelectorAll("optgroup")).toHaveLength(3);
    expect(liste.querySelector("optgroup").getAttribute("label")).toBe("Reliquat");
  });

  test("sans solde initialisé, l'exercice est laissé au traiteur", async () => {
    solde = { initialise: false, solde: null };
    renderPage();
    expect(await screen.findByText(/choisira l'exercice à la validation/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Exercice$/i)).not.toBeInTheDocument();
  });

  test("pas d'exercice pour un congé exceptionnel", async () => {
    renderPage();
    await screen.findByLabelText(/^Exercice$/i);
    fireEvent.change(screen.getByLabelText(/Type de congé/i), { target: { value: "CE" } });
    expect(screen.queryByLabelText(/^Exercice$/i)).not.toBeInTheDocument();
  });
});

describe("CongeNouvelle — envoi", () => {
  test("envoie type, motif et exercice puis redirige vers la référence encodée", async () => {
    api.post.mockResolvedValue({ data: { reference: "00001/26" } });
    renderPage();
    await remplir();
    await waitFor(() => expect(screen.getByLabelText(/^Exercice$/i)).toHaveValue("2025/2026"));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/conges/demandes/", expect.objectContaining({
        employee: "e1", type_conge: "CP", motif: 1, exercice: "2025/2026",
        date_depart: "2026-11-01", date_retour: "2026-11-11", nb_jours: 10, adresse_conge: "12 rue des Oliviers",
      })),
    );
    expect(await screen.findByText("DETAIL")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);  // aucune pièce jointe choisie
  });

  test("téléverse les pièces jointes après la création et signale un échec sans perdre la demande", async () => {
    api.post.mockImplementation((url) => {
      if (url === "/conges/demandes/") return Promise.resolve({ data: { reference: "00002/26" } });
      if (url.endsWith("/pieces/")) return Promise.reject({ response: { data: { fichier: ["Type de fichier non autorisé."] } } });
      return Promise.resolve({ data: {} });
    });
    renderPage();
    await screen.findByText(/Ali Benali/);
    fireEvent.change(screen.getByLabelText(/Type de congé/i), { target: { value: "CE" } });
    fireEvent.change(screen.getByLabelText(/Date de départ/i), { target: { value: "2026-11-01" } });
    await screen.findByRole("option", { name: "Mariage (3 j)" });
    choisirMotif(2);
    fireEvent.change(screen.getByLabelText(/Adresse durant le congé/i), { target: { value: "Oran" } });
    expect(screen.queryByLabelText("Ancienne")).not.toBeInTheDocument();  // pièce attendue inactive
    const fichier = new File(["%PDF"], "acte.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Acte de mariage"), { target: { files: [fichier] } });
    fireEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/conges/demandes/00002-26/pieces/", expect.any(FormData), expect.anything(),
    ));
    const form = api.post.mock.calls.find(([url]) => url.endsWith("/pieces/"))[1];
    expect(form.get("piece")).toBe("7");
    expect(await screen.findByText(/acte\.pdf : Type de fichier non autorisé/)).toBeInTheDocument();
  });

  test("affiche l'erreur de chevauchement renvoyée par le serveur", async () => {
    api.post.mockRejectedValue({
      response: { data: { date_depart: ["Cette période chevauche la demande 00001/26 de cet employé."] } },
    });
    renderPage();
    await remplir();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    expect(await screen.findByText(/chevauche la demande 00001\/26/)).toBeInTheDocument();
  });

  test("refuse l'envoi sans employé sélectionné", async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url === "/conges/motifs/" ? MOTIFS : [] }));
    rtlRender(
      <MemoryRouter initialEntries={["/conges/nouvelle"]}>
        <CongeNouvelle />
      </MemoryRouter>,
      { wrapper: ThemeProvider },
    );
    await screen.findByRole("option", { name: "Congé annuel" });
    choisirMotif(1);
    fireEvent.change(screen.getByLabelText(/Date de départ/i), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText(/Date de retour/i), { target: { value: "2026-11-11" } });
    fireEvent.change(screen.getByLabelText(/Adresse durant le congé/i), { target: { value: "Oran" } });
    fireEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    expect(await screen.findByText(/Sélectionnez un employé/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
