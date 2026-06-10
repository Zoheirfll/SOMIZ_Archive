/**
 * Tests — pages/Login.jsx
 * Tokens dans cookies httpOnly — Login stocke uniquement les données user en sessionStorage.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/auth", () => ({ login: jest.fn() }));
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ loginSuccess: jest.fn() }),
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import { login } from "../services/auth";
import Login from "../pages/Login";

const renderLogin = () => render(<MemoryRouter><Login /></MemoryRouter>);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
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
    expect(screen.getByPlaceholderText("••••••••••")).toHaveAttribute("type", "password");
  });

  test("le bouton toggle affiche le mot de passe", async () => {
    renderLogin();
    const input = screen.getByPlaceholderText("••••••••••");
    await userEvent.click(screen.getByRole("button", { name: /👁/i }));
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
    user: { id: "u1", username: "admin", nom: "Admin", prenom: "Test", role: "ADMIN" },
  };

  test("stocke les infos user en sessionStorage", async () => {
    login.mockResolvedValueOnce(mockData);
    renderLogin();

    await userEvent.type(screen.getByPlaceholderText("votre.identifiant"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••••••"), "pass");
    fireEvent.submit(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(sessionStorage.getItem("user")).toBeTruthy();
    });
    // Les tokens ne doivent PAS être dans le storage (ils sont dans les cookies httpOnly)
    expect(sessionStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("access_token")).toBeNull();
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
    login.mockRejectedValueOnce({ response: { data: { error: "Identifiants incorrects." } } });
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
      expect(screen.getByText(/identifiants incorrects/i)).toBeInTheDocument();
    });
  });
});
