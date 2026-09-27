import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "GESTIONNAIRE", id: "u1", full_name: "Gest Test" } }),
}));

import api from "../services/api";
import AttestationNouvelle from "../pages/AttestationNouvelle";

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>, { wrapper: ThemeProvider });

describe("AttestationNouvelle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("recherche un employé puis soumet la demande", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/employees/search/") {
        return Promise.resolve({ data: [{ id: "emp1", nom: "Dupont", prenom: "Jean", matricule: "M1" }] });
      }
      if (url === "/ref/motifs-attestation/") {
        return Promise.resolve({ data: [{ id: "mot1", nom: "Dossier administratif", is_active: true }] });
      }
      if (url.includes("/contrats/")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValueOnce({ data: { id: "d1", reference: "00001/26" } });

    render(<AttestationNouvelle />);

    const findSuggestion = () =>
      screen.getByText(/Jean Dupont/i, { selector: "span" }).closest("div");
    await userEvent.type(screen.getByLabelText(/employé/i), "Dupont");
    await waitFor(() => expect(findSuggestion()).toBeInTheDocument());
    fireEvent.click(findSuggestion());
    await waitFor(() => expect(screen.getByLabelText(/motif/i)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/motif/i), "mot1");
    fireEvent.click(screen.getByText(/Envoyer la demande/i));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/attestations/demandes/",
      expect.objectContaining({ employee: "emp1", motif: "mot1" })
    ));
  });

  test("permet de saisir un motif libre via \"Autre...\"", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/employees/search/") {
        return Promise.resolve({ data: [{ id: "emp1", nom: "Dupont", prenom: "Jean", matricule: "M1" }] });
      }
      if (url === "/ref/motifs-attestation/") {
        return Promise.resolve({ data: [{ id: "mot1", nom: "Dossier administratif", is_active: true }] });
      }
      if (url.includes("/contrats/")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValueOnce({ data: { id: "d1", reference: "00001/26" } });

    render(<AttestationNouvelle />);

    const findSuggestion2 = () =>
      screen.getByText(/Jean Dupont/i, { selector: "span" }).closest("div");
    await userEvent.type(screen.getByLabelText(/employé/i), "Dupont");
    await waitFor(() => expect(findSuggestion2()).toBeInTheDocument());
    fireEvent.click(findSuggestion2());
    await waitFor(() => expect(screen.getByLabelText(/motif/i)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/motif/i), "__autre__");
    await userEvent.type(screen.getByPlaceholderText(/Précisez le motif/i), "Visa Schengen");
    fireEvent.click(screen.getByText(/Envoyer la demande/i));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/attestations/demandes/",
      expect.objectContaining({ employee: "emp1", motif_autre: "Visa Schengen" })
    ));
  });
});
