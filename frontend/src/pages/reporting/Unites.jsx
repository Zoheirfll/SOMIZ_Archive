import Carte from "../../components/reporting/Carte";
import { useTheme } from "../../context/ThemeContext";

// Écart relatif à l'organisation au-delà duquel une cellule est colorée.
const SEUIL_ECART = 0.1;

export default function Unites({ data }) {
  const theme = useTheme();
  const couleur = (col, valeur) => {
    const ref = data.organisation[col.code];
    if (!col.sens || valeur === null || valeur === undefined || !ref) return {};
    const ecart = (valeur - ref) / ref;
    if (Math.abs(ecart) < SEUIL_ECART) return {};
    const favorable = col.sens === "haut" ? ecart > 0 : ecart < 0;
    return favorable
      ? { background: theme.primaryBg, color: theme.primary }
      : { background: theme.dangerBg, color: theme.danger };
  };
  const cellule = { padding: "8px 6px", textAlign: "center", borderBottom: `1px solid ${theme.borderLight}` };
  const affiche = (v) => (v === null || v === undefined ? "—" : v);
  return (
    <Carte titre="Directions comparées à l'organisation">
      <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 12 }}>
        Vert : nettement meilleur que l'organisation · rouge : nettement moins bon (écart d'au moins 10 %).
        Les colonnes sans jugement restent neutres. Une direction d'un seul agent est masquée.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...cellule, textAlign: "left", color: theme.textSecondary }}>Direction</th>
              {data.colonnes.map((c) => (
                <th key={c.code} title={c.definition} style={{ ...cellule, color: theme.textSecondary, cursor: "help" }}>
                  {c.libelle}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lignes.map((l) => (
              <tr key={l.nom} title={l.masque ? "Effectif trop faible : détail masqué pour protéger l'anonymat" : undefined}>
                <td style={{ ...cellule, textAlign: "left", color: theme.text, fontWeight: 600 }}>{l.nom}</td>
                {data.colonnes.map((c) => (
                  <td key={c.code} style={{ ...cellule, color: theme.text, ...couleur(c, l[c.code]) }}>{affiche(l[c.code])}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td style={{ ...cellule, textAlign: "left", fontWeight: 800, color: theme.text }}>Organisation</td>
              {data.colonnes.map((c) => (
                <td key={c.code} style={{ ...cellule, fontWeight: 800, color: theme.text }}>
                  {affiche(data.organisation[c.code])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Carte>
  );
}
