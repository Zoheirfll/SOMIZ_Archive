import React from "react";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);

import api from "../services/api";
import Registres from "../pages/Registres";

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>, { wrapper: ThemeProvider });

describe("Registres (page)", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    api.get.mockResolvedValue({ data: { annee: 2026, results: [] } });
  });

  test("affiche l'onglet Mouvements par défaut puis Réceptions", async () => {
    render(<Registres />);
    expect(await screen.findByText("Aucun mouvement pour cette année.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Réceptions" }));
    expect(await screen.findByText("Aucune réception pour cette année.")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/registres/receptions/", expect.anything());
  });
});
