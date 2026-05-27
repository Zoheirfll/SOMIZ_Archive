import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [statut, setStatut] = useState("");
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const delay = setTimeout(fetchEmployees, 300);
    return () => clearTimeout(delay);
  }, [search, statut]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.q = search;
      if (statut) params.statut = statut;
      const response = await api.get("/employees/", { params });
      setEmployees(response.data.results || response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      <Navbar />
      <div style={{ padding: "32px", maxWidth: 1300, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                color: theme.text,
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              Dossiers Employés
            </h1>
            <div
              style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}
            >
              {employees.length} employé(s) trouvé(s)
            </div>
          </div>
          {user?.role === "ADMIN" && (
            <button
              onClick={() => navigate("/employees/nouveau")}
              style={{
                background: theme.primary,
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                boxShadow: `0 2px 8px ${theme.primary}44`,
              }}
            >
              + Nouvel employé
            </button>
          )}
        </div>

        {/* Filtres */}
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 20,
            display: "flex",
            gap: 12,
            alignItems: "center",
            boxShadow: theme.shadow,
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Rechercher par nom, prénom ou matricule..."
            style={{
              flex: 1,
              border: `1px solid ${theme.primaryBorder}`,
              borderRadius: 8,
              padding: "9px 14px",
              color: theme.text,
              fontSize: 14,
              outline: "none",
              background: theme.bg,
            }}
          />
          <select
            value={statut}
            onChange={(e) => setStatut(e.target.value)}
            style={{
              border: `1px solid ${theme.primaryBorder}`,
              borderRadius: 8,
              padding: "9px 14px",
              color: theme.text,
              fontSize: 14,
              outline: "none",
              background: theme.bg,
              cursor: "pointer",
            }}
          >
            <option value="">Tous les statuts</option>
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
            <option value="archive">Archivé</option>
          </select>
        </div>

        {/* Table */}
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: theme.shadow,
          }}
        >
          {loading ? (
            <div
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                padding: 60,
              }}
            >
              Chargement...
            </div>
          ) : employees.length === 0 ? (
            <div
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                padding: 60,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
              <div>Aucun employé trouvé.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: theme.primaryBg }}>
                    {[
                      "Matricule",
                      "Nom & Prénom",
                      "Direction",
                      "Département",
                      "Service",
                      "Poste",
                      "Contrat",
                      "Statut",
                      "Dossier",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "12px 16px",
                          textAlign: "left",
                          color: theme.primary,
                          fontSize: 12,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          borderBottom: `2px solid ${theme.primaryBorder}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr
                      key={emp.id}
                      style={{
                        borderBottom: `1px solid ${theme.primaryBorder}`,
                        transition: "background 0.15s",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = theme.primaryBg)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                      onClick={() => navigate(`/employees/${emp.id}`)}
                    >
                      <td
                        style={{
                          padding: "12px 16px",
                          color: theme.primary,
                          fontFamily: "monospace",
                          fontWeight: 700,
                          fontSize: 13,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {emp.matricule}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: theme.text,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {emp.nom} {emp.prenom}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                        }}
                      >
                        {emp.direction_nom || "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                        }}
                      >
                        {emp.departement_nom || "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                        }}
                      >
                        {emp.service_nom || "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                        }}
                      >
                        {emp.poste_nom || "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                        }}
                      >
                        {emp.type_contrat_nom || "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            background:
                              emp.statut === "actif"
                                ? theme.primaryBg
                                : theme.dangerBg,
                            color:
                              emp.statut === "actif"
                                ? theme.primary
                                : theme.danger,
                            border: `1px solid ${emp.statut === "actif" ? theme.primaryBorder : theme.dangerBorder}`,
                            borderRadius: 6,
                            padding: "3px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {emp.statut}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            background: emp.dossier_complet
                              ? theme.primaryBg
                              : "#FFF8E1",
                            color: emp.dossier_complet
                              ? theme.primary
                              : theme.warning,
                            border: `1px solid ${emp.dossier_complet ? theme.primaryBorder : "#FFE082"}`,
                            borderRadius: 6,
                            padding: "3px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {emp.dossier_complet
                            ? "✓ Complet"
                            : `⚠ ${emp.taux_completude}%`}
                        </span>
                      </td>
                      <td
                        style={{ padding: "12px 16px" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => navigate(`/employees/${emp.id}`)}
                          style={{
                            background: theme.primaryBg,
                            border: `1px solid ${theme.primaryBorder}`,
                            color: theme.primary,
                            borderRadius: 6,
                            padding: "5px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Voir →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Employees;
