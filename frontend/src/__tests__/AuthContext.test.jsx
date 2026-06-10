/**
 * Tests — context/AuthContext.js
 * Couvre : AuthProvider, useAuth(), loginSuccess(), logoutSuccess()
 */

import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("../services/auth", () => ({
  getUser: jest.fn(() => null),
  isAuthenticated: jest.fn(() => false),
}));

import { getUser, isAuthenticated } from "../services/auth";
import { AuthProvider, useAuth } from "../context/AuthContext";

const TestConsumer = ({ onLogin, onLogout }) => {
  const { user, authenticated, loginSuccess, logoutSuccess } = useAuth();
  return (
    <div>
      <div data-testid="authenticated">{String(authenticated)}</div>
      <div data-testid="username">{user?.username ?? "none"}</div>
      {onLogin && (
        <button onClick={() => loginSuccess({ username: "admin", role: "ADMIN" })}>
          Login
        </button>
      )}
      {onLogout && (
        <button onClick={() => logoutSuccess()}>Logout</button>
      )}
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
  test("authenticated est false si pas de token", () => {
    isAuthenticated.mockReturnValue(false);
    getUser.mockReturnValue(null);
    renderConsumer();
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
  });

  test("authenticated est true si token présent", () => {
    isAuthenticated.mockReturnValue(true);
    getUser.mockReturnValue({ username: "admin", role: "ADMIN" });
    renderConsumer();
    expect(screen.getByTestId("authenticated").textContent).toBe("true");
  });

  test("username est 'none' si pas d'user", () => {
    isAuthenticated.mockReturnValue(false);
    getUser.mockReturnValue(null);
    renderConsumer();
    expect(screen.getByTestId("username").textContent).toBe("none");
  });
});

describe("AuthContext — loginSuccess()", () => {
  test("met à jour authenticated et user", async () => {
    isAuthenticated.mockReturnValue(false);
    getUser.mockReturnValue(null);
    renderConsumer({ onLogin: true });

    await userEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(screen.getByTestId("authenticated").textContent).toBe("true");
    expect(screen.getByTestId("username").textContent).toBe("admin");
  });
});

describe("AuthContext — logoutSuccess()", () => {
  test("remet authenticated à false", async () => {
    isAuthenticated.mockReturnValue(true);
    getUser.mockReturnValue({ username: "admin", role: "ADMIN" });
    renderConsumer({ onLogin: true, onLogout: true });

    await userEvent.click(screen.getByRole("button", { name: "Logout" }));

    expect(screen.getByTestId("authenticated").textContent).toBe("false");
    expect(screen.getByTestId("username").textContent).toBe("none");
  });
});
