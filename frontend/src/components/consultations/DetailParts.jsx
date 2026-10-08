import { CheckIcon } from "../icons";
import { formatDateHeure } from "../../utils/consultations";

// Mêmes briques visuelles que AttestationDetail.jsx (cartes d'information,
// indicateur d'étapes) pour que les deux types de demande se lisent pareil.

export const Field = ({ label, value, sub, theme, danger }) => (
  <div>
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: theme.textMuted, marginBottom: 6 }}>
      {label}
    </div>
    <div style={{ fontSize: 15, color: danger ? theme.danger : theme.text, fontWeight: 700 }}>
      {value || "—"}
    </div>
    {sub && (
      <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2, fontWeight: 500 }}>{sub}</div>
    )}
  </div>
);

export const InfoCard = ({ title, children, theme }) => (
  <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 22, boxShadow: theme.shadowMd }}>
    <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${theme.border}` }}>
      <span style={{ color: theme.textSecondary, fontSize: 13, fontWeight: 500 }}>{title}</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 18 }}>
      {children}
    </div>
  </div>
);

const ETAPES = [
  { value: "demande", label: "Demandée", dateKey: "created_at" },
  { value: "validation", label: "Validée", dateKey: "date_validation" },
  { value: "echeance", label: "Échéance", dateKey: "date_echeance" },
];

export const ConsultationStepper = ({ demande, theme, isMobile }) => {
  const statut = demande.statut_effectif;
  const banniere = {
    rejetee: "Demande rejetée",
    revoquee: "Consultation révoquée",
  }[statut];
  if (banniere) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8, color: theme.danger,
        background: theme.dangerBg, borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700,
      }}>
        {banniere}
      </div>
    );
  }
  // en_cours → étape 0 ; validee → étape 1 ; expiree → étape 2 (échéance atteinte).
  const idxActuel = statut === "en_cours" ? 0 : statut === "validee" ? 1 : 2;
  return (
    <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
      {ETAPES.map((etape, i) => {
        const atteinte = i <= idxActuel;
        const courante = i === idxActuel;
        const dateEtape = demande[etape.dateKey] ? formatDateHeure(demande[etape.dateKey]) : "";
        // L'échéance prévue est utile à voir avant qu'elle soit atteinte.
        const afficherDate = dateEtape && (atteinte || etape.value === "echeance");
        return (
          <div key={etape.value} style={{ display: "flex", alignItems: "center", flex: i < ETAPES.length - 1 ? 1 : "0 0 auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: atteinte ? theme.primary : theme.surface,
                border: `2px solid ${atteinte ? theme.primary : theme.border}`,
                color: atteinte ? "#fff" : theme.textMuted,
                boxShadow: courante ? `0 0 0 4px ${theme.primaryBg}` : "none",
                transition: "all 0.2s",
              }}>
                {atteinte ? <CheckIcon size={12} /> : <span style={{ fontSize: 10, fontWeight: 700 }}>{i + 1}</span>}
              </div>
              {!isMobile && (
                <>
                  <div style={{
                    fontSize: 10, fontWeight: courante ? 700 : 600, marginTop: 6, textAlign: "center",
                    color: atteinte ? theme.text : theme.textMuted, whiteSpace: "nowrap",
                  }}>
                    {etape.value === "echeance" && statut === "expiree" ? "Expirée" : etape.label}
                  </div>
                  {afficherDate && (
                    <div style={{ fontSize: 9, color: theme.textMuted, marginTop: 2, whiteSpace: "nowrap" }}>
                      {dateEtape}
                    </div>
                  )}
                </>
              )}
            </div>
            {i < ETAPES.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: isMobile ? "0 2px" : "0 4px -18px",
                background: i < idxActuel ? theme.primary : theme.border, transition: "all 0.2s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
};
