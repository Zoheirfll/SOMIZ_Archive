import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import StatAreaChart from "../../components/charts/StatAreaChart";
import StatDonutChart from "../../components/charts/StatDonutChart";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";

const pct = (v) => `${v} %`;

export default function Mouvements({ data }) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <Carte titre="Entrées et sorties par mois">
        <StatAreaChart
          data={data.evolution}
          xKey="mois"
          series={[
            { key: "entrees", label: "Entrées", color: theme.primary },
            { key: "sorties", label: "Sorties", color: theme.danger },
          ]}
        />
      </Carte>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <Carte titre="Sorties par motif"><StatDonutChart data={data.par_motif} height={220} /></Carte>
        <Carte titre="Sorties par sexe"><StatDonutChart data={data.sorties_par_sexe} height={220} /></Carte>
      </div>
      <Carte titre="Rétention par promotion de recrutement">
        <TableauSimple
          colonnes={[
            { cle: "annee", libelle: "Promotion" },
            { cle: "recrutes", libelle: "Recrutés" },
            { cle: "a_1_an", libelle: "Présents à 1 an", format: pct },
            { cle: "a_3_an", libelle: "Présents à 3 ans", format: pct },
            { cle: "a_5_an", libelle: "Présents à 5 ans", format: pct },
            { cle: "inconnus", libelle: "Sortis non datés (exclus)" },
          ]}
          lignes={data.retention}
        />
      </Carte>
      <Carte titre="Mouvements par direction">
        <TableauSimple
          colonnes={[
            { cle: "nom", libelle: "Direction" }, { cle: "entrees", libelle: "Entrées" },
            { cle: "sorties", libelle: "Sorties" }, { cle: "solde", libelle: "Solde" },
          ]}
          lignes={data.par_direction}
          vide="Aucun mouvement sur la période."
        />
      </Carte>
    </>
  );
}
