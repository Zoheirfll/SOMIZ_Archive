import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";

// Modale de saisie générique des deux registres. La validation de présence
// côté client n'est là que pour l'ergonomie : le serveur reste la référence.
export default function RegistreModal({ titre, champs, valeursInitiales, onSubmit, onClose, erreur, enCours }) {
  const theme = useTheme();
  const [valeurs, setValeurs] = useState(valeursInitiales || {});
  const [manquants, setManquants] = useState([]);

  const maj = (name, valeur) => setValeurs((v) => ({ ...v, [name]: valeur }));

  const soumettre = (e) => {
    e.preventDefault();
    const vides = champs.filter((c) => c.required && (valeurs[c.name] === undefined || valeurs[c.name] === ""));
    setManquants(vides);
    if (vides.length === 0) onSubmit(valeurs);
  };

  const styleChamp = {
    width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13,
    border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bg,
    color: theme.text, fontFamily: theme.fontFamily,
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label={titre}
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
    >
      {/* Calque d'assombrissement : couleur du thème + opacité, pour ne coder aucune teinte en dur. */}
      <div aria-hidden="true" onClick={onClose} style={{ position: "absolute", inset: 0, background: theme.text, opacity: 0.45 }} />
      <form
        onSubmit={soumettre}
        style={{ position: "relative", background: theme.surface, borderRadius: 14, padding: 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: theme.shadowXl, fontFamily: theme.fontFamily }}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: 17, color: theme.text }}>{titre}</h2>
        {champs.map((c) => (
          <div key={c.name} style={{ marginBottom: 12 }}>
            <label htmlFor={`reg-${c.name}`} style={{ display: "block", fontSize: 12, fontWeight: 700, color: theme.textSecondary, marginBottom: 4 }}>
              {c.label}{c.required ? " *" : ""}
            </label>
            {c.type === "textarea" ? (
              <textarea id={`reg-${c.name}`} rows={3} style={styleChamp} value={valeurs[c.name] ?? ""} onChange={(e) => maj(c.name, e.target.value)} />
            ) : (
              <input
                id={`reg-${c.name}`} type={c.type} style={styleChamp}
                min={c.type === "number" ? 1 : undefined}
                value={valeurs[c.name] ?? ""}
                onChange={(e) => maj(c.name, c.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
              />
            )}
          </div>
        ))}
        {manquants.length > 0 && (
          <p style={{ color: theme.danger, fontSize: 12 }}>
            {manquants.map((c) => `${c.label} : champ obligatoire`).join(" — ")}
          </p>
        )}
        {erreur && <p role="alert" style={{ color: theme.danger, fontSize: 13, fontWeight: 600 }}>{erreur}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "transparent", color: theme.textSecondary, fontWeight: 700, cursor: "pointer", fontFamily: theme.fontFamily }}>
            Annuler
          </button>
          <button type="submit" disabled={enCours} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: theme.primary, color: theme.surface, fontWeight: 700, cursor: enCours ? "wait" : "pointer", fontFamily: theme.fontFamily }}>
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
