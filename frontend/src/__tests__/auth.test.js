/**
 * Tests — services/auth.js
 * Tokens dans cookies httpOnly — auth.js gère uniquement les données user
 */

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

import api from "../services/api";
import { login, logout, getUser, isAuthenticated } from "../services/auth";

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
});

describe("login()", () => {
  test("appelle POST /auth/login/ et retourne les données", async () => {
    const mockData = { user: { id: "1", username: "admin", role: "ADMIN" } };
    api.post.mockResolvedValueOnce({ data: mockData });

    const result = await login("admin", "pass");
    expect(api.post).toHaveBeenCalledWith("/auth/login/", { username: "admin", password: "pass" });
    expect(result).toEqual(mockData);
  });

  test("propage l'erreur si la requête échoue", async () => {
    api.post.mockRejectedValueOnce(new Error("Identifiants incorrects."));
    await expect(login("bad", "creds")).rejects.toThrow("Identifiants incorrects.");
  });
});

describe("logout()", () => {
  test("appelle POST /api/auth/logout/", async () => {
    api.post.mockResolvedValueOnce({});
    await logout();
    expect(api.post).toHaveBeenCalledWith("/auth/logout/");
  });

  test("ne propage pas l'erreur si la requête échoue", async () => {
    api.post.mockRejectedValueOnce(new Error("Network error"));
    await expect(logout()).resolves.toBeUndefined();
  });
});

describe("getUser()", () => {
  test("retourne null si aucun user stocké", () => {
    expect(getUser()).toBeNull();
  });

  test("retourne l'user depuis sessionStorage", () => {
    const user = { id: "1", username: "admin", role: "ADMIN" };
    sessionStorage.setItem("user", JSON.stringify(user));
    expect(getUser()).toEqual(user);
  });
});

describe("isAuthenticated()", () => {
  test("retourne false si pas d'user en session", () => {
    expect(isAuthenticated()).toBe(false);
  });

  test("retourne true si user en sessionStorage", () => {
    sessionStorage.setItem("user", JSON.stringify({ username: "admin" }));
    expect(isAuthenticated()).toBe(true);
  });

  test("retourne false après suppression", () => {
    sessionStorage.setItem("user", JSON.stringify({ username: "admin" }));
    sessionStorage.removeItem("user");
    expect(isAuthenticated()).toBe(false);
  });
});
