import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), patch: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import AttestationDetail from "../pages/AttestationDetail";

const renderDetail = () => rtlRender(
  <MemoryRouter initialEntries={["/attestations/d1"]}>
    <Routes><Route path="/attestations/:ref" element={<AttestationDetail />} /></Routes>
  </MemoryRouter>,
  { wrapper: ThemeProvider }
);

describe("AttestationDetail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("un ADMIN peut faire avancer le statut", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", id: "u1", can_manage_attestations: true } });
    const demandeMock = {
      id: "d1", reference: "00001/26", employee_nom: "Jean Dupont", motif_nom: "Dossier administratif",
      statut: "recue", demandeur: "u2", demandeur_nom: "Ali Ben", commentaire: "",
      created_at: "2026-09-01T10:00:00Z",
    };
    api.get.mockResolvedValueOnce({ data: demandeMock });
    api.get.mockResolvedValueOnce({ data: { ...demandeMock, statut: "prete" } });
    api.patch.mockResolvedValueOnce({ data: { statut: "prete" } });
    renderDetail();
    await waitFor(() => expect(screen.getByText("00001/26")).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Marquer Prête/i));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/attestations/demandes/d1/statut/", { statut: "prete" }
    ));
  });

  test("un GESTIONNAIRE voit un bouton Annuler si statut Reçue et qu'il est l'auteur", async () => {
    useAuth.mockReturnValue({ user: { role: "GESTIONNAIRE", id: "u1" } });
    api.get.mockResolvedValueOnce({ data: {
      id: "d1", reference: "00001/26", employee_nom: "Jean Dupont", motif_nom: "Dossier administratif",
      statut: "recue", demandeur: "u1", demandeur_nom: "Moi", commentaire: "",
      created_at: "2026-09-01T10:00:00Z",
    }});
    renderDetail();
    await waitFor(() => expect(screen.getByText(/Annuler la demande/i)).toBeInTheDocument());
  });

  test("l'aperçu PDF s'affiche dans la page (iframe) au lieu d'un nouvel onglet", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", id: "u1", can_manage_attestations: true } });
    api.get.mockResolvedValueOnce({ data: {
      id: "d1", reference: "00001/26", employee_nom: "Jean Dupont", motif_nom: "Dossier administratif",
      statut: "recue", demandeur: "u2", demandeur_nom: "Ali Ben", demandeur_role: "GESTIONNAIRE",
      demandeur_libelle_role: "Chef SAP", commentaire: "",
      created_at: "2026-09-01T10:00:00Z",
    }});
    global.URL.createObjectURL = jest.fn(() => "blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();
    api.get.mockResolvedValueOnce({ data: new Blob(["%PDF"], { type: "application/pdf" }) });
    // Rafraîchissement silencieux de la demande après génération de
    // l'aperçu (date_document vient d'être figée côté serveur).
    api.get.mockResolvedValueOnce({ data: {
      id: "d1", reference: "00001/26", employee_nom: "Jean Dupont", motif_nom: "Dossier administratif",
      statut: "recue", demandeur: "u2", demandeur_nom: "Ali Ben", demandeur_role: "GESTIONNAIRE",
      demandeur_libelle_role: "Chef SAP", commentaire: "",
      created_at: "2026-09-01T10:00:00Z", date_document: "2026-09-24",
    }});
    renderDetail();
    await waitFor(() => expect(screen.getByText("00001/26")).toBeInTheDocument());
    expect(screen.getByText("Chef SAP")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Aperçu PDF/i));
    await waitFor(() => expect(screen.getByTitle("Aperçu de l'attestation")).toHaveAttribute("src", "blob:mock-url#toolbar=0"));
    expect(screen.queryByText(/Choisir un fichier/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Aperçu généré et imprimable le 24\/09\/2026/)).toBeInTheDocument());
  });

  test("rouvrir l'aperçu un autre jour prévient avant de changer la date déjà imprimée", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", id: "u1", can_manage_attestations: true } });
    api.get.mockResolvedValueOnce({ data: {
      id: "d1", reference: "00001/26", employee_nom: "Jean Dupont", motif_nom: "Dossier administratif",
      statut: "recue", demandeur: "u2", demandeur_nom: "Ali Ben", commentaire: "",
      created_at: "2026-09-01T10:00:00Z",
    }});
    global.URL.createObjectURL = jest.fn(() => "blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();

    const payload = { needs_confirmation: true, date_document: "2026-09-23", date_nouvelle: "2026-09-24" };
    const conflit = new Error("conflit");
    conflit.response = {
      status: 409,
      data: new Blob([JSON.stringify(payload)], { type: "application/json" }),
    };
    api.get.mockRejectedValueOnce(conflit);
    api.get.mockResolvedValueOnce({ data: new Blob(["%PDF"], { type: "application/pdf" }) });
    // Rafraîchissement silencieux de la demande après régénération —
    // date_document a été mise à jour à la nouvelle date confirmée.
    api.get.mockResolvedValueOnce({ data: {
      id: "d1", reference: "00001/26", employee_nom: "Jean Dupont", motif_nom: "Dossier administratif",
      statut: "recue", demandeur: "u2", demandeur_nom: "Ali Ben", commentaire: "",
      created_at: "2026-09-01T10:00:00Z", date_document: "2026-09-24",
    }});

    renderDetail();
    await waitFor(() => expect(screen.getByText("00001/26")).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Aperçu PDF/i));
    await waitFor(() => screen.getByText(/23\/09\/2026/));
    expect(screen.getByText(/24\/09\/2026/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Confirmer"));
    await waitFor(() => expect(screen.getByTitle("Aperçu de l'attestation")).toHaveAttribute("src", "blob:mock-url#toolbar=0"));
    expect(api.get).toHaveBeenNthCalledWith(
      3,
      "/attestations/demandes/d1/apercu/",
      expect.objectContaining({ params: { confirmer_date: 1 } }),
    );
  });

  test("les informations de l'employé (matricule, affectation...) sont affichées pour vérification", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", id: "u1", can_manage_attestations: true } });
    api.get.mockResolvedValueOnce({ data: {
      id: "d1", reference: "00001/26", employee_nom: "Jean Dupont", motif_nom: "Dossier administratif",
      statut: "recue", demandeur: "u2", demandeur_nom: "Ali Ben", commentaire: "",
      created_at: "2026-09-01T10:00:00Z",
      employee_matricule: "010578",
      employee_date_naissance: "1996-03-18",
      employee_date_embauche: "2018-12-17",
      employee_type_contrat_nom: "CDI",
      employee_categorie_nom: "Cadre",
      employee_poste_nom: "Cadre Administratif",
      employee_direction_nom: "Direction des Ressources Humaines",
      employee_departement_nom: "Département Administration du Personnel",
      employee_service_nom: "Service Administration du Personnel",
    }});
    renderDetail();
    await waitFor(() => expect(screen.getByText("00001/26")).toBeInTheDocument());

    expect(screen.getByText(/Informations de l'employé/i)).toBeInTheDocument();
    expect(screen.getByText("010578")).toBeInTheDocument();
    expect(screen.getByText("18/03/1996")).toBeInTheDocument();
    expect(screen.getByText("Cadre Administratif")).toBeInTheDocument();
    expect(screen.getByText("Direction des Ressources Humaines")).toBeInTheDocument();
    expect(screen.getByText("Service Administration du Personnel")).toBeInTheDocument();
  });
});
