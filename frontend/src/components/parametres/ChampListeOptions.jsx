import { useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";

// Gestion des options d'un champ personnalisé de type "liste" (ChampPersonnalise
// de type_champ='liste') — ajout, réordonnancement, activation/désactivation.
// Une option n'est jamais supprimée définitivement (soft-delete via is_active),
// voir CLAUDE.md section "Champs personnalisés — panneau Informations".
const ChampListeOptions = ({ champId, options, onOptionsChange }) => {
  const theme = useTheme();
  const [nouvelleValeur, setNouvelleValeur] = useState("");
  const [saving, setSaving] = useState(false);

  const ajouterOption = async () => {
    const valeur = nouvelleValeur.trim();
    if (!valeur) return;
    setSaving(true);
    try {
      const resp = await api.post(`/ref/champs-personnalises/${champId}/options/`, {
        valeur,
        ordre: options.length,
      });
      onOptionsChange([...options, resp.data]);
      setNouvelleValeur("");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (option) => {
    const resp = await api.patch(`/ref/champs-personnalises/options/${option.id}/`, {
      is_active: !option.is_active,
    });
    onOptionsChange(options.map((o) => (o.id === option.id ? resp.data : o)));
  };

  return (
    <div style={{ marginTop: 4, marginBottom: 12 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          fontWeight: 700,
          color: theme.textSecondary,
          marginBottom: 6,
        }}
      >
        Options de la liste
      </div>
      {options.length === 0 && (
        <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
          Aucune option pour l'instant.
        </div>
      )}
      {options.map((option) => (
        <div
          key={option.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 0",
          }}
        >
          <span
            style={{
              flex: 1,
              opacity: option.is_active ? 1 : 0.5,
              color: theme.text,
              fontSize: 13,
            }}
          >
            {option.valeur}
          </span>
          <button
            type="button"
            onClick={() => toggleActive(option)}
            style={{
              border: `1px solid ${theme.border}`,
              background: theme.surface,
              color: theme.textSecondary,
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {option.is_active ? "Désactiver" : "Réactiver"}
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          value={nouvelleValeur}
          onChange={(e) => setNouvelleValeur(e.target.value)}
          placeholder="Nouvelle valeur (ex. Marié)"
          style={{
            flex: 1,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 13,
          }}
        />
        <button
          type="button"
          onClick={ajouterOption}
          disabled={saving || !nouvelleValeur.trim()}
          style={{
            border: "none",
            background: theme.accent,
            color: theme.text,
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: saving ? "default" : "pointer",
          }}
        >
          Ajouter une option
        </button>
      </div>
    </div>
  );
};

export default ChampListeOptions;
