import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import Skeleton from "../components/Skeleton";
import HeroDecor from "../components/HeroDecor";
import PageBackground from "../components/PageBackground";
import useIsMobile from "../hooks/useIsMobile";
import { useConfirm } from "../components/ConfirmDialog";

const Field = ({ label, required, children }) => (
  <div style={{ marginBottom: 18 }}>
    <label
      style={{
        color: theme.text,
        fontSize: 13,
        fontWeight: 600,
        display: "block",
        marginBottom: 6,
      }}
    >
      {label} {required && <span style={{ color: theme.danger }}>*</span>}
    </label>
    {children}
  </div>
);

const Input = ({ className, ...props }) => (
  <input
    {...props}
    className={["input-focus", className].filter(Boolean).join(" ")}
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
      fontFamily: theme.fontFamily,
      transition: "border-color 0.15s",
      ...props.style,
    }}
  />
);

const Select = ({ children, className, ...props }) => (
  <select
    {...props}
    className={["input-focus", className].filter(Boolean).join(" ")}
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
      cursor: "pointer",
      fontFamily: theme.fontFamily,
      opacity: props.disabled ? 0.5 : 1,
      ...props.style,
    }}
  >
    {children}
  </select>
);

const SectionHeader = ({ label }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 20,
    }}
  >
    <div
      style={{
        width: 4,
        height: 18,
        background: theme.primary,
        borderRadius: 2,
        flexShrink: 0,
      }}
    />
    <div
      style={{
        color: theme.text,
        fontSize: 13,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {label}
    </div>
  </div>
);

const EmployeeForm = () => {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const isMobile = useIsMobile();
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    if (user && user.role !== "ADMIN") navigate("/employees");
  }, [user, navigate]);

  const [form, setForm] = useState({
    matricule: "",
    numero_contrat: "",
    nom: "",
    prenom: "",
    date_naissance: "",
    date_embauche: "",
    statut: "actif",
    direction: "",
    departement: "",
    service: "",
    cellule: "",
    poste: "",
    type_contrat: "",
    categorie: "",
  });

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);

  // Référentiels
  const [directions, setDirections] = useState([]);
  const [departements, setDepartements] = useState([]);
  const [departementsFiltres, setDepartementsFiltres] = useState([]);
  const [services, setServices] = useState([]);
  const [servicesFiltres, setServicesFiltres] = useState([]);
  const [cellules, setCellules] = useState([]);
  const [postes, setPostes] = useState([]);
  const [typesContrat, setTypesContrat] = useState([]);
  const [categories, setCategories] = useState([]);
  const [champsDefinitions, setChampsDefinitions] = useState([]);
  const [champsValues, setChampsValues] = useState({});
  // Snapshot de l'affectation au chargement (mode édition), pour détecter
  // un transfert et demander confirmation avant de sauvegarder.
  const [originalAffectation, setOriginalAffectation] = useState(null);

  useEffect(() => {
    fetchReferentiels();
    if (isEdit) {
      setFetching(true);
      fetchEmployee();
    }
  }, [id]);

  const fetchReferentiels = async () => {
    try {
      const [dir, dept, srv, cel, pos, tc, cat, champs] = await Promise.all([
        api.get("/ref/directions/"),
        api.get("/ref/departements/"),
        api.get("/ref/services/"),
        api.get("/ref/cellules/"),
        api.get("/ref/postes/"),
        api.get("/ref/types-contrat/"),
        api.get("/ref/categories/"),
        api.get("/ref/champs-personnalises/"),
      ]);
      setDirections(dir.data.results || dir.data);
      setDepartements(dept.data.results || dept.data);
      setServices(srv.data.results || srv.data);
      setCellules(cel.data.results || cel.data);
      setPostes(pos.data.results || pos.data);
      setTypesContrat(tc.data.results || tc.data);
      setCategories(cat.data.results || cat.data);
      setChampsDefinitions((champs.data.results || champs.data).filter((c) => c.is_active));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEmployee = async () => {
    try {
      const response = await api.get(`/employees/${id}/`);
      const emp = response.data;
      const newForm = {
        matricule: emp.matricule || "",
        nom: emp.nom || "",
        prenom: emp.prenom || "",
        date_naissance: emp.date_naissance || "",
        date_embauche: emp.date_embauche || "",
        statut: emp.statut || "actif",
        direction: emp.direction || "",
        departement: emp.departement || "",
        service: emp.service || "",
        cellule: emp.cellule || "",
        poste: emp.poste || "",
        type_contrat: emp.type_contrat || "",
        categorie: emp.categorie || "",
      };
      setForm(newForm);
      setOriginalAffectation({
        direction: newForm.direction,
        departement: newForm.departement,
        service: newForm.service,
        cellule: newForm.cellule,
      });

      if (emp.champs_personnalises) {
        const values = {};
        emp.champs_personnalises.forEach((c) => {
          values[c.id] = c.valeur || "";
        });
        setChampsValues(values);
      }

      // Le pré-filtrage des départements/services est géré par l'effet
      // ci-dessous (déclenché par form.direction/form.departement) — il
      // se déclenche quel que soit l'ordre d'arrivée entre cet appel et
      // fetchReferentiels().
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  // Quand les référentiels sont chargés en mode édition, re-filtrer
  useEffect(() => {
    if (form.direction) {
      setDepartementsFiltres(
        departements.filter((d) => d.direction === form.direction),
      );
    }
    if (form.departement) {
      setServicesFiltres(
        services.filter((s) => s.departement === form.departement),
      );
    }
    // form.direction/form.departement dans les deps : fetchEmployee() et
    // fetchReferentiels() partent en parallèle au montage, donc cet effet
    // doit aussi se redéclencher quand le formulaire se remplit après que
    // les référentiels sont déjà arrivés (sinon les listes filtrées
    // restent vides et l'utilisateur doit tout resélectionner).
  }, [departements, services, form.direction, form.departement]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: null });
  };

  const handleDirectionChange = (e) => {
    const dirId = e.target.value;
    setForm({ ...form, direction: dirId, departement: "", service: "", cellule: "" });
    setDepartementsFiltres(departements.filter((d) => d.direction === dirId));
    setServicesFiltres([]);
  };

  const handleDepartementChange = (e) => {
    const deptId = e.target.value;
    setForm({ ...form, departement: deptId, service: "", cellule: "" });
    setServicesFiltres(services.filter((s) => s.departement === deptId));
  };

  const validate = () => {
    const errs = {};
    if (!form.matricule.trim())
      errs.matricule = "Le matricule est obligatoire.";
    if (!form.nom.trim()) errs.nom = "Le nom est obligatoire.";
    if (!form.prenom.trim()) errs.prenom = "Le prénom est obligatoire.";
    if (!isEdit && form.numero_contrat.trim()) {
      if (!/^\d+$/.test(form.numero_contrat.trim()))
        errs.numero_contrat =
          "Le N° contrat doit contenir uniquement des chiffres.";
    }
    return errs;
  };

  // Nom lisible d'une Direction/Département/Service/Cellule à partir de son id.
  const affectationLabel = (field, valueId) => {
    if (!valueId) return "Aucun(e)";
    const listByField = { direction: directions, departement: departements, service: services, cellule: cellules };
    const found = (listByField[field] || []).find((r) => r.id === valueId);
    return found?.nom || "?";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    if (isEdit && originalAffectation) {
      const changedFields = ["direction", "departement", "service", "cellule"].filter(
        (field) => (form[field] || "") !== (originalAffectation[field] || "")
      );
      if (changedFields.length > 0) {
        const summary = changedFields
          .map((field) => `${affectationLabel(field, originalAffectation[field])} → ${affectationLabel(field, form[field])}`)
          .join("\n");
        const confirmed = await confirm(
          `Cette modification déplace l'employé :\n\n${summary}\n\nConfirmer le transfert ?`
        );
        if (!confirmed) return;
      }
    }

    // Nettoyer les champs vides — exclure numero_contrat du payload employé
    const { numero_contrat, ...formWithoutContrat } = form;
    const payload = {};
    Object.entries(formWithoutContrat).forEach(([k, v]) => {
      payload[k] = v === "" ? null : v;
    });

    setLoading(true);
    try {
      let employeeId = id;
      if (isEdit) {
        await api.patch(`/employees/${id}/`, payload);
        setMessage({ type: "success", text: "Employé modifié avec succès." });
        setTimeout(() => navigate(`/employees/${id}`), 1500);
      } else {
        const response = await api.post("/employees/", payload);
        employeeId = response.data.id;
        // Créer le contrat si un N° est fourni
        if (numero_contrat.trim()) {
          await api.post(`/employees/${employeeId}/contrats/`, {
            numero_contrat: numero_contrat.trim(),
            statut: "actif",
            ...(form.date_embauche ? { date_debut: form.date_embauche } : {}),
          });
        }
        setMessage({ type: "success", text: "Employé créé avec succès." });
        setTimeout(() => navigate(`/employees/${employeeId}`), 1500);
      }

      if (champsDefinitions.length > 0) {
        await api.patch(`/employees/${employeeId}/champs/`, champsValues);
      }
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === "object") setErrors(data);
      else setMessage({ type: "error", text: "Une erreur est survenue." });
    } finally {
      setLoading(false);
    }
  };

  const sectionCardStyle = {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 16,
    padding: 28,
    boxShadow: theme.shadowMd,
    marginBottom: 20,
  };

  if (fetching)
    return (
      <PageBackground style={{ fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ padding: 32, maxWidth: 800, margin: "0 auto" }}>
          <Skeleton height={40} style={{ marginBottom: 16 }} />
          <Skeleton height={40} style={{ marginBottom: 16 }} />
          <Skeleton height={40} style={{ marginBottom: 16 }} />
          <Skeleton height={120} radius={12} />
        </div>
      </PageBackground>
    );

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />

      {/* Hero header */}
      <div
        style={{
          background:
            "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
          padding: isMobile ? "20px 16px 24px" : "32px 32px 36px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <HeroDecor />
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1
            style={{
              color: "#FFFFFF",
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            {isEdit ? "Modifier l'employé" : "Nouvel employé"}
          </h1>
          <div
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: 13,
              marginTop: 6,
            }}
          >
            {isEdit
              ? "Mettez à jour les informations de l'employé"
              : "Créer un nouveau dossier employé dans le système"}
          </div>
        </div>
      </div>

      <div
        className="anim-fade-in"
        style={{ padding: isMobile ? "16px" : "32px", maxWidth: 900, margin: "0 auto" }}
      >
        {/* Back button */}
        <button
          onClick={() => navigate(isEdit ? `/employees/${id}` : "/employees")}
          style={{
            background: "transparent",
            border: `1px solid ${theme.border}`,
            color: theme.textSecondary,
            padding: "7px 16px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: theme.fontFamily,
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ← Retour
        </button>

        {/* Message banner */}
        {message && (
          <div
            style={{
              background:
                message.type === "success" ? theme.primaryBg : theme.dangerBg,
              border: `1px solid ${message.type === "success" ? theme.primaryBorder : theme.dangerBorder}`,
              color: message.type === "success" ? theme.primary : theme.danger,
              borderRadius: 12,
              padding: "12px 18px",
              marginBottom: 20,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Section Identité */}
          <div style={sectionCardStyle}>
            <SectionHeader label="Identité" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: "0 24px",
              }}
            >
              <Field label="Matricule" required>
                <Input
                  name="matricule"
                  value={form.matricule}
                  onChange={handleChange}
                  placeholder="EMP-001"
                />
                {errors.matricule && (
                  <div
                    style={{ color: theme.danger, fontSize: 12, marginTop: 4 }}
                  >
                    {errors.matricule}
                  </div>
                )}
              </Field>

              {!isEdit && (
                <Field label="N° Contrat">
                  <Input
                    name="numero_contrat"
                    value={form.numero_contrat}
                    onChange={handleChange}
                    placeholder="024141"
                  />
                  {errors.numero_contrat && (
                    <div
                      style={{
                        color: theme.danger,
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      {errors.numero_contrat}
                    </div>
                  )}
                </Field>
              )}

              <Field label="Statut" required>
                <Select
                  name="statut"
                  value={form.statut}
                  onChange={handleChange}
                >
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                  <option value="archive">Archivé</option>
                  <option value="demobilise">Démobilisé</option>
                </Select>
              </Field>

              <Field label="Nom" required>
                <Input
                  name="nom"
                  value={form.nom}
                  onChange={handleChange}
                  placeholder="FILALI"
                />
                {errors.nom && (
                  <div
                    style={{ color: theme.danger, fontSize: 12, marginTop: 4 }}
                  >
                    {errors.nom}
                  </div>
                )}
              </Field>

              <Field label="Prénom" required>
                <Input
                  name="prenom"
                  value={form.prenom}
                  onChange={handleChange}
                  placeholder="Ahmed"
                />
                {errors.prenom && (
                  <div
                    style={{ color: theme.danger, fontSize: 12, marginTop: 4 }}
                  >
                    {errors.prenom}
                  </div>
                )}
              </Field>

              <Field label="Date de naissance">
                <Input
                  type="date"
                  name="date_naissance"
                  value={form.date_naissance}
                  onChange={handleChange}
                />
              </Field>

              <Field label="Date de recrutement">
                <Input
                  type="date"
                  name="date_embauche"
                  value={form.date_embauche}
                  onChange={handleChange}
                />
              </Field>

            </div>
          </div>

          {/* Section Organisation */}
          <div style={sectionCardStyle}>
            <SectionHeader label="Organisation" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: "0 24px",
              }}
            >
              <Field label="Direction">
                <Select
                  name="direction"
                  value={form.direction || ""}
                  onChange={handleDirectionChange}
                >
                  <option value="">-- Sélectionner --</option>
                  {directions
                    .filter((d) => d.is_active)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom}
                      </option>
                    ))}
                </Select>
              </Field>

              <Field label="Département">
                <Select
                  name="departement"
                  value={form.departement || ""}
                  onChange={handleDepartementChange}
                  disabled={!form.direction}
                >
                  <option value="">-- Sélectionner --</option>
                  {departementsFiltres
                    .filter((d) => d.is_active)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom}
                      </option>
                    ))}
                </Select>
              </Field>

              <Field label="Service">
                <Select
                  name="service"
                  value={form.service || ""}
                  onChange={(e) =>
                    setForm({ ...form, service: e.target.value, cellule: "" })
                  }
                  disabled={!form.departement}
                >
                  <option value="">-- Sélectionner --</option>
                  {servicesFiltres
                    .filter((s) => s.is_active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom}
                      </option>
                    ))}
                </Select>
              </Field>

              <Field label="Cellule (alternative au Service)">
                <Select
                  name="cellule"
                  value={form.cellule || ""}
                  onChange={(e) =>
                    setForm({ ...form, cellule: e.target.value, service: "" })
                  }
                  disabled={!form.direction}
                >
                  <option value="">-- Aucune --</option>
                  {cellules
                    .filter(
                      (c) =>
                        c.is_active &&
                        (form.departement
                          ? c.departement === form.departement
                          : c.direction === form.direction),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                </Select>
              </Field>

              <Field label="Fonction">
                <Select
                  name="poste"
                  value={form.poste || ""}
                  onChange={handleChange}
                >
                  <option value="">-- Sélectionner --</option>
                  {postes
                    .filter((p) => p.is_active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom}
                      </option>
                    ))}
                </Select>
              </Field>

              <Field label="Type de contrat">
                <Select
                  name="type_contrat"
                  value={form.type_contrat || ""}
                  onChange={handleChange}
                >
                  <option value="">-- Sélectionner --</option>
                  {typesContrat
                    .filter((t) => t.is_active)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nom}
                      </option>
                    ))}
                </Select>
              </Field>

              <Field label="Catégorie">
                <Select
                  name="categorie"
                  value={form.categorie || ""}
                  onChange={handleChange}
                >
                  <option value="">-- Sélectionner --</option>
                  {categories
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
          </div>

          {/* Section Informations complémentaires (champs personnalisés) */}
          {champsDefinitions.length > 0 && (
            <div style={sectionCardStyle}>
              <SectionHeader label="Informations complémentaires" />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: "0 24px",
                }}
              >
                {champsDefinitions.map((champ) => (
                  <Field key={champ.id} label={champ.nom}>
                    <Input
                      type={
                        champ.type_champ === "nombre"
                          ? "number"
                          : champ.type_champ === "date"
                            ? "date"
                            : "text"
                      }
                      value={champsValues[champ.id] || ""}
                      onChange={(e) =>
                        setChampsValues({ ...champsValues, [champ.id]: e.target.value })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={() =>
                navigate(isEdit ? `/employees/${id}` : "/employees")
              }
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                color: theme.textSecondary,
                borderRadius: 10,
                padding: "12px 24px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: theme.fontFamily,
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? `${theme.primary}88` : theme.primary,
                border: "none",
                color: "#fff",
                borderRadius: 10,
                padding: "12px 28px",
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: theme.fontFamily,
                letterSpacing: "-0.01em",
                boxShadow: loading ? "none" : `0 2px 8px ${theme.primary}33`,
                transition: "background 0.15s",
              }}
            >
              {loading
                ? "Enregistrement..."
                : isEdit
                  ? "Enregistrer les modifications"
                  : "Créer l'employé"}
            </button>
          </div>
        </form>
      </div>
      {ConfirmDialog}
    </PageBackground>
  );
};

export default EmployeeForm;
