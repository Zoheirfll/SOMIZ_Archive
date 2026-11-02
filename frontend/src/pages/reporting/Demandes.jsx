import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import StatDonutChart from "../../components/charts/StatDonutChart";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";

function Section({ titre, section, graphiques }) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: "8px 0 14px", color: theme.text }}>{titre}</h2>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 20 }}>
        {graphiques.map(([cle, libelle]) => (
          <Carte key={cle} titre={libelle}><StatDonutChart data={section[cle]} height={220} /></Carte>
        ))}
      </div>
    </>
  );
}

// Chaque section n'est renvoyée par le serveur qu'au compte qui la traite.
export default function Demandes({ data }) {
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      {data.attestations && (
        <Section
          titre="Attestations de travail"
          section={data.attestations}
          graphiques={[["par_statut", "Par statut"], ["par_motif", "Par motif"], ["par_direction", "Par direction"]]}
        />
      )}
      {data.consultations && (
        <>
          <Section
            titre="Consultations d'archives"
            section={data.consultations}
            graphiques={[["par_statut", "Par statut"], ["par_type", "Par type"], ["par_direction", "Par direction"]]}
          />
          <Carte titre="Prolongations et révocations">
            {data.consultations.prolongations} prolongation(s), {data.consultations.revocations} révocation(s) sur la période.
          </Carte>
        </>
      )}
    </>
  );
}
