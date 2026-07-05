import { theme } from "../styles/theme";

describe("theme — tokens accent", () => {
  test("expose les tokens accent ambre", () => {
    expect(theme.accent).toBe("#F59E0B");
    expect(theme.accentLight).toBe("#FBBF24");
    expect(theme.accentBg).toBe("#FFFBEB");
    expect(theme.accentBorder).toBe("#FDE68A");
  });

  test("ne modifie pas les tokens existants", () => {
    expect(theme.primary).toBe("#166534");
    expect(theme.bg).toBe("#F1F5F9");
  });
});
