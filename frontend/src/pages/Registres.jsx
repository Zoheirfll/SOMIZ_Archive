import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import MouvementsPanel from "../components/registres/MouvementsPanel";
import ReceptionsPanel from "../components/registres/ReceptionsPanel";

const ONGLETS = [
  { id: "mouvements", label: "Mouvements" },
  { id: "receptions", label: "Réceptions" },
];

export default function Registres() {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const [onglet, setOnglet] = useState("mouvements");

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ padding: contentPadding(isMobile), maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, color: theme.text, margin: "0 0 12px" }}>Registres d'archives</h1>
        <div
          role="tablist" aria-label="Registre"
          style={{ display: "inline-flex", gap: 4, padding: 4, marginBottom: 16, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 10 }}
        >
          {ONGLETS.map((o) => {
            const actif = onglet === o.id;
            return (
              <button
                key={o.id} type="button" role="tab" aria-selected={actif}
                onClick={() => setOnglet(o.id)}
                style={{
                  border: "none", borderRadius: 7, padding: "7px 16px", fontSize: 13, fontWeight: 700,
                  cursor: actif ? "default" : "pointer", fontFamily: theme.fontFamily,
                  background: actif ? theme.surface : "transparent",
                  color: actif ? theme.primary : theme.textSecondary,
                  boxShadow: actif ? theme.shadow : "none",
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {onglet === "mouvements" ? <MouvementsPanel /> : <ReceptionsPanel />}
      </div>
    </PageBackground>
  );
}
