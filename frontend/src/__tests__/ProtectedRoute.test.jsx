/**
 * Tests — components/ProtectedRoute.jsx
 * Couvre : redirection si non-authentifié, rendu des enfants si authentifié
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("../../frontend/src/context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import { useAuth } from "../../frontend/src/context/AuthContext";
import ProtectedRoute from "../../frontend/src/components/ProtectedRoute";

const renderWithRouter = (authenticated) => {
  useAuth.mockReturnValue({ authenticated });
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

  test("redirige vers /login si non-authentifié", () => {
    renderWithRouter(false);
    expect(screen.queryByText("Contenu protégé")).not.toBeInTheDocument();
    expect(screen.getByText("Page Login")).toBeInTheDocument();
  });

  test("n'affiche pas la page login si authentifié", () => {
    renderWithRouter(true);
    expect(screen.queryByText("Page Login")).not.toBeInTheDocument();
  });
});
