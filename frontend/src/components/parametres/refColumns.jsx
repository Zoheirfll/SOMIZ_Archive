import api from "../../services/api";
import { SYSTEM_FIELDS } from "../../config/parametresTabs";
import Badge from "./Badge";

const StatusBadge = ({ active, theme }) => (
  <span
    style={{
      background: active ? theme.primaryBg : theme.dangerBg,
      color: active ? theme.primary : theme.danger,
      border: `1px solid ${active ? theme.primaryBorder : theme.dangerBorder}`,
      borderRadius: 6,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 600,
    }}
  >
    {active ? "Actif" : "Inactif"}
  </span>
);

// Colonnes de RefTable pour chaque onglet de Parametres.jsx — extrait pour
// garder la page principale sous les 1000 lignes. Fonction pure sur ses
// paramètres (aucun état local), appelée à chaque rendu avec les valeurs
// courantes du composant page.
export function getRefColumns({
  activeTab,
  champsPersonnalisesOptions,
  items,
  isAdmin,
  reorderingField,
  handleMoveField,
  fetchTab,
  page,
  search,
  theme,
}) {
  switch (activeTab) {
    case "directions":
      return [
        { key: "nom", label: "Nom", bold: true },
        { key: "code", label: "Code", mono: true, primary: true },
        {
          key: "nb_departements",
          label: "Départements",
          render: (i) => <Badge count={i.nb_departements} color={theme.primary} />,
        },
        {
          key: "responsable_nom",
          label: "Directeur",
          render: (i) => i.responsable_nom || "—",
        },
        {
          key: "is_active",
          label: "Statut",
          render: (i) => <StatusBadge active={i.is_active} theme={theme} />,
        },
      ];
    case "poles":
      return [
        { key: "nom", label: "Nom", bold: true },
        { key: "code", label: "Code", mono: true, primary: true },
        { key: "direction_nom", label: "Direction" },
        {
          key: "nb_departements",
          label: "Départements",
          render: (i) => <Badge count={i.nb_departements} color={theme.primary} />,
        },
        {
          key: "responsable_nom",
          label: "Directeur",
          render: (i) => i.responsable_nom || "—",
        },
        {
          key: "is_active",
          label: "Statut",
          render: (i) => <StatusBadge active={i.is_active} theme={theme} />,
        },
      ];
    case "departements":
      return [
        { key: "nom", label: "Nom", bold: true },
        { key: "code", label: "Code", mono: true, primary: true },
        { key: "direction_nom", label: "Direction" },
        { key: "pole_nom", label: "Pôle", render: (i) => i.pole_nom || "—" },
        {
          key: "nb_services",
          label: "Services",
          render: (i) => <Badge count={i.nb_services} color={theme.primary} />,
        },
        {
          key: "responsable_nom",
          label: "Chef de département",
          render: (i) => i.responsable_nom || "—",
        },
        {
          key: "is_active",
          label: "Statut",
          render: (i) => <StatusBadge active={i.is_active} theme={theme} />,
        },
      ];
    case "services":
      return [
        { key: "nom", label: "Nom", bold: true },
        { key: "code", label: "Code", mono: true, primary: true },
        { key: "departement_nom", label: "Département" },
        { key: "direction_nom", label: "Direction" },
        {
          key: "responsable_nom",
          label: "Chef de service",
          render: (i) => i.responsable_nom || "—",
        },
        {
          key: "is_active",
          label: "Statut",
          render: (i) => <StatusBadge active={i.is_active} theme={theme} />,
        },
      ];
    case "cellules":
      return [
        { key: "nom", label: "Nom", bold: true },
        { key: "code", label: "Code", mono: true, primary: true },
        {
          key: "rattachement",
          label: "Rattachée à",
          sortable: false,
          render: (i) =>
            i.direction_nom
              ? `Direction : ${i.direction_nom}`
              : `Département : ${i.departement_nom}`,
        },
        {
          key: "nb_employes",
          label: "Employés",
          render: (i) => <Badge count={i.nb_employes} color={theme.primary} />,
        },
        {
          key: "responsable_nom",
          label: "Chef de cellule",
          render: (i) => i.responsable_nom || "—",
        },
        {
          key: "is_active",
          label: "Statut",
          render: (i) => <StatusBadge active={i.is_active} theme={theme} />,
        },
      ];
    case "sections":
      return [
        { key: "nom", label: "Nom", bold: true },
        { key: "code", label: "Code", mono: true, primary: true },
        {
          key: "rattachement",
          label: "Rattachée à",
          sortable: false,
          render: (i) =>
            i.direction_nom
              ? `Direction : ${i.direction_nom}`
              : `Département : ${i.departement_nom}`,
        },
        {
          key: "nb_employes",
          label: "Employés",
          render: (i) => <Badge count={i.nb_employes} color={theme.primary} />,
        },
        {
          key: "responsable_nom",
          label: "Chef de section",
          render: (i) => i.responsable_nom || "—",
        },
        {
          key: "is_active",
          label: "Statut",
          render: (i) => <StatusBadge active={i.is_active} theme={theme} />,
        },
      ];
    case "postes":
      return [
        { key: "nom", label: "Intitulé", bold: true },
        { key: "code", label: "Code", mono: true, primary: true },
        {
          key: "nb_employes",
          label: "Employés",
          render: (i) => <Badge count={i.nb_employes} color={theme.primary} />,
        },
        {
          key: "is_active",
          label: "Statut",
          render: (i) => <StatusBadge active={i.is_active} theme={theme} />,
        },
      ];
    case "types-contrat":
    case "categories":
    case "echelles":
    case "motifs-archivage":
      return [
        { key: "nom", label: "Nom", bold: true },
        { key: "description", label: "Description" },
        {
          key: "nb_employes",
          label: "Employés",
          render: (i) => <Badge count={i.nb_employes} color={theme.primary} />,
        },
        {
          key: "is_active",
          label: "Statut",
          render: (i) => <StatusBadge active={i.is_active} theme={theme} />,
        },
      ];
    case "types-documents":
      return [
        {
          key: "nom",
          label: "Nom",
          bold: true,
          render: (i) =>
            i.parent_nom ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  paddingLeft: 22,
                }}
              >
                <span style={{ color: theme.textMuted, fontSize: 13 }}>↳</span>
                {i.couleur && (
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: i.couleur,
                      border: `1px solid ${theme.border}`,
                      flexShrink: 0,
                    }}
                  />
                )}
                <span>{i.nom}</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i.is_categorie && <span title="Catégorie">📁</span>}
                {i.couleur && (
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: i.couleur,
                      border: `1px solid ${theme.border}`,
                      flexShrink: 0,
                    }}
                  />
                )}
                <span style={{ fontWeight: 700 }}>{i.nom}</span>
              </div>
            ),
        },
        { key: "code", label: "Code", mono: true, primary: true },
        {
          key: "ordre",
          label: "Ordre",
          render: (i) =>
            i.parent_nom ? (
              <span style={{ color: theme.textMuted, fontSize: 12 }}>
                — (suit "{i.parent_nom}")
              </span>
            ) : (
              (i.ordre ?? "—")
            ),
        },
        {
          key: "obligatoire",
          label: "Obligatoire",
          render: (i) => (
            <span
              style={{
                background: i.obligatoire ? theme.dangerBg : theme.primaryBg,
                color: i.obligatoire ? theme.danger : theme.primary,
                border: `1px solid ${i.obligatoire ? theme.dangerBorder : theme.primaryBorder}`,
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {i.obligatoire ? "Obligatoire" : "Optionnel"}
            </span>
          ),
        },
        {
          key: "champ_source",
          label: "Champ source",
          render: (i) => {
            if (!i.champ_source)
              return <span style={{ color: theme.textMuted }}>—</span>;
            const champ =
              SYSTEM_FIELDS.find((f) => f.code === i.champ_source) ||
              champsPersonnalisesOptions.find((c) => c.code === i.champ_source);
            return (
              <span style={{ fontSize: 12 }}>{champ?.nom || i.champ_source}</span>
            );
          },
        },
        {
          key: "nb_documents",
          label: "Documents",
          render: (i) => <Badge count={i.nb_documents} color={theme.primary} />,
        },
        {
          key: "is_active",
          label: "Statut",
          render: (i) => <StatusBadge active={i.is_active} theme={theme} />,
        },
      ];
    case "champs-personnalises":
      return [
        { key: "nom", label: "Nom", bold: true },
        { key: "code", label: "Code", mono: true, primary: true },
        {
          key: "type_champ",
          label: "Type",
          render: (i) => (
            <span
              style={{
                color: theme.textSecondary,
                fontSize: 12,
                textTransform: "capitalize",
              }}
            >
              {i.type_champ}
            </span>
          ),
        },
        {
          key: "categorie",
          label: "Catégorie",
          sortable: false,
          render: (i) => (
            <select
              value={i.categorie}
              onChange={async (e) => {
                const categorie = e.target.value;
                await api.patch(`/ref/champs-personnalises/${i.id}/`, {
                  categorie,
                });
                fetchTab(activeTab, page, search, true);
              }}
              className="input-focus"
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                padding: "3px 6px",
                fontSize: 12,
                color: theme.text,
                background: theme.surface,
              }}
            >
              <option value="ADMINISTRATIF">Administratif</option>
              <option value="PERSONNEL">Personnel</option>
            </select>
          ),
        },
        {
          key: "ordre",
          label: "Ordre",
          sortable: false,
          render: (i) => {
            const idx = items.findIndex((it) =>
              i.system
                ? it.system && it.code === i.code
                : !it.system && it.id === i.id,
            );
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    color: theme.textSecondary,
                    fontSize: 12,
                    minWidth: 18,
                    textAlign: "right",
                  }}
                >
                  {idx + 1}
                </span>
                {isAdmin &&
                  (() => {
                    const busy = !!reorderingField;
                    const upDisabled = idx <= 0 || busy;
                    const downDisabled = idx >= items.length - 1 || busy;
                    return (
                      <div
                        style={{ display: "flex", flexDirection: "column", gap: 1 }}
                      >
                        <button
                          type="button"
                          onClick={() => handleMoveField(i, "up")}
                          disabled={upDisabled}
                          title="Monter"
                          aria-label={`Monter ${i.nom}`}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            lineHeight: 1,
                            fontSize: 10,
                            color: upDisabled ? theme.textMuted : theme.primary,
                            cursor: upDisabled ? "default" : "pointer",
                          }}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveField(i, "down")}
                          disabled={downDisabled}
                          title="Descendre"
                          aria-label={`Descendre ${i.nom}`}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            lineHeight: 1,
                            fontSize: 10,
                            color: downDisabled ? theme.textMuted : theme.primary,
                            cursor: downDisabled ? "default" : "pointer",
                          }}
                        >
                          ▼
                        </button>
                      </div>
                    );
                  })()}
              </div>
            );
          },
        },
        {
          key: "is_active",
          label: "Statut",
          render: (i) =>
            i.system ? (
              <span
                style={{ color: theme.textMuted, fontSize: 11, fontStyle: "italic" }}
              >
                —
              </span>
            ) : (
              <StatusBadge active={i.is_active} theme={theme} />
            ),
        },
      ];
    default:
      return [];
  }
}
