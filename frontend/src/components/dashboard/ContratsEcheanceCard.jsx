import { useTheme } from "../../context/ThemeContext";
import { formatDateFR } from "../../utils/formatDate";
import { employeeSlug } from "../../utils/employeeSlug";
import { useAuth } from "../../context/AuthContext";
import { peutVoirStatistiques } from "../../config/reportingPages";
import LienNav from "../LienNav";

// Seuil à partir duquel une échéance est présentée comme urgente — même seuil
// que la sévérité « warning » de la notification (notifier_echeances_contrat).
const SEUIL_URGENT_JOURS = 7;

// Encart contrats du tableau de bord, en deux variantes (un seul composant) :
// - `echeance` : « Contrats arrivant à échéance » (fenêtre de `fenetreJours`) ;
// - `echus` : « Contrats échus » d'employés encore actifs — contrat à
//   renouveler ou sortie à saisir, le dossier est à mettre à jour (2026-11-01).
// `contrats` est déjà plafonné côté serveur ; `total` est le nombre exact,
// pour le lien « Voir tout » vers /statistiques/contrats.
export default function ContratsEcheanceCard({ contrats, total, fenetreJours = 30, variante = "echeance" }) {
  const theme = useTheme();
  const { user } = useAuth();

  if (!contrats?.length) return null;

  const echus = variante === "echus";
  const idTitre = echus ? "contrats-echus-titre" : "contrats-echeance-titre";
  const libelleJours = (n) => (n === 0 ? "Aujourd'hui" : n === 1 ? "Demain" : `Dans ${n} j`);
  const libelleBadge = (c) => (echus ? `Échu depuis ${c.jours_depasses} j` : libelleJours(c.jours_restants));

  return (
    <section
      aria-labelledby={idTitre}
      className="anim-fade-in"
      style={{
        background: theme.surface,
        border: `1px solid ${echus ? theme.dangerBorder : theme.border}`,
        borderRadius: 16,
        padding: 24,
        boxShadow: theme.shadowMd,
        marginBottom: 32,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <h2 id={idTitre} style={{ color: theme.text, margin: 0, fontSize: 15, fontWeight: 700 }}>
          {echus ? "Contrats échus — dossiers à mettre à jour" : "Contrats arrivant à échéance"}
          <span style={{ color: theme.textMuted, fontWeight: 500, fontSize: 12, marginLeft: 8 }}>
            {echus
              ? `${total} employé${total > 1 ? "s" : ""} actif${total > 1 ? "s" : ""} dont le contrat est terminé`
              : `${total} dans les ${fenetreJours} prochains jours`}
          </span>
        </h2>
        {total > contrats.length && peutVoirStatistiques(user) && (
          <LienNav
            to="/statistiques/contrats"
            style={{
              background: "transparent", border: "none", color: theme.primary,
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: theme.fontFamily,
              textDecoration: "underline",
            }}
          >
            Voir tout ({total})
          </LienNav>
        )}
      </div>
      {echus && (
        <div style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 8 }}>
          Renouveler le contrat, ou saisir la sortie de l'employé, depuis sa fiche.
        </div>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {contrats.map((c) => {
          const urgent = echus || c.jours_restants <= SEUIL_URGENT_JOURS;
          return (
            <li key={c.id} style={{ borderTop: `1px solid ${theme.border}` }}>
              <LienNav
                to={`/employees/${employeeSlug(c)}`}
                style={{
                  display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "10px 4px", background: "transparent", border: "none",
                  cursor: "pointer", textAlign: "left", fontFamily: theme.fontFamily, color: theme.text,
                }}
              >
                <span style={{ fontSize: 13 }}>
                  <strong>{c.employee_nom}</strong>
                  <span style={{ color: theme.textMuted, marginLeft: 8 }}>
                    {c.employee_matricule} · {c.numero_contrat} · fin le {formatDateFR(c.date_fin)}
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
                  {libelleBadge(c)}
                </span>
              </LienNav>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
