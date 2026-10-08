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
  // resetAllMocks (et non clear) : vide aussi les réponses « une fois »
  // non consommées, qui sinon contaminent le test suivant.
  beforeEach(() => jest.resetAllMocks());

  test("soumet une demande sans employé puis ouvre son détail", async () => {
    api.post.mockResolvedValueOnce({ data: { reference: "C-00007/26" } });
    render(<ConsultationNouvelle />);
    await userEvent.selectOptions(screen.getByLabelText(/Type de demande/i), "information");
    await userEvent.type(screen.getByLabelText(/Que souhaitez-vous consulter/i), "Date d'embauche du directeur");
    await userEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/consultations/demandes/", {
      type_demande: "information", description: "Date d'embauche du directeur", importance: "moyenne",
      duree_souhaitee_heures: 24, telechargement_souhaite: false, impression_souhaitee: false,
    }));
    expect(mockNavigate).toHaveBeenCalledWith("/consultations/C-00007-26");
  });

  test("envoie l'importance choisie et l'employé sélectionné", async () => {
    // La recherche part à chaque lettre : réponse permanente, pas « une fois ».
    api.get.mockResolvedValue({
      data: [{ id: "emp1", nom: "Dupont", prenom: "Jean", matricule: "M1", poste_nom: "Ingénieur" }],
    });
    api.post.mockResolvedValueOnce({ data: { reference: "C-00008/26" } });
    render(<ConsultationNouvelle />);
    await userEvent.type(screen.getByLabelText(/Employé concerné/i), "Dup");
    await userEvent.click(await screen.findByText(/Dupont/));
    expect(await screen.findByText(/Ingénieur/)).toBeInTheDocument();   // fiche employé affichée
    await userEvent.selectOptions(screen.getByLabelText(/Importance/i), "haute");
    await userEvent.type(screen.getByLabelText(/Que souhaitez-vous consulter/i), "Contrat 2019");
    await userEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/consultations/demandes/", {
      type_demande: "document", description: "Contrat 2019", importance: "haute", employee: "emp1",
      duree_souhaitee_heures: 24, telechargement_souhaite: false, impression_souhaitee: false,
    }));
  });

  test("le demandeur choisit sa durée et ses droits d'usage souhaités", async () => {
    api.post.mockResolvedValueOnce({ data: { reference: "C-00009/26" } });
    render(<ConsultationNouvelle />);
    await userEvent.selectOptions(screen.getByLabelText("Durée souhaitée"), "custom");
    const saisie = screen.getByLabelText("Durée personnalisée");
    await userEvent.clear(saisie);
    await userEvent.type(saisie, "10");
    await userEvent.click(screen.getByLabelText(/Pouvoir télécharger/));
    await userEvent.click(screen.getByLabelText(/Pouvoir imprimer/));
    expect(screen.getByText(/peut les accorder ou les modifier/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Que souhaitez-vous consulter/i), "Dossier");
    await userEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/consultations/demandes/", {
      type_demande: "document", description: "Dossier", importance: "moyenne",
      duree_souhaitee_heures: 10, telechargement_souhaite: true, impression_souhaitee: true,
    }));
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
