import { useState, useEffect, useMemo } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { TrashIcon, DownloadIcon, UploadIcon } from "../components/icons";
import PageBackground from "../components/PageBackground";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";
import { usePaginationShortcuts } from "../hooks/useKeyboardShortcuts";
import { useKeyboardShortcutsHelp } from "../context/KeyboardShortcutsContext";
import useIsMobile from "../hooks/useIsMobile";
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES, FIELD_NOTICES } from "../config/notices";
import {
  TABS,
  TAB_GROUPS,
  IMPORT_UNSUPPORTED_TABS,
} from "../config/parametresTabs";
import RefModal from "../components/parametres/RefModal";
import RefTable from "../components/parametres/RefTable";
import { getRefColumns } from "../components/parametres/refColumns";
import RefForm from "../components/parametres/RefForm";
import ImportRefModal from "../components/parametres/ImportRefModal";
import { getInputStyle } from "../components/parametres/formStyles";
import "../styles/animations.css";

const PAGE_SIZE = 25;

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────

const Parametres = () => {
  const theme = useTheme();
  const inputStyle = getInputStyle(theme);
  const { user } = useAuth();
  const isAdmin = ["ADMIN", "SUPERADMIN"].includes(user?.role);
  const isMobile = useIsMobile();
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();
  const [systemLabels, setSystemLabels] = useState({});
  const [reorderingField, setReorderingField] = useState(null);
  const [activeTab, setActiveTab] = useState("directions");
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null); // { mode: 'add'|'edit', item: {} }
  const [form, setForm] = useState({});
  // Choix "Une Direction"/"Un Département" pour Cellules/Sections — état
  // séparé du formulaire car form.departement="" (après avoir vidé le
  // champ pour basculer sur Direction) est aussi falsy que "jamais
  // renseigné", donc dériver le choix depuis form.departement empêchait
  // de revenir sur "Un Département" une fois vidé.
  const [rattachementChoice, setRattachementChoice] = useState("direction");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [importModal, setImportModal] = useState(null); // { tab: 'directions' }
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState({
    count: 0,
    next: null,
    previous: null,
  });
  const [sortConfig, setSortConfig] = useState({ key: null, dir: "asc" });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Données des référentiels pour les selects
  const [directions, setDirections] = useState([]);
  const [poles, setPoles] = useState([]);
  const [departements, setDepartements] = useState([]);
  const [champsPersonnalisesOptions, setChampsPersonnalisesOptions] = useState(
    [],
  );

  useEffect(() => {
    api
      .get("/ref/champs-personnalises/")
      .then((res) => {
        const list = res.data.results || res.data;
        setChampsPersonnalisesOptions(
          list.filter((c) => c.is_active && !c.is_systeme),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Charger directions et départements pour les selects
    fetchDirections();
    fetchPoles();
    fetchDepartements();
    if (activeTab === "champs-personnalises") fetchSystemLabels();
    setSearchInput("");
    setSearch("");
    setPage(1);
    setSortConfig({ key: null, dir: "asc" });
    setSelectedIds(new Set());
  }, [activeTab]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(pageMeta.count / PAGE_SIZE));
  const { overrides: shortcutOverrides } = useKeyboardShortcutsHelp();
  usePaginationShortcuts({
    page,
    totalPages,
    onNext: () => setPage((p) => p + 1),
    onPrev: () => setPage((p) => p - 1),
    comboNext: shortcutOverrides["pagination-next"] || "ArrowRight",
    comboPrev: shortcutOverrides["pagination-prev"] || "ArrowLeft",
  });

  useEffect(() => {
    fetchTab(activeTab, page, search);
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page, search]);

  const fetchSystemLabels = async () => {
    try {
      const r = await api.get("/ref/system-field-labels/");
      const list = r.data.results || r.data;
      setSystemLabels(
        Object.fromEntries(
          list.map((l) => [l.code, { label: l.label, ordre: l.ordre }]),
        ),
      );
    } catch {}
  };

  const handleRenameSystemField = async (item) => {
    const newLabel = await prompt(
      "Nouveau libellé affiché :",
      systemLabels[item.code]?.label || item.nom,
    );
    if (newLabel === null) return;
    try {
      await api.put(`/ref/system-field-labels/${item.code}/`, {
        label: newLabel.trim(),
      });
      showMessage("success", "Libellé mis à jour.");
      fetchSystemLabels();
    } catch (err) {
      showMessage("error", "Impossible de mettre à jour le libellé.");
    }
  };

  // Déplace un champ (système ou personnalisé) d'un cran dans l'onglet
  // "Champs personnalisés" — réassigne un ordre séquentiel sur la liste
  // fusionnée entière côté serveur (voir ChampsOrdreReorderView).
  // `reorderingField` bloque les clics concurrents pendant la requête : sans
  // ça, des clics rapides successifs sur ▲/▼ recalculent chacun leur ordre
  // à partir du même `items` non encore rafraîchi (fetchSystemLabels/
  // fetchTab ci-dessous ne sont pas attendus avant de réactiver le bouton),
  // et la réponse la plus lente à revenir écrase les précédentes — l'ordre
  // final observé peut alors n'avoir plus rien à voir avec les clics
  // effectués (incident réel : un ordre personnalisé entièrement perdu
  // après plusieurs clics rapides, retombé near-défaut).
  const handleMoveField = async (item, direction) => {
    if (reorderingField) return;
    const itemKey = item.system ? `system:${item.code}` : `custom:${item.id}`;
    setReorderingField(itemKey);
    try {
      const list = items;
      const idx = list.findIndex((i) =>
        item.system
          ? i.system && i.code === item.code
          : !i.system && i.id === item.id,
      );
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;
      const newList = [...list];
      [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
      const order = newList.map((i) =>
        i.system
          ? { type: "system", code: i.code }
          : { type: "custom", id: i.id },
      );
      await api.put("/ref/champs-personnalises/reorder/", { order });
      await Promise.all([
        fetchSystemLabels(),
        fetchTab("champs-personnalises", page, search, true),
      ]);
    } catch {
      showMessage("error", "Impossible de réordonner ce champ.");
    } finally {
      setReorderingField(null);
    }
  };

  const fetchDirections = async () => {
    try {
      const r = await api.get("/ref/directions/");
      setDirections(r.data.results || r.data);
    } catch {}
  };

  const fetchPoles = async () => {
    try {
      const r = await api.get("/ref/poles/");
      setPoles(r.data.results || r.data);
    } catch {}
  };

  const fetchDepartements = async () => {
    try {
      const r = await api.get("/ref/departements/");
      setDepartements(r.data.results || r.data);
    } catch {}
  };

  const fetchTab = async (tab, pageNum = 1, q = "", silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = { page: pageNum };
      if (q) params.q = q;
      const response = await api.get(`/ref/${tab}/`, { params });
      const isPaginated = Array.isArray(response.data?.results);
      const results = isPaginated ? response.data.results : response.data;
      setData((prev) => ({ ...prev, [tab]: results }));
      setPageMeta(
        isPaginated
          ? {
              count: response.data.count,
              next: response.data.next,
              previous: response.data.previous,
            }
          : { count: (results || []).length, next: null, previous: null },
      );
    } catch (err) {
      showMessage("error", "Impossible de charger les données.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const openAdd = () => {
    setForm({});
    setRattachementChoice("direction");
    setModal({ mode: "add" });
  };

  const openEdit = (item) => {
    setForm({ ...item });
    setRattachementChoice(item.departement ? "departement" : "direction");
    setModal({ mode: "edit", item });
  };

  const handleDelete = async (item) => {
    if (!(await confirm(`Supprimer "${item.nom}" ?`))) return;
    try {
      await api.delete(`/ref/${activeTab}/${item.id}/`);
      showMessage("success", "Supprimé avec succès.");
      fetchTab(activeTab, page, search, true);
    } catch (err) {
      const serverError = err.response?.data?.error;
      showMessage(
        "error",
        serverError ||
          "Impossible de supprimer — des employés y sont peut-être rattachés.",
      );
    }
  };
  const handleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (selectableItems) => {
    setSelectedIds((prev) => {
      const allSelected =
        selectableItems.length > 0 &&
        selectableItems.every((i) => prev.has(i.id));
      if (allSelected) return new Set();
      return new Set(selectableItems.map((i) => i.id));
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!(await confirm(`Supprimer les ${ids.length} éléments sélectionnés ?`)))
      return;
    setBulkDeleting(true);
    try {
      const response = await api.post(`/ref/bulk-delete/${activeTab}/`, {
        ids,
      });
      const { nb_supprimes, nb_erreurs, erreurs } = response.data;
      if (nb_erreurs > 0) {
        const detail = erreurs
          .slice(0, 3)
          .map((e) => `"${e.nom}" : ${e.erreur}`)
          .join(" — ");
        showMessage(
          "error",
          `${nb_supprimes} supprimé(s), ${nb_erreurs} échec(s) — ${detail}`,
        );
      } else {
        showMessage("success", `${nb_supprimes} élément(s) supprimé(s).`);
      }
      setSelectedIds(new Set());
      fetchTab(activeTab, page, search, true);
    } catch (err) {
      showMessage(
        "error",
        err.response?.data?.error || "Échec de la suppression en masse.",
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleImportFile = async () => {
    if (!importFile || !importModal) return;
    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const response = await api.post(
        `/ref/import/${importModal.tab}/`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setImportResult(response.data);
      fetchTab(activeTab, page, search, true);
      fetchDirections();
      fetchPoles();
      fetchDepartements();
    } catch (err) {
      setImportResult({
        error: err.response?.data?.error || "Erreur lors de l'import.",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadRefTemplate = async (tab) => {
    try {
      const response = await api.get(`/ref/import/${tab}/template/`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `template_${tab}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };
  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (modal.mode === "add") {
        await api.post(`/ref/${activeTab}/`, form);
        showMessage("success", "Ajouté avec succès.");
      } else {
        await api.patch(`/ref/${activeTab}/${modal.item.id}/`, form);
        showMessage("success", "Modifié avec succès.");
      }
      setModal(null);
      fetchTab(activeTab, page, search, true);
      fetchDirections();
      fetchPoles();
      fetchDepartements();
    } catch (err) {
      const data = err.response?.data;
      showMessage(
        "error",
        data ? Object.values(data)[0] : "Une erreur est survenue.",
      );
    } finally {
      setSaving(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Pour les types de documents : au lieu de trier à plat par `ordre` (ce
  // qui sépare visuellement une catégorie de ses sous-types), on regroupe
  // chaque catégorie avec ses enfants juste en dessous — la hiérarchie
  // configurée dans "Catégorie parente" devient enfin visible dans le
  // tableau, comme dans la sidebar Documents.
  const sortTypesDocumentsHierarchy = (list) => {
    const byId = new Map(list.map((t) => [t.id, t]));
    const children = new Map();
    list.forEach((t) => {
      if (t.parent && byId.has(t.parent)) {
        if (!children.has(t.parent)) children.set(t.parent, []);
        children.get(t.parent).push(t);
      }
    });
    children.forEach((arr) =>
      arr.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    );
    const roots = list
      .filter((t) => !t.parent || !byId.has(t.parent))
      .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    const ordered = [];
    roots.forEach((r) => {
      ordered.push(r);
      (children.get(r.id) || []).forEach((c) => ordered.push(c));
    });
    return ordered;
  };

  // Le tri par colonne (clic sur l'en-tête) ne s'applique pas aux onglets à
  // ordre imposé : hiérarchie catégorie/sous-type pour "types-documents",
  // ordre géré par les flèches ↑/↓ pour "champs-personnalises" (système et
  // personnalisés peuvent désormais être mélangés librement, voir
  // handleMoveField).
  const sortableTab =
    activeTab !== "types-documents" && activeTab !== "champs-personnalises";

  const items =
    activeTab === "types-documents"
      ? sortTypesDocumentsHierarchy(data[activeTab] || [])
      : activeTab === "champs-personnalises"
        ? (data[activeTab] || [])
            .map((f) =>
              f.is_systeme
                ? {
                    ...f,
                    system: true,
                    nom: systemLabels[f.code]?.label || f.nom,
                    ordre: systemLabels[f.code]?.ordre ?? f.ordre,
                  }
                : { ...f, system: false },
            )
            .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
        : data[activeTab] || [];

  const sortedItems = useMemo(() => {
    if (!sortableTab || !sortConfig.key) return items;
    const dir = sortConfig.dir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      const av = a[sortConfig.key];
      const bv = b[sortConfig.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number")
        return (av - bv) * dir;
      if (typeof av === "boolean" && typeof bv === "boolean")
        return (av === bv ? 0 : av ? -1 : 1) * dir;
      return (
        String(av).localeCompare(String(bv), "fr", { sensitivity: "base" }) *
        dir
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sortConfig, sortableTab]);

  // ─── Colonnes par onglet ───────────────────────────────────────────────────
  // Définitions extraites dans components/parametres/refColumns.jsx (voir
  // getRefColumns) pour garder cette page sous les 1000 lignes.

  const columns = getRefColumns({
    activeTab,
    champsPersonnalisesOptions,
    items,
    isAdmin,
    theme,
    reorderingField,
    handleMoveField,
    fetchTab,
    page,
    search,
  });

  // ─── Formulaire par onglet ─────────────────────────────────────────────────


  const tabFieldNotice =
    activeTab === "cellules" || activeTab === "sections"
      ? FIELD_NOTICES.parametres.cellulesEtSections
      : activeTab === "types-documents"
        ? FIELD_NOTICES.parametres.typesDocumentsCategories
        : null;

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div
        className="anim-fade-in"
        style={{
          padding: isMobile ? "16px" : "32px",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1
              style={{
                color: theme.text,
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              Paramètres
            </h1>
            <InfoNotice text={PAGE_NOTICES.parametres} variant="field" />
          </div>
          <div
            style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}
          >
            Gestion des référentiels organisationnels
          </div>
        </div>

        {message && (
          <div
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

        {/* Navigation + contenu */}
        <div
          style={{
            background: theme.surface,
            borderRadius: 12,
            border: `1px solid ${theme.primaryBorder}`,
            boxShadow: theme.shadow,
            overflow: "hidden",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: "stretch",
          }}
        >
          {isMobile ? (
            /* Mobile : select natif regroupé par optgroup — évite le scroll
               horizontal d'onglets illisible sur petit écran */
            <div
              style={{
                borderBottom: `2px solid ${theme.primaryBorder}`,
                background: theme.bg,
                padding: 12,
              }}
            >
              <select
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value)}
                className="input-focus"
                style={{ ...inputStyle, marginBottom: 0, fontWeight: 700 }}
              >
                {TAB_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.keys.map((key) => {
                      const tab = TABS.find((t) => t.key === key);
                      return tab ? (
                        <option key={tab.key} value={tab.key}>
                          {tab.label}
                        </option>
                      ) : null;
                    })}
                  </optgroup>
                ))}
              </select>
            </div>
          ) : (
            /* Desktop : sidebar verticale groupée par catégorie */
            <nav
              style={{
                width: 220,
                flexShrink: 0,
                borderRight: `2px solid ${theme.primaryBorder}`,
                background: theme.bg,
                padding: "16px 0",
                overflowY: "auto",
              }}
            >
              {TAB_GROUPS.map((group) => (
                <div key={group.label} style={{ marginBottom: 18 }}>
                  <div
                    style={{
                      color: theme.textMuted,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      padding: "0 16px 6px",
                    }}
                  >
                    {group.label}
                  </div>
                  {group.keys.map((key) => {
                    const tab = TABS.find((t) => t.key === key);
                    if (!tab) return null;
                    const active = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          background: active ? theme.primaryBg : "transparent",
                          border: "none",
                          borderLeft: active
                            ? `3px solid ${theme.primary}`
                            : "3px solid transparent",
                          color: active ? theme.primary : theme.textSecondary,
                          padding: "9px 16px 9px 13px",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: active ? 700 : 500,
                          whiteSpace: "nowrap",
                          transition: "all 0.15s",
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          )}

          {/* Contenu onglet */}
          <div style={{ padding: 24, flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flex: 1,
                  minWidth: 200,
                }}
              >
                <div
                  style={{
                    color: theme.textSecondary,
                    fontSize: 13,
                    whiteSpace: "nowrap",
                  }}
                >
                  {pageMeta.count} élément(s)
                </div>
                <InfoNotice text={tabFieldNotice} variant="field" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="input-focus"
                  style={{
                    border: `1px solid ${theme.primaryBorder}`,
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 13,
                    color: theme.text,
                    background: theme.bg,
                    outline: "none",
                    minWidth: 200,
                    maxWidth: 320,
                  }}
                />
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: 8 }}>
                  {selectedIds.size > 0 && (
                    <button
                      onClick={handleBulkDelete}
                      disabled={bulkDeleting}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: theme.dangerBg,
                        border: `1px solid ${theme.dangerBorder}`,
                        color: theme.danger,
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: bulkDeleting ? "not-allowed" : "pointer",
                        opacity: bulkDeleting ? 0.6 : 1,
                      }}
                    >
                      <TrashIcon size={13} /> Supprimer la sélection (
                      {selectedIds.size})
                    </button>
                  )}
                  {!IMPORT_UNSUPPORTED_TABS.has(activeTab) && (
                    <>
                      <button
                        onClick={() => handleDownloadRefTemplate(activeTab)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          background: theme.primaryBg,
                          border: `1px solid ${theme.primaryBorder}`,
                          color: theme.primary,
                          borderRadius: 8,
                          padding: "8px 14px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <DownloadIcon size={13} /> Template
                      </button>
                      <button
                        onClick={() => {
                          setImportModal({ tab: activeTab });
                          setImportFile(null);
                          setImportResult(null);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          background: theme.primaryBg,
                          border: `1px solid ${theme.primaryBorder}`,
                          color: theme.primary,
                          borderRadius: 8,
                          padding: "8px 14px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <UploadIcon size={13} /> Import (CSV/XLSX)
                      </button>
                    </>
                  )}
                  <button
                    onClick={openAdd}
                    style={{
                      background: theme.accent,
                      border: "none",
                      color: theme.text,
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: `0 2px 8px ${theme.accent}44`,
                    }}
                  >
                    + Ajouter
                  </button>
                </div>
              )}
            </div>

            <RefTable
              items={sortedItems}
              columns={columns}
              onEdit={openEdit}
              onDelete={handleDelete}
              onRenameSystem={
                activeTab === "champs-personnalises"
                  ? handleRenameSystemField
                  : undefined
              }
              loading={loading}
              isAdmin={isAdmin}
              sortConfig={sortableTab ? sortConfig : null}
              onSort={sortableTab ? handleSort : null}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
            />

            {(pageMeta.next || pageMeta.previous) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                  marginTop: 16,
                }}
              >
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!pageMeta.previous}
                  style={{
                    border: `1px solid ${theme.primaryBorder}`,
                    background: theme.surface,
                    color: pageMeta.previous ? theme.text : theme.textMuted,
                    borderRadius: 8,
                    padding: "7px 16px",
                    fontSize: 13,
                    cursor: pageMeta.previous ? "pointer" : "not-allowed",
                  }}
                >
                  ← Précédent
                </button>
                <span style={{ color: theme.textSecondary, fontSize: 13 }}>
                  Page {page} sur {Math.max(1, Math.ceil(pageMeta.count / 25))}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!pageMeta.next}
                  style={{
                    border: `1px solid ${theme.primaryBorder}`,
                    background: theme.surface,
                    color: pageMeta.next ? theme.text : theme.textMuted,
                    borderRadius: 8,
                    padding: "7px 16px",
                    fontSize: 13,
                    cursor: pageMeta.next ? "pointer" : "not-allowed",
                  }}
                >
                  Suivant →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <RefModal
          title={modal.mode === "add" ? "Ajouter" : "Modifier"}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
          saving={saving}
        >
          <RefForm
            activeTab={activeTab}
            form={form}
            setForm={setForm}
            handleChange={handleChange}
            directions={directions}
            poles={poles}
            departements={departements}
            rattachementChoice={rattachementChoice}
            setRattachementChoice={setRattachementChoice}
            champsPersonnalisesOptions={champsPersonnalisesOptions}
            items={items}
            modal={modal}
          />
        </RefModal>
      )}
      {/* Modal Import CSV */}
      {importModal && (
        <ImportRefModal
          importModal={importModal}
          setImportModal={setImportModal}
          importFile={importFile}
          setImportFile={setImportFile}
          importResult={importResult}
          importing={importing}
          handleImportFile={handleImportFile}
        />
      )}
      {ConfirmDialog}
      {PromptDialog}
    </PageBackground>
  );
};

export default Parametres;
