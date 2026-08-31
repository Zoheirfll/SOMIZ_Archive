import { useState, useEffect } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import "../styles/animations.css";
import Skeleton from "../components/Skeleton";
import HeroDecor from "../components/HeroDecor";
import PageBackground from "../components/PageBackground";
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES } from "../config/notices";
import useIsMobile from "../hooks/useIsMobile";
import { useAuth } from "../context/AuthContext";
import { usePaginationShortcuts } from "../hooks/useKeyboardShortcuts";
import { useKeyboardShortcutsHelp } from "../context/KeyboardShortcutsContext";

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
  VIEW_AUDIT_LOG: theme.textSecondary,
};

// Champs d'affectation organisationnelle traçés par un transfert
// d'employé (voir employees/views.py EmployeeDetailView.perform_update).
const TRANSFER_FIELD_LABELS = {
  direction: "Direction",
  departement: "Département",
  service: "Service",
  cellule: "Cellule",
  section: "Section",
};

// Résume le detail JSON d'un transfert en une ligne lisible, ex.
// "Service : Paie → Comptabilité".
const formatTransfer = (details) => {
  const transfer = details?.transfer;
  if (!transfer) return null;
  return Object.entries(transfer)
    .map(([field, { de, vers }]) => `${TRANSFER_FIELD_LABELS[field] || field} : ${de || "—"} → ${vers || "—"}`)
    .join(" · ");
};

