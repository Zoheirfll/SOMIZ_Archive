import { useMemo, useState } from "react";
import { useTheme } from "../../context/ThemeContext";

// Panneau "Filtres dossier" — sélection multiple de types de documents, par
// type au choix "Manquant" ou "Présent" (états mutuellement exclusifs sur
// une même ligne), + statut global du dossier (Complet/Incomplet). Remplace
// les liens mono-type venant du Dashboard (?type_manquant=<code> unique) —
// ceux-ci restent lisibles ici (une sélection à un seul code).
const DocFilterPanel = ({
  open,
  onClose,
  docTypesList,
  dossierComplet,
  typeManquant,
  typePresent,
  onApply,
}) => {
  const theme = useTheme();
  const [search, setSearch] = useState("");

  // État local, initialisé depuis l'URL à l'ouverture — { [code]: "manquant"|"present" }
  const [selection, setSelection] = useState(() => {
    const s = {};
    (typeManquant || "").split(",").filter(Boolean).forEach((c) => (s[c] = "manquant"));
    (typePresent || "").split(",").filter(Boolean).forEach((c) => (s[c] = "present"));
    return s;
  });
  const [dossierChoice, setDossierChoice] = useState(
    dossierComplet === "true" ? "complet" : dossierComplet === "false" ? "incomplet" : "tous",
  );

  const filteredTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docTypesList;
    return docTypesList.filter((t) => t.nom.toLowerCase().includes(q));
  }, [docTypesList, search]);

  const setState = (code, state) =>
    setSelection((prev) => {
      const next = { ...prev };
      if (next[code] === state) delete next[code]; // re-clic = désélectionne
      else next[code] = state;
      return next;
    });

  const clearAll = () => {
    setSelection({});
    setDossierChoice("tous");
  };

  const activeCount =
    Object.keys(selection).length + (dossierChoice !== "tous" ? 1 : 0);

  const apply = () => {
    const manquants = Object.entries(selection)
      .filter(([, v]) => v === "manquant")
      .map(([c]) => c);
    const presents = Object.entries(selection)
      .filter(([, v]) => v === "present")
      .map(([c]) => c);
    onApply({
      dossierComplet:
        dossierChoice === "complet" ? "true" : dossierChoice === "incomplet" ? "false" : null,
      manquants,
      presents,
    });
    onClose();
  };

  if (!open) return null;

  const dossierOptions = [
    { key: "tous", label: "Tous" },
    { key: "complet", label: "Complet" },
    { key: "incomplet", label: "Incomplet" },
  ];

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 10 }}
      />
      <div
        className="anim-scale-in"
        role="dialog"
        aria-label="Filtres dossier"
        style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 6px)",
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          boxShadow: theme.shadowMd,
          padding: 14,
          zIndex: 11,
          width: 340,
          maxWidth: "90vw",
          fontFamily: theme.fontFamily,
        }}
      >
        {/* Dossier complet/incomplet */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              color: theme.textMuted,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            Dossier
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {dossierOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setDossierChoice(o.key)}
                style={{
                  flex: 1,
                  border: `1.5px solid ${dossierChoice === o.key ? theme.primary : theme.border}`,
                  background: dossierChoice === o.key ? theme.primaryBg : theme.bg,
                  color: dossierChoice === o.key ? theme.primary : theme.textSecondary,
                  borderRadius: 8,
                  padding: "7px 0",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Types de documents */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <span
            style={{
              color: theme.textMuted,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Documents ({Object.keys(selection).length} sélectionné{Object.keys(selection).length > 1 ? "s" : ""})
          </span>
          {Object.keys(selection).length > 0 && (
            <button
              type="button"
              onClick={() => setSelection({})}
              style={{
                background: "none",
                border: "none",
                color: theme.textMuted,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Aucun
            </button>
          )}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer les types…"
          className="input-focus"
          style={{
            width: "100%",
            boxSizing: "border-box",
            border: `1.5px solid ${theme.border}`,
            borderRadius: 8,
            padding: "7px 10px",
            fontSize: 12,
            color: theme.text,
            background: theme.bg,
            outline: "none",
            marginBottom: 8,
            fontFamily: theme.fontFamily,
          }}
        />

        <div
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            maxHeight: 260,
            overflowY: "auto",
            background: theme.bg,
          }}
        >
          {filteredTypes.length === 0 ? (
            <div style={{ padding: 14, textAlign: "center", color: theme.textMuted, fontSize: 12 }}>
              Aucun type trouvé.
            </div>
          ) : (
            filteredTypes.map((t) => {
              const state = selection[t.code];
              return (
                <div
                  key={t.code}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 10px",
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  <span
                    title={t.nom}
                    style={{
                      color: theme.text,
                      fontSize: 12.5,
                      fontWeight: state ? 600 : 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}
                  >
                    {t.nom}
                  </span>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => setState(t.code, "manquant")}
                      title="Manquant"
                      aria-pressed={state === "manquant"}
                      style={{
                        border: `1px solid ${state === "manquant" ? "#FDE68A" : theme.border}`,
                        background: state === "manquant" ? "#FFFBEB" : "transparent",
                        color: state === "manquant" ? "#92400E" : theme.textMuted,
                        borderRadius: 6,
                        padding: "3px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Manquant
                    </button>
                    <button
                      type="button"
                      onClick={() => setState(t.code, "present")}
                      title="Présent"
                      aria-pressed={state === "present"}
                      style={{
                        border: `1px solid ${state === "present" ? theme.primaryBorder : theme.border}`,
                        background: state === "present" ? theme.primaryBg : "transparent",
                        color: state === "present" ? theme.primary : theme.textMuted,
                        borderRadius: 6,
                        padding: "3px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Présent
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={clearAll}
            style={{
              flex: 1,
              background: "none",
              border: `1.5px solid ${theme.border}`,
              color: theme.textSecondary,
              borderRadius: 8,
              padding: "8px 0",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Réinitialiser
          </button>
          <button
            type="button"
            onClick={apply}
            style={{
              flex: 1,
              background: theme.primary,
              border: "none",
              color: "#fff",
              borderRadius: 8,
              padding: "8px 0",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Appliquer{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
        </div>
      </div>
    </>
  );
};

export default DocFilterPanel;
