/**
 * Tests — pages/Users.jsx
 * Couvre : rendu, chargement liste, formulaire création, validation, reset MDP modal
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "ADMIN", username: "admin" } }),
}));

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
    expect(screen.getByText("Gestion des utilisateurs")).toBeInTheDocument();
  });

  test("affiche le bouton + Nouvel utilisateur", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    renderPage();
    expect(screen.getByRole("button", { name: /nouvel utilisateur/i })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /nouvel utilisateur/i }));
    expect(screen.getByText("Créer un compte utilisateur")).toBeInTheDocument();
  });

  test("cliquer sur Annuler ferme le formulaire", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /nouvel utilisateur/i }));
    fireEvent.click(screen.getByText("Annuler"));
    expect(screen.queryByText("Créer un compte utilisateur")).not.toBeInTheDocument();
  });

  test("validation : champs vides affichent les erreurs", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /nouvel utilisateur/i }));
    fireEvent.click(screen.getByText("Créer le compte"));
    await waitFor(() => {
      expect(screen.getByText("Identifiant obligatoire.")).toBeInTheDocument();
    });
  });

  test("validation : mot de passe trop court", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /nouvel utilisateur/i }));

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

    fireEvent.click(screen.getByText("Créer le compte"));
    await waitFor(() => {
      expect(screen.getByText("Minimum 10 caractères.")).toBeInTheDocument();
    });
  });

  test("validation : mots de passe différents", async () => {
    api.get.mockResolvedValue({ data: { results: [] } });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /nouvel utilisateur/i }));

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

    fireEvent.click(screen.getByText("Créer le compte"));
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
    fireEvent.click(screen.getByRole("button", { name: /nouvel utilisateur/i }));

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

    fireEvent.click(screen.getByText("Créer le compte"));
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

describe("Users — modale Périmètre — Champs personnels", () => {
  test("affiche la section Champs personnels dans la modale Périmètre", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/ref/champs-personnalises/") {
        return Promise.resolve({
          data: [
            { id: "champ-1", nom: "Date de naissance", code: "date_naissance", categorie: "PERSONNEL", is_systeme: true },
            { id: "champ-2", nom: "Matricule", code: "matricule", categorie: "ADMINISTRATIF", is_systeme: true },
          ],
        });
      }
      if (url === "/admin-users/") {
        return Promise.resolve({
          data: {
            results: [makeUser("u1", "cons1", "CONSULTANT", true)],
          },
        });
      }
      return Promise.resolve({ data: { results: [] } });
    });

    renderPage();
    const perimetreBtn = await screen.findByRole("button", { name: "Périmètre" });
    fireEvent.click(perimetreBtn);

    expect(await screen.findByText("Champs personnels")).toBeInTheDocument();
    expect(screen.getByText("Date de naissance")).toBeInTheDocument();
    expect(screen.queryByText("Matricule")).not.toBeInTheDocument();
  });
});

describe("Users — modale Périmètre — Champs personnels par employé (grants ponctuels)", () => {
  const mockRefsAndUser = () => {
    api.get.mockImplementation((url) => {
      if (url === "/ref/champs-personnalises/") {
        return Promise.resolve({
          data: [
            { id: "champ-1", nom: "Date de naissance", code: "date_naissance", categorie: "PERSONNEL", is_systeme: true },
            { id: "champ-2", nom: "RIB", code: "RIB", categorie: "PERSONNEL", is_systeme: false },
          ],
        });
      }
      if (url === "/admin-users/") {
        return Promise.resolve({ data: { results: [makeUser("u1", "cons1", "CONSULTANT", true)] } });
      }
      if (url === "/admin-users/u1/employee-grants/") {
        return Promise.resolve({ data: { grants: [] } });
      }
      if (url.startsWith("/employees/search/")) {
        return Promise.resolve({
          data: [{ id: "emp-1", nom: "Bernard", prenom: "Sophie", matricule: "EMP-001" }],
        });
      }
      return Promise.resolve({ data: { results: [] } });
    });
  };

  test("affiche une checklist Champs personnels pour un employé ajouté aux accès ponctuels", async () => {
    mockRefsAndUser();
    renderPage();
    const perimetreBtn = await screen.findByRole("button", { name: "Périmètre" });
    fireEvent.click(perimetreBtn);

    const searchInput = await screen.findByPlaceholderText(/Rechercher un employé/i);
    fireEvent.change(searchInput, { target: { value: "Bernard" } });
    const result = await screen.findByText(/Sophie Bernard/);
    fireEvent.click(result);

    // Le champ personnel "RIB" apparaît déjà une fois (section périmètre global) —
    // une seconde occurrence doit apparaître dans la checklist par-employé.
    await waitFor(() => {
      expect(screen.getAllByText("RIB").length).toBeGreaterThanOrEqual(2);
    });
  });

  test("les champs personnels restent décochés par défaut même avec Dossier complet actif", async () => {
    // Depuis 2026-09-01 : "Dossier complet" (documents + contrats) est
    // découplé des champs personnels — un nouvel employé ajouté a le
    // dossier complet actif par défaut, mais aucun champ personnel coché
    // tant qu'on ne le sélectionne pas explicitement (ou qu'il n'est pas
    // déjà couvert par le périmètre global).
    mockRefsAndUser();
    renderPage();
    const perimetreBtn = await screen.findByRole("button", { name: "Périmètre" });
    fireEvent.click(perimetreBtn);

    const searchInput = await screen.findByPlaceholderText(/Rechercher un employé/i);
    fireEvent.change(searchInput, { target: { value: "Bernard" } });
    const result = await screen.findByText(/Sophie Bernard/);
    fireEvent.click(result);

    await screen.findAllByText("RIB");
    const ribCheckboxes = screen.getAllByText("RIB").map((el) => el.closest("label").querySelector("input"));
    expect(ribCheckboxes[1]).not.toBeChecked();
  });

  test("cocher un champ personnel précis sort du mode Dossier complet et l'envoie dans le PUT", async () => {
    mockRefsAndUser();
    api.patch.mockResolvedValue({});
    api.put.mockResolvedValue({ data: { grants: [] } });
    renderPage();
    const perimetreBtn = await screen.findByRole("button", { name: "Périmètre" });
    fireEvent.click(perimetreBtn);

    const searchInput = await screen.findByPlaceholderText(/Rechercher un employé/i);
    fireEvent.change(searchInput, { target: { value: "Bernard" } });
    const result = await screen.findByText(/Sophie Bernard/);
    fireEvent.click(result);

    await screen.findAllByText("RIB");
    // La checklist par-employé est la 2e occurrence de "RIB" (la 1ère est la
    // section périmètre global "Champs personnels").
    const ribLabel = screen.getAllByText("RIB")[1].closest("label");
    fireEvent.click(ribLabel.querySelector("input"));

    fireEvent.click(screen.getByText("Enregistrer"));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        "/admin-users/u1/employee-grants/",
        expect.objectContaining({
          grants: expect.arrayContaining([
            expect.objectContaining({ employee: "emp-1", champ_personnel: "champ-2" }),
          ]),
        })
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
    await waitFor(() => screen.getByRole("button", { name: /reset mdp/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset mdp/i }));
    expect(
      screen.getByText("Réinitialiser le mot de passe")
    ).toBeInTheDocument();
  });

  test("le modal affiche le username de l'utilisateur ciblé", async () => {
    api.get.mockResolvedValue({
      data: { results: [makeUser("1", "jean.dupont")] },
    });
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /reset mdp/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset mdp/i }));
    expect(screen.getAllByText("jean.dupont").length).toBeGreaterThan(0);
  });

  test("cliquer Annuler dans le modal le ferme", async () => {
    api.get.mockResolvedValue({
      data: { results: [makeUser("1")] },
    });
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /reset mdp/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset mdp/i }));
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
    await waitFor(() => screen.getByRole("button", { name: /reset mdp/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset mdp/i }));

    const inputs = screen.getAllByPlaceholderText("••••••••••");
    fireEvent.change(inputs[0], { target: { value: "court" } });
    fireEvent.change(inputs[1], { target: { value: "court" } });
    fireEvent.click(screen.getByText("Réinitialiser"));

    await waitFor(() => {
      expect(screen.getByText("Minimum 10 caractères.")).toBeInTheDocument();
    });
  });
});
