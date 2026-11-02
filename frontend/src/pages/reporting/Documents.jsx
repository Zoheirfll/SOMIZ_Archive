import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import StatAreaChart from "../../components/charts/StatAreaChart";
import StatDonutChart from "../../components/charts/StatDonutChart";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";

export default function Documents({ data }) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <Carte titre="Ajouts et suppressions par mois">
        <StatAreaChart
          data={data.evolution}
          xKey="mois"
          series={[
            { key: "uploads", label: "Ajouts", color: theme.primary },
            { key: "suppressions", label: "Suppressions", color: theme.danger },
          ]}
        />
      </Carte>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 20 }}>
        <Carte titre="Par type de document"><StatDonutChart data={data.par_type} height={220} /></Carte>
        <Carte titre="Par direction"><StatDonutChart data={data.par_direction} height={220} /></Carte>
        <Carte titre="Par format de fichier"><StatDonutChart data={data.par_format} height={220} /></Carte>
      </div>
    </>
  );
}
