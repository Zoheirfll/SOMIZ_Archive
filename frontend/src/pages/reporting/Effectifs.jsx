import { useNavigate } from "react-router-dom";
import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import StatDonutChart from "../../components/charts/StatDonutChart";
import useIsMobile from "../../hooks/useIsMobile";

export default function Effectifs({ data }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const grille = (n) => ({ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${n}, 1fr)`, gap: 20 });
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <div style={grille(2)}>
        <Carte titre="Par direction">
          <StatDonutChart data={data.repartition_direction} urlDe={(e) => `/employees?direction=${e.slug}`} onSliceClick={(e) => navigate(`/employees?direction=${e.slug}`)} />
        </Carte>
        <Carte titre="Par département">
          <StatDonutChart data={data.repartition_departement} urlDe={(e) => `/employees?departement=${e.slug}`} onSliceClick={(e) => navigate(`/employees?departement=${e.slug}`)} />
        </Carte>
      </div>
      <div style={grille(3)}>
        <Carte titre="Par catégorie"><StatDonutChart data={data.repartition_categorie} height={220} /></Carte>
        <Carte titre="Par type de contrat"><StatDonutChart data={data.repartition_type_contrat} height={220} /></Carte>
        <Carte titre="Par fonction"><StatDonutChart data={data.repartition_fonction} height={220} /></Carte>
      </div>
      <div style={grille(2)}>
        <Carte titre={`Unités sans responsable actif (${data.unites_sans_responsable.length})`}>
          <TableauSimple
            colonnes={[{ cle: "type", libelle: "Type" }, { cle: "nom", libelle: "Unité" }]}
            lignes={data.unites_sans_responsable}
            vide="Toutes les unités ont un responsable actif."
          />
        </Carte>
        <Carte titre={`Fonctions sans titulaire (${data.postes_sans_titulaire.length})`}>
          <TableauSimple
            colonnes={[{ cle: "nom", libelle: "Fonction" }]}
            lignes={data.postes_sans_titulaire.map((nom) => ({ nom }))}
            vide="Toutes les fonctions actives ont au moins un titulaire."
          />
        </Carte>
      </div>
    </>
  );
}
