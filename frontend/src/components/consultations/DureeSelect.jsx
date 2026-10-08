import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { DUREES, LIMITE_MAX_HEURES, formatDuree } from "../../utils/consultations";

// Durée de consultation : raccourcis usuels + durée personnalisée (en heures
// ou en jours). Renvoie TOUJOURS un nombre d'heures entier valide (borné entre
// 1 h et LIMITE_MAX_HEURES, les mêmes bornes que le serveur).
export default function DureeSelect({ value, onChange, ariaLabel = "Durée de la consultation" }) {
  const theme = useTheme();
  const [personnalisee, setPersonnalisee] = useState(!DUREES.some((d) => d.value === value));
  const [unite, setUnite] = useState(value >= 24 && value % 24 === 0 ? "jours" : "heures");
  const [saisie, setSaisie] = useState(String(unite === "jours" ? value / 24 : value));
  const [avertissement, setAvertissement] = useState("");

  const champ = {
    padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`,
    background: theme.bg, color: theme.text, fontSize: 13, fontFamily: theme.fontFamily,
  };

  const appliquer = (texte, uniteCourante) => {
    setSaisie(texte);
    const n = Number(texte);
    if (!texte || !Number.isFinite(n) || n < 1) {
      setAvertissement("Indiquez une durée d'au moins 1 heure.");
      return;
    }
    const heures = Math.round(n * (uniteCourante === "jours" ? 24 : 1));
    if (heures > LIMITE_MAX_HEURES) {
      setAvertissement(`Maximum ${formatDuree(LIMITE_MAX_HEURES)} (${LIMITE_MAX_HEURES} h).`);
      onChange(LIMITE_MAX_HEURES);
      return;
    }
    setAvertissement("");
    onChange(heures);
  };

  const changerPalier = (e) => {
    if (e.target.value === "custom") {
      setPersonnalisee(true);
      setUnite("heures");
      setSaisie(String(value));
      setAvertissement("");
      return;
    }
    setPersonnalisee(false);
    setAvertissement("");
    onChange(Number(e.target.value));
  };

  const changerUnite = (e) => {
    setUnite(e.target.value);
    appliquer(saisie, e.target.value);
  };

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select aria-label={ariaLabel} value={personnalisee ? "custom" : value} onChange={changerPalier} style={champ}>
          {DUREES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          <option value="custom">Personnalisée…</option>
        </select>
        {personnalisee && (
          <>
            <input
              type="number" min={1} step={1} inputMode="numeric"
              aria-label="Durée personnalisée" value={saisie}
              onChange={(e) => appliquer(e.target.value, unite)}
              style={{ ...champ, width: 84 }}
            />
            <select aria-label="Unité de durée" value={unite} onChange={changerUnite} style={champ}>
              <option value="heures">heures</option>
              <option value="jours">jours</option>
            </select>
          </>
        )}
      </div>
      {personnalisee && !avertissement && (
        <span style={{ fontSize: 11, color: theme.textMuted }}>
          Accès ouvert pendant {formatDuree(value)}.
        </span>
      )}
      {avertissement && <span style={{ fontSize: 11, color: theme.warning }}>{avertissement}</span>}
    </div>
  );
}
