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

describe("Navbar (desktop) — menu déroulant « Demandes »", () => {
  const avecUtilisateur = (user) => {
    useIsMobile.mockReturnValue(false);
    useAuth.mockReturnValue({ user: { prenom: "A", nom: "B", ...user }, logoutSuccess: jest.fn() });
    renderNavbar();
  };

  test("un GESTIONNAIRE voit Attestations et Consultations dans le déroulant", () => {
    avecUtilisateur({ role: "GESTIONNAIRE", can_request_attestations: true, can_request_consultations: true });
    // Fermé : aucune des deux sections n'est affichée.
    expect(screen.queryByRole("menuitem", { name: /Attestations/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Demandes/ }));
    expect(screen.getByRole("menuitem", { name: /Attestations de travail/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Consultations d'archives/ })).toBeInTheDocument();
  });

  test("un CONSULTANT n'a qu'une section : lien direct, pas de déroulant", () => {
    avecUtilisateur({ role: "CONSULTANT", can_request_consultations: true });
    const bouton = screen.getByRole("button", { name: /Demandes/ });
    expect(bouton).not.toHaveAttribute("aria-haspopup");
    fireEvent.click(bouton);
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  test("un gestionnaire autorisé aux congés voit « Congés » dans le déroulant", () => {
    avecUtilisateur({ role: "GESTIONNAIRE", can_request_attestations: true, can_request_conges: true });
    fireEvent.click(screen.getByRole("button", { name: /Demandes/ }));
    expect(screen.getByRole("menuitem", { name: /Congés/ })).toBeInTheDocument();
  });

  test("un compte qui n'a que les congés : lien direct vers /conges, pas de déroulant", () => {
    avecUtilisateur({ role: "GESTIONNAIRE", can_request_conges: true });
    const bouton = screen.getByRole("button", { name: /Demandes/ });
    expect(bouton).not.toHaveAttribute("aria-haspopup");
  });

  test("un ADMIN non chargé des congés ne voit pas la section", () => {
    avecUtilisateur({ role: "ADMIN" });
    expect(screen.queryByRole("button", { name: /Demandes/ })).not.toBeInTheDocument();
  });

  test("Échap referme le déroulant", () => {
    avecUtilisateur({ role: "GESTIONNAIRE", can_request_attestations: true, can_request_consultations: true });
    fireEvent.click(screen.getByRole("button", { name: /Demandes/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("Navbar (desktop) — menu « Administration »", () => {
  test("un ADMIN ouvre le déroulant et voit ses quatre entrées", () => {
    useIsMobile.mockReturnValue(false);
    useAuth.mockReturnValue({ user: { role: "ADMIN", prenom: "A", nom: "B" }, logoutSuccess: jest.fn() });
    renderNavbar();
    fireEvent.click(screen.getByRole("button", { name: /Administration/ }));
    ["Import", "Utilisateurs", "Configuration", "Journal"].forEach((nom) =>
      expect(screen.getByRole("menuitem", { name: nom })).toBeInTheDocument()
    );
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
