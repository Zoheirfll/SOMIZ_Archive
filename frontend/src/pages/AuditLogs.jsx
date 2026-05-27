import { useState, useEffect } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";

const ACTION_COLORS = {
  VIEW: theme.primary,
  UPLOAD: "#1976D2",
  DELETE_DOC: theme.danger,
  DELETE_EMP: theme.danger,
  MODIFY_EMP: theme.warning,
  MODIFY_DOC: theme.warning,
  CREATE_EMP: "#7B1FA2",
  LOGIN: theme.primary,
  LOGOUT: theme.textSecondary,
  LOGIN_FAIL: theme.danger,
};

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({ user: "", action: "" });

  useEffect(() => {
    fetchLogs();
  }, [page, filters]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = { page };
      if (filters.user) params.user = filters.user;
      if (filters.action) params.action = filters.action;
      const response = await api.get("/reporting/audit-logs/", { params });
      setLogs(response.data.results);
      setTotal(response.data.total);
      setTotalPages(response.data.total_pages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
    setPage(1);
  };

  return (
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      <Navbar />
      <div style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              color: theme.text,
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            Journal d'Audit
          </h1>
          <div
            style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}
          >
            {total} entrée(s) — Traçabilité RGPD / ANPDP
          </div>
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
            boxShadow: theme.shadow,
          }}
        >
          <input
            name="user"
            value={filters.user}
            onChange={handleFilter}
            placeholder="🔍 Filtrer par utilisateur..."
            style={{
              flex: 1,
              border: `1px solid ${theme.primaryBorder}`,
              borderRadius: 8,
              padding: "9px 14px",
              color: theme.text,
              fontSize: 13,
              outline: "none",
              background: theme.bg,
            }}
          />
          <select
            name="action"
            value={filters.action}
            onChange={handleFilter}
            style={{
              border: `1px solid ${theme.primaryBorder}`,
              borderRadius: 8,
              padding: "9px 14px",
              color: theme.text,
              fontSize: 13,
              outline: "none",
              background: theme.bg,
              cursor: "pointer",
            }}
          >
            <option value="">Toutes les actions</option>
            {Object.keys(ACTION_COLORS).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
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
          ) : logs.length === 0 ? (
            <div
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                padding: 60,
              }}
            >
              Aucune entrée trouvée.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: theme.primaryBg }}>
                  {["Date & Heure", "Utilisateur", "Action", "Cible", "IP"].map(
                    (h) => (
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
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    style={{ borderBottom: `1px solid ${theme.primaryBorder}` }}
                  >
                    <td
                      style={{
                        padding: "11px 16px",
                        color: theme.textSecondary,
                        fontSize: 12,
                        fontFamily: "monospace",
                      }}
                    >
                      {new Date(log.timestamp).toLocaleString("fr-FR")}
                    </td>
                    <td
                      style={{
                        padding: "11px 16px",
                        color: theme.text,
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      {log.username_snapshot}
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <span
                        style={{
                          background: `${ACTION_COLORS[log.action] || theme.textSecondary}18`,
                          color:
                            ACTION_COLORS[log.action] || theme.textSecondary,
                          border: `1px solid ${ACTION_COLORS[log.action] || theme.textSecondary}44`,
                          borderRadius: 6,
                          padding: "3px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: "monospace",
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "11px 16px",
                        color: theme.textSecondary,
                        fontSize: 13,
                      }}
                    >
                      {log.target_label || "—"}
                    </td>
                    <td
                      style={{
                        padding: "11px 16px",
                        color: theme.textMuted,
                        fontSize: 12,
                        fontFamily: "monospace",
                      }}
                    >
                      {log.ip_address || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                padding: 16,
                borderTop: `1px solid ${theme.primaryBorder}`,
              }}
            >
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  background: theme.primaryBg,
                  border: `1px solid ${theme.primaryBorder}`,
                  color: theme.primary,
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 13,
                  cursor: page === 1 ? "not-allowed" : "pointer",
                  opacity: page === 1 ? 0.5 : 1,
                }}
              >
                ← Précédent
              </button>
              <span style={{ color: theme.textSecondary, fontSize: 13 }}>
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  background: theme.primaryBg,
                  border: `1px solid ${theme.primaryBorder}`,
                  color: theme.primary,
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 13,
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                  opacity: page === totalPages ? 0.5 : 1,
                }}
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;
