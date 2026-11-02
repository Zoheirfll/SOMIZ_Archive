import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import api from "../services/api";
import { ThemeProvider } from "../context/ThemeContext";
import DocumentPagesModal from "../components/employeeDetail/DocumentPagesModal";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const doc = {
  id: "d1", type_document: "AVENANT",
  fichiers: [{
    id: "f1", ordre: 1, mime_type: "application/pdf", file_name: "scan.pdf",
    pages: [
      { id: "p1", ordre: 1, nom: "CONTRAT 1" },
      { id: "p2", ordre: 2, nom: "CONTRAT INITIAL" },
    ],
  }],
};
const typesList = [
  { id: 1, code: "AVENANT", nom: "Avenant au contrat de travail" },
  { id: 2, code: "CONTRAT_INI", nom: "Contrat de travail initial" },
];

const renderModal = (props = {}) =>
  render(
    <ThemeProvider>
      <DocumentPagesModal doc={doc} docLabel="Avenant au contrat de travail" typesList={typesList}
        onClose={jest.fn()} onChanged={jest.fn().mockResolvedValue()} {...props} />
    </ThemeProvider>,
  );

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.post.mockResolvedValue({ data: {} });
});

test("déplacer une page : choix du type, confirmation, puis appel serveur", async () => {
  const onChanged = jest.fn().mockResolvedValue();
  renderModal({ onChanged });
  fireEvent.click(screen.getByRole("button", { name: "Déplacer CONTRAT INITIAL" }));
  const choix = await screen.findByLabelText(/Déplacer cette page vers/);
  // La destination ne propose pas le type actuel du document.
  expect(screen.queryByRole("option", { name: "Avenant au contrat de travail" })).not.toBeInTheDocument();
  fireEvent.change(choix, { target: { value: "2" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Déplacer" }).pop());
  expect(await screen.findByText(/Déplacer 1 page de « Avenant au contrat de travail » vers « Contrat de travail initial »/))
    .toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/files/f1/pages/deplacer/", { pages: ["p2"], type_doc: 2 }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

test("déplacer tout le document appelle la route du document", async () => {
  renderModal();
  fireEvent.click(screen.getByRole("button", { name: /Déplacer tout le document/ }));
  fireEvent.change(await screen.findByLabelText(/Déplacer tout le document vers/), { target: { value: "2" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Déplacer" }).pop());
  fireEvent.click(await screen.findByRole("button", { name: "Confirmer" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/documents/d1/deplacer/", { type_doc: 2 }));
});

test("sans liste de types, aucun bouton de déplacement n'est proposé", () => {
  renderModal({ typesList: [] });
  expect(screen.queryByRole("button", { name: /Déplacer/ })).not.toBeInTheDocument();
});
