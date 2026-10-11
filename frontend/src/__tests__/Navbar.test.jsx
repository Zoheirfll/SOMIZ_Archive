import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";
import { KeyboardShortcutsProvider, useKeyboardShortcutsHelp } from "../context/KeyboardShortcutsContext";

jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: [] })) } }));
jest.mock("../hooks/useIsMobile", () => jest.fn());

import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";

function Probe() {
  const { paletteOpen } = useKeyboardShortcutsHelp();
  return <span data-testid="palette-state">{paletteOpen ? "open" : "closed"}</span>;
}

const renderNavbar = () =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <KeyboardShortcutsProvider>
          <Navbar />
          <Probe />
        </KeyboardShortcutsProvider>
      </ThemeProvider>
    </MemoryRouter>
  );

describe("Navbar (mobile) — icône de recherche", () => {
  test("ouvre la palette de commandes au clic", () => {
    useIsMobile.mockReturnValue(true);
    useAuth.mockReturnValue({ user: { role: "ADMIN", prenom: "A", nom: "B" }, logoutSuccess: jest.fn() });
    renderNavbar();
    expect(screen.getByTestId("palette-state")).toHaveTextContent("closed");
    fireEvent.click(screen.getByLabelText("Recherche rapide"));
    expect(screen.getByTestId("palette-state")).toHaveTextContent("open");
  });
});

describe("Navbar (desktop) — entrée « Registres »", () => {
  const avecUtilisateur = (user) => {
    useIsMobile.mockReturnValue(false);
    useAuth.mockReturnValue({ user: { prenom: "A", nom: "B", ...user }, logoutSuccess: jest.fn() });
    renderNavbar();
  };

  test("le SUPERADMIN la voit toujours, même sans le champ can_manage_registres (session ancienne)", () => {
    avecUtilisateur({ role: "SUPERADMIN" });
    expect(screen.getByRole("button", { name: "Registres" })).toBeInTheDocument();
  });

  test("un ADMIN chargé des registres la voit", () => {
    avecUtilisateur({ role: "ADMIN", can_manage_registres: true });
    expect(screen.getByRole("button", { name: "Registres" })).toBeInTheDocument();
  });

  test("un ADMIN chargé des consultations seulement ne la voit pas", () => {
    avecUtilisateur({ role: "ADMIN", can_manage_consultations: true });
    // Garde-fou contre un test vide : « Demandes » (consultations) doit, lui, être affiché.
    expect(screen.getByRole("button", { name: /Demandes/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registres" })).not.toBeInTheDocument();
  });
});

describe("Navbar (desktop) — icône de recherche", () => {
  test("ouvre la palette de commandes au clic", () => {
    useIsMobile.mockReturnValue(false);
    useAuth.mockReturnValue({ user: { role: "ADMIN", prenom: "A", nom: "B" }, logoutSuccess: jest.fn() });
    renderNavbar();
    expect(screen.getByTestId("palette-state")).toHaveTextContent("closed");
    fireEvent.click(screen.getByLabelText("Recherche rapide"));
    expect(screen.getByTestId("palette-state")).toHaveTextContent("open");
  });
});
