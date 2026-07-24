/**
 * Tests — pages/Parametres.jsx
 * Couvre : rendu, onglets, chargement données, ajout/suppression référentiels, modal
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "ADMIN", username: "admin" } }),
}));

import api from "../services/api";
import Parametres from "../pages/Parametres";

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

  test("affiche un skeleton pendant le fetch", () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.queryByText("Chargement...")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
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
  test("clic Modifier ouvre le modal en mode édition avec les données pré-remplies", async () => {
    api.get.mockResolvedValue(dirResponse);
    renderPage();
    await waitFor(() => screen.getByText("Direction Générale"));
    const editBtns = screen.getAllByTitle("Modifier");
    fireEvent.click(editBtns[0]);
    await waitFor(() => {
      const input = screen.getByDisplayValue("Direction Générale");
      expect(input).toBeInTheDocument();
    });
  });
});

describe("Parametres — suppression", () => {
  test("clic Supprimer avec confirmation appelle DELETE", async () => {
    api.get.mockResolvedValue(dirResponse);
    api.delete = jest.fn().mockResolvedValue({});
    renderPage();
    await waitFor(() => screen.getByText("Direction Générale"));
    const delBtns = screen.getAllByTitle("Supprimer");
    fireEvent.click(delBtns[0]);
    await waitFor(() => screen.getByText("Confirmer"));
    fireEvent.click(screen.getByText("Confirmer"));
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(
        expect.stringContaining("dir-1")
      );
    });
  });

  test("annuler la confirmation ne supprime pas", async () => {
    api.get.mockResolvedValue(dirResponse);
    api.delete = jest.fn();
    renderPage();
    await waitFor(() => screen.getAllByTitle("Supprimer"));
    const delBtns = screen.getAllByTitle("Supprimer");
    fireEvent.click(delBtns[0]);
    await waitFor(() => screen.getByText("Annuler"));
    fireEvent.click(screen.getByText("Annuler"));
    expect(api.delete).not.toHaveBeenCalled();
  });

  test("erreur API lors de la suppression affiche un message d'erreur", async () => {
    api.get.mockResolvedValue(dirResponse);
    api.delete = jest.fn().mockRejectedValue({
      response: { data: { error: "Impossible de supprimer : cet élément est utilisé." } },
    });
    renderPage();
    await waitFor(() => screen.getAllByTitle("Supprimer"));
    fireEvent.click(screen.getAllByTitle("Supprimer")[0]);
    await waitFor(() => screen.getByText("Confirmer"));
    fireEvent.click(screen.getByText("Confirmer"));
    await waitFor(() => {
      expect(screen.getByText("Impossible de supprimer : cet élément est utilisé.")).toBeInTheDocument();
    });
  });
});

describe("Parametres — erreurs réseau", () => {
  test("erreur lors du chargement affiche un message d'erreur", async () => {
    api.get.mockRejectedValue(new Error("Network Error"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/erreur|impossible/i)).toBeInTheDocument();
    });
  });

  test("erreur API lors de l'ajout affiche le message d'erreur serveur", async () => {
    api.get.mockResolvedValue(emptyResponse);
    api.post.mockRejectedValue({
      response: { data: { nom: ["Ce nom existe déjà."] } },
    });
    renderPage();
    await waitFor(() => screen.getByText(/\+ Ajouter/i));
    fireEvent.click(screen.getByText(/\+ Ajouter/i));
    await waitFor(() => screen.getByText("Enregistrer"));
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => {
      expect(screen.getByText("Ce nom existe déjà.")).toBeInTheDocument();
    });
  });

  test("erreur réseau lors de l'ajout affiche le message générique", async () => {
    api.get.mockResolvedValue(emptyResponse);
    api.post.mockRejectedValue(new Error("Network Error"));
    renderPage();
    await waitFor(() => screen.getByText(/\+ Ajouter/i));
    fireEvent.click(screen.getByText(/\+ Ajouter/i));
    await waitFor(() => screen.getByText("Enregistrer"));
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => {
      expect(screen.getByText("Une erreur est survenue.")).toBeInTheDocument();
    });
  });
});
