import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import AlertesListe from "../../components/reporting/AlertesListe";
import ObjectifsEditeur from "../../components/reporting/ObjectifsEditeur";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";
import useLienLigne from "../../hooks/useLienLigne";

const telecharger = (blob, nom) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
};

export default function Synthese({ data, params, onParams }) {
  const { user } = useAuth();
  const estAdmin = ["ADMIN", "SUPERADMIN"].includes(user?.role);
  const theme = useTheme();
  const navigate = useNavigate();
  const lienLigne = useLienLigne();
  const isMobile = useIsMobile();
  const [rapports, setRapports] = useState([]);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    api.get("/reporting/rapports-mensuels/").then((r) => setRapports(Array.isArray(r.data) ? r.data : [])).catch(() => setRapports([]));
  }, []);

  const bilanSocial = async () => {
    setErreur("");
    try {
      const r = await api.get("/reporting/rh/bilan/", { params: { ...params, fmt: "xlsx" }, responseType: "blob" });
      telecharger(r.data, `bilan_social_${params.date_debut}_${params.date_fin}.xlsx`);
    } catch {
      setErreur("Impossible de générer le bilan social.");
    }
  };

  const rapportMensuel = async (r) => {
    setErreur("");
    try {
      const res = await api.get(`/reporting/rapports-mensuels/${r.id}/fichier/`, { responseType: "blob" });
      telecharger(res.data, `rapport_mensuel_${r.mois.slice(0, 7)}.pdf`);
    } catch {
      setErreur("Impossible de télécharger ce rapport.");
    }
  };

  const bouton = { background: "transparent", border: `1px solid ${theme.primaryBorder}`, color: theme.primary, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: theme.fontFamily };
  const faits = data.faits_marquants || [];
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <Carte titre="Points d'attention">
          <AlertesListe alertes={data.alertes} />
        </Carte>
        <Carte titre="Faits marquants">
          {faits.length === 0 ? (
            <div style={{ color: theme.textMuted, fontSize: 13 }}>Rien de notable sur la période.</div>
          ) : (
            faits.map((f) => (
              <div key={f.texte} {...lienLigne(f.lien)} style={{ fontSize: 13, color: theme.text, padding: "8px 0", borderBottom: `1px solid ${theme.borderLight}`, cursor: "pointer" }}>
                {f.texte}
              </div>
            ))
          )}
        </Carte>
      </div>
      <Carte titre="Objectifs DRH">
        <ObjectifsEditeur onChange={() => onParams({})} lectureSeule={!estAdmin} />
      </Carte>
      <Carte titre="Rapports">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={bilanSocial} style={bouton}>Bilan social de la période (Excel)</button>
          {rapports.map((r) => (
            <button key={r.id} type="button" onClick={() => rapportMensuel(r)} style={bouton}>
              Rapport mensuel {r.mois.slice(0, 7)} (PDF)
            </button>
          ))}
        </div>
        {rapports.length === 0 && (
          <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>
            Aucun rapport mensuel généré pour l'instant (commande rapport_mensuel, planifiée le 1er du mois en production).
          </div>
        )}
        {erreur && <div style={{ color: theme.danger, fontSize: 12, marginTop: 8 }}>{erreur}</div>}
      </Carte>
    </>
  );
}
