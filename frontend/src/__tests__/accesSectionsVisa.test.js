import { canSeeConges } from "../config/accesSections";

describe("canSeeConges — responsables d'unité", () => {
  test("un responsable (can_visa_conges) accède aux congés sans droit de demander", () => {
    expect(canSeeConges({ role: "CONSULTANT", can_visa_conges: true })).toBe(true);
  });

  test("un consultant sans droit ni visa n'y accède pas", () => {
    expect(canSeeConges({ role: "CONSULTANT" })).toBe(false);
  });

  test("les droits existants restent valables", () => {
    expect(canSeeConges({ can_request_conges: true })).toBe(true);
    expect(canSeeConges({ can_manage_conges: true })).toBe(true);
  });
});
