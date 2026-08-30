import { useState, useRef, useEffect, useMemo } from "react";
import { theme } from "../styles/theme";

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

const normalize = (s) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase();

/**
 * Select recherchable — remplace un <select> natif quand la liste d'options
 * est trop longue pour être parcourue par lettre (ex. Poste, ~700+ entrées) :
 * champ texte qui filtre les options par sous-chaîne (accent-insensible),
 * pas seulement par la première lettre tapée.
 *
 * Émet un événement synthétique { target: { name, value } } pour rester
 * compatible avec les handleChange(e) existants basés sur <select>.
 */
const SearchableSelect = ({
  name,
  value,
  onChange,
  options, // [{ value, label }]
  placeholder = "-- Sélectionner --",
  disabled,
  className,
  style,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => o.value === value) || null;

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) => normalize(o.label).includes(q));
  }, [options, query]);

  useEffect(() => {
    setHighlight(0);
  }, [filtered.length, open]);

  const commit = (opt) => {
    onChange({ target: { name, value: opt ? opt.value : "" } });
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) commit(filtered[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", width: "100%", ...style }}
    >
      <input
        ref={inputRef}
        className={["input-focus", className].filter(Boolean).join(" ")}
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : selected ? selected.label : ""}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{
          width: "100%",
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          padding: "12px 14px",
          color: theme.text,
          fontSize: 14,
          outline: "none",
          background: theme.surface,
          boxSizing: "border-box",
          cursor: disabled ? "default" : "text",
          fontFamily: theme.fontFamily,
          opacity: disabled ? 0.5 : 1,
        }}
      />
      {open && !disabled && (
        <div
          className="anim-slide-down"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            boxShadow: theme.shadowLg,
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              commit(null);
            }}
            style={{
              padding: "10px 14px",
              fontSize: 14,
              color: theme.textMuted,
              cursor: "pointer",
              background: !value ? theme.surfaceHover : "transparent",
            }}
          >
            {placeholder}
          </div>
          {filtered.length === 0 && (
            <div
              style={{
                padding: "10px 14px",
                fontSize: 13,
                color: theme.textMuted,
              }}
            >
              Aucun résultat
            </div>
          )}
          {filtered.map((opt, i) => (
            <div
              key={opt.value}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(opt);
              }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: "10px 14px",
                fontSize: 14,
                color: theme.text,
                cursor: "pointer",
                background:
                  i === highlight
                    ? theme.primaryBg
                    : opt.value === value
                      ? theme.surfaceHover
                      : "transparent",
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
