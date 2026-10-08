import React from "react";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));
jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "GESTIONNAIRE", id: "u1" } }),
}));

import api from "../services/api";
import ConsultationNouvelle from "../pages/ConsultationNouvelle";

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>, { wrapper: ThemeProvider });

describe("ConsultationNouvelle", () => {
  beforeEach(() => jest.clearAllMocks());

  test("soumet une demande sans employé puis ouvre son détail", async () => {
    api.post.mockResolvedValueOnce({ data: { reference: "C-00007/26" } });
    render(<ConsultationNouvelle />);
    await userEvent.selectOptions(screen.getByLabelText(/Type de demande/i), "information");
    await userEvent.type(screen.getByLabelText(/Que souhaitez-vous consulter/i), "Date d'embauche du directeur");
    await userEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/consultations/demandes/", {
      type_demande: "information", description: "Date d'embauche du directeur",
    }));
    expect(mockNavigate).toHaveBeenCalledWith("/consultations/C-00007-26");
  });

  test("refuse d'envoyer une description vide", async () => {
    render(<ConsultationNouvelle />);
    await userEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    expect(await screen.findByText(/Décrivez ce que vous souhaitez consulter/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("affiche le texte réel de l'erreur serveur", async () => {
    api.post.mockRejectedValueOnce({ response: { data: { employee: ["Cet employé n'est pas dans votre périmètre."] } } });
    render(<ConsultationNouvelle />);
    await userEvent.type(screen.getByLabelText(/Que souhaitez-vous consulter/i), "x");
    await userEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    expect(await screen.findByText(/n'est pas dans votre périmètre/i)).toBeInTheDocument();
  });
});
