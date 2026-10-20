import React from "react";
import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));
jest.mock("../utils/registres", () => ({
  ...jest.requireActual("../utils/registres"),
  telechargerRegistre: jest.fn(),
}));

import api from "../services/api";
import { telechargerRegistre } from "../utils/registres";
import MouvementsPanel from "../components/registres/MouvementsPanel";
import ReceptionsPanel from "../components/registres/ReceptionsPanel";

const render = (ui) => rtlRender(ui, { wrapper: ThemeProvider });

const MANUEL = {
  reference: "M-00001/26", date_depart: "2026-03-01", date_retour: null,
  beneficiaire: "M. Directeur", employe: "Dupont Jean", matricule: "EMP-001", fonction: "Ingénieur",
  service: "Paie", numero_contrat: "CTR-1", type_documents: "Dossier", nombre_documents: 3,
  observation: "", saisi_par: "Karim Admin", annulee: false, motif_annulation: "",
};
const RENDU = { ...MANUEL, reference: "M-00002/26", date_retour: "2026-03-04" };
const ANNULEE = { ...MANUEL, reference: "M-00003/26", annulee: true, motif_annulation: "Doublon" };

describe("MouvementsPanel", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    telechargerRegistre.mockResolvedValue(undefined);
  });

  test("n'offre « Enregistrer le retour » que pour les dossiers non rendus, sans colonne Origine", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [MANUEL, RENDU] } });
    render(<MouvementsPanel />);
    expect(await screen.findByText("M-00001/26")).toBeInTheDocument();
    expect(screen.getByText("M-00002/26")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Enregistrer le retour/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Annuler la ligne" })).toHaveLength(2);
    expect(screen.queryByText("Origine")).not.toBeInTheDocument();
    expect(screen.queryByText("Consultation")).not.toBeInTheDocument();
  });

  test("affiche qui a saisi chaque mouvement", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [MANUEL] } });
    render(<MouvementsPanel />);
    expect(await screen.findByRole("columnheader", { name: "Saisi par" })).toBeInTheDocument();
    expect(screen.getByText("Karim Admin")).toBeInTheDocument();
  });

  test("le retour en un clic rafraîchit sans démonter la liste", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [MANUEL] } });
    api.post.mockResolvedValue({ data: {} });
    render(<MouvementsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /Enregistrer le retour/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/registres/mouvements/M-00001-26/retour/", undefined));
    // Rafraîchissement silencieux : la ligne reste affichée, pas de « Chargement… ».
    expect(screen.queryByText("Chargement…")).not.toBeInTheDocument();
    expect(screen.getByText("M-00001/26")).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  test("la ligne annulée porte son motif et n'a plus d'action", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [ANNULEE] } });
    render(<MouvementsPanel />);
    expect(await screen.findByText(/Annulée : Doublon/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enregistrer le retour/ })).not.toBeInTheDocument();
  });

  test("Imprimer et Télécharger passent par telechargerRegistre avec le bon format", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [MANUEL] } });
    render(<MouvementsPanel />);
    await screen.findByText("M-00001/26");
    await userEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    expect(telechargerRegistre).toHaveBeenCalledWith("mouvements", expect.objectContaining({ fmt: "pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Télécharger" }));
    expect(telechargerRegistre).toHaveBeenCalledWith("mouvements", expect.objectContaining({ fmt: "xlsx" }));
  });

  test("l'annulation passe par une modale stylée, jamais window.prompt ni window.confirm", async () => {
    const prompt = jest.spyOn(window, "prompt").mockImplementation(() => null);
    const confirm = jest.spyOn(window, "confirm").mockImplementation(() => false);
    api.get.mockResolvedValue({ data: { annee: 2026, results: [MANUEL] } });
    api.post.mockResolvedValue({ data: {} });
    render(<MouvementsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Annuler la ligne" }));
    await userEvent.type(within(await screen.findByRole("dialog")).getByRole("textbox"), "Doublon{enter}");
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/registres/mouvements/M-00001-26/annuler/", { motif: "Doublon" },
    ));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(prompt).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("MouvementsPanel — suppression définitive et messages d'erreur", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    telechargerRegistre.mockResolvedValue(undefined);
  });

  test("une ligne active n'offre pas « Supprimer » : il faut l'annuler d'abord", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [MANUEL] } });
    render(<MouvementsPanel />);
    await screen.findByText("M-00001/26");
    expect(screen.queryByRole("button", { name: "Supprimer la ligne" })).not.toBeInTheDocument();
  });

  test("une mauvaise référence saisie ne supprime rien", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [ANNULEE] } });
    render(<MouvementsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer la ligne" }));
    await userEvent.type(within(await screen.findByRole("dialog")).getByRole("textbox"), "M-99999/26{enter}");
    expect(await screen.findByText(/ne correspond pas/)).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  test("la bonne référence supprime puis rafraîchit sans démonter la liste", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [ANNULEE] } });
    api.delete.mockResolvedValue({ status: 204 });
    render(<MouvementsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer la ligne" }));
    await userEvent.type(within(await screen.findByRole("dialog")).getByRole("textbox"), "M-00003/26{enter}");
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/registres/mouvements/M-00003-26/"));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Chargement…")).not.toBeInTheDocument();
  });

  test("le vrai message du serveur est affiché (erreur renvoyée sous forme de liste)", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [MANUEL] } });
    api.post.mockRejectedValue({ response: { data: ["Le motif d'annulation est obligatoire."] } });
    render(<MouvementsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Annuler la ligne" }));
    await userEvent.type(within(await screen.findByRole("dialog")).getByRole("textbox"), "x{enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Le motif d'annulation est obligatoire.");
  });
});

