/**
 * Tests — pages/Profil.jsx
 * Couvre : affichage infos user, formulaire changement MDP, toggle password, messages
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
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
import Profil from "../pages/Profil";

const adminUser = {
  id: "1",
  username: "admin.test",
  nom: "Admin",
  prenom: "Test",
  role: "ADMIN",
};

const renderPage = (user = adminUser) => {
  useAuth.mockReturnValue({ user });
  return render(
    <MemoryRouter>
      <Profil />
    </MemoryRouter>
  );
};

beforeEach(() => jest.clearAllMocks());

describe("Profil — informations utilisateur", () => {
  test("affiche le nom complet", () => {
    renderPage();
    expect(screen.getByText("Test Admin")).toBeInTheDocument();
  });

  test("affiche le username", () => {
    renderPage();
    expect(screen.getByText("@admin.test")).toBeInTheDocument();
  });

  test("affiche le rôle", () => {
    renderPage();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  test("affiche les initiales dans l'avatar", () => {
    renderPage();
    // Les initiales de "Test Admin" dans l'avatar
    expect(screen.getByText("TA")).toBeInTheDocument();
  });

  test("affiche le titre Changer le mot de passe", () => {
    renderPage();
    expect(screen.getByText("Changer le mot de passe")).toBeInTheDocument();
  });

  test("affiche le bouton Retour", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /retour/i })).toBeInTheDocument();
  });

  test("clic Retour appelle navigate(-1)", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /retour/i }));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});

describe("Profil — formulaire changement de mot de passe", () => {
  test("affiche les 3 champs de mot de passe", () => {
    renderPage();
    expect(screen.getByText("Ancien mot de passe")).toBeInTheDocument();
    expect(screen.getByText("Nouveau mot de passe")).toBeInTheDocument();
    expect(screen.getByText("Confirmer le nouveau mot de passe")).toBeInTheDocument();
  });

  test("affiche le bouton de soumission", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: "Modifier le mot de passe" })
    ).toBeInTheDocument();
  });

  test("les champs de mot de passe sont masqués par défaut", () => {
    renderPage();
    const inputs = screen.getAllByPlaceholderText("••••••••••");
    inputs.forEach((input) => {
      expect(input).toHaveAttribute("type", "password");
    });
  });

  test("toggle démasque un champ", () => {
    renderPage();
    const toggles = screen.getAllByRole("button", { name: /afficher\/masquer/i });
    fireEvent.click(toggles[0]);
    const inputs = screen.getAllByPlaceholderText("••••••••••");
    expect(inputs[0]).toHaveAttribute("type", "text");
  });
});

describe("Profil — soumission du formulaire", () => {
  const fillForm = () => {
    const inputs = screen.getAllByPlaceholderText("••••••••••");
    fireEvent.change(inputs[0], {
      target: { name: "ancien_mot_de_passe", value: "AncienPass123!" },
    });
    fireEvent.change(inputs[1], {
      target: { name: "nouveau_mot_de_passe", value: "NouveauPass123!" },
    });
    fireEvent.change(inputs[2], {
      target: { name: "confirmation", value: "NouveauPass123!" },
    });
  };

  test("soumission réussie affiche le message de succès", async () => {
    api.post.mockResolvedValue({
      data: { message: "Mot de passe modifié avec succès." },
    });
    renderPage();
    fillForm();
    fireEvent.submit(
      screen.getByRole("button", { name: "Modifier le mot de passe" })
    );
    await waitFor(() => {
      expect(
        screen.getByText("Mot de passe modifié avec succès.")
      ).toBeInTheDocument();
    });
  });

  test("soumission réussie vide les champs du formulaire", async () => {
    api.post.mockResolvedValue({
      data: { message: "Mot de passe modifié avec succès." },
    });
    renderPage();
    fillForm();
    fireEvent.submit(
      screen.getByRole("button", { name: "Modifier le mot de passe" })
    );
    await waitFor(() => {
      const inputs = screen.getAllByPlaceholderText("••••••••••");
      inputs.forEach((input) => {
        expect(input.value).toBe("");
      });
    });
  });

  test("erreur API affiche le message d'erreur", async () => {
    api.post.mockRejectedValue({
      response: { data: { error: "Ancien mot de passe incorrect." } },
    });
    renderPage();
    fillForm();
    fireEvent.submit(
      screen.getByRole("button", { name: "Modifier le mot de passe" })
    );
    await waitFor(() => {
      expect(
        screen.getByText("Ancien mot de passe incorrect.")
      ).toBeInTheDocument();
    });
  });

  test("erreur sans réponse affiche message générique", async () => {
    api.post.mockRejectedValue(new Error("Network"));
    renderPage();
    fillForm();
    fireEvent.submit(
      screen.getByRole("button", { name: "Modifier le mot de passe" })
    );
    await waitFor(() => {
      expect(screen.getByText("Erreur.")).toBeInTheDocument();
    });
  });

  test("le bouton est désactivé pendant la soumission", async () => {
    let resolveFn;
    api.post.mockReturnValue(new Promise((res) => { resolveFn = res; }));
    renderPage();
    fillForm();
    fireEvent.submit(
      screen.getByRole("button", { name: "Modifier le mot de passe" })
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Enregistrement..." })
      ).toBeDisabled();
    });
    resolveFn({ data: { message: "ok" } });
  });
});
