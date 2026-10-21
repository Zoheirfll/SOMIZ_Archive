import {
  canRequestAttestations, canRequestConsultations, canSeeAttestations, canSeeConsultations,
  canRequestConges, canSeeConges,
} from "../config/accesSections";

describe("accesSections — congés", () => {
  test("canRequestConges suit le droit demandeur", () => {
    expect(canRequestConges({ can_request_conges: true })).toBe(true);
    expect(canRequestConges({ can_request_conges: false })).toBe(false);
    expect(canRequestConges(null)).toBe(false);
  });

  test("canSeeConges : demandeur autorisé ou traiteur", () => {
    expect(canSeeConges({ can_request_conges: true })).toBe(true);
    expect(canSeeConges({ can_manage_conges: true })).toBe(true);
    expect(canSeeConges({ role: "ADMIN" })).toBe(false);
    expect(canSeeConges(undefined)).toBe(false);
  });

  test("un traiteur voit la section sans pouvoir demander", () => {
    const admin = { role: "ADMIN", can_manage_conges: true };
    expect(canSeeConges(admin)).toBe(true);
    expect(canRequestConges(admin)).toBe(false);
  });
});

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
