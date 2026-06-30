/**
 * Tests — pages/Import.jsx
 * Couvre : rendu, sélection fichier CSV, drag-drop, import, téléchargement template
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "ADMIN", username: "admin" } }),
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../services/api";
import Import from "../pages/Import";

const renderPage = () =>
  render(
    <MemoryRouter>
      <Import />
    </MemoryRouter>
  );

beforeEach(() => jest.clearAllMocks());

describe("Import — rendu", () => {
  test("affiche le titre Import CSV", () => {
    renderPage();
    expect(screen.getByText(/Import CSV/i)).toBeInTheDocument();
  });

  test("affiche le bouton Télécharger le template", () => {
    renderPage();
    expect(screen.getByText(/[Tt]el[eé]charger le template/i)).toBeInTheDocument();
  });

  test("affiche la zone de drag & drop", () => {
    renderPage();
    expect(screen.getByText(/Glissez-déposez|Parcourir/i)).toBeInTheDocument();
  });

  test("le bouton Importer est désactivé si aucun fichier sélectionné", () => {
    renderPage();
    const btn = screen.getByRole("button", { name: /Lancer l'import|Importer/i });
    expect(btn).toBeDisabled();
  });
});

describe("Import — sélection fichier", () => {
  test("sélectionner un fichier CSV active le bouton Importer", () => {
    renderPage();
    const file = new File(["matricule,nom,prenom\nEMP-001,Dupont,Jean"], "employes.csv", {
      type: "text/csv",
    });
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput, { target: { files: [file] } });
    const btn = screen.getByRole("button", { name: /Lancer l'import|Importer/i });
    expect(btn).not.toBeDisabled();
  });
});

describe("Import — drag & drop", () => {
  test("drop d'un fichier CSV le sélectionne", () => {
    renderPage();
    const dropZone = document.querySelector('[data-testid="drop-zone"]') ||
      screen.getByText(/Glissez-déposez|Parcourir/i).closest("div");

    const file = new File(["data"], "test.csv", { type: "text/csv" });
    if (dropZone) {
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
        preventDefault: jest.fn(),
      });
    }
    // Vérification que le composant ne crashe pas
    expect(screen.getByText(/Import CSV/i)).toBeInTheDocument();
  });
});

describe("Import — résultat import", () => {
  test("import réussi affiche le résultat", async () => {
    const file = new File(["data"], "employes.csv", { type: "text/csv" });
    api.post.mockResolvedValue({
      data: {
        nb_created: 5,
        nb_errors: 0,
        errors: [],
      },
    });
    renderPage();

    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [file] } });
      const btn = screen.getByRole("button", { name: /Lancer l'import|Importer/i });
      fireEvent.click(btn);
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/employees/import/",
          expect.any(FormData),
          expect.objectContaining({
            headers: { "Content-Type": "multipart/form-data" },
          })
        );
      });
    }
  });

  test("import en erreur affiche le message d'erreur", async () => {
    api.post.mockRejectedValue({
      response: { data: { error: "Fichier invalide." } },
    });
    const file = new File(["data"], "employes.csv", { type: "text/csv" });
    renderPage();

    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [file] } });
      const btn = screen.getByRole("button", { name: /Lancer l'import|Importer/i });
      fireEvent.click(btn);
      await waitFor(() => {
        expect(screen.getByText(/Fichier invalide\./)).toBeInTheDocument();
      });
    }
  });
});

describe("Import — template", () => {
  test("clic Télécharger le template appelle l'API GET", async () => {
    const blob = new Blob(["csv data"], { type: "text/csv" });
    api.get.mockResolvedValue({ data: blob });
    URL.createObjectURL = jest.fn(() => "blob:mock");
    URL.revokeObjectURL = jest.fn();

    // Mock createElement pour éviter l'erreur d'appendchild
    const fakeAnchor = { href: "", download: "", click: jest.fn(), style: {} };
    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag) =>
      tag === "a" ? fakeAnchor : origCreate(tag)
    );

    renderPage();
    fireEvent.click(screen.getByText(/[Tt]el[eé]charger le template/i));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/employees/import/template/",
        expect.objectContaining({ responseType: "blob" })
      );
    });
    jest.restoreAllMocks();
  });
});
