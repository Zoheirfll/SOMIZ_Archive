/**
 * Tests — pages/EmployeeDetail.jsx
 * Couvre : rendu, chargement employé, affichage documents, upload fichier, suppression
 */

import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../components/SecureDocViewer", () => () => (
  <div data-testid="doc-viewer">Visionneuse document</div>
));
jest.mock("../components/ScanImportModal", () => () => (
  <div data-testid="scan-import-modal">Scan import</div>
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
  is_active: true,
  fichiers: [mockFile],
  nb_fichiers: 1,
  version: 1,
  file_size_kb: 100,
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

  test("affiche un skeleton pendant le fetch", () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.queryByText("Chargement...")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
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

  test("le hero header a le cercle décoratif ambre en overlay", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText("EMP-001").length).toBeGreaterThan(0);
    });
    const decor = document.querySelector('[data-testid="hero-decor"]');
    expect(decor).toBeInTheDocument();
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
    is_active: true,
    fichiers: [],
    nb_fichiers: 0,
    version: 1,
    file_size_kb: 0,
    contrat: "contrat-1",
  };

  const employeeAvecDeuxDocs = {
    ...mockEmployee,
    documents: [mockDoc, mockDocContrat],
  };

  beforeEach(() => {
    const typesDocumentsAvecBulletin = [
      ...mockTypes,
      { id: "type-3", code: "BULLETIN", nom: "Bulletin de salaire", obligatoire: false },
    ];
    api.get.mockImplementation((url) => {
      if (url.includes("types-documents")) {
        return Promise.resolve({ data: { results: typesDocumentsAvecBulletin } });
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
      // Doit aussi afficher le document lié au contrat sélectionné (contrat-1 par défaut)
      expect(screen.getAllByText("Bulletin de salaire").length).toBeGreaterThan(0);
    });
  });

  test("filtre correctement les documents par contrat — exclut les docs d'autres contrats", async () => {
    // Variante avec 2 contrats et 2 docs liés à des contrats différents
    const mockDocAttestation = {
      id: "doc-3",
      type_document: "ATTESTATION",
      is_active: true,
      fichiers: [],
      nb_fichiers: 0,
      version: 1,
      file_size_kb: 0,
      contrat: "contrat-0", // Contrat plus ancien
    };

    const mockContratsAvecDeux = [
      {
        id: "contrat-0",
        numero_contrat: "CTR-2019-000",
        type_contrat_nom: "CDI",
        date_debut: "2019-01-01",
        date_fin: "2020-01-01",
        statut: "inactif",
        nb_documents: 1,
      },
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

    const typesDocumentsComplets = [
      ...mockTypes,
      { id: "type-3", code: "BULLETIN", nom: "Bulletin de salaire", obligatoire: false },
      { id: "type-4", code: "ATTESTATION", nom: "Attestation de travail", obligatoire: false },
    ];

    const employeeAvecTroisDocs = {
      ...mockEmployee,
      documents: [mockDoc, mockDocContrat, mockDocAttestation],
    };

    api.get.mockImplementation((url) => {
      if (url.includes("types-documents")) {
        return Promise.resolve({ data: { results: typesDocumentsComplets } });
      }
      if (url.includes("types-contrat")) {
        return Promise.resolve({ data: { results: [{ id: "tc-1", nom: "CDI" }] } });
      }
      if (url.includes("/contrats/")) {
        return Promise.resolve({ data: mockContratsAvecDeux });
      }
      if (url.includes("files/")) {
        return Promise.resolve({ data: new Blob(["pdf"], { type: "application/pdf" }) });
      }
      return Promise.resolve({ data: employeeAvecTroisDocs });
    });

    renderPage("ADMIN");
    await waitFor(() => {
      // Le contrat le plus récent (contrat-1) doit être sélectionné par défaut
      const onglet = screen.getByRole("button", { name: "CTR-2020-001" });
      expect(onglet).toHaveAttribute("aria-pressed", "true");
    });

    // Docs visibles : doc général + doc du contrat sélectionné
    await waitFor(() => {
      expect(screen.getAllByText("Carte Nationale").length).toBeGreaterThan(0); // général
      expect(screen.getAllByText("Bulletin de salaire").length).toBeGreaterThan(0); // contrat-1
    });

    // Doc du AUTRE contrat doit être caché — vérifier que seuls les docs du contrat sélectionné sont visibles
    // Les labels des documents sont dans des <span> avec fontWeight: 600
    const sidebarHeader = screen.getByText("Documents (2)");
    const sidebar = sidebarHeader.closest("div").parentElement;
    const documentTypeSpans = sidebar.querySelectorAll('span');
    const documentLabels = Array.from(documentTypeSpans)
      .filter((span) => span.style.fontWeight === "600")
      .map((span) => span.textContent);

    expect(documentLabels).toContain("Bulletin de salaire"); // du contrat sélectionné
    expect(documentLabels).not.toContain("Attestation de travail"); // du contrat non-sélectionné
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

  test("upload réussi appelle api.post sur l'endpoint du contrat sélectionné", async () => {
    api.post.mockResolvedValue({});
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
    renderPage("ADMIN");
    await waitFor(() => screen.getAllByText("EMP-001").length > 0);
    // Attendre que les contrats soient chargés
    await waitFor(() => {
      const tabBtn = screen.getByRole("button", { name: "CTR-2020-001" });
      expect(tabBtn).toHaveAttribute("aria-pressed", "true");
    });

    // Obtenir l'input du formulaire principal "Choisir fichier(s)" (dernier input, pas les quick-uploads)
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const mainInput = fileInputs[fileInputs.length - 1];
    if (mainInput) {
      const file = new File(["pdf"], "test.pdf", { type: "application/pdf" });
      fireEvent.change(mainInput, { target: { files: [file] } });
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/contrats/contrat-1/documents/",
          expect.any(FormData),
          expect.any(Object)
        );
      });
    }
  });

  test("upload réussi cible le dossier général si l'employé n'a aucun contrat", async () => {
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
    api.post.mockResolvedValue({});
    renderPage("ADMIN");
    await waitFor(() => screen.getAllByText("EMP-001").length > 0);

    const fileInputs = document.querySelectorAll('input[type="file"]');
    const mainInput = fileInputs[fileInputs.length - 1];
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
  test("affiche le bouton d'upload rapide à côté de chaque document manquant (ADMIN)", async () => {
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
    api.delete.mockResolvedValue({});
    renderPage("ADMIN");
    await waitFor(() => screen.getAllByText("Carte Nationale").length > 0);

    const deleteBtns = screen.queryAllByTitle(/Supprimer/i);
    if (deleteBtns.length > 0) {
      fireEvent.click(deleteBtns[0]);
      await waitFor(() => screen.getByText("Confirmer"));
      fireEvent.click(screen.getByText("Confirmer"));
      await waitFor(() => {
        expect(api.delete).toHaveBeenCalled();
      });
    }
  });
});

describe("EmployeeDetail — préservation sélection contrat après upload", () => {
  test("après upload, le contrat sélectionné (non-défaut) reste sélectionné", async () => {
    // Deux contrats : un ancien (contrat-0), un récent (contrat-1)
    const mockContratsAvecDeux = [
      {
        id: "contrat-0",
        numero_contrat: "CTR-2019-000",
        type_contrat_nom: "CDI",
        date_debut: "2019-01-01",
        date_fin: "2020-01-01",
        statut: "inactif",
        nb_documents: 1,
      },
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

    api.get.mockImplementation((url) => {
      if (url.includes("types-documents")) {
        return Promise.resolve({ data: { results: mockTypes } });
      }
      if (url.includes("types-contrat")) {
        return Promise.resolve({ data: { results: [{ id: "tc-1", nom: "CDI" }] } });
      }
      if (url.includes("/contrats/")) {
        return Promise.resolve({ data: mockContratsAvecDeux });
      }
      if (url.includes("files/")) {
        return Promise.resolve({ data: new Blob(["pdf"], { type: "application/pdf" }) });
      }
      return Promise.resolve({ data: mockEmployee });
    });

    api.post.mockResolvedValue({});

    renderPage("ADMIN");

    // Attendre le chargement initial — par défaut le contrat récent (contrat-1) est sélectionné
    await waitFor(() => {
      const tabBtn = screen.getByRole("button", { name: "CTR-2020-001" });
      expect(tabBtn).toHaveAttribute("aria-pressed", "true");
    });

    // Cliquer sur l'onglet du contrat ANCIEN (contrat-0)
    const olderContractTab = screen.getByRole("button", { name: "CTR-2019-000" });
    fireEvent.click(olderContractTab);

    // Vérifier que le contrat ancien est maintenant sélectionné
    await waitFor(() => {
      const tabBtn = screen.getByRole("button", { name: "CTR-2019-000" });
      expect(tabBtn).toHaveAttribute("aria-pressed", "true");
    });

    // Récupérer le file input principal et déclencher un upload
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const mainInput = fileInputs[fileInputs.length - 1];
    if (mainInput) {
      const file = new File(["pdf"], "test.pdf", { type: "application/pdf" });
      fireEvent.change(mainInput, { target: { files: [file] } });

      // Attendre que l'upload soit fait (api.post) et que fetchContrats soit rappelé
      await waitFor(() => {
        expect(api.post).toHaveBeenCalled();
      });
    }

    // Point crucial : après l'upload qui déclenche fetchContrats(),
    // le contrat ancien doit RESTER sélectionné (pas réinitialisé au contrat récent)
    await waitFor(() => {
      const tabBtn = screen.getByRole("button", { name: "CTR-2019-000" });
      expect(tabBtn).toHaveAttribute("aria-pressed", "true");
    });

    // Vérifier aussi que le contrat récent n'est plus sélectionné
    const recentTab = screen.getByRole("button", { name: "CTR-2020-001" });
    expect(recentTab).toHaveAttribute("aria-pressed", "false");
  });
});

describe("EmployeeDetail — sélection par défaut cohérente avec le contrat affiché", () => {
  test("le fichier chargé par défaut appartient au contrat récent, pas à un contrat plus ancien", async () => {
    const oldFile = { id: "file-old", file_name: "diplome_ancien.pdf", mime_type: "application/pdf" };
    const oldDoc = {
      id: "doc-old", type_document: "DIPLOME", is_active: true,
      contrat: "contrat-0", fichiers: [oldFile], nb_fichiers: 1, version: 1, file_size_kb: 100,
    };
    const recentFile = { id: "file-recent", file_name: "diplome_recent.pdf", mime_type: "application/pdf" };
    const recentDoc = {
      id: "doc-recent", type_document: "DIPLOME", is_active: true,
      contrat: "contrat-1", fichiers: [recentFile], nb_fichiers: 1, version: 1, file_size_kb: 100,
    };
    const employeeDeuxContrats = {
      ...mockEmployee,
      // Le document de l'ANCIEN contrat apparaît en premier dans la liste
      documents: [oldDoc, recentDoc],
    };
    const contratsAvecDeux = [
      { id: "contrat-0", numero_contrat: "CTR-2019-000", type_contrat_nom: "CDI", date_debut: "2019-01-01", date_fin: "2020-01-01", statut: "inactif", nb_documents: 1 },
      { id: "contrat-1", numero_contrat: "CTR-2020-001", type_contrat_nom: "CDI", date_debut: "2020-01-01", date_fin: null, statut: "actif", nb_documents: 1 },
    ];

    api.get.mockImplementation((url) => {
      if (url.includes("types-documents")) return Promise.resolve({ data: { results: mockTypes } });
      if (url.includes("types-contrat")) return Promise.resolve({ data: { results: [{ id: "tc-1", nom: "CDI" }] } });
      if (url.includes("/contrats/")) return Promise.resolve({ data: contratsAvecDeux });
      if (url.includes(`files/${recentFile.id}`)) return Promise.resolve({ data: new Blob(["pdf-recent"], { type: "application/pdf" }) });
      if (url.includes(`files/${oldFile.id}`)) return Promise.resolve({ data: new Blob(["pdf-old"], { type: "application/pdf" }) });
      return Promise.resolve({ data: employeeDeuxContrats });
    });

    renderPage("ADMIN");

    // Le contrat récent doit être sélectionné par défaut
    await waitFor(() => {
      const tabBtn = screen.getByRole("button", { name: "CTR-2020-001" });
      expect(tabBtn).toHaveAttribute("aria-pressed", "true");
    });

    // Le fichier chargé (appelé via /files/{id}/view/) doit être celui du contrat récent
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining(`files/${recentFile.id}`),
        expect.any(Object),
      );
    });
    expect(api.get).not.toHaveBeenCalledWith(
      expect.stringContaining(`files/${oldFile.id}`),
      expect.any(Object),
    );
  });
});

