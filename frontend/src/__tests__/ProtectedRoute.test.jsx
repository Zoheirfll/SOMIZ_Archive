/**
 * Tests — components/ProtectedRoute.jsx
 * authChecked=true requis pour déclencher la redirection.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import { useAuth } from "../context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";

const renderWithRouter = (authenticated, authChecked = true) => {
  useAuth.mockReturnValue({ authenticated, authChecked });
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute>
              <div>Contenu protégé</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Page Login</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe("ProtectedRoute", () => {
  test("affiche le contenu si authentifié", () => {
    renderWithRouter(true);
    expect(screen.getByText("Contenu protégé")).toBeInTheDocument();
  });

  test("redirige vers /login si non-authentifié et authChecked", () => {
    renderWithRouter(false, true);
    expect(screen.queryByText("Contenu protégé")).not.toBeInTheDocument();
    expect(screen.getByText("Page Login")).toBeInTheDocument();
  });

  test("n'affiche rien pendant la vérification (authChecked=false)", () => {
    renderWithRouter(false, false);
    expect(screen.queryByText("Contenu protégé")).not.toBeInTheDocument();
    expect(screen.queryByText("Page Login")).not.toBeInTheDocument();
  });

  test("n'affiche pas la page login si authentifié", () => {
    renderWithRouter(true);
    expect(screen.queryByText("Page Login")).not.toBeInTheDocument();
  });
});
