import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import { useShortcut } from "../hooks/useKeyboardShortcuts";
import { getPageActions } from "../config/commandPaletteActions";
import { SearchIcon, XIcon } from "./icons";
import StatutBadge from "./attestations/StatutBadge";

const normalize = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const canSeeAttestations = (user) =>
  user?.role === "GESTIONNAIRE" || !!user?.can_manage_attestations;

export default function CommandPalette({ isOpen, onClose }) {
  const theme = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const inputRef = useRef(null);

  const [query, setQuery] = useState("");
  const [employeeResults, setEmployeeResults] = useState([]);
  const [attestationResults, setAttestationResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const showAttestations = canSeeAttestations(user);

  // Réinitialise la recherche à chaque ouverture/fermeture — pas de
  // persistance de la dernière recherche entre deux ouvertures.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setEmployeeResults([]);
    setAttestationResults([]);
    setSelectedIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Recherche debouncée dès 2 caractères — 2 appels indépendants :
  // l'échec de l'un ne doit pas effacer les résultats de l'autre.
  useEffect(() => {
    if (!isOpen) return undefined;
    const q = query.trim();
    if (q.length < 2) {
      setEmployeeResults([]);
      setAttestationResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get("/employees/search/", { params: { q } })
        .then((res) => { if (!cancelled) setEmployeeResults(res.data || []); })
        .catch(() => { if (!cancelled) setEmployeeResults([]); });

      if (showAttestations) {
        api.get("/attestations/demandes/", { params: { q } })
          .then((res) => {
            if (cancelled) return;
            setAttestationResults(res.data?.results || res.data || []);
          })
          .catch(() => { if (!cancelled) setAttestationResults([]); });
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, isOpen, showAttestations]);

  const pageActions = useMemo(() => getPageActions(user), [user]);
  const filteredPageActions = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return pageActions;
    return pageActions.filter((a) => normalize(a.label).includes(q));
  }, [pageActions, query]);

  // Liste aplatie (ordre d'affichage : Employés, Attestations, Pages &
  // actions) pour que la navigation ↑/↓ déplace un simple index.
  const flatResults = useMemo(() => {
    const items = [];
    employeeResults.forEach((e) =>
      items.push({ kind: "employee", key: `emp-${e.id}`, data: e })
    );
    if (showAttestations) {
      attestationResults.forEach((d) =>
        items.push({ kind: "attestation", key: `att-${d.id}`, data: d })
      );
    }
    filteredPageActions.forEach((a) =>
      items.push({ kind: "page", key: `page-${a.id}`, data: a })
    );
    return items;
  }, [employeeResults, attestationResults, filteredPageActions, showAttestations]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [flatResults.length]);

  const activate = (item) => {
    if (!item) return;
    if (item.kind === "employee") navigate(`/employees/${item.data.matricule}`);
    else if (item.kind === "attestation") navigate(`/attestations/${item.data.reference.replace("/", "-")}`);
    else navigate(item.data.path);
    onClose();
  };

  useShortcut("ArrowDown", () => {
    setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
  }, { enabled: isOpen, allowInInputs: true });
  useShortcut("ArrowUp", () => {
    setSelectedIndex((i) => Math.max(i - 1, 0));
  }, { enabled: isOpen, allowInInputs: true });
  useShortcut("Enter", () => {
    activate(flatResults[selectedIndex]);
  }, { enabled: isOpen, allowInInputs: true });
  useShortcut("Escape", onClose, { enabled: isOpen, allowInInputs: true });

  if (!isOpen) return null;

  const trimmedQuery = query.trim();
  const showHint = trimmedQuery.length > 0 && trimmedQuery.length < 2;
  const showNoResults =
    trimmedQuery.length >= 2 &&
    employeeResults.length === 0 &&
    attestationResults.length === 0 &&
    filteredPageActions.length === 0;

  const rowStyle = (isSelected) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 8,
    cursor: "pointer",
    background: isSelected ? theme.primaryBg : "transparent",
  });

  let cursor = -1;

  return (
    <div
      role="dialog"
      aria-label="Recherche rapide"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: isMobile ? 0 : "10vh",
        zIndex: 2000,
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        className="anim-scale-in"
        style={{
          background: theme.surface,
          borderRadius: isMobile ? 0 : 16,
          width: isMobile ? "100%" : 560,
          maxWidth: "94vw",
          height: isMobile ? "100%" : "auto",
          maxHeight: isMobile ? "100%" : "70vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: theme.shadowLg,
          border: `1px solid ${theme.border}`,
          fontFamily: theme.fontFamily,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${theme.borderLight}` }}>
          <SearchIcon size={17} style={{ color: theme.textMuted, flexShrink: 0 }} />
          <input
            ref={inputRef}
            role="textbox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un employé, une attestation, une page…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 15,
              color: theme.text,
              fontFamily: theme.fontFamily,
            }}
          />
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{ background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer", padding: 4, display: "flex" }}
          >
            <XIcon size={16} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: 8 }}>
          {showHint && (
            <div style={{ padding: "8px 12px", fontSize: 12, color: theme.textMuted }}>
              Tapez au moins 2 caractères…
            </div>
          )}

          {employeeResults.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: theme.textMuted }}>
                Employés
              </div>
              {employeeResults.map((e) => {
                cursor += 1;
                const idx = cursor;
                return (
                  <div
                    key={e.id}
                    style={rowStyle(idx === selectedIndex)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => activate({ kind: "employee", data: e })}
                  >
                    <span style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>
                      {e.nom} {e.prenom}
                      <span style={{ color: theme.textMuted, fontWeight: 400 }}> · {e.matricule}</span>
                    </span>
                    {e.numero_contrat_actif && (
                      <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: "monospace" }}>
                        N° {e.numero_contrat_actif}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {showAttestations && attestationResults.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: theme.textMuted }}>
                Attestations
              </div>
              {attestationResults.map((d) => {
                cursor += 1;
                const idx = cursor;
                return (
                  <div
                    key={d.id}
                    style={rowStyle(idx === selectedIndex)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => activate({ kind: "attestation", data: d })}
                  >
                    <span style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>
                      {`${d.employee_nom} · ${d.reference}`}
                    </span>
                    <StatutBadge statut={d.statut} />
                  </div>
                );
              })}
            </div>
          )}

          {filteredPageActions.length > 0 && (
            <div>
              <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: theme.textMuted }}>
                Pages & actions
              </div>
              {filteredPageActions.map((a) => {
                cursor += 1;
                const idx = cursor;
                return (
                  <div
                    key={a.id}
                    style={rowStyle(idx === selectedIndex)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => activate({ kind: "page", data: a })}
                  >
                    <span style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>{a.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {showNoResults && (
            <div style={{ padding: "16px 12px", fontSize: 13, color: theme.textMuted, textAlign: "center" }}>
              Aucun résultat.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
