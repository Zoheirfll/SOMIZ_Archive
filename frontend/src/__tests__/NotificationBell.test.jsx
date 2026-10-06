import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../hooks/useIsMobile", () => jest.fn(() => false));

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../services/api";
import NotificationBell from "../components/NotificationBell";
import { NOTIFICATIONS_POLL_MS } from "../hooks/useNotifications";

const NOTIFS = [
  { id: "n1", message: "Nouvelle demande d'attestation 00123/26", link: "/attestations/00123-26",
    severity: "info", created_at: "2026-10-06T10:00:00Z", read_at: null },
  { id: "n2", message: "Attestation prête", link: "", severity: "info",
    created_at: "2026-10-05T10:00:00Z", read_at: "2026-10-05T11:00:00Z" },
];

let unread;

const setup = () => {
  unread = 1;
  api.get.mockImplementation((url) => {
    if (url === "/notifications/compteur/") return Promise.resolve({ data: { non_lues: unread } });
    return Promise.resolve({ data: { results: NOTIFS } });
  });
  api.post.mockImplementation(() => Promise.resolve({ data: {} }));
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <NotificationBell />
      </ThemeProvider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("NotificationBell", () => {
  test("affiche le badge du nombre de non-lues", async () => {
    setup();
    expect(await screen.findByTestId("notification-badge")).toHaveTextContent("1");
    expect(screen.getByLabelText("Notifications, 1 non lue")).toBeInTheDocument();
  });

  test("ouvre le panneau, liste les notifications, ferme avec Échap", async () => {
    setup();
    await screen.findByTestId("notification-badge");
    fireEvent.click(screen.getByLabelText("Notifications, 1 non lue"));
    expect(await screen.findByText("Attestation prête")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("clic sur une notification : marque comme lue puis navigue", async () => {
    setup();
    await screen.findByTestId("notification-badge");
    fireEvent.click(screen.getByLabelText("Notifications, 1 non lue"));
    fireEvent.click(await screen.findByText("Nouvelle demande d'attestation 00123/26"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/notifications/n1/lue/"));
    expect(mockNavigate).toHaveBeenCalledWith("/attestations/00123-26");
  });

  test("« Tout marquer comme lu » appelle l'API", async () => {
    setup();
    await screen.findByTestId("notification-badge");
    fireEvent.click(screen.getByLabelText("Notifications, 1 non lue"));
    fireEvent.click(await screen.findByText("Tout marquer comme lu"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/notifications/tout-lire/"));
  });
});

describe("useNotifications — polling", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  const countCalls = () =>
    api.get.mock.calls.filter(([url]) => url === "/notifications/compteur/").length;

  test("interroge le compteur à intervalle régulier", async () => {
    setup();
    await act(async () => {});
    const before = countCalls();
    await act(async () => { jest.advanceTimersByTime(NOTIFICATIONS_POLL_MS); });
    expect(countCalls()).toBe(before + 1);
  });

  test("ne poll pas quand l'onglet est caché", async () => {
    setup();
    await act(async () => {});
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    const before = countCalls();
    await act(async () => { jest.advanceTimersByTime(NOTIFICATIONS_POLL_MS * 3); });
    expect(countCalls()).toBe(before);
  });

  test("rafraîchit immédiatement au retour sur l'onglet", async () => {
    setup();
    await act(async () => {});
    const before = countCalls();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(countCalls()).toBe(before + 1);
  });
});
