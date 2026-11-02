import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import api from "../services/api";
import { ThemeProvider } from "../context/ThemeContext";
import DesignerInterimModal from "../components/organigramme/DesignerInterimModal";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const unite = {
  type: "service", id: "s1", nom: "Service Paie", titulaire_nom: "Kheira FERGOUG",
  role: "titulaire", validation_requise: true,
};

const renderModal = (props = {}) =>
  render(
    <ThemeProvider>
      <DesignerInterimModal unite={unite} onClose={jest.fn()} onSaved={jest.fn()} {...props} />
    </ThemeProvider>,
  );

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.get.mockResolvedValue({ data: [{ id: "u1", nom: "Amine BEN", username: "amine" }] });
});

test("charge les candidats autorisés par le serveur et prévient qu'une validation est requise", async () => {
  renderModal();
  expect(await screen.findByRole("option", { name: /Amine BEN/ })).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/interims/candidats/", { params: { unite_type: "service", unite_id: "s1" } });
  expect(screen.getByText(/supérieur direct devra valider/)).toBeInTheDocument();
});

test("demande confirmation avant d'envoyer la désignation", async () => {
  api.post.mockResolvedValue({ data: { statut: "en_attente" } });
  const onSaved = jest.fn();
  renderModal({ onSaved });
  await screen.findByRole("option", { name: /Amine BEN/ });
  fireEvent.change(screen.getByLabelText("Intérimaire"), { target: { value: "u1" } });
  fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2099-12-31" } });
  fireEvent.click(screen.getByRole("button", { name: "Désigner" }));
  expect(await screen.findByText(/Désigner Amine BEN comme intérimaire de Kheira FERGOUG/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/interims/", expect.objectContaining({
    unite_type: "service", unite_id: "s1", interimaire: "u1", date_fin: "2099-12-31",
  })));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});

test("affiche le refus du serveur sans fermer la fenêtre", async () => {
  api.post.mockRejectedValue({ response: { data: { error: "Cette période chevauche un autre intérim." } } });
  const onSaved = jest.fn();
  renderModal({ onSaved });
  await screen.findByRole("option", { name: /Amine BEN/ });
  fireEvent.change(screen.getByLabelText("Intérimaire"), { target: { value: "u1" } });
  fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2099-12-31" } });
  fireEvent.click(screen.getByRole("button", { name: "Désigner" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmer" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("chevauche");
  expect(onSaved).not.toHaveBeenCalled();
});
