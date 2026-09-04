/**
 * Tests — pages/UserPerimetre.jsx
 * Couvre : chargement de l'utilisateur cible, sections de périmètre,
 * champs personnels, grants "employés spécifiques", sauvegarde, annulation.
 */

import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);

import api from "../services/api";
import UserPerimetre from "../pages/UserPerimetre";

const render = (ui, options) => rtlRender(ui, { wrapper: ThemeProvider, ...options });

const targetUser = {
  id: "u1",
  username: "cons1",
  nom: "Dupont",
  prenom: "Jean",
  role: "CONSULTANT",
  scope_directions: [],
  scope_poles: [],
  scope_departements: [],
  scope_services: [],
  scope_cellules: [],
  scope_sections: [],
  scope_types_documents: [],
  scope_champs_personnels: [],
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/users/u1/perimetre"]}>
      <Routes>
        <Route path="/users/:id/perimetre" element={<UserPerimetre />} />
        <Route path="/users" element={<div>PAGE USERS</div>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => jest.clearAllMocks());

describe("UserPerimetre — chargement", () => {
  test("charge et affiche l'utilisateur cible", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/admin-users/u1/") return Promise.resolve({ data: targetUser });
      if (url === "/admin-users/u1/employee-grants/") return Promise.resolve({ data: { grants: [] } });
      return Promise.resolve({ data: { results: [] } });
    });
    renderPage();
    expect(await screen.findByText("cons1")).toBeInTheDocument();
    expect(screen.getByText("Périmètre d'accès")).toBeInTheDocument();
  });

  test("bouton Annuler retourne vers /users", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/admin-users/u1/") return Promise.resolve({ data: targetUser });
      if (url === "/admin-users/u1/employee-grants/") return Promise.resolve({ data: { grants: [] } });
      return Promise.resolve({ data: { results: [] } });
    });
    renderPage();
    await screen.findByText("cons1");
    fireEvent.click(screen.getByText("Annuler"));
    expect(await screen.findByText("PAGE USERS")).toBeInTheDocument();
  });
});

describe("UserPerimetre — Champs personnels", () => {
  test("affiche la section Champs personnels, filtrée sur la catégorie PERSONNEL", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/admin-users/u1/") return Promise.resolve({ data: targetUser });
      if (url === "/admin-users/u1/employee-grants/") return Promise.resolve({ data: { grants: [] } });
      if (url === "/ref/champs-personnalises/") {
        return Promise.resolve({
          data: [
            { id: "champ-1", nom: "Date de naissance", code: "date_naissance", categorie: "PERSONNEL", is_systeme: true },
            { id: "champ-2", nom: "Matricule", code: "matricule", categorie: "ADMINISTRATIF", is_systeme: true },
          ],
        });
      }
      return Promise.resolve({ data: { results: [] } });
    });

    renderPage();
    expect((await screen.findAllByText("Champs personnels")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Date de naissance")).toBeInTheDocument();
    expect(screen.queryByText("Matricule")).not.toBeInTheDocument();
  });
});

describe("UserPerimetre — Champs personnels par employé (grants ponctuels)", () => {
  const mockRefsAndUser = () => {
    api.get.mockImplementation((url) => {
      if (url === "/admin-users/u1/") return Promise.resolve({ data: targetUser });
      if (url === "/admin-users/u1/employee-grants/") return Promise.resolve({ data: { grants: [] } });
      if (url === "/ref/champs-personnalises/") {
        return Promise.resolve({
          data: [
            { id: "champ-1", nom: "Date de naissance", code: "date_naissance", categorie: "PERSONNEL", is_systeme: true },
            { id: "champ-2", nom: "RIB", code: "RIB", categorie: "PERSONNEL", is_systeme: false },
          ],
        });
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
    await screen.findByText("cons1");

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
    mockRefsAndUser();
    renderPage();
    await screen.findByText("cons1");

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
    await screen.findByText("cons1");

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

describe("UserPerimetre — sauvegarde", () => {
  test("Enregistrer navigue vers /users avec un message de succès", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/admin-users/u1/") return Promise.resolve({ data: targetUser });
      if (url === "/admin-users/u1/employee-grants/") return Promise.resolve({ data: { grants: [] } });
      return Promise.resolve({ data: { results: [] } });
    });
    api.patch.mockResolvedValue({});
    api.put.mockResolvedValue({ data: { grants: [] } });
    renderPage();
    await screen.findByText("cons1");
    fireEvent.click(screen.getByText("Enregistrer"));
    expect(await screen.findByText("PAGE USERS")).toBeInTheDocument();
    expect(api.patch).toHaveBeenCalledWith("/admin-users/u1/", expect.objectContaining({ scope_directions: [] }));
  });
});
