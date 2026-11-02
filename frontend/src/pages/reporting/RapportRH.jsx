// frontend/src/pages/reporting/RapportRH.jsx
import { Navigate, useParams } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { pagesVisibles } from "../../config/reportingPages";
import { useAuth } from "../../context/AuthContext";
import useRapportRH from "../../hooks/useRapportRH";
import usePageTitle from "../../hooks/usePageTitle";
import RapportLayout from "../../components/reporting/RapportLayout";
import { presetToRange } from "../../components/reporting/periodes";
import Skeleton from "../../components/Skeleton";
import Synthese from "./Synthese";
import Effectifs from "./Effectifs";
import Parite from "./Parite";
import Demographie from "./Demographie";
import Contrats from "./Contrats";
import Qualite from "./Qualite";
import Activite from "./Activite";
import Mouvements from "./Mouvements";
import Carriere from "./Carriere";
import Unites from "./Unites";
import Documents from "./Documents";
import Conges from "./Conges";
import Demandes from "./Demandes";

const COMPOSANTS = {
  synthese: Synthese, effectifs: Effectifs, parite: Parite, demographie: Demographie, mouvements: Mouvements,
  carriere: Carriere, contrats: Contrats, unites: Unites, qualite: Qualite, documents: Documents,
  conges: Conges, demandes: Demandes, activite: Activite,
};

function RapportPage({ def }) {
  const theme = useTheme();
  usePageTitle(def.label);
  const { data, loading, error, params, refresh } = useRapportRH(def.page, presetToRange("12m"));
  const Composant = COMPOSANTS[def.page];
  return (
    <RapportLayout def={def} params={params} onParams={refresh}>
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={100} radius={16} />)}
        </div>
      ) : error ? (
        <div style={{ color: theme.danger, textAlign: "center", padding: 60 }}>{error}</div>
      ) : (
        <>
          {data?.nominatif_masque && (
            <div role="status" style={{ color: theme.textSecondary, background: theme.surface, border: `1px solid ${theme.border}`,
              borderRadius: 10, padding: "8px 14px", fontSize: 12, marginBottom: 16 }}>
              Les listes nominatives (noms d'agents) sont masquées pour votre profil : seuls les chiffres sont affichés.
            </div>
          )}
          <Composant data={data} params={params} onParams={refresh} />
        </>
      )}
    </RapportLayout>
  );
}

export default function RapportRH() {
  const { page } = useParams();
  const { user } = useAuth();
  // Page inconnue ou non autorisée pour ce compte : retour à la synthèse.
  const def = pagesVisibles(user).find((p) => p.page === page);
  if (!def) {
    // Page non autorisée : première page accessible, sinon accueil (pas de boucle).
    const premiere = pagesVisibles(user)[0];
    return <Navigate to={premiere ? premiere.path : "/"} replace />;
  }
  // key : changer de page remonte un état neuf (pas de données de l'ancienne page).
  return <RapportPage key={def.page} def={def} />;
}
