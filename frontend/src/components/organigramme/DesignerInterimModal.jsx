import { useEffect, useId, useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import useModalA11y from "../../hooks/useModalA11y";
import { useConfirm } from "../ConfirmDialog";

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Désigner un intérimaire depuis l'Organigramme (2026-11-01). Mêmes règles que
// la page /interims, toutes vérifiées côté serveur (accounts/interims.py) :
// l'unité doit être « gérable » par le compte (titulaire, supérieur direct ou
// SUPERADMIN — `unite` vient de GET /interims/ `unites`), les candidats viennent
// de /interims/candidats/, et une désignation par le titulaire part en
// validation chez son supérieur direct.
const DesignerInterimModal = ({ unite, onClose, onSaved }) => {
  const theme = useTheme();
  const titleId = useId();
  const { confirm, ConfirmDialog } = useConfirm();
  const dialogRef = useModalA11y({ isOpen: true, onEscape: onClose, initialFocus: "select" });
  const [candidats, setCandidats] = useState([]);
  const [form, setForm] = useState({ interimaire: "", date_debut: aujourdhui(), date_fin: "" });
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let annule = false;
    api.get("/interims/candidats/", { params: { unite_type: unite.type, unite_id: unite.id } })
      .then((r) => { if (!annule) setCandidats(r.data || []); })
      .catch((err) => { if (!annule) setErreur(err.response?.data?.error || "Candidats indisponibles."); });
    return () => { annule = true; };
  }, [unite.type, unite.id]);

  const envoyer = async (e) => {
    e.preventDefault();
    setErreur("");
    const choisi = candidats.find((c) => c.id === form.interimaire);
    const ok = await confirm(
      `Désigner ${choisi?.nom || "ce compte"} comme intérimaire de ${unite.titulaire_nom} (« ${unite.nom} ») `
      + `du ${form.date_debut} au ${form.date_fin} ? Il exercera ses droits de validation pendant cette période.`
      + (unite.validation_requise && unite.role === "titulaire" ? " Votre supérieur direct devra valider." : ""),
      { danger: false },
    );
    if (!ok) return;
    setEnvoi(true);
    try {
      const { data } = await api.post("/interims/", { ...form, unite_type: unite.type, unite_id: unite.id });
      onSaved(data);
    } catch (err) {
      setErreur(err.response?.data?.error || "Désignation impossible.");
    } finally {
      setEnvoi(false);
    }
  };

  const champ = {
    width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, borderRadius: 8,
    border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontFamily: "inherit",
  };
  const etiquette = { display: "block", fontSize: 12, fontWeight: 700, color: theme.textSecondary, margin: "10px 0 4px" };
  const bouton = (principal) => ({
    background: principal ? theme.primary : theme.bg,
    color: principal ? theme.surface : theme.textSecondary,
    border: `1px solid ${principal ? theme.primary : theme.border}`,
    borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 1500, padding: 16,
      }}
      onClick={onClose}
    >
      {ConfirmDialog}
      <form
        ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()} onSubmit={envoyer}
        style={{
          background: theme.surface, borderRadius: 16, padding: 28, width: "100%", maxWidth: 440,
          border: `1px solid ${theme.border}`, boxShadow: theme.shadowXl,
        }}
      >
        <h2 id={titleId} style={{ color: theme.text, margin: "0 0 4px", fontSize: 17, fontWeight: 800 }}>
          Désigner un intérimaire
        </h2>
        <div style={{ color: theme.textSecondary, fontSize: 13 }}>
          {unite.nom} — titulaire : {unite.titulaire_nom}
        </div>

        <label htmlFor="interim-compte" style={etiquette}>Intérimaire</label>
        <select id="interim-compte" required value={form.interimaire} style={champ}
          onChange={(e) => setForm({ ...form, interimaire: e.target.value })}>
          <option value="">Choisir un compte…</option>
          {candidats.map((c) => <option key={c.id} value={c.id}>{c.nom} ({c.username})</option>)}
        </select>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label htmlFor="interim-debut" style={etiquette}>Du</label>
            <input id="interim-debut" type="date" required value={form.date_debut} style={champ}
              onChange={(e) => setForm({ ...form, date_debut: e.target.value })} />
          </div>
          <div>
            <label htmlFor="interim-fin" style={etiquette}>Au</label>
            <input id="interim-fin" type="date" required min={form.date_debut} value={form.date_fin} style={champ}
              onChange={(e) => setForm({ ...form, date_fin: e.target.value })} />
          </div>
        </div>
        {unite.validation_requise && unite.role === "titulaire" && (
          <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 10 }}>
            Votre supérieur direct devra valider cette désignation.
          </div>
        )}
        {erreur && (
          <div role="alert" style={{ color: theme.danger, fontSize: 13, fontWeight: 600, marginTop: 12 }}>{erreur}</div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" style={bouton(false)} onClick={onClose}>Annuler</button>
          <button type="submit" style={bouton(true)} disabled={envoi}>{envoi ? "Envoi…" : "Désigner"}</button>
        </div>
      </form>
    </div>
  );
};

export default DesignerInterimModal;
