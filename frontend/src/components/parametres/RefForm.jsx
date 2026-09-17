import { useTheme } from "../../context/ThemeContext";
import ResponsableField from "./ResponsableField";
import { getInputStyle, getLabelStyle } from "./formStyles";
import { SYSTEM_FIELDS } from "../../config/parametresTabs";
import ChampListeOptions from "./ChampListeOptions";

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
  errors = {},
}) => {
    const theme = useTheme();
    const inputStyle = getInputStyle(theme);
    const labelStyle = getLabelStyle(theme);
    // Erreur de validation serveur (champ dupliqué, requis...) affichée sous
    // le champ concerné — DRF renvoie {champ: ["message"]} ou {champ: "message"}.
    const FieldError = ({ name }) => {
      const msg = Array.isArray(errors[name]) ? errors[name][0] : errors[name];
      if (!msg) return null;
      return (
        <div style={{ color: theme.danger, fontSize: 12, marginTop: -8, marginBottom: 12 }}>
          {msg}
        </div>
      );
    };
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
            />
            <FieldError name="nom" />
            <label style={labelStyle}>Abréviation</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
            />
            <FieldError name="code" />
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
            />
            <FieldError name="nom" />
            <label style={labelStyle}>Abréviation</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
            />
            <FieldError name="code" />
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
            />
            <FieldError name="nom" />
            <label style={labelStyle}>Abréviation</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
            />
            <FieldError name="code" />
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
            />
            <FieldError name="nom" />
            <label style={labelStyle}>Abréviation</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
            />
            <FieldError name="code" />
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
            />
            <FieldError name="nom" />
            <label style={labelStyle}>Abréviation</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
            />
            <FieldError name="code" />
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
            />
            <FieldError name="nom" />
            <label style={labelStyle}>Abréviation</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
            />
            <FieldError name="code" />
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
            />
            <FieldError name="nom" />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus"
              style={inputStyle}
            />
            <FieldError name="code" />
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
            <FieldError name="nom" />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus"
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            {activeTab === "types-contrat" && (
              <>
                <label style={labelStyle}>Durée indéterminée</label>
                <select
                  name="duree_indeterminee"
                  aria-label="Durée indéterminée"
                  value={form.duree_indeterminee ?? false}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      duree_indeterminee: e.target.value === "true",
                    })
                  }
                  className="input-focus"
                  style={inputStyle}
                >
                  <option value="false">Non — date de fin possible</option>
                  <option value="true">
                    Oui — jamais de date de fin (ex. CDI)
                  </option>
                </select>
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 11,
                    marginTop: -8,
                    marginBottom: 12,
                  }}
                >
                  Si "Oui", le champ Date de fin sera masqué dans le
                  formulaire Contrat pour ce type et toujours vidé côté
                  serveur.
                </div>
              </>
            )}
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
            />
            <FieldError name="nom" />

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
            <FieldError name="code" />

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
            <FieldError name="parent" />
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
            <FieldError name="ordre" />

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
            />
            <FieldError name="nom" />

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
            <FieldError name="code" />

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
              <option value="liste">Liste (choix unique)</option>
            </select>

            {form.type_champ === "liste" && (
              modal?.item?.id ? (
                <ChampListeOptions
                  champId={modal.item.id}
                  options={form.options || modal.item.options || []}
                  onOptionsChange={(options) => setForm({ ...form, options })}
                />
              ) : (
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 11,
                    marginTop: -8,
                    marginBottom: 12,
                  }}
                >
                  Enregistrez d'abord le champ pour pouvoir ajouter ses options.
                </div>
              )
            )}

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

            <label style={labelStyle}>Champ conditionnel (optionnel)</label>
            <select
              name="condition_champ"
              aria-label="Champ conditionnel"
              value={form.condition_champ || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  condition_champ: e.target.value || null,
                  condition_valeur: e.target.value ? form.condition_valeur : "",
                })
              }
              className="input-focus"
              style={inputStyle}
            >
              <option value="">-- Toujours affiché --</option>
              {items
                .filter((c) => !c.is_systeme && c.id !== modal?.item?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
            </select>
            {form.condition_champ && (
              <>
                <label style={labelStyle}>Valeur requise</label>
                {(() => {
                  const champCondition = items.find((c) => c.id === form.condition_champ);
                  if (champCondition?.type_champ === "liste") {
                    return (
                      <select
                        name="condition_valeur"
                        aria-label="Valeur requise"
                        value={form.condition_valeur || ""}
                        onChange={handleChange}
                        className="input-focus"
                        style={inputStyle}
                      >
                        <option value="">-- Sélectionner --</option>
                        {(champCondition.options || [])
                          .filter((o) => o.is_active)
                          .map((o) => (
                            <option key={o.id} value={o.valeur}>
                              {o.valeur}
                            </option>
                          ))}
                      </select>
                    );
                  }
                  return (
                    <input
                      name="condition_valeur"
                      aria-label="Valeur requise"
                      value={form.condition_valeur || ""}
                      onChange={handleChange}
                      className="input-focus"
                      style={inputStyle}
                    />
                  );
                })()}
                <div
                  style={{ color: theme.textMuted, fontSize: 11, marginTop: -8, marginBottom: 12 }}
                >
                  Ce champ ne sera affiché (fiche, formulaire, liste) que si
                  l'employé a cette valeur sur le champ choisi ci-dessus.
                </div>
              </>
            )}

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
