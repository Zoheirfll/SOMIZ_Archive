import { useTheme } from "../../context/ThemeContext";
import { CheckIcon, XIcon, FolderIcon, RocketIcon } from "../icons";
import { TABS, REF_COLUMNS_INFO } from "../../config/parametresTabs";

// Modale d'import CSV/XLSX d'un référentiel — extraite de Parametres.jsx
// pour garder la page principale sous les 1000 lignes.
const ImportRefModal = ({
  importModal,
  setImportModal,
  importFile,
  setImportFile,
  importResult,
  importing,
  handleImportFile,
}) => {
  const theme = useTheme();
  return (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}
    onClick={() => setImportModal(null)}
  >
    <div
      style={{
        background: theme.surface,
        borderRadius: 16,
        padding: 32,
        width: 520,
        maxWidth: "90vw",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        border: `1px solid ${theme.primaryBorder}`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h2
        style={{
          color: theme.text,
          margin: "0 0 12px",
          fontSize: 16,
          fontWeight: 800,
        }}
      >
        Import — {TABS.find((t) => t.key === importModal.tab)?.label}
      </h2>

      {/* Colonnes obligatoires/optionnelles — voir REF_COLUMNS_INFO,
          reflète ReferentielImportView.MODELS côté backend */}
      {REF_COLUMNS_INFO[importModal.tab] && (
        <div
          style={{
            background: theme.bg,
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            fontSize: 12,
            color: theme.textSecondary,
          }}
        >
          <div style={{ marginBottom: 4 }}>
            <strong style={{ color: theme.danger }}>Obligatoire :</strong>{" "}
            {REF_COLUMNS_INFO[importModal.tab].obligatoires.join(", ")}
          </div>
          <div>
            <strong style={{ color: theme.primary }}>Optionnel :</strong>{" "}
            {REF_COLUMNS_INFO[importModal.tab].optionnelles.join(", ")}
          </div>
          {REF_COLUMNS_INFO[importModal.tab].note && (
            <div style={{ marginTop: 6, fontStyle: "italic" }}>
              {REF_COLUMNS_INFO[importModal.tab].note}
            </div>
          )}
        </div>
      )}

      {/* Zone dépôt */}
      <div
        onClick={() => document.getElementById("ref-csv-input").click()}
        style={{
          border: `2px dashed ${importFile ? theme.primary : theme.primaryBorder}`,
          borderRadius: 10,
          padding: 24,
          textAlign: "center",
          background: importFile ? theme.primaryBg : theme.bg,
          cursor: "pointer",
          marginBottom: 16,
          transition: "all 0.2s",
        }}
      >
        {importFile ? (
          <div>
            <div
              style={{
                color: theme.primary,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <CheckIcon size={14} /> {importFile.name}
            </div>
            <div
              style={{
                color: theme.textSecondary,
                fontSize: 12,
                marginTop: 4,
              }}
            >
              {(importFile.size / 1024).toFixed(1)} Ko — Cliquez pour changer
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                marginBottom: 8,
                display: "flex",
                justifyContent: "center",
                color: theme.textMuted,
              }}
            >
              <FolderIcon size={28} />
            </div>
            <div style={{ color: theme.text, fontSize: 14 }}>
              Cliquez pour choisir un fichier Excel (.xlsx) ou CSV
            </div>
          </div>
        )}
        <input
          id="ref-csv-input"
          type="file"
          accept=".csv,.xlsx"
          onChange={(e) => setImportFile(e.target.files[0])}
          style={{ display: "none" }}
        />
      </div>

      {/* Résultat */}
      {importResult && (
        <div style={{ marginBottom: 16 }}>
          {importResult.error ? (
            <div
              style={{
                background: theme.dangerBg,
                border: `1px solid ${theme.dangerBorder}`,
                borderRadius: 8,
                padding: 12,
                color: theme.danger,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <XIcon size={13} /> {importResult.error}
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                {[
                  {
                    label: "Créés",
                    value: importResult.nb_crees,
                    color: theme.primary,
                  },
                  {
                    label: "Erreurs",
                    value: importResult.nb_erreurs,
                    color:
                      importResult.nb_erreurs > 0 ? theme.danger : theme.primary,
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "10px",
                      background: theme.bg,
                      borderRadius: 8,
                      border: `1px solid ${theme.primaryBorder}`,
                    }}
                  >
                    <div
                      style={{
                        color: s.color,
                        fontSize: 22,
                        fontWeight: 800,
                      }}
                    >
                      {s.value}
                    </div>
                    <div style={{ color: theme.textSecondary, fontSize: 12 }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              {importResult.nb_erreurs > 0 && (
                <div
                  style={{
                    background: theme.dangerBg,
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  {importResult.erreurs.slice(0, 5).map((err, i) => (
                    <div
                      key={i}
                      style={{
                        color: theme.danger,
                        fontSize: 12,
                        marginBottom: 3,
                      }}
                    >
                      Ligne {err.ligne} — {err.nom} : {err.erreurs.join(", ")}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Boutons */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button
          onClick={() => setImportModal(null)}
          style={{
            background: "transparent",
            border: `1px solid ${theme.primaryBorder}`,
            color: theme.textSecondary,
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Fermer
        </button>
        <button
          onClick={handleImportFile}
          disabled={!importFile || importing}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background:
              !importFile || importing ? `${theme.primary}88` : theme.primary,
            border: "none",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 24px",
            fontSize: 13,
            fontWeight: 700,
            cursor: !importFile || importing ? "not-allowed" : "pointer",
          }}
        >
          {importing ? (
            "Import..."
          ) : (
            <>
              <RocketIcon size={13} /> Importer
            </>
          )}
        </button>
      </div>
    </div>
  </div>
  );
};

export default ImportRefModal;
