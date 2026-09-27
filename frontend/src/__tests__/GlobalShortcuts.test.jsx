import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { KeyboardShortcutsProvider } from "../context/KeyboardShortcutsContext";

jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../components/CommandPalette", () => ({ isOpen, onClose }) =>
  isOpen ? <div data-testid="palette" onClick={onClose}>palette</div> : null
);

import { useAuth } from "../context/AuthContext";
import GlobalShortcuts from "../components/GlobalShortcuts";

const renderAt = (path = "/employees") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <KeyboardShortcutsProvider>
        <GlobalShortcuts />
      </KeyboardShortcutsProvider>
    </MemoryRouter>
  );

describe("GlobalShortcuts — palette de commandes", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { role: "ADMIN" } });
  });

  test("Ctrl+K ouvre la palette", () => {
    renderAt();
    expect(screen.queryByTestId("palette")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("palette")).toBeInTheDocument();
  });

  test("désactivé sur /login", () => {
    renderAt("/login");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.queryByTestId("palette")).not.toBeInTheDocument();
  });
});
