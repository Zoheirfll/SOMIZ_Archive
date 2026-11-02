// frontend/src/components/reporting/RapportLayout.jsx
import { useState } from "react";
import api from "../../services/api";
import Navbar from "../Navbar";
import PageBackground from "../PageBackground";
import HeroDecor from "../HeroDecor";
import { heroPadding, contentPadding } from "../../styles/theme";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";
import { PRESETS, presetToRange } from "./periodes";
import "../../styles/animations.css";

export default function RapportLayout({ def, params, onParams, filtres, children }) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const [preset, setPreset] = useState("12m");
  const [menuExport, setMenuExport] = useState(false);
  const [erreurExport, setErreurExport] = useState("");

  const choisirPreset = (key) => {
    setPreset(key);
    onParams(presetToRange(key));
  };
  const changerDate = (champ, valeur) => {
    setPreset(null);
    if (valeur) onParams({ [champ]: valeur });
  };

  const exporterExcel = async () => {
    setMenuExport(false);
    setErreurExport("");
    try {
      const res = await api.get(`/reporting/rh/${def.page}/`, { params: { ...params, fmt: "xlsx" }, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport_${def.page}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErreurExport("Impossible d'exporter ce rapport.");
    }
  };

  const champDate = { border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily, background: theme.surface, color: theme.text };
  const itemMenu = { display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: theme.text, fontFamily: theme.fontFamily };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: theme.directionGrad, padding: heroPadding(isMobile), position: "relative", overflow: "hidden" }}>
        <HeroDecor />
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ color: theme.textOnDark, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.7 }}>
            Statistiques
          </div>
          <h1 style={{ color: theme.textOnDark, margin: "4px 0 0", fontSize: 24, fontWeight: 800 }}>{def.label}</h1>
          <div style={{ color: theme.textOnDark, opacity: 0.65, fontSize: 13, marginTop: 6 }}>{def.description}</div>
        </div>
      </div>

      <div className="no-print" style={{ background: theme.surface, borderBottom: `1px solid ${theme.border}`, padding: isMobile ? "12px 16px" : "14px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => choisirPreset(p.key)}
              style={{
                background: preset === p.key ? theme.primaryBg : "transparent",
                border: `1px solid ${preset === p.key ? theme.primaryBorder : theme.border}`,
                color: preset === p.key ? theme.primary : theme.textSecondary,
                borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: theme.fontFamily,
              }}
            >
              {p.label}
            </button>
          ))}
          <label htmlFor="rapport-debut" style={{ fontSize: 12, color: theme.textSecondary, marginLeft: isMobile ? 0 : "auto" }}>Du</label>
          <input id="rapport-debut" type="date" value={params.date_debut || ""} onChange={(e) => changerDate("date_debut", e.target.value)} style={champDate} />
          <label htmlFor="rapport-fin" style={{ fontSize: 12, color: theme.textSecondary }}>au</label>
          <input id="rapport-fin" type="date" value={params.date_fin || ""} onChange={(e) => changerDate("date_fin", e.target.value)} style={champDate} />
          {filtres}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuExport((v) => !v)}
              style={{ background: theme.primary, color: theme.surface, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: theme.fontFamily }}
            >
              Exporter
            </button>
            {menuExport && (
              <div className="anim-scale-in" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, boxShadow: theme.shadowLg, zIndex: 20, minWidth: 170 }}>
                <button type="button" onClick={exporterExcel} style={itemMenu}>Excel (.xlsx)</button>
                <button type="button" onClick={() => { setMenuExport(false); window.print(); }} style={itemMenu}>PDF (impression)</button>
              </div>
            )}
          </div>
        </div>
        {erreurExport && <div style={{ maxWidth: 1200, margin: "8px auto 0", color: theme.danger, fontSize: 12 }}>{erreurExport}</div>}
      </div>

      <div style={{ padding: contentPadding(isMobile), maxWidth: 1200, margin: "0 auto" }}>{children}</div>
    </PageBackground>
  );
}
