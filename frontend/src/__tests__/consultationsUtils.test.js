import { slugDepuisReference, formatDateHeure, tempsRestant, DUREES } from "../utils/consultations";

describe("utils/consultations", () => {
  test("slugDepuisReference remplace le / de la référence", () => {
    expect(slugDepuisReference("C-00001/26")).toBe("C-00001-26");
  });

  test("formatDateHeure formate jj/mm/aaaa hh:mm et tolère le vide", () => {
    expect(formatDateHeure(null)).toBe("—");
    expect(formatDateHeure("pas une date")).toBe("—");
    expect(formatDateHeure("2026-10-08T09:05:00")).toBe("08/10/2026 09:05");
  });

  test("tempsRestant", () => {
    const now = new Date("2026-10-08T10:00:00").getTime();
    expect(tempsRestant("2026-10-08T09:59:59", now)).toBe("Expirée");
    expect(tempsRestant("2026-10-08T10:00:00", now)).toBe("Expirée");
    expect(tempsRestant("2026-10-08T10:12:00", now)).toBe("12 min");
    expect(tempsRestant("2026-10-08T15:05:00", now)).toBe("5 h 05 min");
    expect(tempsRestant("2026-10-10T13:00:00", now)).toBe("2 j 3 h");
  });

  test("les durées proposées reprennent les presets du serveur", () => {
    expect(DUREES.map((d) => d.value)).toEqual([1, 24, 72, 168]);
  });
});
