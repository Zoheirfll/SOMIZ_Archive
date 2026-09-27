import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import StatutBadge from "../attestations/StatutBadge";
import { FileTextIcon } from "../icons";
import { formatDateFR } from "../../utils/formatDate";

// Onglet "Attestations" de la fiche employé — historique des demandes
// d'attestation de travail pour CET employé (GET /attestations/demandes/
// ?employee=<id>, déjà scopé côté serveur : un GESTIONNAIRE n'y voit que
// ses propres demandes, un ADMIN non chargé des attestations n'a aucun
// accès — voir CanAccessAttestations). Placé à côté de "Carrière", même
// pattern d'extraction que CarriereTab/DossierTab.
const AttestationsTab = ({ activeTab, employee, user, navigate }) => {
  const theme = useTheme();
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const canSee = user?.can_manage_attestations || user?.role === "GESTIONNAIRE";
  const canRequest = ["SUPERADMIN", "GESTIONNAIRE"].includes(user?.role);

  useEffect(() => {
    if (activeTab !== "attestations" || !canSee) return;
    let cancelled = false;
    setLoading(true);
    api.get("/attestations/demandes/", { params: { employee: employee.matricule } })
      .then((res) => {
        if (cancelled) return;
        setDemandes(res.data.results || res.data);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, canSee, employee.matricule]);

  if (activeTab !== "attestations") return null;

  if (!canSee) {
    return (
      <div
        className="tab-content"
        style={{
          background: theme.surface, border: `1px solid ${theme.border}`,
          borderRadius: 12, padding: 24, color: theme.textMuted, fontSize: 13,
        }}
      >
        Vous n'avez pas accès aux demandes d'attestation de travail.
      </div>
    );
  }

  return (
    <div
      className="tab-content"
      style={{
        background: theme.surface, border: `1px solid ${theme.border}`,
        borderRadius: 12, padding: 24,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div
          style={{
            fontSize: 11, fontWeight: 700, textTransform: "uppercase",
            color: theme.textSecondary, borderLeft: `4px solid ${theme.primary}`, paddingLeft: 8,
          }}
        >
          Demandes d'attestation de travail
        </div>
        {canRequest && (
          <button
            type="button"
            onClick={() => navigate("/attestations/nouvelle", { state: { employeeId: employee.id } })}
            className="btn-lift"
            style={{
              background: theme.primary, color: "#fff", border: "none", borderRadius: 8,
              padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            + Nouvelle demande
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: theme.textSecondary }}>Chargement...</div>
      ) : demandes.length === 0 ? (
        <div style={{ textAlign: "center", padding: 24, color: theme.textMuted, fontSize: 13 }}>
          Aucune demande d'attestation pour cet employé.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {demandes.map((d) => (
            <Link
              key={d.id}
              to={`/attestations/${d.reference.replace("/", "-")}`}
              className="card-lift"
              style={{
                display: "flex", alignItems: "center", gap: 12, textDecoration: "none",
                border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 14px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  width: 34, height: 34, borderRadius: 8, background: theme.primaryBg,
                  color: theme.primary, display: "flex", alignItems: "center",
                  justifyContent: "center", flexShrink: 0,
                }}
              >
                <FileTextIcon size={15} />
              </div>
              <div style={{ flex: "0 0 100px", fontWeight: 700, color: theme.primary, fontSize: 13 }}>
                {d.reference}
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ color: theme.text, fontSize: 13, fontWeight: 600 }}>{d.motif_nom}</div>
                <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }}>
                  Demandée le {formatDateFR(d.created_at)} par {d.demandeur_nom}
                </div>
              </div>
              <StatutBadge statut={d.statut} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default AttestationsTab;