// SVG search icon
const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const AuditLogs = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPERADMIN";
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [scope, setScope] = useState("all");
  const [filters, setFilters] = useState({ user: "", action: "" });
  const [filterableUsers, setFilterableUsers] = useState([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    fetchLogs();
  }, [page, filters]);

  useEffect(() => {
    fetchFilterableUsers();
  }, []);

  const { overrides: shortcutOverrides } = useKeyboardShortcutsHelp();
  usePaginationShortcuts({
    page,
    totalPages,
    onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
    onPrev: () => setPage((p) => Math.max(1, p - 1)),
    comboNext: shortcutOverrides["pagination-next"] || "ArrowRight",
    comboPrev: shortcutOverrides["pagination-prev"] || "ArrowLeft",
  });

  // Liste de comptes proposée dans le filtre "Utilisateur" — reflète
  // exactement le périmètre appliqué côté serveur (AuditLogListView) :
  // tous les comptes pour un SUPERADMIN, ou seulement soi-même + les
  // CONSULTANT pour un ADMIN ordinaire — pour ne jamais proposer un
  // utilisateur que le filtre ne pourrait de toute façon pas montrer.
  const fetchFilterableUsers = async () => {
    try {
      const response = await api.get("/admin-users/");
      const all = response.data.results || response.data;
      const visible = isSuperAdmin
        ? all
        : all.filter((u) => u.role === "CONSULTANT" || u.username === user?.username);
      setFilterableUsers(
        [...visible].sort((a, b) => a.username.localeCompare(b.username)),
      );
    } catch (err) {
      console.error(err);
    }
  };

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
      setScope(response.data.scope || "all");
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

  const inputStyle = {
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    padding: "9px 14px",
    color: theme.text,
    fontSize: 13,
    outline: "none",
    background: theme.bg,
    fontFamily: theme.fontFamily,
  };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />

      {/* Hero header */}
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: isMobile ? "20px 16px 24px" : "32px 32px 36px", position: "relative", overflow: "hidden" }}>
        <HeroDecor />
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
                Journal d'audit
              </h1>
              <InfoNotice text={PAGE_NOTICES.audit} />
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 }}>
              Traçabilité RGPD — toutes les actions sont enregistrées
            </div>
          </div>
          <div style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 10,
            padding: "8px 16px",
            color: "rgba(255,255,255,0.85)",
            fontSize: 13,
            fontWeight: 600,
          }}>
            {total} entrée{total !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <div className="anim-fade-in" style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>

        {scope === "own_and_consultants" && (
          <div style={{
            background: theme.primaryBg,
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 10,
            padding: "10px 16px",
            marginBottom: 16,
            color: theme.primary,
            fontSize: 13,
            fontWeight: 600,
          }}>
            Vous voyez vos propres actions et celles des comptes Consultant. Seul un Super-administrateur peut consulter le journal complet (y compris les autres Administrateurs).
          </div>
        )}

        {/* Filtres */}
        <div style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          padding: "16px 20px",
          marginBottom: 20,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: isMobile ? "wrap" : "nowrap",
          boxShadow: theme.shadowMd,
        }}>
          <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : 1, display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 12, color: theme.textMuted, pointerEvents: "none", display: "flex", zIndex: 1 }}>
              <IconSearch />
            </span>
            <select
              name="user"
              value={filters.user}
              onChange={handleFilter}
              style={{ ...inputStyle, flex: 1, paddingLeft: 36, cursor: "pointer" }}
            >
              <option value="">
                {isSuperAdmin ? "Tous les utilisateurs" : "Vous + Consultants"}
              </option>
              {filterableUsers.map((u) => (
                <option key={u.id} value={u.username}>
                  {u.username} — {u.prenom} {u.nom} ({u.role === "CONSULTANT" ? "Consultant" : u.role === "SUPERADMIN" ? "Super-admin" : "Admin"})
                </option>
              ))}
            </select>
          </div>
          <select
            name="action"
            value={filters.action}
            onChange={handleFilter}
            style={{ ...inputStyle, cursor: "pointer", minWidth: 200 }}
          >
            <option value="">Toutes les actions</option>
            {Object.keys(ACTION_COLORS).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: theme.shadowMd,
        }}>
          {loading ? (
            <div style={{ padding: 24 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ padding: "10px 0" }}>
                  <Skeleton width="70%" height={14} style={{ marginBottom: 6 }} />
                  <Skeleton width="40%" height={11} />
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div style={{ color: theme.textSecondary, textAlign: "center", padding: 60 }}>
              Aucune entrée trouvée.
            </div>
          ) : (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: theme.bg, borderBottom: `2px solid ${theme.border}` }}>
                  {["Date & Heure", "Utilisateur", "Action", "Cible", "Détails", "IP"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "13px 16px",
                        textAlign: "left",
                        color: theme.textSecondary,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr
                    key={log.id}
                    className="table-row-hover"
                    style={{
                      borderBottom: `1px solid ${theme.border}`,
                      background: idx % 2 === 0 ? theme.surface : "#FAFBFC",
                    }}
                  >
                    <td style={{ padding: "11px 16px", color: theme.textSecondary, fontSize: 12, fontFamily: "monospace" }}>
                      {new Date(log.timestamp).toLocaleString("fr-FR")}
                    </td>
                    <td style={{ padding: "11px 16px", color: theme.text, fontWeight: 600, fontSize: 13 }}>
                      {log.username_snapshot}
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <span style={{
                        background: `${ACTION_COLORS[log.action] || theme.textSecondary}18`,
                        color: ACTION_COLORS[log.action] || theme.textSecondary,
                        border: `1px solid ${ACTION_COLORS[log.action] || theme.textSecondary}44`,
                        borderRadius: 20,
                        padding: "3px 12px",
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "monospace",
                        letterSpacing: "0.03em",
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: "11px 16px", color: theme.textSecondary, fontSize: 13 }}>
                      {log.target_label || "—"}
                    </td>
                    <td style={{ padding: "11px 16px", color: theme.textSecondary, fontSize: 12 }}>
                      {formatTransfer(log.details) || "—"}
                    </td>
                    <td style={{ padding: "11px 16px", color: theme.textMuted, fontSize: 12, fontFamily: "monospace" }}>
                      {log.ip_address || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 10,
              padding: "16px",
              borderTop: `1px solid ${theme.border}`,
            }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  background: theme.surface,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.textSecondary,
                  borderRadius: 8,
                  padding: "6px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: page === 1 ? "not-allowed" : "pointer",
                  opacity: page === 1 ? 0.45 : 1,
                  fontFamily: "inherit",
                }}
              >
                Précédent
              </button>
              <span style={{ color: theme.textSecondary, fontSize: 13, fontWeight: 500, minWidth: 100, textAlign: "center" }}>
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  background: theme.surface,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.textSecondary,
                  borderRadius: 8,
                  padding: "6px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                  opacity: page === totalPages ? 0.45 : 1,
                  fontFamily: "inherit",
                }}
              >
                Suivant
              </button>
            </div>
          )}
        </div>
      </div>
    </PageBackground>
  );
};

export default AuditLogs;
