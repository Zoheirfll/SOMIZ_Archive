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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState(null);
  const [ordering, setOrdering] = useState("nom");
  const { user } = useAuth();
  const navigate = useNavigate();

  const PAGE_SIZE = 25;

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [search, statut, ordering]);

  useEffect(() => {
    const delay = setTimeout(fetchEmployees, 300);
    return () => clearTimeout(delay);
  }, [search, statut, page, ordering]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params = { page };
      if (search) params.q = search;
      if (statut) params.statut = statut;
      if (ordering) params.ordering = ordering;
      const response = await api.get("/employees/", { params });
      setEmployees(response.data.results || response.data);
      setTotalCount(response.data.count || 0);
      setTotalPages(Math.ceil((response.data.count || 0) / PAGE_SIZE));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Sélection ────────────────────────────────────────────────────────────

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === employees.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(employees.map((e) => e.id)));
    }
  };

  const handleBulkAction = async (action) => {
    if (selected.size === 0) return;

    const msg =
      action === "delete"
        ? `⚠️ SUPPRIMER DÉFINITIVEMENT ${selected.size} employé(s) ?\nCette action est IRRÉVERSIBLE — tous leurs documents seront supprimés.`
        : `Archiver ${selected.size} employé(s) ?\nLeur statut passera à "archivé".`;

    if (!window.confirm(msg)) return;

    setDeleting(true);
    try {
      const response = await api.post("/employees/bulk-delete/", {
        ids: Array.from(selected),
        action,
      });
      const nb = response.data.nb_supprimes || response.data.nb_archives;
      setMessage({
        type: "success",
        text:
          action === "delete"
            ? `${nb} employé(s) supprimé(s) définitivement.`
            : `${nb} employé(s) archivé(s).`,
      });
      setSelected(new Set());
      fetchEmployees();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.error || "Erreur lors de l'opération.",
      });
    } finally {
      setDeleting(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const allSelected =
    employees.length > 0 && selected.size === employees.length;
  const someSelected = selected.size > 0;

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
              {totalCount} employé(s) au total — page {page} / {totalPages || 1}
            </div>
          </div>
          {user?.role === "ADMIN" && (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => navigate("/import")}
                style={{
                  background: theme.primaryBg,
                  border: `1px solid ${theme.primaryBorder}`,
                  color: theme.primary,
                  borderRadius: 8,
                  padding: "10px 18px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                📥 Import CSV
              </button>
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
            </div>
          )}
        </div>

        {/* Message */}
        {message && (
          <div
            className="notif-banner"
            style={{
              background:
                message.type === "success" ? theme.primaryBg : theme.dangerBg,
              border: `1px solid ${message.type === "success" ? theme.primaryBorder : theme.dangerBorder}`,
              color: message.type === "success" ? theme.primary : theme.danger,
              borderRadius: 8,
              padding: "10px 16px",
              marginBottom: 16,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {message.text}
          </div>
        )}

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

        {/* Barre d'actions — apparaît quand sélection active */}
        {someSelected && user?.role === "ADMIN" && (
          <div
            className="anim-slide-down"
            style={{
              background: theme.primaryBg,
              border: `1px solid ${theme.primaryBorder}`,
              borderRadius: 10,
              padding: "12px 20px",
              marginBottom: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: theme.shadow,
            }}
          >
            <span
              style={{ color: theme.primary, fontWeight: 600, fontSize: 14 }}
            >
              {selected.size} employé(s) sélectionné(s)
            </span>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setSelected(new Set())}
                style={{
                  background: "transparent",
                  border: `1px solid ${theme.primaryBorder}`,
                  color: theme.textSecondary,
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Désélectionner tout
              </button>

              <button
                onClick={() => handleBulkAction("archive")}
                disabled={deleting}
                style={{
                  background: deleting ? `${theme.warning}88` : "#FFF8E1",
                  border: `1px solid #FFE082`,
                  color: theme.warning,
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                }}
              >
                📦 Archiver ({selected.size})
              </button>

              <button
                onClick={() => handleBulkAction("delete")}
                disabled={deleting}
                style={{
                  background: deleting ? `${theme.danger}88` : theme.danger,
                  border: "none",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                }}
              >
                🗑️ Supprimer ({selected.size})
              </button>
            </div>
          </div>
        )}

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
                    {/* Case tout sélectionner — ADMIN uniquement */}
                    {user?.role === "ADMIN" && (
                      <th
                        style={{
                          padding: "12px 16px",
                          width: 40,
                          borderBottom: `2px solid ${theme.primaryBorder}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          style={{ cursor: "pointer", width: 15, height: 15 }}
                        />
                      </th>
                    )}
                    {[
                      { label: "Matricule", key: "matricule" },
                      { label: "Nom & Prénom", key: "nom" },
                      { label: "Direction", key: "direction__nom" },
                      { label: "Département", key: "departement__nom" },
                      { label: "Service", key: "service__nom" },
                      { label: "Poste", key: "poste__nom" },
                      { label: "Contrat", key: "type_contrat__nom" },
                      { label: "Statut", key: "statut" },
                      { label: "Dossier", key: null },
                      { label: "", key: null },
                    ].map((h) => (
                      <th
                        key={h.label}
                        onClick={() => {
                          if (!h.key) return;
                          setOrdering((prev) =>
                            prev === h.key ? `-${h.key}` : h.key,
                          );
                        }}
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
                          cursor: h.key ? "pointer" : "default",
                          userSelect: "none",
                        }}
                      >
                        {h.label}
                        {h.key && (
                          <span
                            style={{
                              marginLeft: 4,
                              opacity:
                                ordering === h.key || ordering === `-${h.key}`
                                  ? 1
                                  : 0.3,
                            }}
                          >
                            {ordering === `-${h.key}` ? " ↓" : " ↑"}
                          </span>
                        )}
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
                        background: selected.has(emp.id)
                          ? `${theme.primary}10`
                          : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!selected.has(emp.id))
                          e.currentTarget.style.background = theme.primaryBg;
                      }}
                      onMouseLeave={(e) => {
                        if (!selected.has(emp.id))
                          e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {/* Checkbox — ADMIN uniquement */}
                      {user?.role === "ADMIN" && (
                        <td
                          style={{ padding: "12px 16px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(emp.id);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(emp.id)}
                            onChange={() => toggleSelect(emp.id)}
                            style={{ cursor: "pointer", width: 15, height: 15 }}
                          />
                        </td>
                      )}
                      <td
                        onClick={() => navigate(`/employees/${emp.id}`)}
                        style={{
                          padding: "12px 16px",
                          color: theme.primary,
                          fontFamily: "monospace",
                          fontWeight: 700,
                          fontSize: 13,
                          whiteSpace: "nowrap",
                          cursor: "pointer",
                        }}
                      >
                        {emp.matricule}
                      </td>
                      <td
                        onClick={() => navigate(`/employees/${emp.id}`)}
                        style={{
                          padding: "12px 16px",
                          color: theme.text,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          cursor: "pointer",
                        }}
                      >
                        {emp.nom} {emp.prenom}
                      </td>
                      <td
                        onClick={() => navigate(`/employees/${emp.id}`)}
                        style={{
                          padding: "12px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {emp.direction_nom || "—"}
                      </td>
                      <td
                        onClick={() => navigate(`/employees/${emp.id}`)}
                        style={{
                          padding: "12px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {emp.departement_nom || "—"}
                      </td>
                      <td
                        onClick={() => navigate(`/employees/${emp.id}`)}
                        style={{
                          padding: "12px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {emp.service_nom || "—"}
                      </td>
                      <td
                        onClick={() => navigate(`/employees/${emp.id}`)}
                        style={{
                          padding: "12px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {emp.poste_nom || "—"}
                      </td>
                      <td
                        onClick={() => navigate(`/employees/${emp.id}`)}
                        style={{
                          padding: "12px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {emp.type_contrat_nom || "—"}
                      </td>
                      <td
                        onClick={() => navigate(`/employees/${emp.id}`)}
                        style={{ padding: "12px 16px", cursor: "pointer" }}
                      >
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
                      <td
                        onClick={() => navigate(`/employees/${emp.id}`)}
                        style={{ padding: "12px 16px", cursor: "pointer" }}
                      >
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
                          className="btn-lift"
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 20px",
                borderTop: `1px solid ${theme.primaryBorder}`,
                background: theme.bg,
              }}
            >
              <div style={{ color: theme.textSecondary, fontSize: 13 }}>
                Affichage {(page - 1) * PAGE_SIZE + 1} —{" "}
                {Math.min(page * PAGE_SIZE, totalCount)} sur {totalCount}
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  style={{
                    background: theme.primaryBg,
                    border: `1px solid ${theme.primaryBorder}`,
                    color: theme.primary,
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    cursor: page === 1 ? "not-allowed" : "pointer",
                    opacity: page === 1 ? 0.5 : 1,
                  }}
                >
                  «
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    background: theme.primaryBg,
                    border: `1px solid ${theme.primaryBorder}`,
                    color: theme.primary,
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 13,
                    cursor: page === 1 ? "not-allowed" : "pointer",
                    opacity: page === 1 ? 0.5 : 1,
                  }}
                >
                  ← Précédent
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 ||
                      p === totalPages ||
                      (p >= page - 2 && p <= page + 2),
                  )
                  .map((p, idx, arr) => (
                    <span key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span
                          style={{ color: theme.textMuted, padding: "0 4px" }}
                        >
                          ...
                        </span>
                      )}
                      <button
                        onClick={() => setPage(p)}
                        style={{
                          background:
                            p === page ? theme.primary : theme.primaryBg,
                          border: `1px solid ${p === page ? theme.primary : theme.primaryBorder}`,
                          color: p === page ? "#fff" : theme.primary,
                          borderRadius: 6,
                          padding: "6px 11px",
                          fontSize: 13,
                          fontWeight: p === page ? 700 : 400,
                          cursor: "pointer",
                          minWidth: 36,
                        }}
                      >
                        {p}
                      </button>
                    </span>
                  ))}

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    background: theme.primaryBg,
                    border: `1px solid ${theme.primaryBorder}`,
                    color: theme.primary,
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 13,
                    cursor: page === totalPages ? "not-allowed" : "pointer",
                    opacity: page === totalPages ? 0.5 : 1,
                  }}
                >
                  Suivant →
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  style={{
                    background: theme.primaryBg,
                    border: `1px solid ${theme.primaryBorder}`,
                    color: theme.primary,
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    cursor: page === totalPages ? "not-allowed" : "pointer",
                    opacity: page === totalPages ? 0.5 : 1,
                  }}
                >
                  »
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: theme.textSecondary, fontSize: 13 }}>
                  Aller à
                </span>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  defaultValue={page}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = parseInt(e.target.value);
                      if (val >= 1 && val <= totalPages) setPage(val);
                    }
                  }}
                  style={{
                    width: 56,
                    border: `1px solid ${theme.primaryBorder}`,
                    borderRadius: 6,
                    padding: "6px 8px",
                    fontSize: 13,
                    color: theme.text,
                    background: theme.surface,
                    outline: "none",
                    textAlign: "center",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Employees;
