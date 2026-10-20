import { getPageActions } from "../config/commandPaletteActions";

describe("getPageActions", () => {
  test("un CONSULTANT ne voit ni les pages admin ni les actions réservées", () => {
    const items = getPageActions({ role: "CONSULTANT", can_request_consultations: true });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Employés");
    expect(labels).toContain("Organigramme");
    expect(labels).not.toContain("Utilisateurs");
    expect(labels).not.toContain("Nouvel employé");
    expect(labels).not.toContain("Nouvelle demande d'attestation");
  });

  test("un ADMIN voit les pages admin et \"Nouvel employé\", pas \"Nouvelle demande d'attestation\"", () => {
    const items = getPageActions({ role: "ADMIN" });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Utilisateurs");
    expect(labels).toContain("Configuration");
    expect(labels).toContain("Nouvel employé");
    expect(labels).not.toContain("Nouvelle demande d'attestation");
  });

  test("un GESTIONNAIRE voit \"Nouvelle demande d'attestation\", pas \"Nouvel employé\" ni les pages admin", () => {
    const items = getPageActions({ role: "GESTIONNAIRE", can_request_attestations: true, can_request_consultations: true });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Nouvelle demande d'attestation");
    expect(labels).not.toContain("Nouvel employé");
    expect(labels).not.toContain("Utilisateurs");
  });

  test("les pages Demandes et Registres suivent les mêmes règles de visibilité que la navbar", () => {
    const labels = (user) => getPageActions(user).map((i) => i.label);

    expect(labels({ role: "GESTIONNAIRE", can_request_attestations: true, can_request_consultations: true })).toEqual(expect.arrayContaining([
      "Demandes d'attestation", "Consultations d'archives", "Nouvelle demande de consultation",
    ]));
    // CONSULTANT : consultations seulement, pas d'attestations.
    expect(labels({ role: "CONSULTANT", can_request_consultations: true })).toEqual(expect.arrayContaining([
      "Consultations d'archives", "Nouvelle demande de consultation",
    ]));
    expect(labels({ role: "CONSULTANT", can_request_consultations: true })).not.toContain("Demandes d'attestation");
    // ADMIN sans drapeau « chargé de… » : aucune de ces pages.
    const adminSimple = labels({ role: "ADMIN" });
    ["Demandes d'attestation", "Consultations d'archives", "Registres"].forEach((l) =>
      expect(adminSimple).not.toContain(l));
    // Drapeaux d'un ADMIN chargé.
    expect(labels({ role: "ADMIN", can_manage_consultations: true })).toContain("Consultations d'archives");
    expect(labels({ role: "ADMIN", can_manage_registres: true })).toContain("Registres");
    expect(labels({ role: "SUPERADMIN" })).toContain("Registres");
    // Un ADMIN ne crée pas de demande de consultation (réservée aux demandeurs).
    expect(labels({ role: "ADMIN", can_manage_consultations: true })).not.toContain("Nouvelle demande de consultation");
  });

  test("chaque entrée a un id, un label et un chemin uniques", () => {
    const items = getPageActions({ role: "SUPERADMIN" });
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Vérifier que les paires (label, path) sont uniques
    // (détecte les doublons même si les ids diffèrent)
    const labelPathPairs = items.map((i) => `${i.label}|${i.path}`);
    expect(new Set(labelPathPairs).size).toBe(labelPathPairs.length);

    items.forEach((i) => {
      expect(typeof i.label).toBe("string");
      expect(i.path.startsWith("/")).toBe(true);
    });
  });

  test("un ADMIN voit le Dashboard dans les résultats", () => {
    const items = getPageActions({ role: "ADMIN" });
    const dashboardItem = items.find((i) => i.path === "/dashboard");
    expect(dashboardItem).toBeDefined();
    expect(dashboardItem.label).toBe("Dashboard");
  });
});
