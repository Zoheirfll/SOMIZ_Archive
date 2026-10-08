import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

// Sélecteur « Demandes » : attestations de travail | consultations d'archives.
// Affiché en haut des deux listes ; masqué si le compte n'a accès qu'à une
// seule section (rien à choisir). Les conditions de visibilité sont celles de
// la navbar (canSeeAttestations / canSeeConsultations).
export default function DemandesTabs() {
  const { user } = useAuth();
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const onglets = [
    {
      path: "/attestations", label: "Attestations de travail",
      visible: user?.role === "GESTIONNAIRE" || !!user?.can_manage_attestations,
    },
    {
      path: "/consultations", label: "Consultations d'archives",
      visible: ["GESTIONNAIRE", "CONSULTANT"].includes(user?.role) || !!user?.can_manage_consultations,
    },
  ].filter((o) => o.visible);

  if (onglets.length < 2) return null;

  return (
    <div
      role="tablist"
      aria-label="Type de demande"
      style={{
        display: "inline-flex", gap: 4, padding: 4, marginBottom: 16,
        background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 10,
      }}
    >
      {onglets.map((o) => {
        const actif = location.pathname.startsWith(o.path);
        return (
          <button
            key={o.path}
            type="button"
            role="tab"
            aria-selected={actif}
            onClick={() => { if (!actif) navigate(o.path); }}
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
  );
}
