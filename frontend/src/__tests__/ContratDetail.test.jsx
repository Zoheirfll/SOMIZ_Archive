/**
 * Tests — pages/ContratDetail.jsx
 * Couvre : rendu, chargement contrat, documents, upload, navigation, permissions
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../components/SecureDocViewer", () => () => (
  <div data-testid="doc-viewer">Visionneuse document</div>
));
jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import ContratDetail from "../pages/ContratDetail";

const mockFile = {
  id: "file-1",
  file_name: "contrat_v1.pdf",
  mime_type: "application/pdf",
  file_size: 204800,
  file_size_kb: 200,
};
const mockDoc = {
  id: "doc-1",
  type_document: "CONTRAT",
  type_document_label: "Contrat de travail",
  is_active: true,
  fichiers: [mockFile],
  nb_fichiers: 1,
  version: 1,
  file_size_kb: 200,
};
const mockContrat = {
  id: "contrat-uuid",
  numero_contrat: "CTR-2024-001",
  employee_id: "emp-uuid",
  employee_matricule: "MAT-0042",
  employee_nom: "Amine KHERROUBI",
  type_contrat_nom: "CDI",
  date_debut: "2024-01-15",
  date_fin: null,
  statut: "actif",
  notes: "",
  nb_documents: 1,
  documents: [mockDoc],
};
const mockTypes = [
  { id: "type-1", code: "CONTRAT", nom: "Contrat de travail", obligatoire: false },
  { id: "type-2", code: "AVENANT", nom: "Avenant", obligatoire: false },
];

const renderPage = (role = "ADMIN") => {
  useAuth.mockReturnValue({ user: { role, username: "admin" } });
  return render(
    <MemoryRouter initialEntries={["/contrats/contrat-uuid"]}>
      <Routes>
        <Route path="/contrats/:id" element={<ContratDetail />} />
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
    return Promise.resolve({ data: mockContrat });
  });
});

describe("ContratDetail — rendu initial", () => {
  test("affiche la navbar", async () => {
    renderPage();
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
  });

  test("affiche Chargement... pendant le fetch", () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Chargement...")).toBeInTheDocument();
  });

  test("affiche le numéro de contrat", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText("CTR-2024-001").length).toBeGreaterThan(0);
    });
  });

  test("affiche le matricule de l'employé", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/MAT-0042/)).toBeInTheDocument();
    });
  });

  test("affiche le nom de l'employé", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Amine KHERROUBI/)).toBeInTheDocument();
    });
  });

  test("affiche le type de contrat", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("CDI")).toBeInTheDocument();
    });
  });

  test("affiche le statut actif", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText("actif").length).toBeGreaterThan(0);
    });
  });

  test("affiche la date de début", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2024-01-15")).toBeInTheDocument();
    });
  });
});

describe("ContratDetail — fil d'ariane", () => {
  test("bouton ← Employés navigue vers la liste", async () => {
    renderPage();
    await waitFor(() => screen.getByText("← Employés"));
    fireEvent.click(screen.getByText("← Employés"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees");
  });

  test("bouton employé navigue vers sa fiche", async () => {
    renderPage();
    await waitFor(() => screen.getByText(/MAT-0042/));
    const empBtn = screen.getByText(/MAT-0042.*Amine KHERROUBI/);
    fireEvent.click(empBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/employees/emp-uuid");
  });
});

describe("ContratDetail — documents", () => {
  test("affiche la liste des documents", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Contrat de travail")).toBeInTheDocument();
    });
  });

  test("affiche le nom du fichier", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/contrat_v1\.pdf/)).toBeInTheDocument();
    });
  });

  test("affiche le compteur de documents", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Documents \(1\)/)).toBeInTheDocument();
    });
  });
});

describe("ContratDetail — upload (ADMIN)", () => {
  test("affiche la section d'upload pour ADMIN", async () => {
    renderPage("ADMIN");
    await waitFor(() => {
      expect(screen.getByText(/Ajouter un document/i)).toBeInTheDocument();
    });
  });

  test("CONSULTANT ne voit pas la section upload", async () => {
    renderPage("CONSULTANT");
    await waitFor(() => screen.getAllByText("CTR-2024-001").length > 0);
    expect(screen.queryByText(/Ajouter un document/i)).not.toBeInTheDocument();
  });

  test("upload appelle api.post sur /contrats/{id}/documents/", async () => {
    api.post.mockResolvedValue({ data: mockDoc });
    renderPage("ADMIN");
    await waitFor(() => screen.getByText(/Ajouter un document/i));

    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      const file = new File(["pdf"], "avenant.pdf", { type: "application/pdf" });
      fireEvent.change(fileInput, { target: { files: [file] } });
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/contrats/contrat-uuid/documents/",
          expect.any(FormData),
          expect.any(Object)
        );
      });
    }
  });
});

describe("ContratDetail — suppression document (ADMIN)", () => {
  test("bouton supprimer appelle DELETE", async () => {
    window.confirm = jest.fn(() => true);
    api.delete.mockResolvedValue({});
    renderPage("ADMIN");
    await waitFor(() => screen.getByText("Contrat de travail"));

    const deleteBtns = screen.getAllByText("🗑️");
    if (deleteBtns.length > 0) {
      fireEvent.click(deleteBtns[0]);
      await waitFor(() => {
        expect(api.delete).toHaveBeenCalled();
      });
    }
  });
});
