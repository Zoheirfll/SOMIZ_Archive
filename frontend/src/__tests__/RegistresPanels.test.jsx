import React from "react";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
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
  reference: "M-00001/26", origine: "manuel", date_depart: "2026-03-01", date_retour: null,
  beneficiaire: "M. Directeur", employe: "Dupont Jean", matricule: "EMP-001", fonction: "Ingénieur",
  service: "Paie", numero_contrat: "CTR-1", type_documents: "Dossier", nombre_documents: 3,
  observation: "", annulee: false, motif_annulation: "",
};
const CONSULTATION = { ...MANUEL, reference: "C-00002/26", origine: "consultation", date_retour: "2026-03-04" };
const ANNULEE = { ...MANUEL, reference: "M-00003/26", annulee: true, motif_annulation: "Doublon" };

describe("MouvementsPanel", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    telechargerRegistre.mockResolvedValue(undefined);
  });

  test("affiche manuel et consultation, sans action de modification sur la consultation", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [MANUEL, CONSULTATION] } });
    render(<MouvementsPanel />);
    expect(await screen.findByText("M-00001/26")).toBeInTheDocument();
    expect(screen.getByText("C-00002/26")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Enregistrer le retour/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Annuler la ligne" })).toHaveLength(1);
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
    await userEvent.type(await screen.findByRole("textbox", { name: "" }), "Doublon{enter}");
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/registres/mouvements/M-00001-26/annuler/", { motif: "Doublon" },
    ));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(prompt).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
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
});
