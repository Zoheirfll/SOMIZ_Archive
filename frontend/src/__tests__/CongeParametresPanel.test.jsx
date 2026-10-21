import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

import api from "../services/api";
import CongeParametresPanel from "../components/parametres/CongeParametresPanel";

const MOTIFS = [
  { id: 1, nom: "Congé annuel", type_conge: "CP", is_active: true },
  { id: 2, nom: "Mariage", type_conge: "CE", is_active: true, nb_jours_fixe: 3,
    pieces: [{ id: 7, libelle: "Acte de mariage", is_active: true }] },
  { id: 3, nom: "Ancien motif", type_conge: "CE", is_active: false },
];

const render = () => rtlRender(<CongeParametresPanel theme={{}} />, { wrapper: ThemeProvider });

beforeEach(() => {
  jest.resetAllMocks();
  api.get.mockImplementation((url) => {
    if (url === "/conges/parametres/") return Promise.resolve({ data: { droit_annuel_jours: 30 } });
    if (url === "/conges/motifs/") return Promise.resolve({ data: MOTIFS });
    return Promise.resolve({ data: {} });
  });
});

describe("CongeParametresPanel — droit annuel", () => {
  test("affiche le droit annuel courant", async () => {
    render();
    // Le champ existe avant la fin du chargement : on attend la valeur.
    const champ = await screen.findByLabelText("Droit annuel (jours par exercice)");
    await waitFor(() => expect(champ).toHaveValue(30));
  });

  test("enregistre un nouveau droit annuel", async () => {
    api.put.mockResolvedValue({ data: { droit_annuel_jours: 35 } });
    render();
    const champ = await screen.findByLabelText("Droit annuel (jours par exercice)");
    fireEvent.change(champ, { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le droit annuel" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/conges/parametres/", { droit_annuel_jours: 35 }));
    expect(await screen.findByText(/Droit annuel enregistré/)).toBeInTheDocument();
  });

  test("affiche l'erreur renvoyée par le serveur", async () => {
    // Valeur acceptée par la validation native du champ (1-90) mais refusée par le serveur.
    api.put.mockRejectedValue({ response: { data: { droit_annuel_jours: ["Le droit annuel doit être compris entre 1 et 90 jours."] } } });
    render();
    const champ = await screen.findByLabelText("Droit annuel (jours par exercice)");
    await waitFor(() => expect(champ).toHaveValue(30));
    fireEvent.change(champ, { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le droit annuel" }));
    expect(await screen.findByText(/compris entre 1 et 90/)).toBeInTheDocument();
  });
});

describe("CongeParametresPanel — motifs", () => {
  test("liste les motifs par type, les inactifs sont signalés", async () => {
    render();
    expect(await screen.findByText("Congé annuel")).toBeInTheDocument();
    expect(screen.getByText("Mariage")).toBeInTheDocument();
    expect(screen.getByText("Ancien motif")).toBeInTheDocument();
    expect(screen.getByText("inactif")).toBeInTheDocument();
  });

  test("ajoute un motif pour un type", async () => {
    api.post.mockResolvedValue({ data: { id: 9, nom: "Décès d'un proche", type_conge: "CE", is_active: true } });
    render();
    await screen.findByText("Congé annuel");
    fireEvent.change(screen.getByLabelText("Nouveau motif"), { target: { value: "Décès d'un proche" } });
    fireEvent.change(screen.getByLabelText("Type du nouveau motif"), { target: { value: "CE" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter le motif" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/conges/motifs/", { nom: "Décès d'un proche", type_conge: "CE" }),
    );
  });

  test("désactive un motif actif (jamais supprimé)", async () => {
    api.delete.mockResolvedValue({});
    render();
    fireEvent.click(await screen.findByRole("button", { name: "Désactiver Mariage" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/conges/motifs/2/"));
  });

  test("réactive un motif inactif", async () => {
    api.patch.mockResolvedValue({ data: {} });
    render();
    fireEvent.click(await screen.findByRole("button", { name: "Réactiver Ancien motif" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/conges/motifs/3/", { is_active: true }));
  });

  test("refuse un motif vide sans appeler le serveur", async () => {
    render();
    await screen.findByText("Congé annuel");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter le motif" }));
    expect(api.post).not.toHaveBeenCalled();
  });

  test("crée un motif avec une durée fixe", async () => {
    api.post.mockResolvedValue({ data: {} });
    render();
    await screen.findByText("Congé annuel");
    fireEvent.change(screen.getByLabelText("Nouveau motif"), { target: { value: "Naissance" } });
    fireEvent.change(screen.getByLabelText("Type du nouveau motif"), { target: { value: "CE" } });
    fireEvent.change(screen.getByLabelText(/Durée fixe \(j/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter le motif" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/conges/motifs/", { nom: "Naissance", type_conge: "CE", nb_jours_fixe: 3 },
    ));
  });

  test("modifie ou retire la durée fixe d'un motif existant", async () => {
    api.patch.mockResolvedValue({ data: {} });
    render();
    const duree = await screen.findByLabelText("Durée fixe de Mariage");
    await waitFor(() => expect(duree).toHaveValue(3));
    fireEvent.change(duree, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la durée de Mariage" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/conges/motifs/2/", { nb_jours_fixe: null }));
  });

  test("ajoute et désactive une pièce attendue", async () => {
    api.post.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({});
    render();
    expect(await screen.findByText("Pièce : Acte de mariage")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nouvelle pièce pour Mariage"), { target: { value: "Livret de famille" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter la pièce à Mariage" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/conges/motifs/2/pieces/", { libelle: "Livret de famille" }));
    fireEvent.click(screen.getByRole("button", { name: "Désactiver la pièce Acte de mariage" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/conges/motifs/pieces/7/"));
  });

  test("affiche l'erreur de doublon renvoyée par le serveur", async () => {
    api.post.mockRejectedValue({ response: { data: { nom: ["Ce motif existe déjà pour ce type de congé."] } } });
    render();
    await screen.findByText("Congé annuel");
    fireEvent.change(screen.getByLabelText("Nouveau motif"), { target: { value: "Mariage" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter le motif" }));
    expect(await screen.findByText(/existe déjà/)).toBeInTheDocument();
  });
});
