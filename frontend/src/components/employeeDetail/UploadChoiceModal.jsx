import { useTheme } from "../../context/ThemeContext";

// Choix à l'upload quand un document du même type existe déjà
// (2026-09-14) : soit les nouveaux fichiers rejoignent le document
// existant comme FICHIERS supplémentaires — chacun gardant son identité
// et ses propres pages (cas « Avenants », « Décisions »… qui
// s'accumulent) — soit ils forment une nouvelle version et l'ancienne
// bascule dans l'historique (cas d'un scan corrigé qui remplace le
// précédent, comportement historique de l'application).
const UploadChoiceModal = ({ docLabel, nbFichiers, onChoose }) => {
  const theme = useTheme();

  const option = (titre, description, onClick, primary) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        background: primary ? theme.primaryBg : theme.bg,
        border: `1.5px solid ${primary ? theme.primaryBorder : theme.border}`,
        borderRadius: 10,
        padding: "12px 14px",
        cursor: "pointer",
        fontFamily: theme.fontFamily,
        width: "100%",
      }}
    >
      <div
        style={{
          color: primary ? theme.primary : theme.text,
          fontWeight: 700,
          fontSize: 13,
          marginBottom: 3,
        }}
      >
        {titre}
      </div>
      <div style={{ color: theme.textSecondary, fontSize: 11.5, lineHeight: 1.4 }}>
        {description}
      </div>
    </button>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        backdropFilter: "blur(2px)",
      }}
      onClick={() => onChoose(null)}
    >
      <div
        role="dialog"
        aria-label={`Ajout à ${docLabel}`}
        className="anim-scale-in"
        style={{
          background: theme.surface,
          borderRadius: 16,
          padding: 24,
          width: 460,
          maxWidth: "92vw",
          boxShadow: "0 16px 48px rgba(15,23,42,0.25)",
          border: `1px solid ${theme.border}`,
          fontFamily: theme.fontFamily,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ color: theme.text, fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
          « {docLabel} » existe déjà
        </div>
        <div style={{ color: theme.textSecondary, fontSize: 12.5, marginBottom: 16 }}>
          {nbFichiers} fichier{nbFichiers > 1 ? "s" : ""} à ajouter — que
          faire du document déjà présent ?
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {option(
            "Ajouter au document existant",
            "Les fichiers rejoignent le document actuel comme fichiers supplémentaires (avenant 2, décision 3…), chacun gardant son nom et ses propres pages. Navigables avec les flèches ← →.",
            () => onChoose("fichier"),
            true,
          )}
          {option(
            "Nouvelle version",
            "Le document actuel bascule dans « Historique (versions antérieures) » et les nouveaux fichiers deviennent la version courante.",
            () => onChoose("version"),
            false,
          )}
        </div>

        <button
          type="button"
          onClick={() => onChoose(null)}
          style={{
            marginTop: 14,
            width: "100%",
            background: "transparent",
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            color: theme.textSecondary,
            padding: "8px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: theme.fontFamily,
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
};

export default UploadChoiceModal;
