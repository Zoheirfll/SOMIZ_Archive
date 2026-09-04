import { useTheme } from "../../context/ThemeContext";
import ResponsableField from "./ResponsableField";
import { getInputStyle, getLabelStyle } from "./formStyles";
import { SYSTEM_FIELDS } from "../../config/parametresTabs";

// Formulaire d'ajout/édition, un cas par onglet référentiel — extrait de
// Parametres.jsx (voir CLAUDE.md, pages >1000 lignes) pour garder la page
// principale sous les 1000 lignes. Aucun état local : entièrement piloté
// par les props (form/setForm de la page parente).
const RefForm = ({
  activeTab,
  form,
  setForm,
  handleChange,
  directions,
  poles,
  departements,
  rattachementChoice,
  setRattachementChoice,
  champsPersonnalisesOptions,
  items,
  modal,
}) => {
    const theme = useTheme();
    const inputStyle = getInputStyle(theme);
    const labelStyle = getLabelStyle(theme);
    switch (activeTab) {
      case "directions":
        return (
          <>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="Direction Générale"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="DG"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus"
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
              placeholder="Description optionnelle"
            />
            <ResponsableField
              label="Directeur"
              value={form.responsable || null}
              currentLabel={form.responsable_nom}
              onChange={(id, nom) =>
                setForm({ ...form, responsable: id, responsable_nom: nom })
              }
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus"
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

      case "poles":
        return (
          <>
            <label style={labelStyle}>
              Direction <span style={{ color: theme.danger }}>*</span>
            </label>
            <select
              name="direction"
              value={form.direction || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
            >
              <option value="">-- Sélectionner --</option>
              {directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom}
                </option>
              ))}
            </select>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="Pôle Machines Tournantes"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="PMT"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus"
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <ResponsableField
              label="Directeur"
              value={form.responsable || null}
              currentLabel={form.responsable_nom}
              onChange={(id, nom) =>
                setForm({ ...form, responsable: id, responsable_nom: nom })
              }
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus"
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

      case "departements": {
        const polesDeLaDirection = poles.filter(
          (p) => p.direction === form.direction,
        );
        return (
          <>
            <label style={labelStyle}>
              Direction <span style={{ color: theme.danger }}>*</span>
            </label>
            <select
              name="direction"
              value={form.direction || ""}
              onChange={(e) =>
                setForm({ ...form, direction: e.target.value, pole: "" })
              }
              className="input-focus"
              style={inputStyle}
            >
              <option value="">-- Sélectionner --</option>
              {directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom}
                </option>
              ))}
            </select>
            <label style={labelStyle}>Pôle (optionnel)</label>
            <select
              name="pole"
              value={form.pole || ""}
              onChange={handleChange}
              disabled={!form.direction || polesDeLaDirection.length === 0}
              className="input-focus"
              style={inputStyle}
            >
              <option value="">
                -- Aucun (rattaché directement à la Direction) --
              </option>
              {polesDeLaDirection.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="Département Ressources Humaines"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="DRH"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus"
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <ResponsableField
              label="Chef de département"
              value={form.responsable || null}
              currentLabel={form.responsable_nom}
              onChange={(id, nom) =>
                setForm({ ...form, responsable: id, responsable_nom: nom })
              }
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus"
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );
      }

      case "services":
        return (
          <>
            <label style={labelStyle}>
              Département <span style={{ color: theme.danger }}>*</span>
            </label>
            <select
              name="departement"
              value={form.departement || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
            >
              <option value="">-- Sélectionner --</option>
              {departements.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom} ({d.direction_nom})
                </option>
              ))}
            </select>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="Service Paie"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="SP"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus"
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <ResponsableField
              label="Chef de service"
              value={form.responsable || null}
              currentLabel={form.responsable_nom}
              onChange={(id, nom) =>
                setForm({ ...form, responsable: id, responsable_nom: nom })
              }
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus"
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

      case "cellules": {
        const rattachement = rattachementChoice;
        return (
          <>
            <label style={labelStyle}>
              Rattachée à <span style={{ color: theme.danger }}>*</span>
            </label>
            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: theme.text,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={rattachement === "direction"}
                  onChange={() => {
                    setRattachementChoice("direction");
                    setForm({
                      ...form,
                      direction: form.direction || "",
                      departement: "",
                    });
                  }}
                />
                Une Direction
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: theme.text,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={rattachement === "departement"}
                  onChange={() => {
                    setRattachementChoice("departement");
                    setForm({
                      ...form,
                      departement: form.departement || "",
                      direction: "",
                    });
                  }}
                />
                Un Département
              </label>
            </div>
            {rattachement === "direction" ? (
              <select
                name="direction"
                value={form.direction || ""}
                onChange={handleChange}
                className="input-focus"
                style={inputStyle}
              >
                <option value="">-- Sélectionner une Direction --</option>
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                  </option>
                ))}
              </select>
            ) : (
              <select
                name="departement"
                value={form.departement || ""}
                onChange={handleChange}
                className="input-focus"
                style={inputStyle}
              >
                <option value="">-- Sélectionner un Département --</option>
                {departements.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom} ({d.direction_nom})
                  </option>
                ))}
              </select>
            )}
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="Cellule Audit Interne"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="CAI"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus"
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <ResponsableField
              label="Chef de cellule"
              value={form.responsable || null}
              currentLabel={form.responsable_nom}
              onChange={(id, nom) =>
                setForm({ ...form, responsable: id, responsable_nom: nom })
              }
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus"
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );
      }

      case "sections": {
        const rattachement = rattachementChoice;
        return (
          <>
            <label style={labelStyle}>
              Rattachée à <span style={{ color: theme.danger }}>*</span>
            </label>
            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: theme.text,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={rattachement === "direction"}
                  onChange={() => {
                    setRattachementChoice("direction");
                    setForm({
                      ...form,
                      direction: form.direction || "",
                      departement: "",
                    });
                  }}
                />
                Une Direction
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: theme.text,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={rattachement === "departement"}
                  onChange={() => {
                    setRattachementChoice("departement");
                    setForm({
                      ...form,
                      departement: form.departement || "",
                      direction: "",
                    });
                  }}
                />
                Un Département
              </label>
            </div>
            {rattachement === "direction" ? (
              <select
                name="direction"
                value={form.direction || ""}
                onChange={handleChange}
                className="input-focus"
                style={inputStyle}
              >
                <option value="">-- Sélectionner une Direction --</option>
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                  </option>
                ))}
              </select>
            ) : (
              <select
                name="departement"
                value={form.departement || ""}
                onChange={handleChange}
                className="input-focus"
                style={inputStyle}
              >
                <option value="">-- Sélectionner un Département --</option>
                {departements.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom} ({d.direction_nom})
                  </option>
                ))}
              </select>
            )}
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="Section Contrôle Qualité"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="SCQ"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus"
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <ResponsableField
              label="Chef de section"
              value={form.responsable || null}
              currentLabel={form.responsable_nom}
              onChange={(id, nom) =>
                setForm({ ...form, responsable: id, responsable_nom: nom })
              }
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus"
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );
      }

      case "postes":
        return (
          <>
            <label style={labelStyle}>
              Intitulé <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="Ingénieur principal"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="ING-P"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus"
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus"
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

      case "types-contrat":
      case "categories":
      case "echelles":
      case "motifs-archivage":
        return (
          <>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder={
                activeTab === "types-contrat"
                  ? "CDI, CDD, Titulaire..."
                  : activeTab === "echelles"
                    ? "Échelle 10, Échelle 12..."
                    : activeTab === "motifs-archivage"
                      ? "Fin de contrat, Démission..."
                      : "Cadre, Technicien..."
              }
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus"
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus"
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );
      case "types-documents":
        return (
          <>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="Attestation de travail"
            />

            <label style={labelStyle}>
              Code <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="ATTESTATION"
            />

            <label style={labelStyle}>Catégorie parente (optionnel)</label>
            <select
              name="parent"
              value={form.parent || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
            >
              <option value="">-- Aucune (type racine) --</option>
              {items
                .filter((t) => !t.parent && t.id !== modal?.item?.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nom}
                  </option>
                ))}
            </select>
            <div
              style={{
                color: theme.textMuted,
                fontSize: 11,
                marginTop: -8,
                marginBottom: 12,
              }}
            >
              Rattacher ce type à une catégorie (ex. "Acte de naissance" sous
              "État civil") pour l'afficher comme sous-dossier. Un type devenant
              lui-même une catégorie (une fois qu'il a des sous-types) n'est
              plus uploadable directement.
            </div>

            <label style={labelStyle}>Ordre d'affichage</label>
            <input
              type="number"
              name="ordre"
              value={form.ordre ?? 0}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              min="0"
            />

            <label style={labelStyle}>Obligatoire ?</label>
            <select
              name="obligatoire"
              value={
                modal?.item?.is_categorie ? false : (form.obligatoire ?? false)
              }
              onChange={(e) =>
                setForm({ ...form, obligatoire: e.target.value === "true" })
              }
              disabled={modal?.item?.is_categorie}
              className="input-focus"
              style={inputStyle}
            >
              <option value="false">Optionnel</option>
              <option value="true">Obligatoire</option>
            </select>
            {modal?.item?.is_categorie && (
              <div
                style={{
                  color: theme.warning,
                  fontSize: 11,
                  marginTop: 4,
                  marginBottom: 12,
                }}
              >
                Cette catégorie a des sous-types — elle n'est plus uploadable
                directement, donc "Obligatoire" n'a aucun effet ici. Marquez
                le(s) sous-type(s) concerné(s) comme obligatoire(s) à la place.
              </div>
            )}

            <label style={labelStyle}>Champ source (optionnel)</label>
            <select
              name="champ_source"
              aria-label="Champ source"
              value={modal?.item?.is_categorie ? "" : form.champ_source || ""}
              onChange={handleChange}
              disabled={modal?.item?.is_categorie}
              className="input-focus"
              style={inputStyle}
            >
              <option value="">-- Aucun --</option>
              <optgroup label="Champs système">
                {SYSTEM_FIELDS.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.nom}
                  </option>
                ))}
              </optgroup>
              {champsPersonnalisesOptions.length > 0 && (
                <optgroup label="Champs personnalisés">
                  {champsPersonnalisesOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.nom}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <div
              style={{
                color: theme.textMuted,
                fontSize: 11,
                marginTop: -8,
                marginBottom: 12,
              }}
            >
              Le champ de la fiche employé que ce document justifie (ex. "Date
              de naissance" pour un Acte de naissance) — cliquer sur ce champ,
              côté fiche employé, ouvrira directement ce document.
            </div>

            <label style={labelStyle}>Couleur (optionnel)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="color"
                value={form.couleur || "#166534"}
                onChange={(e) => setForm({ ...form, couleur: e.target.value })}
                style={{
                  width: 40,
                  height: 34,
                  padding: 2,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              />
              <input
                name="couleur"
                value={form.couleur || ""}
                onChange={handleChange}
                placeholder="#166534"
                className="input-focus"
                style={{ ...inputStyle, flex: 1 }}
              />
              {form.couleur && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, couleur: "" })}
                  style={{
                    background: "none",
                    border: "none",
                    color: theme.textMuted,
                    fontSize: 12,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Réinitialiser
                </button>
              )}
            </div>
            <div
              style={{
                color: theme.textMuted,
                fontSize: 11,
                marginTop: 4,
                marginBottom: 12,
              }}
            >
              Colore le dossier/sous-dossier dans la sidebar Documents de la
              fiche employé. Un sous-type sans couleur propre hérite de la
              couleur de sa catégorie.
            </div>

            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus"
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

      case "champs-personnalises":
        return (
          <>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="Permis de conduire"
            />

            <label style={labelStyle}>
              Code <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              placeholder="PERMIS"
            />

            <label style={labelStyle}>Type</label>
            <select
              name="type_champ"
              value={form.type_champ || "texte"}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
            >
              <option value="texte">Texte</option>
              <option value="nombre">Nombre</option>
              <option value="date">Date</option>
              <option value="booleen">Booléen (Oui/Non)</option>
            </select>

            <label style={labelStyle}>Ordre d'affichage</label>
            <input
              type="number"
              name="ordre"
              value={form.ordre ?? 0}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
              min="0"
            />

            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus"
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
            <div
              style={{ color: theme.textMuted, fontSize: 11, marginTop: -8 }}
            >
              Ce champ apparaîtra sur la fiche de tous les employés (section
              "Informations complémentaires").
            </div>
          </>
        );

      default:
        return null;
    }
  };

export default RefForm;
