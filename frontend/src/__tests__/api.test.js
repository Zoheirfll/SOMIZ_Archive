/**
 * Tests — services/api.js
 * Couvre : intercepteur request (token), intercepteur response (401)
 */

import axios from "axios";

// On mock axios pour tester les intercepteurs
jest.mock("axios", () => {
  const mockAxios = {
    create: jest.fn(() => mockAxios),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    get: jest.fn(),
    post: jest.fn(),
  };
  return { default: mockAxios, ...mockAxios };
});

describe("api.js — intercepteur de requête", () => {
  let requestInterceptor;

  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    sessionStorage.clear();

    // Capturer l'intercepteur enregistré
    const mockAxiosInstance = {
      interceptors: {
        request: { use: jest.fn((fn) => { requestInterceptor = fn; }) },
        response: { use: jest.fn() },
      },
    };
    jest.doMock("axios", () => ({ default: { create: () => mockAxiosInstance }, create: () => mockAxiosInstance }));

    require("../services/api");
  });

  test("ajoute le Bearer token depuis localStorage", () => {
    localStorage.setItem("access_token", "token_local");
    const config = { headers: {} };
    const result = requestInterceptor(config);
    expect(result.headers.Authorization).toBe("Bearer token_local");
  });

  test("ajoute le Bearer token depuis sessionStorage si localStorage vide", () => {
    sessionStorage.setItem("access_token", "token_session");
    const config = { headers: {} };
    const result = requestInterceptor(config);
    expect(result.headers.Authorization).toBe("Bearer token_session");
  });

  test("ne définit pas Authorization si aucun token", () => {
    const config = { headers: {} };
    const result = requestInterceptor(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  test("préfère localStorage sur sessionStorage", () => {
    localStorage.setItem("access_token", "token_local");
    sessionStorage.setItem("access_token", "token_session");
    const config = { headers: {} };
    const result = requestInterceptor(config);
    expect(result.headers.Authorization).toBe("Bearer token_local");
  });
});

describe("api.js — intercepteur de réponse (401)", () => {
  let responseErrorHandler;

  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    sessionStorage.clear();

    const mockAxiosInstance = {
      interceptors: {
        request: { use: jest.fn() },
        response: {
          use: jest.fn((_, errFn) => { responseErrorHandler = errFn; }),
        },
      },
    };
    jest.doMock("axios", () => ({ default: { create: () => mockAxiosInstance }, create: () => mockAxiosInstance }));

    delete window.location;
    window.location = { href: "" };

    require("../services/api");
  });

  test("redirige vers /login sur 401 hors login", async () => {
    localStorage.setItem("access_token", "tok");
    sessionStorage.setItem("refresh_token", "ref");

    const error = {
      response: { status: 401 },
      config: { url: "/api/employees/" },
    };

    await expect(responseErrorHandler(error)).rejects.toEqual(error);
    expect(window.location.href).toBe("/login");
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(sessionStorage.getItem("refresh_token")).toBeNull();
  });

  test("ne redirige pas sur 401 pour /auth/login", async () => {
    const error = {
      response: { status: 401 },
      config: { url: "/api/auth/login" },
    };

    await expect(responseErrorHandler(error)).rejects.toEqual(error);
    expect(window.location.href).not.toBe("/login");
  });

  test("ne redirige pas sur 403", async () => {
    const error = {
      response: { status: 403 },
      config: { url: "/api/employees/" },
    };

    await expect(responseErrorHandler(error)).rejects.toEqual(error);
    expect(window.location.href).not.toBe("/login");
  });
});