describe("EmployeeDetail — position stable des documents (pas de saut au ré-upload)", () => {
  test("l'ordre visuel (CSS order) suit le champ ordre du type, pas la présence/absence", async () => {
    const docHaut = { ...mockDoc, id: "doc-haut", type_document: "CONTRAT", ordre: 1, type_ordre: 1 };
    const docBas = { ...mockDoc, id: "doc-bas", type_document: "DIPLOME", ordre: 5, type_ordre: 5 };
    const employeeCustom = {
      ...mockEmployee,
      // "doc-bas" (ordre=5) apparaît AVANT "doc-haut" (ordre=1) dans le
      // tableau brut — l'affichage doit quand même respecter ordre=1 < 5.
      documents: [docBas, docHaut],
      documents_manquants: [{ code: "CV", label: "CV", ordre: 3, type_ordre: 3 }],
    };
    api.get.mockImplementation((url) => {
      if (url.includes("types-documents")) return Promise.resolve({ data: { results: mockTypes } });
      if (url.includes("types-contrat")) return Promise.resolve({ data: { results: [] } });
      if (url.includes("/contrats/")) return Promise.resolve({ data: [] });
      if (url.includes("files/")) return Promise.resolve({ data: new Blob(["pdf"], { type: "application/pdf" }) });
      return Promise.resolve({ data: employeeCustom });
    });

    renderPage("ADMIN");
    await waitFor(() => screen.getAllByText("EMP-001").length > 0);

    const getOrder = (el) => parseInt(el.style.order, 10);

    const contratLabel = (await screen.findAllByText("CONTRAT"))[0];
    const diplomeLabel = (await screen.findAllByText("DIPLOME"))[0];
    const cvLabel = (await screen.findAllByText("CV"))[0];

    // Remonter jusqu'au conteneur de ligne qui porte le style `order`
    const findOrderedAncestor = (el) => {
      let node = el;
      while (node && node.style.order === "") node = node.parentElement;
      return node;
    };

    const orderContrat = getOrder(findOrderedAncestor(contratLabel));
    const orderDiplome = getOrder(findOrderedAncestor(diplomeLabel));
    const orderCv = getOrder(findOrderedAncestor(cvLabel));

    expect(orderContrat).toBeLessThan(orderCv);
    expect(orderCv).toBeLessThan(orderDiplome);
  });
});
