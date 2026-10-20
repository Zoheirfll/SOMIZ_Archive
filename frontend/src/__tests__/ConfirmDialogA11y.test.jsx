/**
 * Accessibilité des modales useConfirm() / usePrompt() (components/ConfirmDialog.jsx) :
 * rôle dialog + aria-modal + nom accessible, Échap, focus initial sûr,
 * piège de focus (Tab/Shift+Tab) et restitution du focus au déclencheur.
 */
import React, { useState } from "react";
import { render as rtlRender, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";

const render = (ui) => rtlRender(ui, { wrapper: ThemeProvider });

function ConfirmHarness({ danger = true }) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [result, setResult] = useState("aucun");
  return (
    <>
      <button onClick={async () => setResult(String(await confirm("Supprimer le document ?", { danger })))}>
        Ouvrir
      </button>
      <span data-testid="resultat">{result}</span>
      {ConfirmDialog}
    </>
  );
}

function PromptHarness() {
  const { prompt, PromptDialog } = usePrompt();
  const [result, setResult] = useState("aucun");
  return (
    <>
      <button onClick={async () => setResult(String(await prompt("Nouveau nom :", "a.pdf")))}>Ouvrir</button>
      <span data-testid="resultat">{result}</span>
      {PromptDialog}
    </>
  );
}

describe("useConfirm — accessibilité", () => {
  test("expose un dialogue modal avec un nom accessible (le message)", () => {
    render(<ConfirmHarness />);
    fireEvent.click(screen.getByText("Ouvrir"));
    const dialog = screen.getByRole("dialog", { name: "Supprimer le document ?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  test("Échap annule (résout false)", async () => {
    render(<ConfirmHarness />);
    fireEvent.click(screen.getByText("Ouvrir"));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("resultat")).toHaveTextContent("false"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("action destructive : le focus initial est sur « Annuler », jamais sur « Confirmer »", () => {
    render(<ConfirmHarness danger />);
    fireEvent.click(screen.getByText("Ouvrir"));
    expect(screen.getByRole("button", { name: "Annuler" })).toHaveFocus();
  });

  test("action non destructive : le focus initial est sur « Confirmer »", () => {
    render(<ConfirmHarness danger={false} />);
    fireEvent.click(screen.getByText("Ouvrir"));
    expect(screen.getByRole("button", { name: "Confirmer" })).toHaveFocus();
  });

  test("le focus est piégé dans la modale (Tab depuis le dernier bouton revient au premier)", () => {
    render(<ConfirmHarness />);
    fireEvent.click(screen.getByText("Ouvrir"));
    const confirmer = screen.getByRole("button", { name: "Confirmer" });
    confirmer.focus();
    fireEvent.keyDown(confirmer, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Annuler" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("button", { name: "Annuler" }), { key: "Tab", shiftKey: true });
    expect(confirmer).toHaveFocus();
  });

  test("à la fermeture, le focus revient au bouton qui a ouvert la modale", async () => {
    render(<ConfirmHarness />);
    const declencheur = screen.getByText("Ouvrir");
    declencheur.focus();
    fireEvent.click(declencheur);
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(declencheur).toHaveFocus());
  });
});

describe("usePrompt — accessibilité", () => {
  test("dialogue modal nommé, champ de saisie relié au message", () => {
    render(<PromptHarness />);
    fireEvent.click(screen.getByText("Ouvrir"));
    expect(screen.getByRole("dialog", { name: "Nouveau nom :" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("textbox", { name: "Nouveau nom :" })).toHaveValue("a.pdf");
  });

  test("Échap annule (résout null)", async () => {
    render(<PromptHarness />);
    fireEvent.click(screen.getByText("Ouvrir"));
    await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); });
    await waitFor(() => expect(screen.getByTestId("resultat")).toHaveTextContent("null"));
  });
});
