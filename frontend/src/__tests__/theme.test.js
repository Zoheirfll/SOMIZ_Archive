import { lightTheme, darkTheme } from "../styles/theme";

describe("theme — cohérence light/dark", () => {
  test("light et dark exposent exactement le même jeu de clés", () => {
    expect(Object.keys(lightTheme).sort()).toEqual(Object.keys(darkTheme).sort());
  });
});

describe.each([
  ["lightTheme", lightTheme],
  ["darkTheme", darkTheme],
])("%s — tokens accent", (_name, theme) => {
  test("expose les tokens accent ambre", () => {
    expect(typeof theme.accent).toBe("string");
    expect(typeof theme.accentLight).toBe("string");
    expect(typeof theme.accentBg).toBe("string");
    expect(typeof theme.accentBorder).toBe("string");
  });

  test("expose les tokens de base (fontFamily, primary, bg)", () => {
    expect(typeof theme.fontFamily).toBe("string");
    expect(typeof theme.primary).toBe("string");
    expect(typeof theme.bg).toBe("string");
  });
});

describe("lightTheme — valeurs figées", () => {
  test("ne modifie pas les tokens existants", () => {
    expect(lightTheme.primary).toBe("#166534");
    expect(lightTheme.bg).toBe("#F1F5F9");
    expect(lightTheme.accent).toBe("#F59E0B");
    expect(lightTheme.accentLight).toBe("#FBBF24");
    expect(lightTheme.accentBg).toBe("#FFFBEB");
    expect(lightTheme.accentBorder).toBe("#FDE68A");
  });
});

describe("darkTheme — valeurs figées", () => {
  test("expose une palette sombre distincte de la palette claire", () => {
    expect(darkTheme.bg).not.toBe(lightTheme.bg);
    expect(darkTheme.surface).not.toBe(lightTheme.surface);
    expect(darkTheme.text).not.toBe(lightTheme.text);
  });
});
