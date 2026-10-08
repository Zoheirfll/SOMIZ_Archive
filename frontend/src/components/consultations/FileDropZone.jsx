import { useRef, useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { formatTaille } from "../../utils/consultations";

// Zone de dépôt de fichiers : glisser-déposer ou clic (clavier compris), liste
// des fichiers choisis avec leur taille et un bouton « retirer ». Le contrôle
// de taille fait ici n'est qu'un confort : le serveur revérifie tout.
export default function FileDropZone({ files, onChange, accept, maxMo, maxFichiers = 20 }) {
  const theme = useTheme();
  const inputRef = useRef(null);
  const [survol, setSurvol] = useState(false);
  const [info, setInfo] = useState("");

  const ajouter = (nouveaux) => {
    const existants = new Set(files.map((f) => `${f.name}|${f.size}`));
    const uniques = Array.from(nouveaux).filter((f) => !existants.has(`${f.name}|${f.size}`));
    const total = [...files, ...uniques];
    if (total.length > maxFichiers) {
      setInfo(`Maximum ${maxFichiers} fichiers par livraison.`);
      onChange(total.slice(0, maxFichiers));
      return;
    }
    setInfo("");
    onChange(total);
  };

  const retirer = (index) => {
    setInfo("");
    onChange(files.filter((_, i) => i !== index));
  };

  const ouvrir = () => inputRef.current?.click();

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Zone de dépôt des fichiers"
        onClick={ouvrir}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrir(); } }}
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); ajouter(e.dataTransfer?.files || []); }}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center",
          padding: "22px 16px", borderRadius: 12, cursor: "pointer",
          border: `2px dashed ${survol ? theme.primary : theme.border}`,
          background: survol ? theme.primaryBg : theme.bg,
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={theme.primary} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <div style={{ color: theme.text, fontSize: 14, fontWeight: 700 }}>
          Glissez vos fichiers ici ou <span style={{ color: theme.primary, textDecoration: "underline" }}>parcourez</span>
        </div>
        <div style={{ color: theme.textMuted, fontSize: 12 }}>
          PDF, JPEG, PNG, TIFF — {maxMo} Mo max par fichier
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={accept}
          aria-label="Choisir des fichiers"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { ajouter(e.target.files || []); e.target.value = ""; }}
        />
      </div>

      {info && <div style={{ color: theme.warning, fontSize: 12, marginTop: 8 }}>{info}</div>}

      {files.length > 0 && (
        <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((f, i) => {
            const trop = f.size > maxMo * 1024 * 1024;
            return (
              <li
                key={`${f.name}|${f.size}|${i}`}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8,
                  background: trop ? theme.dangerBg : theme.surface,
                  border: `1px solid ${trop ? theme.dangerBorder : theme.border}`,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, color: theme.text, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name}
                </span>
                <span style={{ color: trop ? theme.danger : theme.textMuted, fontSize: 12, flexShrink: 0 }}>
                  {formatTaille(f.size)}{trop ? ` — dépasse ${maxMo} Mo` : ""}
                </span>
                <button
                  type="button"
                  aria-label={`Retirer ${f.name}`}
                  onClick={() => retirer(i)}
                  style={{ border: "none", background: "transparent", color: theme.textMuted, fontSize: 16, lineHeight: 1, cursor: "pointer", padding: 2 }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
