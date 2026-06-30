/**
 * Tests — pages/AuditLogs.jsx
 * Couvre : rendu, chargement logs, filtre utilisateur, filtre action, pagination, état vide
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);

import api from "../services/api";
import AuditLogs from "../pages/AuditLogs";

const makeLog = (id, action = "VIEW", username = "admin") => ({
  id,
  action,
  username_snapshot: username,
  timestamp: "2026-06-09T10:00:00Z",
  target_label: "EMP-001 — Jean Dupont",
  ip_address: "192.168.1.1",
});

const mockResponse = (logs, total = logs.length, total_pages = 1) => ({
  data: { results: logs, total, total_pages },
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <AuditLogs />
    </MemoryRouter>
  );

beforeEach(() => jest.clearAllMocks());

describe("AuditLogs — rendu initial", () => {
  test("affiche le titre Journal d'Audit", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Journal d'audit")).toBeInTheDocument();
    });
  });

  test("affiche le filtre utilisateur", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage();
    expect(
      screen.getByPlaceholderText(/filtrer par utilisateur/i)
    ).toBeInTheDocument();
  });

  test("affiche le select de filtre action", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage();
    expect(screen.getByDisplayValue("Toutes les actions")).toBeInTheDocument();
  });
});

describe("AuditLogs — chargement", () => {
  test("affiche Chargement... pendant le fetch", () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Chargement...")).toBeInTheDocument();
  });

  test("affiche les logs après chargement", async () => {
    api.get.mockResolvedValue(mockResponse([makeLog(1, "VIEW", "admin")]));
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText("admin").length).toBeGreaterThan(0);
      expect(screen.getAllByText("VIEW").length).toBeGreaterThan(0);
    });
  });

  test("affiche la cible du log", async () => {
    api.get.mockResolvedValue(mockResponse([makeLog(1)]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("EMP-001 — Jean Dupont")).toBeInTheDocument();
    });
  });

  test("affiche l'adresse IP", async () => {
    api.get.mockResolvedValue(mockResponse([makeLog(1)]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("192.168.1.1")).toBeInTheDocument();
    });
  });

  test("affiche le message vide si aucun log", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Aucune entrée trouvée.")).toBeInTheDocument();
    });
  });

  test("affiche le compteur total", async () => {
    api.get.mockResolvedValue(mockResponse([makeLog(1)], 42));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/42 entrée/)).toBeInTheDocument();
    });
  });
});

describe("AuditLogs — filtres", () => {
  test("filtrer par utilisateur recharge les logs depuis page 1", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage();
    await waitFor(() => screen.getByText("Aucune entrée trouvée."));

    const input = screen.getByPlaceholderText(/filtrer par utilisateur/i);
    fireEvent.change(input, { target: { name: "user", value: "admin" } });

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith(
        "/reporting/audit-logs/",
        expect.objectContaining({
          params: expect.objectContaining({ user: "admin", page: 1 }),
        })
      );
    });
  });

  test("filtrer par action recharge les logs", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage();
    await waitFor(() => screen.getByText("Aucune entrée trouvée."));

    const select = screen.getByDisplayValue("Toutes les actions");
    fireEvent.change(select, { target: { name: "action", value: "LOGIN" } });

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith(
        "/reporting/audit-logs/",
        expect.objectContaining({
          params: expect.objectContaining({ action: "LOGIN" }),
        })
      );
    });
  });
});

describe("AuditLogs — pagination", () => {
  test("affiche les boutons pagination si total_pages > 1", async () => {
    api.get.mockResolvedValue(mockResponse([makeLog(1)], 100, 3));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Précédent")).toBeInTheDocument();
      expect(screen.getByText("Suivant")).toBeInTheDocument();
    });
  });

  test("n'affiche pas la pagination si une seule page", async () => {
    api.get.mockResolvedValue(mockResponse([makeLog(1)], 1, 1));
    renderPage();
    await waitFor(() => screen.getByText("VIEW"));
    expect(screen.queryByText("Précédent")).not.toBeInTheDocument();
  });

  test("clic Suivant → passe à la page 2", async () => {
    api.get.mockResolvedValue(mockResponse([makeLog(1)], 100, 3));
    renderPage();
    await waitFor(() => screen.getByText("Suivant"));
    fireEvent.click(screen.getByText("Suivant"));
    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith(
        "/reporting/audit-logs/",
        expect.objectContaining({ params: expect.objectContaining({ page: 2 }) })
      );
    });
  });

  test("bouton Précédent est désactivé sur la page 1", async () => {
    api.get.mockResolvedValue(mockResponse([makeLog(1)], 100, 3));
    renderPage();
    await waitFor(() => screen.getByText("Précédent"));
    expect(screen.getByText("Précédent")).toBeDisabled();
  });
});
