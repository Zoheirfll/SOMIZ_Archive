/**
 * Tests — pages/Parametres.jsx
 * Couvre : rendu, onglets, chargement données, ajout/suppression référentiels, modal
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../../frontend/src/services/api", () => ({
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock("../../frontend/src/components/Navbar", () => () => <nav data-testid="navbar" />);

import api from "../../frontend/src/services/api";
import Parametres from "../../frontend/src/pages/Parametres";

const makeItem = (id, nom, code = "") => ({ id, nom, code, is_active: true });

const emptyResponse = { data: { results: [] } };
const dirResponse = {
  data: { results: [makeItem("dir-1", "Direction Générale", "DG")] },
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <Parametres />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue(emptyResponse);
});

describe("Parametres — rendu initial", () => {
  test("affiche le titre Paramètres", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Paramètres/i)).toBeInTheDocument();
    });
  });

  test("affiche les 7 onglets", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Directions")).toBeInTheDocument();
      expect(screen.getByText("Départements")).toBeInTheDocument();
      expect(screen.getByText("Services")).toBeInTheDocument();
      expect(screen.getByText("Postes")).toBeInTheDocument();
      expect(screen.getByText("Types de contrat")).toBeInTheDocument();
      expect(screen.getByText("Catégories")).toBeInTheDocument();
      expect(screen.getByText("Types de documents")).toBeInTheDocument();
    });
  });

  test("l'onglet Directions est actif par défaut", async () => {
    renderPage();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("/ref/directions/")
      );
    });
  });

  test("affiche le bouton + Ajouter", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/\+ Ajouter/i)).toBeInTheDocument();
    });
  });
});

describe("Parametres — chargement des données", () => {
  test("affiche les éléments chargés", async () => {
    api.get.mockResolvedValue(dirResponse);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Direction Générale")).toBeInTheDocument();
    });
  });

  test("affiche le message vide si aucun élément", async () => {
    api.get.mockResolvedValue(emptyResponse);
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/Aucun élément/)
      ).toBeInTheDocument();
    });
  });

  test("affiche Chargement... pendant le fetch", () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Chargement...")).toBeInTheDocument();
  });
});

describe("Parametres — navigation onglets", () => {
  test("clic sur Postes charge les postes", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Postes"));
    fireEvent.click(screen.getByText("Postes"));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("/ref/postes/")
      );
    });
  });

  test("clic sur Types de contrat charge les types de contrat", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Types de contrat"));
    fireEvent.click(screen.getByText("Types de contrat"));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("/ref/types-contrat/")
      );
    });
  });

  test("clic sur Types de documents charge les types de documents", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Types de documents"));
    fireEvent.click(screen.getByText("Types de documents"));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("/ref/types-documents/")
      );
    });
  });
});

describe("Parametres — modal ajout", () => {
  test("clic + Ajouter ouvre le modal", async () => {
    renderPage();
    await waitFor(() => screen.getByText(/\+ Ajouter/i));
    fireEvent.click(screen.getByText(/\+ Ajouter/i));
    await waitFor(() => {
      expect(screen.getByText("Enregistrer")).toBeInTheDocument();
    });
  });

  test("clic Annuler dans le modal le ferme", async () => {
    renderPage();
    await waitFor(() => screen.getByText(/\+ Ajouter/i));
    fireEvent.click(screen.getByText(/\+ Ajouter/i));
    await waitFor(() => screen.getByText("Annuler"));
    fireEvent.click(screen.getByText("Annuler"));
    expect(screen.queryByText("Enregistrer")).not.toBeInTheDocument();
  });

  test("soumission POST réussie ferme le modal et recharge les données", async () => {
    api.get.mockResolvedValue(emptyResponse);
    api.post.mockResolvedValue({ data: { id: "new-1", nom: "Nouvelle Direction" } });
    renderPage();
    await waitFor(() => screen.getByText(/\+ Ajouter/i));
    fireEvent.click(screen.getByText(/\+ Ajouter/i));
    await waitFor(() => screen.getByText("Enregistrer"));
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalled();
    });
  });
});

describe("Parametres — édition", () => {
  test("clic ✏️ ouvre le modal en mode édition avec les données pré-remplies", async () => {
    api.get.mockResolvedValue(dirResponse);
    renderPage();
    await waitFor(() => screen.getByText("Direction Générale"));
    const editBtns = screen.getAllByText("✏️");
    fireEvent.click(editBtns[0]);
    await waitFor(() => {
      const input = screen.getByDisplayValue("Direction Générale");
      expect(input).toBeInTheDocument();
    });
  });
});

describe("Parametres — suppression", () => {
  test("clic 🗑️ avec confirmation appelle DELETE", async () => {
    window.confirm = jest.fn(() => true);
    api.get.mockResolvedValue(dirResponse);
    api.delete = jest.fn().mockResolvedValue({});
    renderPage();
    await waitFor(() => screen.getByText("Direction Générale"));
    const delBtns = screen.getAllByText("🗑️");
    fireEvent.click(delBtns[0]);
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(
        expect.stringContaining("dir-1")
      );
    });
  });

  test("annuler la confirmation ne supprime pas", async () => {
    window.confirm = jest.fn(() => false);
    api.get.mockResolvedValue(dirResponse);
    api.delete = jest.fn();
    renderPage();
    await waitFor(() => screen.getAllByText("🗑️"));
    const delBtns = screen.getAllByText("🗑️");
    fireEvent.click(delBtns[0]);
    expect(api.delete).not.toHaveBeenCalled();
  });
});
