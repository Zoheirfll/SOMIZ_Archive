/**
 * Tests — pages/Users.jsx
 * Couvre : rendu, chargement liste, formulaire création, validation, reset MDP modal
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);

import api from "../services/api";
import Users from "../pages/Users";

const makeUser = (id, username = "user1", role = "CONSULTANT", is_active = true) => ({
  id,
  username,
  nom: "Dupont",
  prenom: "Jean",
  role,
  is_active,
  last_login: "2026-06-01T08:00:00Z",
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <Users />
    </MemoryRouter>
  );

beforeEach(() => jest.clearAllMocks());

describe("Users — rendu initial", () => {
  test("affiche le titre Utilisateurs", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    renderPage();
    expect(screen.getByText("Utilisateurs")).toBeInTheDocument();
  });

  test("affiche le bouton + Nouvel utilisateur", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    renderPage();
    expect(screen.getByText("+ Nouvel utilisateur")).toBeInTheDocument();
  });

  test("charge la liste des utilisateurs au montage", async () => {
    api.get.mockResolvedValue({ data: { results: [makeUser("1")] } });
    renderPage();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/admin-users/");
    });
  });
});

describe("Users — liste des utilisateurs", () => {
  test("affiche les utilisateurs chargés", async () => {
    api.get.mockResolvedValue({
      data: { results: [makeUser("1", "admin.test", "ADMIN")] },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("admin.test")).toBeInTheDocument();
    });
  });

  test("affiche le badge rôle ADMIN", async () => {
    api.get.mockResolvedValue({
      data: { results: [makeUser("1", "admin.test", "ADMIN")] },
    });
    renderPage();
    await waitFor(() => screen.getByText("ADMIN"));
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  test("affiche le badge Actif / Désactivé", async () => {
    api.get.mockResolvedValue({
      data: {
        results: [
          makeUser("1", "actif_user", "CONSULTANT", true),
          makeUser("2", "inactif_user", "CONSULTANT", false),
        ],
      },
    });
    renderPage();
    await waitFor(() => screen.getByText("Actif"));
    expect(screen.getByText("Actif")).toBeInTheDocument();
    expect(screen.getByText("Désactivé")).toBeInTheDocument();
  });

  test("affiche Jamais si last_login null", async () => {
    const u = makeUser("1");
    u.last_login = null;
    api.get.mockResolvedValue({ data: { results: [u] } });
    renderPage();
    await waitFor(() => screen.getByText("Jamais"));
    expect(screen.getByText("Jamais")).toBeInTheDocument();
  });
});

describe("Users — formulaire création", () => {
  test("cliquer sur + Nouvel utilisateur affiche le formulaire", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    renderPage();
    fireEvent.click(screen.getByText("+ Nouvel utilisateur"));
    expect(screen.getByText("Créer un compte")).toBeInTheDocument();
  });

  test("cliquer sur Annuler ferme le formulaire", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    renderPage();
    fireEvent.click(screen.getByText("+ Nouvel utilisateur"));
    fireEvent.click(screen.getByText("Annuler"));
    expect(screen.queryByText("Créer un compte")).not.toBeInTheDocument();
  });

  test("validation : champs vides affichent les erreurs", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    renderPage();
    fireEvent.click(screen.getByText("+ Nouvel utilisateur"));
    fireEvent.click(screen.getByText("Créer"));
    await waitFor(() => {
      expect(screen.getByText("Identifiant obligatoire.")).toBeInTheDocument();
    });
  });

  test("validation : mot de passe trop court", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    renderPage();
    fireEvent.click(screen.getByText("+ Nouvel utilisateur"));

    fireEvent.change(screen.getByPlaceholderText("prenom.nom"), {
      target: { name: "username", value: "test" },
    });
    fireEvent.change(screen.getByPlaceholderText("BENALI"), {
      target: { name: "nom", value: "Dupont" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ahmed"), {
      target: { name: "prenom", value: "Jean" },
    });
    // Mot de passe trop court
    const pwdInputs = screen.getAllByPlaceholderText("Min. 10 caractères");
    fireEvent.change(pwdInputs[0], {
      target: { name: "password", value: "court" },
    });

    fireEvent.click(screen.getByText("Créer"));
    await waitFor(() => {
      expect(screen.getByText("Minimum 10 caractères.")).toBeInTheDocument();
    });
  });

  test("validation : mots de passe différents", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    renderPage();
    fireEvent.click(screen.getByText("+ Nouvel utilisateur"));

    fireEvent.change(screen.getByPlaceholderText("prenom.nom"), {
      target: { name: "username", value: "test" },
    });
    fireEvent.change(screen.getByPlaceholderText("BENALI"), {
      target: { name: "nom", value: "Dupont" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ahmed"), {
      target: { name: "prenom", value: "Jean" },
    });
    const pwdInputs = screen.getAllByPlaceholderText("Min. 10 caractères");
    fireEvent.change(pwdInputs[0], {
      target: { name: "password", value: "LongPassword123!" },
    });
    fireEvent.change(screen.getByPlaceholderText("Répétez le mot de passe"), {
      target: { name: "password2", value: "AutrePassword!" },
    });

    fireEvent.click(screen.getByText("Créer"));
    await waitFor(() => {
      expect(
        screen.getByText("Les mots de passe ne correspondent pas.")
      ).toBeInTheDocument();
    });
  });

  test("soumission réussie affiche le message de succès", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    api.post.mockResolvedValue({});
    renderPage();
    fireEvent.click(screen.getByText("+ Nouvel utilisateur"));

    fireEvent.change(screen.getByPlaceholderText("prenom.nom"), {
      target: { name: "username", value: "nouveau.user" },
    });
    fireEvent.change(screen.getByPlaceholderText("BENALI"), {
      target: { name: "nom", value: "Martin" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ahmed"), {
      target: { name: "prenom", value: "Paul" },
    });
    const pwdInputs = screen.getAllByPlaceholderText("Min. 10 caractères");
    fireEvent.change(pwdInputs[0], {
      target: { name: "password", value: "SecurePass123!" },
    });
    fireEvent.change(screen.getByPlaceholderText("Répétez le mot de passe"), {
      target: { name: "password2", value: "SecurePass123!" },
    });

    fireEvent.click(screen.getByText("Créer"));
    await waitFor(() => {
      expect(
        screen.getByText("Utilisateur créé avec succès.")
      ).toBeInTheDocument();
    });
  });
});

describe("Users — toggle actif/désactivé", () => {
  test("cliquer Désactiver appelle PATCH avec is_active: false", async () => {
    api.get.mockResolvedValue({
      data: { results: [makeUser("user-uuid", "actif_user", "CONSULTANT", true)] },
    });
    api.patch.mockResolvedValue({});
    renderPage();
    await waitFor(() => screen.getByText("Désactiver"));
    fireEvent.click(screen.getByText("Désactiver"));
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/admin-users/user-uuid/",
        { is_active: false }
      );
    });
  });
});

describe("Users — modal reset mot de passe", () => {
  test("cliquer Reset MDP ouvre le modal", async () => {
    api.get.mockResolvedValue({
      data: { results: [makeUser("1", "target_user")] },
    });
    renderPage();
    await waitFor(() => screen.getByText("🔑 Reset MDP"));
    fireEvent.click(screen.getByText("🔑 Reset MDP"));
    expect(
      screen.getByText("Réinitialiser le mot de passe")
    ).toBeInTheDocument();
  });

  test("le modal affiche le username de l'utilisateur ciblé", async () => {
    api.get.mockResolvedValue({
      data: { results: [makeUser("1", "jean.dupont")] },
    });
    renderPage();
    await waitFor(() => screen.getByText("🔑 Reset MDP"));
    fireEvent.click(screen.getByText("🔑 Reset MDP"));
    expect(screen.getAllByText("jean.dupont").length).toBeGreaterThan(0);
  });

  test("cliquer Annuler dans le modal le ferme", async () => {
    api.get.mockResolvedValue({
      data: { results: [makeUser("1")] },
    });
    renderPage();
    await waitFor(() => screen.getByText("🔑 Reset MDP"));
    fireEvent.click(screen.getByText("🔑 Reset MDP"));
    fireEvent.click(screen.getByText("Annuler"));
    expect(
      screen.queryByText("Réinitialiser le mot de passe")
    ).not.toBeInTheDocument();
  });

  test("reset MDP trop court affiche un message d'erreur", async () => {
    api.get.mockResolvedValue({
      data: { results: [makeUser("1", "user")] },
    });
    renderPage();
    await waitFor(() => screen.getByText("🔑 Reset MDP"));
    fireEvent.click(screen.getByText("🔑 Reset MDP"));

    const inputs = screen.getAllByPlaceholderText("••••••••••");
    fireEvent.change(inputs[0], { target: { value: "court" } });
    fireEvent.change(inputs[1], { target: { value: "court" } });
    fireEvent.click(screen.getByText("🔑 Réinitialiser"));

    await waitFor(() => {
      expect(screen.getByText("Minimum 10 caractères.")).toBeInTheDocument();
    });
  });
});
