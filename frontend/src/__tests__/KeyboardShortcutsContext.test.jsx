import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  KeyboardShortcutsProvider,
  useKeyboardShortcutsHelp,
} from "../context/KeyboardShortcutsContext";

function Probe() {
  const { paletteOpen, openPalette, closePalette, togglePalette } = useKeyboardShortcutsHelp();
  return (
    <div>
      <span data-testid="state">{paletteOpen ? "open" : "closed"}</span>
      <button onClick={openPalette}>open</button>
      <button onClick={closePalette}>close</button>
      <button onClick={togglePalette}>toggle</button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <KeyboardShortcutsProvider>
      <Probe />
    </KeyboardShortcutsProvider>
  );

describe("KeyboardShortcutsContext — état de la palette de commandes", () => {
  test("fermée par défaut, s'ouvre et se ferme", () => {
    renderProbe();
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByTestId("state")).toHaveTextContent("open");
    fireEvent.click(screen.getByText("close"));
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
  });

  test("togglePalette inverse l'état", () => {
    renderProbe();
    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("state")).toHaveTextContent("open");
    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
  });
});
