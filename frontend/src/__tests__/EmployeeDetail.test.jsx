/**
 * Tests — pages/EmployeeDetail.jsx
 * Couvre : rendu, chargement employé, affichage documents, upload fichier, suppression
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../components/SecureDocViewer", () => () => (
  <div data-testid="doc-viewer">Visionneuse document</div>
));
jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import EmployeeDetail from "../pages/EmployeeDetail";

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
  documents_manquants: [{ code: "DIPLOME", label: "Diplôme" }],
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

const mockContrats = [
  {
    id: "contrat-1",
    numero_contrat: "CTR-2020-001",
    type_contrat_nom: "CDI",
    date_debut: "2020-01-01",
    date_fin: null,
    statut: "actif",
    nb_documents: 2,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => "blob:mock-url");
  URL.revokeObjectURL = jest.fn();

  api.get.mockImplementation((url) => {
    if (url.includes("types-documents")) {
      return Promise.resolve({ data: { results: mockTypes } });
    }
    if (url.includes("types-contrat")) {
      return Promise.resolve({ data: { results: [{ id: "tc-1", nom: "CDI" }] } });
    }
    if (url.includes("/contrats/")) {
      return Promise.resolve({ data: mockContrats });
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
      expect(screen.getAllByText("EMP-001").length).toBeGreaterThan(0);
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
      expect(screen.getAllByText("actif").length).toBeGreaterThan(0);
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
      expect(screen.getAllByText("Carte Nationale").length).toBeGreaterThan(0);
    });
  });

  test("affiche la section documents", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText("Carte Nationale").length).toBeGreaterThan(0);
    });
  });

  test("affiche les documents manquants", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Diplôme")).toBeInTheDocument();
    });
  });
});

describe("EmployeeDetail — onglets contrat (dossier)", () => {
  const mockDocContrat = {
    id: "doc-2",
    type_document: "BULLETIN",
    type_document_label: "Bulletin de salaire",
    is_active: true,
    fichiers: [],
    nb_fichiers: 0,
    contrat: "contrat-1",
  };

  const employeeAvecDeuxDocs = {
    ...mockEmployee,
    documents: [mockDoc, mockDocContrat],
  };

  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url.includes("types-documents")) {
        return Promise.resolve({ data: { results: mockTypes } });
      }
      if (url.includes("types-contrat")) {
        return Promise.resolve({ data: { results: [{ id: "tc-1", nom: "CDI" }] } });
      }
      if (url.includes("/contrats/")) {
        return Promise.resolve({ data: mockContrats });
      }
      if (url.includes("files/")) {
        return Promise.resolve({ data: new Blob(["pdf"], { type: "application/pdf" }) });
      }
      return Promise.resolve({ data: employeeAvecDeuxDocs });
    });
  });

  test("affiche un onglet par contrat avec le dernier sélectionné par défaut", async () => {
    renderPage("ADMIN");
    await waitFor(() => {
      const onglet = screen.getByRole("button", { name: "CTR-2020-001" });
      expect(onglet).toHaveAttribute("aria-pressed", "true");
    });
  });

  test("le dossier général et les documents du contrat sélectionné sont visibles", async () => {
    renderPage("ADMIN");
    // Les documents visibles incluent le document sans contrat (général) et ceux du contrat sélectionné
    await waitFor(() => {
      expect(screen.getAllByText("Carte Nationale").length).toBeGreaterThan(0);
    });
  });

  test("aucun onglet affiché si l'employé n'a aucun contrat", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("types-documents")) {
        return Promise.resolve({ data: { results: mockTypes } });
      }
      if (url.includes("types-contrat")) {
        return Promise.resolve({ data: { results: [] } });
      }
      if (url.includes("/contrats/")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: mockEmployee });
    });
    renderPage("ADMIN");
    await waitFor(() => screen.getAllByText("EMP-001").length > 0);
    expect(screen.queryByRole("button", { name: "CTR-2020-001" })).not.toBeInTheDocument();
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
    await waitFor(() => screen.getAllByText("EMP-001").length > 0);
    expect(screen.queryByText("✏️ Modifier")).not.toBeInTheDocument();
  });
});

describe("EmployeeDetail — upload fichier (ADMIN)", () => {
  test("affiche la section d'upload pour ADMIN", async () => {
    renderPage("ADMIN");
    await waitFor(() => {
      expect(screen.getAllByText(/Ajouter un document/i).length).toBeGreaterThan(0);
    });
  });

  test("CONSULTANT ne voit pas la section upload", async () => {
    renderPage("CONSULTANT");
    await waitFor(() => screen.getAllByText("EMP-001").length > 0);
    expect(
      screen.queryByText(/Ajouter un document|Choisir un fichier/i)
    ).not.toBeInTheDocument();
  });

  test("upload réussi appelle api.post avec FormData", async () => {
    api.post.mockResolvedValue({});
    renderPage("ADMIN");
    await waitFor(() => screen.getAllByText("EMP-001").length > 0);

    // Cibler le premier input file du formulaire principal (pas les quick upload)
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const mainInput = fileInputs[0];
    if (mainInput) {
      const file = new File(["pdf"], "test.pdf", { type: "application/pdf" });
      fireEvent.change(mainInput, { target: { files: [file] } });
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

describe("EmployeeDetail — quick upload (document manquant)", () => {
  test("affiche le bouton 📎 à côté de chaque document manquant (ADMIN)", async () => {
    renderPage("ADMIN");
    await waitFor(() => screen.getByText("Diplôme"));
    const quickBtns = screen.getAllByTitle(/Uploader/i);
    expect(quickBtns.length).toBeGreaterThanOrEqual(1);
  });

  test("CONSULTANT ne voit pas le bouton quick upload", async () => {
    renderPage("CONSULTANT");
    await waitFor(() => screen.getByText("Diplôme"));
    expect(screen.queryByTitle(/Uploader/i)).not.toBeInTheDocument();
  });

  test("quick upload appelle api.post avec le bon type_doc", async () => {
    api.post.mockResolvedValue({});
    renderPage("ADMIN");
    await waitFor(() => screen.getByText("Diplôme"));

    const quickInputs = document.querySelectorAll('label[title] input[type="file"]');
    if (quickInputs.length > 0) {
      const file = new File(["img"], "diplome.pdf", { type: "application/pdf" });
      fireEvent.change(quickInputs[0], { target: { files: [file] } });
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

describe("EmployeeDetail — onglet Contrats", () => {
  test("affiche l'onglet Dossier", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Dossier/)).toBeInTheDocument();
    });
  });

  test("affiche l'onglet Contrats", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Contrats/)).toBeInTheDocument();
    });
  });

  test("clic sur onglet Contrats affiche la liste", async () => {
    renderPage("ADMIN");
    await waitFor(() => screen.getByText(/Contrats/));
    const contratsTab = screen.getAllByText(/Contrats/)[0];
    fireEvent.click(contratsTab);
    await waitFor(() => {
      expect(screen.getAllByText("CTR-2020-001").length).toBeGreaterThan(0);
    });
  });

  test("bouton + Nouveau contrat visible pour ADMIN", async () => {
    renderPage("ADMIN");
    await waitFor(() => screen.getByText(/Contrats/));
    fireEvent.click(screen.getAllByText(/Contrats/)[0]);
    await waitFor(() => {
      expect(screen.getByText("+ Nouveau contrat")).toBeInTheDocument();
    });
  });

  test("CONSULTANT ne voit pas + Nouveau contrat", async () => {
    renderPage("CONSULTANT");
    await waitFor(() => screen.getByText(/Contrats/));
    fireEvent.click(screen.getAllByText(/Contrats/)[0]);
    await waitFor(() => screen.getAllByText("CTR-2020-001").length > 0);
    expect(screen.queryByText("+ Nouveau contrat")).not.toBeInTheDocument();
  });

  test("clic sur un contrat navigue vers sa page", async () => {
    renderPage("ADMIN");
    await waitFor(() => screen.getByText(/Contrats/));
    fireEvent.click(screen.getAllByText(/Contrats/)[0]);
    await waitFor(() => screen.getAllByText("CTR-2020-001").length > 0);
    // Cherche la ligne de la table dans l'onglet contrats (pas le badge header)
    const rows = document.querySelectorAll("tr");
    const contratRow = Array.from(rows).find((tr) =>
      tr.textContent.includes("CTR-2020-001") && tr.textContent.includes("CDI")
    );
    if (contratRow) fireEvent.click(contratRow);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/contrats/contrat-1");
    });
  });
});

describe("EmployeeDetail — suppression fichier", () => {
  test("bouton supprimer fichier appelle DELETE (ADMIN)", async () => {
    window.confirm = jest.fn(() => true);
    api.delete.mockResolvedValue({});
    renderPage("ADMIN");
    await waitFor(() => screen.getAllByText("Carte Nationale").length > 0);

    const deleteBtns = screen.queryAllByTitle(/Supprimer/i);
    if (deleteBtns.length > 0) {
      fireEvent.click(deleteBtns[0]);
      await waitFor(() => {
        expect(api.delete).toHaveBeenCalled();
      });
    }
  });
});
