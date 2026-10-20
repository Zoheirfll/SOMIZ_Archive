import {
  canRequestAttestations, canRequestConsultations, canSeeAttestations, canSeeConsultations,
} from "../config/accesSections";

describe("accesSections — droits de demande (peut_demander_*)", () => {
  test("un gestionnaire sans droit ne voit ni ne demande rien", () => {
    const u = { role: "GESTIONNAIRE" };
    expect(canRequestAttestations(u)).toBe(false);
    expect(canRequestConsultations(u)).toBe(false);
    expect(canSeeAttestations(u)).toBe(false);
    expect(canSeeConsultations(u)).toBe(false);
  });

  test("les droits sont indépendants : un gestionnaire par service", () => {
    const attestations = { role: "GESTIONNAIRE", can_request_attestations: true };
    expect(canSeeAttestations(attestations)).toBe(true);
    expect(canSeeConsultations(attestations)).toBe(false);
    const consultations = { role: "CONSULTANT", can_request_consultations: true };
    expect(canSeeConsultations(consultations)).toBe(true);
    expect(canSeeAttestations(consultations)).toBe(false);
  });

  test("un traiteur voit sa section sans pouvoir demander", () => {
    const admin = { role: "ADMIN", can_manage_attestations: true };
    expect(canSeeAttestations(admin)).toBe(true);
    expect(canRequestAttestations(admin)).toBe(false);
  });

  test("tolère un utilisateur absent", () => {
    expect(canSeeAttestations(null)).toBe(false);
    expect(canRequestConsultations(undefined)).toBe(false);
  });
});
