import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";
import { KeyboardShortcutsProvider, useKeyboardShortcutsHelp } from "../context/KeyboardShortcutsContext";

jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: [] })) } }));
jest.mock("../hooks/useIsMobile", () => () => true);

import { useAuth } from "../context/AuthContext";
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
    useAuth.mockReturnValue({ user: { role: "ADMIN", prenom: "A", nom: "B" }, logoutSuccess: jest.fn() });
    renderNavbar();
    expect(screen.getByTestId("palette-state")).toHaveTextContent("closed");
    fireEvent.click(screen.getByLabelText("Recherche rapide"));
    expect(screen.getByTestId("palette-state")).toHaveTextContent("open");
  });
});
