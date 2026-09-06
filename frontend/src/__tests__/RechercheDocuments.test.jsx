import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";
import api from "../services/api";
import RechercheDocuments from "../pages/RechercheDocuments";

const render = (ui) =>
  rtlRender(
    <MemoryRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>
  );

jest.mock("../services/api", () => ({
  get: jest.fn(),
}));

jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "ADMIN" } }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test("affiche un message d'erreur si la recherche fait moins de 2 caractères", async () => {
  render(<RechercheDocuments />);
  fireEvent.change(screen.getByPlaceholderText(/nom, prénom/i), { target: { value: "a" } });
  fireEvent.click(screen.getByRole("button", { name: /rechercher/i }));
  expect(await screen.findByText(/au moins 2 caractères/i)).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});

test("affiche les résultats retournés par l'API, tous employés confondus", async () => {
  api.get.mockResolvedValueOnce({
    data: {
      results: [
        {
          employee_id: "e1",
          employee_matricule: "EMP-001",
          employee_nom: "Dupont",
          employee_prenom: "Jean",
          type_doc_nom: "Acte de mariage",
          file_id: "f1",
          file_name: "acte.pdf",
          snippet: "...épouse Fatima BENALI, née le...",
        },
      ],
      total: 1,
      truncated: false,
    },
  });
  render(<RechercheDocuments />);

  fireEvent.change(screen.getByPlaceholderText(/nom, prénom/i), {
    target: { value: "Fatima Benali" },
  });
  fireEvent.click(screen.getByRole("button", { name: /rechercher/i }));

  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith("/ocr/search/", { params: { q: "Fatima Benali" } })
  );
  expect(await screen.findByText(/Jean Dupont/i)).toBeInTheDocument();
  expect(screen.getByText(/Acte de mariage/i)).toBeInTheDocument();
});

test("affiche 'Aucun résultat' quand la recherche ne trouve rien", async () => {
  api.get.mockResolvedValueOnce({ data: { results: [], total: 0, truncated: false } });
  render(<RechercheDocuments />);

  fireEvent.change(screen.getByPlaceholderText(/nom, prénom/i), { target: { value: "introuvable" } });
  fireEvent.click(screen.getByRole("button", { name: /rechercher/i }));

  expect(await screen.findByText(/aucun résultat/i)).toBeInTheDocument();
});
