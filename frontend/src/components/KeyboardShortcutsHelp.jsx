import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useKeyboardShortcutsHelp } from "../context/KeyboardShortcutsContext";
import { comboFromEvent } from "../hooks/useKeyboardShortcuts";
import { DEFAULT_SHORTCUTS, resolveCombo } from "../config/keyboardShortcuts";
import { XIcon, PencilIcon } from "./icons";

const isAdmin = (role) => ["ADMIN", "SUPERADMIN"].includes(role);

const ARROW_LABEL = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };

const Kbd = ({ children }) => {
  const theme = useTheme();
  return (
  <kbd
    style={{
      background: theme.bg,
      border: `1px solid ${theme.border}`,
      borderBottom: `2px solid ${theme.border}`,
      borderRadius: 6,
      padding: "2px 7px",
      fontSize: 12,
      fontWeight: 700,
      color: theme.text,
      fontFamily: "inherit",
      minWidth: 20,
      textAlign: "center",
      display: "inline-block",
    }}
  >
    {children}
  </kbd>
  );
};

const Combo = ({ combo }) => {
  const theme = useTheme();
  return (
  <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
    {combo.split("+").map((k, i) => (
      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {i > 0 && <span style={{ color: theme.textMuted, fontSize: 11 }}>+</span>}
        <Kbd>{ARROW_LABEL[k] || k}</Kbd>
      </span>
    ))}
  </span>
  );
};

function Row({ shortcut, combo, isCustom, isEditing, onEdit, onCancelEdit, onReset }) {
  const theme = useTheme();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
      }}
    >
      <span style={{ fontSize: 13, color: theme.textSecondary }}>{shortcut.label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {isEditing ? (
          <>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: theme.accent,
                background: theme.accentBg,
                border: `1px dashed ${theme.accentBorder}`,
                borderRadius: 6,
                padding: "3px 8px",
              }}
            >
              Appuyez sur une touche…
            </span>
            <button
              onClick={onCancelEdit}
              aria-label="Annuler"
              style={{ background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer", padding: 2, display: "flex" }}
            >
              <XIcon size={13} />
            </button>
          </>
        ) : (
          <>
            <Combo combo={combo} />
            {isCustom && (
              <button
                onClick={onReset}
                title="Réinitialiser ce raccourci"
                aria-label="Réinitialiser ce raccourci"
                style={{ background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer", padding: 2, fontSize: 14, lineHeight: 1 }}
              >
                ↺
              </button>
            )}
            <button
              onClick={onEdit}
              title="Modifier ce raccourci"
              aria-label="Modifier ce raccourci"
              style={{ background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer", padding: 2, display: "flex" }}
            >
              <PencilIcon size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const Section = ({ title, children }) => {
  const theme = useTheme();
  return (
  <div style={{ marginBottom: 20 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <div style={{ width: 4, height: 14, borderRadius: 2, background: theme.primary }} />
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: theme.textMuted,
        }}
      >
        {title}
      </span>
    </div>
    <div style={{ borderTop: `1px solid ${theme.borderLight}` }}>{children}</div>
  </div>
  );
};

export default function KeyboardShortcutsHelp({ onClose }) {
  const theme = useTheme();
  const { user } = useAuth();
  const { overrides, setOverride, resetOverride, resetAllOverrides } = useKeyboardShortcutsHelp();
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  const visible = DEFAULT_SHORTCUTS.filter((s) => !s.adminOnly || isAdmin(user?.role));

  useEffect(() => {
    if (!editingId) return undefined;

    const onKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setEditingId(null);
        setError(null);
        return;
      }

      const combo = comboFromEvent(e);
      if (!combo) return; // touche modificatrice seule, on attend la suite

      const conflict = DEFAULT_SHORTCUTS.find(
        (s) => s.id !== editingId && resolveCombo(s, overrides).toLowerCase() === combo.toLowerCase()
      );
      if (conflict) {
        setError(`Déjà utilisé pour « ${conflict.label} »`);
        return;
      }

      setOverride(editingId, combo);
      setEditingId(null);
      setError(null);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [editingId, overrides, setOverride]);

  const hasAnyOverride = Object.keys(overrides).length > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        className="anim-scale-in"
        style={{
          background: theme.surface,
          borderRadius: 16,
          padding: 28,
          width: 460,
          maxWidth: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 16px 48px rgba(15,23,42,0.25)",
          border: `1px solid ${theme.border}`,
          fontFamily: theme.fontFamily,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: theme.text }}>Raccourcis clavier</div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{ background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer", padding: 4, display: "flex" }}
          >
            <XIcon size={16} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 16 }}>
          Cliquez sur ✎ pour réassigner un raccourci, puis appuyez sur la nouvelle combinaison.
        </div>

        {error && (
          <div
            className="anim-slide-down"
            style={{
              background: theme.dangerBg,
              border: `1px solid ${theme.dangerBorder}`,
              color: theme.danger,
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <Section title="Navigation">
          {visible
            .filter((s) => s.category === "navigation")
            .map((s) => (
              <Row
                key={s.id}
                shortcut={s}
                combo={resolveCombo(s, overrides)}
                isCustom={Boolean(overrides[s.id])}
                isEditing={editingId === s.id}
                onEdit={() => {
                  setEditingId(s.id);
                  setError(null);
                }}
                onCancelEdit={() => setEditingId(null)}
                onReset={() => resetOverride(s.id)}
              />
            ))}
        </Section>

        <Section title="Accès rapide">
          {visible
            .filter((s) => s.category === "quick")
            .map((s) => (
              <Row
                key={s.id}
                shortcut={s}
                combo={resolveCombo(s, overrides)}
                isCustom={Boolean(overrides[s.id])}
                isEditing={editingId === s.id}
                onEdit={() => {
                  setEditingId(s.id);
                  setError(null);
                }}
                onCancelEdit={() => setEditingId(null)}
                onReset={() => resetOverride(s.id)}
              />
            ))}
        </Section>

        <Section title="Listes paginées">
          {visible
            .filter((s) => s.category === "pagination")
            .map((s) => (
              <Row
                key={s.id}
                shortcut={s}
                combo={resolveCombo(s, overrides)}
                isCustom={Boolean(overrides[s.id])}
                isEditing={editingId === s.id}
                onEdit={() => {
                  setEditingId(s.id);
                  setError(null);
                }}
                onCancelEdit={() => setEditingId(null)}
                onReset={() => resetOverride(s.id)}
              />
            ))}
        </Section>

        <button
          onClick={resetAllOverrides}
          disabled={!hasAnyOverride}
          style={{
            width: "100%",
            marginTop: 4,
            background: theme.surface,
            border: `1.5px solid ${theme.border}`,
            color: hasAnyOverride ? theme.textSecondary : theme.textMuted,
            borderRadius: 10,
            padding: "9px 0",
            fontSize: 13,
            fontWeight: 600,
            cursor: hasAnyOverride ? "pointer" : "default",
            fontFamily: "inherit",
            opacity: hasAnyOverride ? 1 : 0.5,
          }}
        >
          Réinitialiser tous les raccourcis
        </button>
      </div>
    </div>
  );
}
