import { useId, useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import useModalA11y from "../../hooks/useModalA11y";

// Enveloppe commune des modales du module congés : overlay, rôle « dialog »,
// focus piégé, Échap pour fermer (useModalA11y). Styles inline, tokens du thème.
export function ModalShell({ titre, onClose, children, largeur = 480 }) {
  const theme = useTheme();
  const titleId = useId();
  const ref = useModalA11y({ isOpen: true, onEscape: onClose, initialFocus: "select, input, textarea" });
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 2000, backdropFilter: "blur(2px)", padding: 16,
      }}
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.surface, borderRadius: 16, padding: 26, width: largeur, maxWidth: "100%",
          maxHeight: "92vh", overflowY: "auto", boxShadow: "0 16px 48px rgba(15,23,42,0.25)",
          border: `1px solid ${theme.border}`, fontFamily: theme.fontFamily,
        }}
      >
        <h2 id={titleId} style={{ color: theme.text, fontSize: 16, fontWeight: 800, margin: "0 0 16px" }}>{titre}</h2>
        {children}
      </div>
    </div>
  );
}

export const champStyle = (theme) => ({
  width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 8,
  border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 12, fontSize: 14, fontFamily: "inherit",
});

export const etiquetteStyle = (theme) => ({ fontSize: 12, fontWeight: 700, color: theme.text });

export function BoutonsModale({ onClose, libelle, desactive, danger, envoi }) {
  const theme = useTheme();
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
      <button type="button" onClick={onClose} style={{
        background: theme.surface, border: `1.5px solid ${theme.border}`, color: theme.textSecondary,
        borderRadius: 10, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
      }}>
        Fermer
      </button>
      <button type="submit" disabled={desactive || envoi} style={{
        background: desactive ? theme.bg : danger ? theme.danger : theme.primary,
        color: desactive ? theme.textMuted : "#fff", border: "none", borderRadius: 10, padding: "9px 22px",
        fontSize: 13, fontWeight: 700, cursor: desactive || envoi ? "not-allowed" : "pointer", fontFamily: "inherit",
        opacity: envoi ? 0.7 : 1,
      }}>
        {envoi ? "Envoi..." : libelle}
      </button>
    </div>
  );
}

function MessageErreur({ texte }) {
  const theme = useTheme();
  if (!texte) return null;
  return (
    <div role="alert" style={{ color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 12 }}>
      {texte}
    </div>
  );
}

// ─── Annulation d'un titre (même signé) ─────────────────────────────────────
// Confirmation renforcée : le traiteur doit retaper la référence du titre
// (le serveur la revérifie, voir AnnulerSerializer).
export function AnnulerModal({ demande, onClose, onSubmit }) {
  const theme = useTheme();
  const [motif, setMotif] = useState("");
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const valide = motif.trim() !== "" && saisie.trim() === demande.reference;

  const soumettre = async (e) => {
    e.preventDefault();
    if (!valide) return;
    setEnvoi(true);
    setErreur("");
    const resultat = await onSubmit({ motif: motif.trim(), reference_confirmation: saisie.trim() });
    setEnvoi(false);
    if (resultat) setErreur(resultat);
  };

  return (
    <ModalShell titre="Annuler le titre de congé" onClose={onClose}>
      <form onSubmit={soumettre}>
        <p style={{ color: theme.textSecondary, fontSize: 13, marginTop: 0 }}>
          Les jours débités seront restitués aux compartiments d'origine. Le titre est conservé dans l'historique avec le statut « Annulée ».
        </p>
        <label htmlFor="annul-motif" style={etiquetteStyle(theme)}>Motif de l'annulation</label>
        <textarea id="annul-motif" rows={3} value={motif} onChange={(e) => setMotif(e.target.value)}
          style={{ ...champStyle(theme), resize: "vertical" }} />
        <label htmlFor="annul-ref" style={etiquetteStyle(theme)}>Saisissez la référence {demande.reference} pour confirmer</label>
        <input id="annul-ref" value={saisie} onChange={(e) => setSaisie(e.target.value)} autoComplete="off" style={champStyle(theme)} />
        <MessageErreur texte={erreur} />
        <BoutonsModale onClose={onClose} libelle="Confirmer l'annulation" desactive={!valide} danger envoi={envoi} />
      </form>
    </ModalShell>
  );
}

// ─── Interruption (rappel de l'employé) ─────────────────────────────────────
export function InterrompreModal({ demande, onClose, onSubmit }) {
  const theme = useTheme();
  const [dateRappel, setDateRappel] = useState("");
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const valide = dateRappel !== "" && motif.trim() !== "";

  const soumettre = async (e) => {
    e.preventDefault();
    if (!valide) return;
    setEnvoi(true);
    setErreur("");
    const resultat = await onSubmit({ date_rappel: dateRappel, motif: motif.trim() });
    setEnvoi(false);
    if (resultat) setErreur(resultat);
  };

  return (
    <ModalShell titre="Interrompre le congé" onClose={onClose}>
      <form onSubmit={soumettre}>
        <p style={{ color: theme.textSecondary, fontSize: 13, marginTop: 0 }}>
          Congé prévu du {demande.date_depart} au {demande.date_retour} ({demande.nb_jours} j). Les jours non pris
          seront restitués, reliquat d'abord. Une seule interruption est possible par titre.
        </p>
        <label htmlFor="int-date" style={etiquetteStyle(theme)}>Date de rappel</label>
        <input id="int-date" type="date" min={demande.date_depart} max={demande.date_retour} value={dateRappel}
          onChange={(e) => setDateRappel(e.target.value)} style={champStyle(theme)} />
        <label htmlFor="int-motif" style={etiquetteStyle(theme)}>Motif de l'interruption</label>
        <textarea id="int-motif" rows={3} value={motif} onChange={(e) => setMotif(e.target.value)}
          style={{ ...champStyle(theme), resize: "vertical" }} />
        <MessageErreur texte={erreur} />
        <BoutonsModale onClose={onClose} libelle="Confirmer l'interruption" desactive={!valide} envoi={envoi} />
      </form>
    </ModalShell>
  );
}

export { MessageErreur };
