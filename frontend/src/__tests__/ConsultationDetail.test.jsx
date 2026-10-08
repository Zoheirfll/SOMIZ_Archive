import React from "react";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../components/SecureDocViewer", () => (props) => (
  <div data-testid="viewer">{props.fileName}</div>
));
jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));

const mockPrompt = jest.fn();
const mockConfirm = jest.fn();
jest.mock("../components/ConfirmDialog", () => ({
  useConfirm: () => ({ confirm: mockConfirm, ConfirmDialog: null }),
  usePrompt: () => ({ prompt: mockPrompt, PromptDialog: null }),
}));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import ConsultationDetail from "../pages/ConsultationDetail";

const render = () =>
  rtlRender(
    <MemoryRouter initialEntries={["/consultations/C-00001-26"]}>
      <Routes><Route path="/consultations/:ref" element={<ConsultationDetail />} /></Routes>
    </MemoryRouter>,
    { wrapper: ThemeProvider },
  );

const BASE = {
  id: "d1", reference: "C-00001/26", type_demande: "document", type_demande_label: "Document",
  description: "Contrat de 2019", employee: null, employee_nom: null,
  demandeur_nom: "Ali Ben", traite_par_nom: null, motif_rejet: "",
  created_at: "2026-10-08T09:00:00Z", date_validation: null, date_echeance: null,
  nb_prolongations: 0, telechargement_autorise: false, impression_autorisee: false, fichiers: [],
  duree_souhaitee_heures: 24, telechargement_souhaite: false, impression_souhaitee: false,
  duree_accordee_heures: null,
  statut: "en_cours", statut_effectif: "en_cours",
};
const VALIDEE = {
  ...BASE, statut: "validee", statut_effectif: "validee",
  date_validation: "2026-10-08T10:00:00Z", date_echeance: "2099-01-01T10:00:00Z",
  fichiers: [{ id: "f1", file_name: "scan.pdf", mime_type: "application/pdf", file_size: 1000, origine: "scan_externe", purge: false }],
};

beforeEach(() => {
  // resetAllMocks : vide aussi les réponses « une fois » non consommées.
  jest.resetAllMocks();
  global.URL.createObjectURL = jest.fn(() => "blob:test");
  global.URL.revokeObjectURL = jest.fn();
});

const connecte = (user, demande) => {
  useAuth.mockReturnValue({ user });
  api.get.mockImplementation((url) => {
    if (url.includes("/voir/") || url.includes("/telecharger/")) return Promise.resolve({ data: new Blob(["x"]) });
    if (url.includes("/documents/")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: demande });
  });
};

