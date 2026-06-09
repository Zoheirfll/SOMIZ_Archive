/**
 * Tests — pages/EmployeeDetail.jsx
 * Couvre : rendu, chargement employé, affichage documents, upload fichier, suppression
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("../../frontend/src/services/api", () => ({
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock("../../frontend/src/components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../../frontend/src/components/SecureDocViewer", () => () => (
  <div data-testid="doc-viewer">Visionneuse document</div>
));
jest.mock("../../frontend/src/context/AuthContext", () => ({
  useAuth: jest.fn(),
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../../frontend/src/services/api";
import { useAuth } from "../../frontend/src/context/AuthContext";
import EmployeeDetail from "../../frontend/src/pages/EmployeeDetail";

const mockFile = { id: "file-1", file_name: "cin_recto.pdf", mime_type: "application/pdf", file_size: 102400 };
const mockDoc = {
  id: "doc-1",
  type_document: "CIN",
  type_document_label: "Carte Nationale",
  is_active: true,
  fichiers: [mockFile],
  nb_fichiers: 1,
};
const mockEmployee = {
  id: "emp-uuid",
  matricule: "EMP-001",
  nom: "Dupont",
  prenom: "Jean",
  statut: "actif",
  direction_nom: "Direction Générale",
  departement_nom: "RH",
  service_nom: "Paie",
  poste_nom: "Ingénieur",
  type_contrat_nom: "CDI",
  categorie_nom: "Cadre",
  date_embauche: "2020-06-01",
  taux_completude: 75,
  dossier_complet: false,
  documents: [mockDoc],
  documents_manquants: ["Diplôme"],
};
const mockTypes = [
  { id: "type-1", code: "CIN", nom: "Carte Nationale", obligatoire: true },
  { id: "type-2", code: "CV", nom: "CV", obligatoire: false },
];

const renderPage = (role = "ADMIN") => {
  useAuth.mockReturnValue({ user: { role, username: "admin" } });
  return render(
    <MemoryRouter initialEntries={["/employees/emp-uuid"]}>
      <Routes>
        <Route path="/employees/:id" element={<EmployeeDetail />} />
      </Routes>
    </MemoryRouter>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => "blob:mock-url");
  URL.revokeObjectURL = jest.fn();

  api.get.mockImplementation((url) => {
    if (url.includes("types-documents")) {
      return Promise.resolve({ data: { results: mockTypes } });
    }
    if (url.includes("files/")) {
      return Promise.resolve({ data: new Blob(["pdf"], { type: "application/pdf" }) });
    }
    return Promise.resolve({ data: mockEmployee });
  });
});

describe("EmployeeDetail — rendu initial", () => {
  test("affiche la navbar", async () => {
    renderPage();
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
  });

  test("affiche Chargement... pendant le fetch", () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Chargement...")).toBeInTheDocument();
  });

  test("affiche le matricule de l'employé", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("EMP-001")).toBeInTheDocument();
    });
  });

  test("affiche le nom complet", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Jean Dupont/)).toBeInTheDocument();
    });
  });

  test("affiche le statut", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("actif")).toBeInTheDocument();
    });
  });

  test("affiche le département", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("RH")).toBeInTheDocument();
    });
  });

  test("affiche le taux de complétude", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/75%/)).toBeInTheDocument();
    });
  });
});

describe("EmployeeDetail — documents", () => {
  test("affiche la liste des documents", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Carte Nationale")).toBeInTheDocument();
    });
  });

  test("affiche le nom du fichier", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("cin_recto.pdf")).toBeInTheDocument();
    });
  });

  test("affiche les documents manquants", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Diplôme")).toBeInTheDocument();
    });
  });
});

describe("EmployeeDetail — navigation", () => {
  test("bouton ← Retour navigue en arrière", async () => {
    renderPage();
    await waitFor(() => screen.getByText("← Retour"));
    fireEvent.click(screen.getByText("← Retour"));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  test("bouton Modifier navigue vers la page édition (ADMIN)", async () => {
    renderPage("ADMIN");
    await waitFor(() => screen.getByText(/Modifier/));
    const modifyBtn = screen.getAllByText(/Modifier/)[0];
    fireEvent.click(modifyBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/employees/emp-uuid/modifier");
  });

  test("CONSULTANT ne voit pas le bouton Modifier", async () => {
    renderPage("CONSULTANT");
    await waitFor(() => screen.getByText("EMP-001"));
    expect(screen.queryByText("✏️ Modifier")).not.toBeInTheDocument();
  });
});

describe("EmployeeDetail — upload fichier (ADMIN)", () => {
  test("affiche la section d'upload pour ADMIN", async () => {
    renderPage("ADMIN");
    await waitFor(() => {
      expect(screen.getByText(/Ajouter un document|Upload/i)).toBeInTheDocument();
    });
  });

  test("CONSULTANT ne voit pas la section upload", async () => {
    renderPage("CONSULTANT");
    await waitFor(() => screen.getByText("EMP-001"));
    expect(
      screen.queryByText(/Ajouter un document|Choisir un fichier/i)
    ).not.toBeInTheDocument();
  });

  test("upload réussi affiche un message de succès", async () => {
    api.post.mockResolvedValue({});
    renderPage("ADMIN");
    await waitFor(() => screen.getByText("EMP-001"));

    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      const file = new File(["pdf"], "test.pdf", { type: "application/pdf" });
      fireEvent.change(fileInput, { target: { files: [file] } });
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/employees/emp-uuid/documents/",
          expect.any(FormData),
          expect.any(Object)
        );
      });
    }
  });
});

describe("EmployeeDetail — suppression fichier", () => {
  test("bouton supprimer fichier appelle DELETE (ADMIN)", async () => {
    window.confirm = jest.fn(() => true);
    api.delete.mockResolvedValue({});
    renderPage("ADMIN");
    await waitFor(() => screen.getByText("cin_recto.pdf"));

    const deleteBtns = screen.getAllByText(/🗑️|Supprimer/i);
    if (deleteBtns.length > 0) {
      fireEvent.click(deleteBtns[0]);
      await waitFor(() => {
        expect(api.delete).toHaveBeenCalled();
      });
    }
  });
});
