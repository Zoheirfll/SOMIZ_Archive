/**
 * Tests — context/AuthContext.js
 * AuthProvider vérifie la session via /auth/me/ au démarrage (cookie httpOnly).
 */

import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

import api from "../services/api";
import { AuthProvider, useAuth } from "../context/AuthContext";

const TestConsumer = ({ onLogin, onLogout, onRefresh }) => {
  const { user, authenticated, authChecked, loginSuccess, logoutSuccess, refreshUser } = useAuth();
  return (
    <div>
      <div data-testid="authenticated">{String(authenticated)}</div>
      <div data-testid="checked">{String(authChecked)}</div>
      <div data-testid="username">{user?.username ?? "none"}</div>
      <div data-testid="needs-consent">{String(user?.needs_consent)}</div>
      {onLogin && (
        <button onClick={() => loginSuccess({ username: "admin", role: "ADMIN" })}>Login</button>
      )}
      {onLogout && (
        <button onClick={() => logoutSuccess()}>Logout</button>
      )}
      {onRefresh && <button onClick={() => refreshUser()}>Refresh</button>}
    </div>
  );
};

const renderConsumer = (props = {}) =>
  render(
    <AuthProvider>
      <TestConsumer {...props} />
    </AuthProvider>
  );

describe("AuthContext — état initial", () => {
  test("authenticated est false puis true si /auth/me/ réussit", async () => {
    api.get.mockResolvedValueOnce({ data: { username: "admin", role: "ADMIN" } });
    renderConsumer();
    await waitFor(() => {
      expect(screen.getByTestId("authenticated").textContent).toBe("true");
    });
  });

  test("authenticated reste false si /auth/me/ échoue (pas de cookie)", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 401 } });
    renderConsumer();
    await waitFor(() => {
      expect(screen.getByTestId("checked").textContent).toBe("true");
    });
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
  });

  test("username est défini après /auth/me/ réussi", async () => {
    api.get.mockResolvedValueOnce({ data: { username: "admin", role: "ADMIN" } });
    renderConsumer();
    await waitFor(() => {
      expect(screen.getByTestId("username").textContent).toBe("admin");
    });
  });
});

describe("AuthContext — loginSuccess()", () => {
  test("met à jour authenticated et user", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 401 } });
    renderConsumer({ onLogin: true });
    await waitFor(() => screen.getByTestId("checked").textContent === "true");

    await userEvent.click(screen.getByRole("button", { name: "Login" }));
    expect(screen.getByTestId("authenticated").textContent).toBe("true");
    expect(screen.getByTestId("username").textContent).toBe("admin");
  });
});

describe("AuthContext — logoutSuccess()", () => {
  test("remet authenticated à false", async () => {
    api.get.mockResolvedValueOnce({ data: { username: "admin", role: "ADMIN" } });
    renderConsumer({ onLogin: true, onLogout: true });
    await waitFor(() => screen.getByTestId("authenticated").textContent === "true");

    await userEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
    expect(screen.getByTestId("username").textContent).toBe("none");
  });
});

describe("AuthContext — refreshUser()", () => {
  test("recharge l'utilisateur depuis /auth/me/ et met à jour needs_consent", async () => {
    api.get.mockResolvedValueOnce({ data: { username: "admin", role: "ADMIN", needs_consent: true } });
    renderConsumer({ onRefresh: true });
    await waitFor(() => {
      expect(screen.getByTestId("needs-consent").textContent).toBe("true");
    });

    api.get.mockResolvedValueOnce({ data: { username: "admin", role: "ADMIN", needs_consent: false } });
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => {
      expect(screen.getByTestId("needs-consent").textContent).toBe("false");
    });
  });
});
