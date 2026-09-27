import { getPageActions } from "../config/commandPaletteActions";

describe("getPageActions", () => {
  test("un CONSULTANT ne voit ni les pages admin ni les actions réservées", () => {
    const items = getPageActions({ role: "CONSULTANT" });
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
    const items = getPageActions({ role: "GESTIONNAIRE" });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Nouvelle demande d'attestation");
    expect(labels).not.toContain("Nouvel employé");
    expect(labels).not.toContain("Utilisateurs");
  });

  test("chaque entrée a un id, un label et un chemin uniques", () => {
    const items = getPageActions({ role: "SUPERADMIN" });
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    items.forEach((i) => {
      expect(typeof i.label).toBe("string");
      expect(i.path.startsWith("/")).toBe(true);
    });
  });
});
