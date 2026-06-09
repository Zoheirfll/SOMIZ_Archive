/**
 * Tests — pages/Login.jsx
 * Couvre : rendu, soumission, remember-me, erreurs, toggle password
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// Mocks
jest.mock("../../frontend/src/services/auth", () => ({
  login: jest.fn(),
}));
jest.mock("../../frontend/src/context/AuthContext", () => ({
  useAuth: () => ({ loginSuccess: jest.fn() }),
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import { login } from "../../frontend/src/services/auth";
import Login from "../../frontend/src/pages/Login";

const renderLogin = () =>
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
});

describe("Login — rendu", () => {
  test("affiche le champ identifiant", () => {
    renderLogin();
    expect(screen.getByPlaceholderText("votre.identifiant")).toBeInTheDocument();
  });

  test("affiche le champ mot de passe", () => {
    renderLogin();
    expect(screen.getByPlaceholderText("••••••••••")).toBeInTheDocument();
  });

  test("affiche le bouton Se connecter", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: /se connecter/i })).toBeInTheDocument();
  });

  test("affiche la case à cocher Se rappeler de moi", () => {
    renderLogin();
    expect(screen.getByLabelText(/se rappeler de moi/i)).toBeInTheDocument();
  });

  test("affiche le titre SOMIZ", () => {
    renderLogin();
    expect(screen.getByText("SOMIZ")).toBeInTheDocument();
  });
});

describe("Login — toggle mot de passe", () => {
  test("le champ est de type password par défaut", () => {
    renderLogin();
    const input = screen.getByPlaceholderText("••••••••••");
    expect(input).toHaveAttribute("type", "password");
  });

  test("le bouton toggle affiche le mot de passe", async () => {
    renderLogin();
    const input = screen.getByPlaceholderText("••••••••••");
    const toggle = screen.getByRole("button", { name: /👁/i });
    await userEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
  });

  test("cliquer deux fois remasque le mot de passe", async () => {
    renderLogin();
    const input = screen.getByPlaceholderText("••••••••••");
    const toggle = screen.getByRole("button", { name: /👁/i });
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(input).toHaveAttribute("type", "password");
  });
});

describe("Login — soumission réussie", () => {
  const mockData = {
    access: "access123",
    refresh: "refresh123",
    user: { id: "u1", username: "admin", nom: "Admin", prenom: "Test", role: "ADMIN" },
  };

  test("stocke dans sessionStorage si remember-me non coché", async () => {
    login.mockResolvedValueOnce(mockData);
    renderLogin();

    await userEvent.type(screen.getByPlaceholderText("votre.identifiant"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••••••"), "pass");
    fireEvent.submit(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(sessionStorage.getItem("access_token")).toBe("access123");
      expect(sessionStorage.getItem("refresh_token")).toBe("refresh123");
    });
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  test("stocke dans localStorage si remember-me coché", async () => {
    login.mockResolvedValueOnce(mockData);
    renderLogin();

    await userEvent.click(screen.getByLabelText(/se rappeler de moi/i));
    await userEvent.type(screen.getByPlaceholderText("votre.identifiant"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••••••"), "pass");
    fireEvent.submit(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(localStorage.getItem("access_token")).toBe("access123");
      expect(localStorage.getItem("refresh_token")).toBe("refresh123");
    });
    expect(sessionStorage.getItem("access_token")).toBeNull();
  });

  test("redirige vers /employees après connexion", async () => {
    login.mockResolvedValueOnce(mockData);
    renderLogin();

    await userEvent.type(screen.getByPlaceholderText("votre.identifiant"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••••••"), "pass");
    fireEvent.submit(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/employees");
    });
  });
});

describe("Login — gestion des erreurs", () => {
  test("affiche le message d'erreur sur échec", async () => {
    const error = { response: { data: { error: "Identifiants incorrects." } } };
    login.mockRejectedValueOnce(error);
    renderLogin();

    await userEvent.type(screen.getByPlaceholderText("votre.identifiant"), "wrong");
    await userEvent.type(screen.getByPlaceholderText("••••••••••"), "bad");
    fireEvent.submit(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByText("Identifiants incorrects.")).toBeInTheDocument();
    });
  });

  test("affiche un message générique si pas de réponse serveur", async () => {
    login.mockRejectedValueOnce(new Error("Network Error"));
    renderLogin();

    await userEvent.type(screen.getByPlaceholderText("votre.identifiant"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••••••"), "pass");
    fireEvent.submit(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByText("Identifiants incorrects.")).toBeInTheDocument();
    });
  });

  test("désactive le bouton pendant le chargement", async () => {
    let resolveFn;
    login.mockReturnValueOnce(new Promise((res) => { resolveFn = res; }));
    renderLogin();

    await userEvent.type(screen.getByPlaceholderText("votre.identifiant"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••••••"), "pass");
    fireEvent.submit(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connexion/i })).toBeDisabled();
    });

    resolveFn({
      access: "tok",
      refresh: "ref",
      user: { id: "1", username: "a", nom: "A", prenom: "B", role: "ADMIN" },
    });
  });
});