describe("ConsultationDetail", () => {
  test("le demandeur voit le viewer tant que la consultation est valide", async () => {
    connecte({ role: "GESTIONNAIRE", id: "u1" }, VALIDEE);
    render();
    expect(await screen.findByTestId("viewer")).toHaveTextContent("scan.pdf");
  });

  test("pas de bouton Télécharger quand le traiteur ne l'a pas autorisé", async () => {
    connecte({ role: "GESTIONNAIRE", id: "u1" }, VALIDEE);
    render();
    await screen.findByTestId("viewer");
    expect(screen.queryByRole("button", { name: /Télécharger/i })).not.toBeInTheDocument();
  });

  test("bouton Télécharger quand le téléchargement est autorisé", async () => {
    connecte({ role: "GESTIONNAIRE", id: "u1" }, { ...VALIDEE, telechargement_autorise: true });
    render();
    await screen.findByTestId("viewer");
    expect(screen.getByRole("button", { name: /Télécharger/i })).toBeInTheDocument();
  });

  test("bouton Imprimer seulement si l'impression est accordée ; il prévient le serveur", async () => {
    connecte({ role: "GESTIONNAIRE", id: "u1" }, VALIDEE);
    const { unmount } = render();
    await screen.findByTestId("viewer");
    expect(screen.queryByRole("button", { name: /Imprimer/i })).not.toBeInTheDocument();
    unmount();

    connecte({ role: "GESTIONNAIRE", id: "u1" }, { ...VALIDEE, impression_autorisee: true });
    api.post.mockResolvedValueOnce({ status: 204 });
    render();
    await userEvent.click(await screen.findByRole("button", { name: /Imprimer/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/consultations/demandes/C-00001-26/fichiers/f1/imprimer/",
    ));
  });

  test("impression refusée par le serveur : message affiché", async () => {
    connecte({ role: "GESTIONNAIRE", id: "u1" }, { ...VALIDEE, impression_autorisee: true });
    api.post.mockRejectedValueOnce({ response: { data: { detail: "L'impression n'est pas autorisée." } } });
    render();
    await userEvent.click(await screen.findByRole("button", { name: /Imprimer/i }));
    expect(await screen.findByText(/impression n'est pas autorisée/i)).toBeInTheDocument();
  });

  test("souhaits du demandeur et droits accordés sont affichés côte à côte", async () => {
    connecte({ role: "GESTIONNAIRE", id: "u1" }, {
      ...VALIDEE, duree_souhaitee_heures: 72, duree_accordee_heures: 24,
      telechargement_souhaite: true, telechargement_autorise: false,
      impression_souhaitee: false, impression_autorisee: false,
    });
    render();
    await screen.findByTestId("viewer");
    expect(screen.getByText("3 jours")).toBeInTheDocument();            // durée souhaitée
    expect(screen.getByText("Modifiée par le traiteur")).toBeInTheDocument();
    expect(screen.getByText(/Souhaité : oui — modifié par le traiteur/)).toBeInTheDocument();
  });

  test("traiteur : les souhaits préremplissent le panneau, les modifications sont signalées et envoyées", async () => {
    connecte({ role: "ADMIN", id: "u2", can_manage_consultations: true }, {
      ...BASE, duree_souhaitee_heures: 48, telechargement_souhaite: true, impression_souhaitee: true,
    });
    api.post.mockResolvedValueOnce({ data: BASE });
    render();
    expect(await screen.findByText(/Souhaits du demandeur/)).toBeInTheDocument();
    const impression = screen.getByLabelText(/Autoriser l'impression/);
    expect(impression).toBeChecked();                                   // souhait préaccordé
    expect(screen.getByLabelText(/Autoriser le téléchargement/)).toBeChecked();
    await userEvent.click(impression);                                  // le traiteur refuse l'impression
    expect(screen.getByText("(modifié)")).toBeInTheDocument();
    await userEvent.upload(
      screen.getByLabelText("Choisir des fichiers"),
      new File([new ArrayBuffer(10)], "scan.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Valider et envoyer/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, form] = api.post.mock.calls[0];
    expect(url).toBe("/consultations/demandes/C-00001-26/valider/");
    expect(form.get("duree_heures")).toBe("48");
    expect(form.get("telechargement_autorise")).toBe("true");
    expect(form.get("impression_autorisee")).toBe("false");
  });

  test("consultation expirée : message à la place du viewer", async () => {
    connecte(
      { role: "GESTIONNAIRE", id: "u1" },
      { ...VALIDEE, statut_effectif: "expiree", date_echeance: "2026-10-01T10:00:00Z", fichiers: [] },
    );
    render();
    expect(await screen.findByText(/Consultation expirée le/i)).toBeInTheDocument();
    expect(screen.queryByTestId("viewer")).not.toBeInTheDocument();
  });

  test("le demandeur n'a aucun bouton de traitement", async () => {
    connecte({ role: "GESTIONNAIRE", id: "u1" }, BASE);
    render();
    await screen.findByRole("heading", { name: "C-00001/26" });
    expect(screen.queryByRole("button", { name: /Valider/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rejeter/i })).not.toBeInTheDocument();
  });

  test("le traiteur voit le panneau de traitement d'une demande en cours", async () => {
    connecte({ role: "ADMIN", id: "u2", can_manage_consultations: true }, BASE);
    render();
    expect(await screen.findByRole("button", { name: /Valider et envoyer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rejeter/i })).toBeInTheDocument();
  });

  test("rejet : le motif est demandé puis envoyé", async () => {
    connecte({ role: "ADMIN", id: "u2", can_manage_consultations: true }, BASE);
    mockPrompt.mockResolvedValueOnce("Hors périmètre");
    api.post.mockResolvedValueOnce({ data: { ...BASE, statut: "rejetee", statut_effectif: "rejetee" } });
    render();
    await userEvent.click(await screen.findByRole("button", { name: /Rejeter/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/consultations/demandes/C-00001-26/rejeter/", { motif_rejet: "Hors périmètre" },
    ));
  });

  test("révocation : exige de saisir la référence", async () => {
    connecte({ role: "ADMIN", id: "u2", can_manage_consultations: true }, VALIDEE);
    mockPrompt.mockResolvedValueOnce("mauvaise-saisie");
    render();
    await userEvent.click(await screen.findByRole("button", { name: /Révoquer/i }));
    expect(await screen.findByText(/La référence saisie ne correspond pas/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();           // saisie incorrecte : rien n'est envoyé

    mockPrompt.mockResolvedValueOnce("C-00001/26");
    api.post.mockResolvedValueOnce({ data: { ...VALIDEE, statut: "revoquee", statut_effectif: "revoquee" } });
    await userEvent.click(screen.getByRole("button", { name: /Révoquer/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/consultations/demandes/C-00001-26/revoquer/", {},
    ));
  });

  test("affiche le texte réel d'une erreur serveur de chargement", async () => {
    useAuth.mockReturnValue({ user: { role: "GESTIONNAIRE", id: "u1" } });
    api.get.mockRejectedValueOnce({ response: { status: 404, data: { detail: "Introuvable." } } });
    render();
    expect(await screen.findByText(/Introuvable/i)).toBeInTheDocument();
  });
});
