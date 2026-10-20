import { useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { formatDateFR } from "../../utils/formatDate";
import { employeeSlug } from "../../utils/employeeSlug";

// Seuil à partir duquel une échéance est présentée comme urgente — même seuil
// que la sévérité « warning » de la notification (notifier_echeances_contrat).
const SEUIL_URGENT_JOURS = 7;

// Encart « Contrats arrivant à échéance » du tableau de bord. `contrats` est
// déjà plafonné côté serveur (les plus proches d'abord) ; `total` est le nombre
// exact dans la fenêtre, pour le lien « Voir tout » vers /statistiques.
export default function ContratsEcheanceCard({ contrats, total, fenetreJours = 30 }) {
  const theme = useTheme();
  const navigate = useNavigate();

  if (!contrats?.length) return null;

  const libelleJours = (n) => (n === 0 ? "Aujourd'hui" : n === 1 ? "Demain" : `Dans ${n} j`);

  return (
    <section
      aria-labelledby="contrats-echeance-titre"
      className="anim-fade-in"
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 16,
        padding: 24,
        boxShadow: theme.shadowMd,
        marginBottom: 32,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <h2 id="contrats-echeance-titre" style={{ color: theme.text, margin: 0, fontSize: 15, fontWeight: 700 }}>
          Contrats arrivant à échéance
          <span style={{ color: theme.textMuted, fontWeight: 500, fontSize: 12, marginLeft: 8 }}>
            {total} dans les {fenetreJours} prochains jours
          </span>
        </h2>
        {total > contrats.length && (
          <button
            type="button"
            onClick={() => navigate("/statistiques")}
            style={{
              background: "transparent", border: "none", color: theme.primary,
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: theme.fontFamily,
              textDecoration: "underline",
            }}
          >
            Voir tout ({total})
          </button>
        )}
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {contrats.map((c) => {
          const urgent = c.jours_restants <= SEUIL_URGENT_JOURS;
          return (
            <li key={c.id} style={{ borderTop: `1px solid ${theme.border}` }}>
              <button
                type="button"
                onClick={() => navigate(`/employees/${employeeSlug(c)}`)}
                style={{
                  display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "10px 4px", background: "transparent", border: "none",
                  cursor: "pointer", textAlign: "left", fontFamily: theme.fontFamily, color: theme.text,
                }}
              >
                <span style={{ fontSize: 13 }}>
                  <strong>{c.employee_nom}</strong>
                  <span style={{ color: theme.textMuted, marginLeft: 8 }}>
                    {c.numero_contrat} · fin le {formatDateFR(c.date_fin)}
                  </span>
                </span>
                <span
                  style={{
                    background: urgent ? theme.dangerBg : theme.accentBg,
                    color: urgent ? theme.danger : theme.warning,
                    border: `1px solid ${urgent ? theme.dangerBorder : theme.accentBorder}`,
                    borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                  }}
                >
                  {libelleJours(c.jours_restants)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