describe("MouvementsPanel — pagination et employé", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    telechargerRegistre.mockResolvedValue(undefined);
  });

  const page = (numero) => ({ data: { annee: 2026, count: 120, page: numero, num_pages: 3, results: [MANUEL] } });

  test("Suivant demande la page 2 ; un changement de filtre revient à la page 1", async () => {
    api.get.mockResolvedValue(page(1));
    render(<MouvementsPanel />);
    expect(await screen.findByText("120 lignes")).toBeInTheDocument();
    expect(screen.getByText("Page 1 sur 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Précédent" })).toBeDisabled();

    api.get.mockResolvedValue(page(2));
    await userEvent.click(screen.getByRole("button", { name: "Suivant" }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(
      "/registres/mouvements/", { params: expect.objectContaining({ page: 2 }) },
    ));

    api.get.mockResolvedValue(page(1));
    await userEvent.selectOptions(screen.getByLabelText("Filtre"), "en_cours");
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(
      "/registres/mouvements/", { params: expect.objectContaining({ page: 1, statut: "en_cours" }) },
    ));
  });

  test("pas de boutons de navigation quand il n'y a qu'une page", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, count: 1, page: 1, num_pages: 1, results: [MANUEL] } });
    render(<MouvementsPanel />);
    expect(await screen.findByText("1 ligne")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suivant" })).not.toBeInTheDocument();
  });

  test("la création envoie l'identifiant de l'employé choisi", async () => {
    const employe = { id: "e1", prenom: "Jean", nom: "Dupont", matricule: "EMP-001" };
    api.get.mockImplementation((url) => (
      url === "/employees/search/" ? Promise.resolve({ data: [employe] }) : Promise.resolve(page(1))
    ));
    api.post.mockResolvedValue({ data: {} });
    render(<MouvementsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau mouvement" }));
    await userEvent.type(screen.getByLabelText("Employé concerné (dossier)"), "dup");
    await userEvent.click(await screen.findByRole("option", { name: /Jean Dupont/ }));
    await userEvent.type(screen.getByLabelText(/Type de documents/), "Dossier");
    await userEvent.type(screen.getByLabelText(/Date de départ/), "2026-03-01");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/registres/mouvements/",
      expect.objectContaining({ employee: "e1", type_documents: "Dossier", date_depart: "2026-03-01" }),
    ));
    const corps = api.post.mock.calls[0][1];
    expect(corps).not.toHaveProperty("nom_libre");
  });
});

describe("ReceptionsPanel", () => {
  beforeEach(() => jest.resetAllMocks());

  test("classer en un clic", async () => {
    const reception = {
      slug: "R-00001-26", reference: "R-00001/26", type_document: "Courrier", nombre: 2, expediteur: "DRH",
      date_reception: "2026-03-01", date_classement: null, observation: "", is_active: true, motif_annulation: "",
    };
    api.get.mockResolvedValue({ data: { annee: 2026, results: [reception] } });
    api.post.mockResolvedValue({ data: {} });
    render(<ReceptionsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /Classer/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/registres/receptions/R-00001-26/classer/", undefined));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  test("supprimer une réception annulée exige la saisie de sa référence", async () => {
    const annulee = {
      slug: "R-00005-26", reference: "R-00005/26", type_document: "Courrier", nombre: 1, expediteur: "DRH",
      date_reception: "2026-03-01", date_classement: null, observation: "", is_active: false,
      motif_annulation: "Doublon", saisi_par_nom: "Sara Archiviste",
    };
    api.get.mockResolvedValue({ data: { annee: 2026, results: [annulee] } });
    api.delete.mockResolvedValue({ status: 204 });
    render(<ReceptionsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer la ligne" }));
    await userEvent.type(within(await screen.findByRole("dialog")).getByRole("textbox"), "R-00005/26{enter}");
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/registres/receptions/R-00005-26/"));
  });

  test("affiche qui a saisi chaque réception", async () => {
    const reception = {
      slug: "R-00002-26", reference: "R-00002/26", type_document: "Courrier", nombre: 1, expediteur: "DRH",
      date_reception: "2026-03-01", date_classement: "2026-03-02", observation: "", is_active: true,
      motif_annulation: "", saisi_par_nom: "Sara Archiviste",
    };
    api.get.mockResolvedValue({ data: { annee: 2026, results: [reception] } });
    render(<ReceptionsPanel />);
    expect(await screen.findByText("Sara Archiviste")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Saisi par" })).toBeInTheDocument();
  });
});
