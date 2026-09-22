import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn() },
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
      if (url.includes("/contrats/")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValueOnce({ data: { id: "d1", reference: "00001/26" } });

    render(<AttestationNouvelle />);

    await userEvent.type(screen.getByLabelText(/employé/i), "Dupont");
    await waitFor(() => expect(screen.getByText(/Dupont — M1/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Dupont — M1/));
    await userEvent.type(screen.getByLabelText(/motif/i), "Dossier administratif");
    fireEvent.click(screen.getByText(/Envoyer la demande/i));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/attestations/demandes/",
      expect.objectContaining({ employee: "emp1", motif: "Dossier administratif" })
    ));
  });
});
