import {
  joursEntre, ajouterJours, exercicePour, calculerVentilation, exerciceParDefaut, exerciceSelectionnable,
  refVersUrl, libelleStatutConge, libelleCategorie,
} from "../utils/conges";

describe("joursEntre et ajouterJours", () => {
  test("compte les jours calendaires entre départ et retour", () => {
    expect(joursEntre("2026-11-01", "2026-11-11")).toBe(10);
    expect(joursEntre("2026-08-10", "2026-08-23")).toBe(13);
  });

  test("renvoie une chaîne vide si une date manque ou si le retour n'est pas après le départ", () => {
    expect(joursEntre("", "2026-11-11")).toBe("");
    expect(joursEntre("2026-11-11", "2026-11-01")).toBe("");
    expect(joursEntre("2026-11-01", "2026-11-01")).toBe("");
  });

  test("ajoute des jours, y compris à travers un changement de mois ou d'heure", () => {
    expect(ajouterJours("2026-11-01", 3)).toBe("2026-11-04");
    expect(ajouterJours("2026-10-30", 3)).toBe("2026-11-02");
    expect(ajouterJours("2027-03-27", 2)).toBe("2027-03-29");
    expect(ajouterJours("", 3)).toBe("");
  });
});

describe("exercicePour — du 1er juillet au 30 juin", () => {
  test.each([
    ["2026-06-30", "2025/2026"],
    ["2026-07-01", "2026/2027"],
    ["2026-08-10", "2026/2027"],
    ["2027-01-15", "2026/2027"],
  ])("%s → %s", (iso, attendu) => {
    expect(exercicePour(iso)).toBe(attendu);
  });

  test("renvoie une chaîne vide sans date", () => {
    expect(exercicePour("")).toBe("");
  });
});

const EXERCICES = [
  { exercice: "2026/2027", restant: 30 },
  { exercice: "2025/2026", restant: 13 },
  { exercice: "2024/2025", restant: 0 },
  { exercice: "2027/2028", restant: 30 },
];

describe("exercice de départ", () => {
  test("propose le plus ancien exercice qui a encore des jours", () => {
    expect(exerciceParDefaut(EXERCICES)).toBe("2025/2026");
    expect(exerciceParDefaut([])).toBe("");
  });

  test("seul ce plus ancien exercice est sélectionnable", () => {
    expect(exerciceSelectionnable(EXERCICES, "2025/2026")).toBe(true);
    expect(exerciceSelectionnable(EXERCICES, "2026/2027")).toBe(false);
    expect(exerciceSelectionnable(EXERCICES, "2024/2025")).toBe(false);
  });
});

describe("calculerVentilation — le plus ancien d'abord, en cascade", () => {
  test("reste dans l'exercice de départ s'il suffit", () => {
    expect(calculerVentilation(EXERCICES, 10)).toEqual({
      parts: [{ exercice: "2025/2026", jours: 10 }], erreur: null,
    });
  });

  test("déborde sur les exercices suivants, jusqu'à l'anticipé", () => {
    expect(calculerVentilation(EXERCICES, 50).parts).toEqual([
      { exercice: "2025/2026", jours: 13 },
      { exercice: "2026/2027", jours: 30 },
      { exercice: "2027/2028", jours: 7 },
    ]);
  });

  test("refuse de démarrer après un exercice plus ancien non vidé", () => {
    expect(calculerVentilation(EXERCICES, 5, "2026/2027").erreur).toMatch(/2025\/2026 a encore 13/);
  });

  test("refuse un exercice de départ sans jours", () => {
    expect(calculerVentilation(EXERCICES, 5, "2024/2025").erreur).toMatch(/plus de jours/);
  });

  test("refuse si le total ne suffit pas", () => {
    expect(calculerVentilation(EXERCICES, 74).erreur).toMatch(/73 disponible/);
  });

  test("sans solde ou sans jours demandés, rien n'est calculé", () => {
    expect(calculerVentilation(null, 10)).toBeNull();
    expect(calculerVentilation(EXERCICES, "")).toBeNull();
  });
});

describe("refVersUrl et libellés", () => {
  test("encode la référence pour l'URL", () => {
    expect(refVersUrl("00001/26")).toBe("00001-26");
  });

  test("libelleStatutConge couvre les six statuts", () => {
    expect(libelleStatutConge("recue")).toBe("Reçue");
    expect(libelleStatutConge("annulee")).toBe("Annulée");
    expect(libelleStatutConge("interrompue")).toBe("Interrompue");
    expect(libelleStatutConge("inconnu")).toBe("inconnu");
  });

  test("libelleCategorie", () => {
    expect(libelleCategorie("ANTICIPE")).toBe("Anticipé");
    expect(libelleCategorie("")).toBe("");
  });
});
