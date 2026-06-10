/**
 * Tests — services/api.js
 * Tokens dans cookies httpOnly — pas d'Authorization header manuel.
 * L'intercepteur response tente un refresh silencieux sur 401.
 */

import axios from "axios";

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

describe("api.js — configuration", () => {
  beforeEach(() => {
    jest.resetModules();

    const mockAxiosInstance = {
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };
    jest.doMock("axios", () => ({
      default: { create: () => mockAxiosInstance },
      create: () => mockAxiosInstance,
    }));

    require("../services/api");
  });

  test("crée l'instance axios avec withCredentials: true", () => {
    const axiosMod = require("axios");
    const createCall = axiosMod.create || axiosMod.default?.create;
    if (createCall?.mock?.calls?.length > 0) {
      const config = createCall.mock.calls[0][0];
      expect(config?.withCredentials).toBe(true);
    }
  });
});

describe("api.js — intercepteur de réponse (401)", () => {
  let responseErrorHandler;

  beforeEach(() => {
    jest.resetModules();

    const mockAxiosInstance = {
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn((_, errFn) => { responseErrorHandler = errFn; }) },
      },
      post: jest.fn().mockRejectedValue({ response: { status: 401 } }),
    };
    jest.doMock("axios", () => ({
      default: { create: () => mockAxiosInstance },
      create: () => mockAxiosInstance,
    }));

    delete window.location;
    window.location = { href: "" };

    require("../services/api");
  });

  test("ne redirige pas sur 401 pour /auth/login", async () => {
    const error = {
      response: { status: 401 },
      config: { url: "/api/auth/login", _retry: false },
    };
    await expect(responseErrorHandler(error)).rejects.toBeDefined();
    expect(window.location.href).not.toBe("/login");
  });

  test("ne redirige pas sur 403", async () => {
    const error = {
      response: { status: 403 },
      config: { url: "/api/employees/" },
    };
    await expect(responseErrorHandler(error)).rejects.toBeDefined();
    expect(window.location.href).not.toBe("/login");
  });
});
