/**
 * Tests — services/auth.js
 * Couvre : login(), logout(), getUser(), isAuthenticated()
 */

jest.mock("../../frontend/src/services/api", () => ({
  default: {
    post: jest.fn(),
  },
}));

import api from "../../frontend/src/services/api";
import { login, logout, getUser, isAuthenticated } from "../../frontend/src/services/auth";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
});

describe("login()", () => {
  test("appelle POST /auth/login/ et retourne les données", async () => {
    const mockData = {
      access: "access_token",
      refresh: "refresh_token",
      user: { id: "1", username: "admin", role: "ADMIN" },
    };
    api.post.mockResolvedValueOnce({ data: mockData });

    const result = await login("admin", "pass");
    expect(api.post).toHaveBeenCalledWith("/auth/login/", {
      username: "admin",
      password: "pass",
    });
    expect(result).toEqual(mockData);
  });

  test("propage l'erreur si la requête échoue", async () => {
    api.post.mockRejectedValueOnce(new Error("Identifiants incorrects."));
    await expect(login("bad", "creds")).rejects.toThrow("Identifiants incorrects.");
  });
});

describe("logout()", () => {
  test("appelle POST /auth/logout/ avec le refresh token de localStorage", async () => {
    localStorage.setItem("refresh_token", "myrefresh");
    api.post.mockResolvedValueOnce({});

    await logout();
    expect(api.post).toHaveBeenCalledWith("/auth/logout/", { refresh: "myrefresh" });
  });

  test("appelle POST /auth/logout/ avec le refresh token de sessionStorage", async () => {
    sessionStorage.setItem("refresh_token", "session_refresh");
    api.post.mockResolvedValueOnce({});

    await logout();
    expect(api.post).toHaveBeenCalledWith("/auth/logout/", { refresh: "session_refresh" });
  });

  test("efface localStorage après logout", async () => {
    localStorage.setItem("access_token", "tok");
    localStorage.setItem("refresh_token", "ref");
    localStorage.setItem("user", JSON.stringify({ username: "admin" }));
    api.post.mockResolvedValueOnce({});

    await logout();
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
  });

  test("efface sessionStorage après logout", async () => {
    sessionStorage.setItem("access_token", "tok");
    sessionStorage.setItem("refresh_token", "ref");
    sessionStorage.setItem("user", JSON.stringify({ username: "admin" }));
    api.post.mockResolvedValueOnce({});

    await logout();
    expect(sessionStorage.getItem("access_token")).toBeNull();
    expect(sessionStorage.getItem("refresh_token")).toBeNull();
    expect(sessionStorage.getItem("user")).toBeNull();
  });

  test("efface le storage même si la requête échoue", async () => {
    localStorage.setItem("access_token", "tok");
    api.post.mockRejectedValueOnce(new Error("Network error"));

    await logout();
    expect(localStorage.getItem("access_token")).toBeNull();
  });
});

describe("getUser()", () => {
  test("retourne null si aucun user stocké", () => {
    expect(getUser()).toBeNull();
  });

  test("retourne l'user depuis localStorage", () => {
    const user = { id: "1", username: "admin", role: "ADMIN" };
    localStorage.setItem("user", JSON.stringify(user));
    expect(getUser()).toEqual(user);
  });

  test("retourne l'user depuis sessionStorage", () => {
    const user = { id: "2", username: "cons", role: "CONSULTANT" };
    sessionStorage.setItem("user", JSON.stringify(user));
    expect(getUser()).toEqual(user);
  });

  test("préfère localStorage sur sessionStorage", () => {
    const local = { id: "1", username: "local" };
    const session = { id: "2", username: "session" };
    localStorage.setItem("user", JSON.stringify(local));
    sessionStorage.setItem("user", JSON.stringify(session));
    expect(getUser()?.username).toBe("local");
  });
});

describe("isAuthenticated()", () => {
  test("retourne false si aucun token", () => {
    expect(isAuthenticated()).toBe(false);
  });

  test("retourne true si token dans localStorage", () => {
    localStorage.setItem("access_token", "tok");
    expect(isAuthenticated()).toBe(true);
  });

  test("retourne true si token dans sessionStorage", () => {
    sessionStorage.setItem("access_token", "tok");
    expect(isAuthenticated()).toBe(true);
  });

  test("retourne false si tokens supprimés", () => {
    localStorage.setItem("access_token", "tok");
    localStorage.removeItem("access_token");
    expect(isAuthenticated()).toBe(false);
  });
});
