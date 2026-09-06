import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import api from "../services/api";
import OcrSuggestionsPanel from "../components/OcrSuggestionsPanel";

const render = (ui, options) => rtlRender(ui, { wrapper: ThemeProvider, ...options });

jest.mock("../services/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

const suggestion = {
  ocr_result_id: 1,
  field_index: 0,
  champ_code: "nin",
  valeur: "123456789012345678",
  confiance: 90,
  document_id: "d1",
  file_id: "f1",
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("n'affiche rien après un résultat vide (pas de section Suggestions OCR)", async () => {
  api.get.mockResolvedValueOnce({ data: [] });
  render(<OcrSuggestionsPanel employeeId="e1" />);
  await waitFor(() =>
    expect(screen.queryByText(/chargement/i)).not.toBeInTheDocument()
  );
  expect(screen.queryByText(/suggestions ocr/i)).not.toBeInTheDocument();
});

test("affiche une suggestion et l'applique après confirmation", async () => {
  api.get.mockResolvedValueOnce({ data: [suggestion] });
  api.get.mockResolvedValueOnce({ data: [] });
  api.post.mockResolvedValueOnce({ data: { statut: "appliquee" } });
  render(<OcrSuggestionsPanel employeeId="e1" />);

  expect(await screen.findByText(/123456789012345678/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /appliquer/i }));
  fireEvent.click(await screen.findByRole("button", { name: /confirmer/i }));

  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith("/ocr/suggestions/1/0/appliquer/")
  );
});

test("ignore une suggestion sans confirmation", async () => {
  api.get.mockResolvedValueOnce({ data: [suggestion] });
  api.get.mockResolvedValueOnce({ data: [] });
  api.post.mockResolvedValueOnce({ data: { statut: "ignoree" } });
  render(<OcrSuggestionsPanel employeeId="e1" />);

  fireEvent.click(await screen.findByRole("button", { name: /ignorer/i }));

  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith("/ocr/suggestions/1/0/ignorer/")
  );
});
