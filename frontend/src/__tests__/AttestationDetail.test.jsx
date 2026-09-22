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

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import AttestationDetail from "../pages/AttestationDetail";

const renderDetail = () => rtlRender(
  <MemoryRouter initialEntries={["/attestations/d1"]}>
    <Routes><Route path="/attestations/:id" element={<AttestationDetail />} /></Routes>
  </MemoryRouter>,
  { wrapper: ThemeProvider }
);

describe("AttestationDetail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("un ADMIN peut faire avancer le statut", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", id: "u1" } });
    api.get.mockResolvedValueOnce({ data: {
      id: "d1", reference: "00001/26", employee_nom: "Jean Dupont", motif: "Dossier administratif",
      statut: "recue", demandeur: "u2", demandeur_nom: "Ali Ben", commentaire: "",
    }});
    api.patch.mockResolvedValueOnce({ data: { statut: "imprimee" } });
    renderDetail();
    await waitFor(() => expect(screen.getByText("00001/26")).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Marquer Imprimée/i));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/attestations/demandes/d1/statut/", { statut: "imprimee" }
    ));
  });

  test("un GESTIONNAIRE voit un bouton Annuler si statut Reçue et qu'il est l'auteur", async () => {
    useAuth.mockReturnValue({ user: { role: "GESTIONNAIRE", id: "u1" } });
    api.get.mockResolvedValueOnce({ data: {
      id: "d1", reference: "00001/26", employee_nom: "Jean Dupont", motif: "Dossier administratif",
      statut: "recue", demandeur: "u1", demandeur_nom: "Moi", commentaire: "",
    }});
    renderDetail();
    await waitFor(() => expect(screen.getByText(/Annuler la demande/i)).toBeInTheDocument());
  });
});
