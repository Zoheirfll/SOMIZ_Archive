import { Link } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";
import { grouperDemandes, libelleJour, prochainTri, estTriParDateDemande } from "../../utils/listeDemandes";

// Liste dense des demandes, groupée par jour de réception, avec en-têtes
// triables. Chaque colonne : { label, cle (clé de tri API, optionnelle),
// width (piste de grille), cell(d) }. La première colonne est la référence ;
// la dernière, le statut (remonté à droite de la 1re ligne en mobile).
// `selection` = { selected: Set, toggle(id), ariaLabel(d) } ajoute une case à cocher.
export default function TableDemandes({ demandes, colonnes, tri, setTri, lien, selection, aTraiter }) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const pistes = [selection && "28px", ...colonnes.map((c) => c.width)].filter(Boolean).join(" ");
  const groupes = grouperDemandes(demandes, tri);
  const groupeParJour = estTriParDateDemande(tri);

  return (
    <div style={{
      background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`,
      boxShadow: theme.shadowMd, overflow: "hidden",
    }}>
      {!isMobile && (
        <div style={{
          display: "grid", gridTemplateColumns: pistes, gap: 12, padding: "10px 20px",
          background: theme.bg, borderBottom: `1px solid ${theme.border}`,
        }}>
          {selection && <span />}
          {colonnes.map((c) => {
            const actif = c.cle && (tri === c.cle || tri === `-${c.cle}`);
            const fleche = actif ? (tri.startsWith("-") ? " ▼" : " ▲") : "";
            const style = {
              fontSize: 11, fontWeight: 700, color: actif ? theme.primary : theme.textMuted, textAlign: "left",
              background: "none", border: "none", padding: 0, fontFamily: theme.fontFamily,
              cursor: c.cle ? "pointer" : "default",
            };
            return c.cle ? (
              <button
                key={c.label} type="button" style={style} aria-label={`Trier par ${c.label}`}
                onClick={() => setTri(prochainTri(tri, c.cle))}
              >
                {c.label}{fleche}
              </button>
            ) : <span key={c.label} style={style}>{c.label}</span>;
          })}
        </div>
      )}

      {groupes.map(([cle, liste]) => {
        const nbATraiter = aTraiter ? liste.filter(aTraiter).length : 0;
        return (
          <div key={cle}>
            {groupeParJour && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 20px",
                background: theme.primaryBg, borderBottom: `1px solid ${theme.border}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.primary }}>{libelleJour(cle)}</span>
                <span style={{ fontSize: 12, color: theme.textSecondary }}>
                  {liste.length} demande{liste.length > 1 ? "s" : ""}
                </span>
                {nbATraiter > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme.warning }}>· {nbATraiter} à traiter</span>
                )}
              </div>
            )}
            {liste.map((d) => (
              <Link
                key={d.id} to={lien(d)} className="card-lift"
                style={{
                  display: "grid", gap: isMobile ? 6 : 12, alignItems: "center", textDecoration: "none",
                  gridTemplateColumns: isMobile ? "1fr auto" : pistes,
                  padding: isMobile ? "12px 16px" : "11px 20px", borderBottom: `1px solid ${theme.border}`,
                }}
              >
                {selection && !isMobile && (
                  <input
                    type="checkbox" aria-label={selection.ariaLabel(d)} checked={selection.selected.has(d.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); selection.toggle(d.id); }}
                    style={{ cursor: "pointer" }}
                  />
                )}
                {isMobile ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {selection && (
                        <input
                          type="checkbox" aria-label={selection.ariaLabel(d)} checked={selection.selected.has(d.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => { e.stopPropagation(); selection.toggle(d.id); }}
                        />
                      )}
                      {colonnes[0].cell(d)}
                    </div>
                    <div style={{ justifySelf: "end" }}>{colonnes[colonnes.length - 1].cell(d)}</div>
                    {colonnes.slice(1, -1).map((c) => (
                      <div key={c.label} style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "baseline" }}>
                        <span style={{ fontSize: 11, color: theme.textMuted, minWidth: 74 }}>{c.label}</span>
                        <span style={{ minWidth: 0 }}>{c.cell(d)}</span>
                      </div>
                    ))}
                  </>
                ) : colonnes.map((c) => <div key={c.label} style={{ minWidth: 0 }}>{c.cell(d)}</div>)}
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}
