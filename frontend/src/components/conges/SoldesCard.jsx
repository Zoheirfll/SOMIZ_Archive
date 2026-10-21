import { useTheme } from "../../context/ThemeContext";
import { libelleCategorie } from "../../utils/conges";

// Carte des soldes de congé d'un employé (API : GET /conges/soldes/<matricule>/).
// Les jours sont suivis par exercice ; disponible = reliquat + actuel, l'anticipé
// n'y est jamais compté (mais peut être débité en dernier recours).
export default function SoldesCard({ solde, initialise = true, titre = "Soldes de congé", children }) {
  const theme = useTheme();
  const carte = {
    background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 22, boxShadow: theme.shadowMd,
  };

  const Cellule = ({ label, valeur, fort, note }) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: theme.textMuted, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: fort ? 24 : 18, fontWeight: 800, color: fort ? theme.primary : theme.text }}>{valeur}</div>
      {note && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{note}</div>}
    </div>
  );

  const th = { textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: theme.textMuted, padding: "6px 8px", borderBottom: `1px solid ${theme.border}` };
  const td = { fontSize: 13, color: theme.text, padding: "6px 8px", borderBottom: `1px solid ${theme.borderLight}` };

  return (
    <div style={carte}>
      <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: theme.textSecondary, fontSize: 13, fontWeight: 500 }}>{titre}</span>
        {initialise && solde?.exercice_courant && (
          <span style={{ color: theme.textMuted, fontSize: 11 }}>Exercice en cours {solde.exercice_courant}</span>
        )}
      </div>
      {!initialise || !solde ? (
        <div style={{ color: theme.textMuted, fontSize: 13 }}>
          Soldes non initialisés pour cet employé : une validation de congé payé sera refusée tant que le solde de départ n'est pas saisi.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 18, marginBottom: 18 }}>
            <Cellule label="Disponible" valeur={solde.disponible} fort note="reliquat + actuel" />
            <Cellule label="Reliquat" valeur={solde.reliquat} />
            <Cellule label="Actuel" valeur={solde.actuel} />
            <Cellule label="Anticipé" valeur={solde.anticipe} note="non compté" />
            <Cellule label="Droit initial" valeur={solde.droit_initial} />
            <Cellule label="CP consommés" valeur={solde.cp_consomme} />
            {/* Le compteur « retrait CS » (sans solde) reste calculé côté serveur mais
                n'est pas affiché : il n'a aucun rapport avec les jours de congé payé. */}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Exercice</th><th style={th}>Groupe</th><th style={th}>Droit</th>
                  <th style={th}>Consommé</th><th style={th}>Restant</th>
                </tr>
              </thead>
              <tbody>
                {(solde.exercices || []).map((e) => (
                  <tr key={e.exercice}>
                    <td style={td}>{e.exercice}{e.ouvert === false && <span style={{ color: theme.textMuted, fontSize: 11 }}> (à ouvrir)</span>}</td>
                    <td style={td}>{libelleCategorie(e.categorie)}</td>
                    <td style={td}>{e.droit}</td>
                    <td style={td}>{e.consomme}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{e.restant}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {children}
    </div>
  );
}
