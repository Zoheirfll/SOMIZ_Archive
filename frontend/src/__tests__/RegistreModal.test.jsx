import React from "react";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";
import RegistreModal from "../components/registres/RegistreModal";
import { anneesDisponibles } from "../utils/registres";
import api from "../services/api";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn() } }));

const render = (ui) => rtlRender(ui, { wrapper: ThemeProvider });

const CHAMPS = [
  { name: "type_documents", label: "Type de documents", type: "text", required: true },
  { name: "nombre_documents", label: "Nombre de documents", type: "number", required: true },
  { name: "date_depart", label: "Date de départ", type: "date", required: true },
  { name: "observation", label: "Observation", type: "textarea" },
];

describe("RegistreModal", () => {
  test("soumet les valeurs saisies", async () => {
    const onSubmit = jest.fn();
    render(<RegistreModal titre="Nouveau mouvement" champs={CHAMPS} valeursInitiales={{ nombre_documents: 1 }} onSubmit={onSubmit} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Type de documents/), "Dossier");
    await userEvent.type(screen.getByLabelText(/Date de départ/), "2026-03-01");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type_documents: "Dossier", nombre_documents: 1, date_depart: "2026-03-01",
    }));
  });

  test("n'appelle pas onSubmit si un champ obligatoire est vide", async () => {
    const onSubmit = jest.fn();
    render(<RegistreModal titre="Nouveau" champs={CHAMPS} valeursInitiales={{}} onSubmit={onSubmit} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Type de documents : champ obligatoire/)).toBeInTheDocument();
  });

  test("affiche l'erreur serveur et ferme avec Annuler", async () => {
    const onClose = jest.fn();
    render(<RegistreModal titre="Nouveau" champs={CHAMPS} valeursInitiales={{}} onSubmit={() => {}} onClose={onClose} erreur="Indiquez un employé ou un nom." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Indiquez un employé ou un nom.");
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("RegistreModal — champ employé", () => {
  const EMPLOYE = { id: "e1", prenom: "Jean", nom: "Dupont", matricule: "EMP-001", poste_nom: "Ingénieur" };
  const CHAMPS_EMPLOYE = [
    { name: "employee", label: "Employé concerné", type: "employee" },
    { name: "type_documents", label: "Type de documents", type: "text", required: true },
  ];

  beforeEach(() => {
    api.get.mockReset();
    api.get.mockResolvedValue({ data: [EMPLOYE] });
  });

  test("cherche, sélectionne un employé et le transmet à onSubmit", async () => {
    const onSubmit = jest.fn();
    render(<RegistreModal titre="Nouveau" champs={CHAMPS_EMPLOYE} valeursInitiales={{}} onSubmit={onSubmit} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText("Employé concerné"), "dup");
    await userEvent.click(await screen.findByRole("option", { name: /Jean Dupont/ }));
    expect(api.get).toHaveBeenCalledWith("/employees/search/", { params: { q: "dup" } });
    expect(screen.getByText("Jean Dupont")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Type de documents/), "Dossier");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ employee: EMPLOYE, type_documents: "Dossier" }));
  });

  test("ne cherche pas avant 2 caractères et permet de changer d'employé", async () => {
    render(<RegistreModal titre="Nouveau" champs={CHAMPS_EMPLOYE} valeursInitiales={{ employee: EMPLOYE }} onSubmit={() => {}} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Changer l'employé" }));
    await userEvent.type(screen.getByLabelText("Employé concerné"), "d");
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe("anneesDisponibles", () => {
  test("renvoie 6 années décroissantes depuis l'année donnée", () => {
    expect(anneesDisponibles(2026)).toEqual([2026, 2025, 2024, 2023, 2022, 2021]);
  });
});
