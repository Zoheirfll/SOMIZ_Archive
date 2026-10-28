import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";
import { IMPORTANCES } from "../attestations/ImportanceBadge";
import { MOIS } from "../../utils/listeDemandes";

// Barre de période (année + mois de réception), filtre d'importance, tri et
// — si `departDu`/`departAu` sont fournis — période du congé. Partagée par
// /attestations, /consultations et /conges.
export default function FiltresPeriode({
  idPrefix, annee, setAnnee, mois, setMois, importance, setImportance, tri, setTri, optionsTri, total,
  departDu, setDepartDu, departAu, setDepartAu, filtresActifs, onReset,
}) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const avecDepart = setDepartDu && setDepartAu;

  const etiquette = { fontSize: 12, fontWeight: 700, color: theme.textMuted, padding: "0 2px" };
  const champ = {
    border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12,
    fontFamily: theme.fontFamily, background: theme.surface, color: theme.text,
  };
  const boutonAnnee = {
    width: 32, height: 32, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.surface,
    color: theme.textSecondary, cursor: "pointer", fontSize: 16, fontWeight: 700, fontFamily: theme.fontFamily,
  };
  const separateur = <div style={{ width: 1, height: 22, background: theme.border, margin: "0 6px" }} />;

  return (
    <div style={{
      background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, boxShadow: theme.shadowMd,
      padding: "10px 12px", marginBottom: 16, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
    }}>
      <button type="button" aria-label="Année précédente" onClick={() => setAnnee(annee - 1)} style={boutonAnnee}>‹</button>
      <span style={{ fontSize: 15, fontWeight: 800, color: theme.text, minWidth: 48, textAlign: "center" }}>{annee}</span>
      <button type="button" aria-label="Année suivante" onClick={() => setAnnee(annee + 1)} style={boutonAnnee}>›</button>
      {separateur}
      {[{ v: null, l: "Année" }, ...MOIS.map((l, n) => ({ v: n + 1, l }))].map((m) => {
        const actif = mois === m.v;
        return (
          <button
            key={m.l} type="button" onClick={() => setMois(m.v)} aria-pressed={actif}
            style={{
              padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: `1px solid ${actif ? theme.primary : "transparent"}`, fontFamily: theme.fontFamily,
              background: actif ? theme.primary : "transparent", color: actif ? "#fff" : theme.textSecondary,
            }}
          >
            {m.l}
          </button>
        );
      })}
      <span style={{ marginLeft: isMobile ? 0 : "auto", fontSize: 12, color: theme.textSecondary, fontWeight: 600 }}>
        {total} demande{total > 1 ? "s" : ""}
      </span>

      <div style={{ flexBasis: "100%", height: 0 }} />

      <span style={etiquette}>Importance</span>
      {[{ value: "", label: "Toutes" }, ...IMPORTANCES].map((i) => {
        const actif = importance === i.value;
        return (
          <button
            key={i.value || "toutes"} type="button" onClick={() => setImportance(i.value)} aria-pressed={actif}
            style={{
              padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: `1px solid ${actif ? theme.primaryBorder : theme.border}`, fontFamily: theme.fontFamily,
              background: actif ? theme.primaryBg : "transparent", color: actif ? theme.primary : theme.textSecondary,
            }}
          >
            {i.label}
          </button>
        );
      })}
      {avecDepart && (
        <>
          {separateur}
          <label htmlFor={`${idPrefix}-depart-du`} style={etiquette}>Départ du</label>
          <input id={`${idPrefix}-depart-du`} type="date" value={departDu} onChange={(e) => setDepartDu(e.target.value)} style={champ} />
          <label htmlFor={`${idPrefix}-depart-au`} style={etiquette}>au</label>
          <input id={`${idPrefix}-depart-au`} type="date" value={departAu} onChange={(e) => setDepartAu(e.target.value)} style={champ} />
        </>
      )}
      {separateur}
      <label htmlFor={`${idPrefix}-tri`} style={etiquette}>Trier par</label>
      <select id={`${idPrefix}-tri`} value={tri} onChange={(e) => setTri(e.target.value)} style={champ}>
        {optionsTri.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {filtresActifs && (
        <button type="button" onClick={onReset} style={{
          marginLeft: "auto", background: "transparent", border: "none", color: theme.primary,
          fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: theme.fontFamily,
        }}>
          Réinitialiser les filtres
        </button>
      )}
    </div>
  );
}
