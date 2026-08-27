/**
 * Tests — pages/Consentement.jsx
 * Écran de consentement Loi 18-07, obligatoire avant tout accès à l'application.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

jest.mock("../services/auth", () => ({
  logout: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ logoutSuccess: jest.fn(), refreshUser: jest.fn().mockResolvedValue(undefined) }),
}));

import api from "../services/api";
import Consentement from "../pages/Consentement";

const renderPage = () =>
  render(
    <MemoryRouter>
      <Consentement />
    </MemoryRouter>
  );

describe("Consentement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("désactive le bouton J'accepte tant que la case n'est pas cochée", () => {
    renderPage();
    const acceptButton = screen.getByRole("button", { name: /j'accepte/i });
    expect(acceptButton).toBeDisabled();
  });

  it("active le bouton J'accepte une fois la case cochée", () => {
    renderPage();
    fireEvent.click(screen.getByRole("checkbox"));
    const acceptButton = screen.getByRole("button", { name: /j'accepte/i });
    expect(acceptButton).not.toBeDisabled();
  });

  it("appelle POST /auth/consent/ quand on clique sur J'accepte", async () => {
    api.post.mockResolvedValueOnce({ data: { message: "ok" } });
    renderPage();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /j'accepte/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/consent/"));
  });

  it("affiche une erreur si l'appel échoue, sans rediriger", async () => {
    api.post.mockRejectedValueOnce(new Error("network"));
    renderPage();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /j'accepte/i }));
    await waitFor(() =>
      expect(screen.getByText(/erreur/i)).toBeInTheDocument()
    );
  });
});
