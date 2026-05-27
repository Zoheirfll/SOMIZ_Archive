import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";

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

const Input = ({ ...props }) => (
  <input
    {...props}
    style={{
      width: "100%",
      border: `1px solid ${theme.primaryBorder}`,
      borderRadius: 8,
      padding: "10px 14px",
      color: theme.text,
      fontSize: 14,
      outline: "none",
      background: theme.bg,
      boxSizing: "border-box",
      transition: "border 0.15s",
      ...props.style,
    }}
  />
);

const Select = ({ children, ...props }) => (
  <select
    {...props}
    style={{
      width: "100%",
      border: `1px solid ${theme.primaryBorder}`,
      borderRadius: 8,
      padding: "10px 14px",
      color: theme.text,
      fontSize: 14,
      outline: "none",
      background: theme.bg,
      boxSizing: "border-box",
      cursor: "pointer",
      opacity: props.disabled ? 0.5 : 1,
      ...props.style,
    }}
  >
    {children}
  </select>
);

const EmployeeForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState({
    matricule: "",
    nom: "",
    prenom: "",
    date_naissance: "",
    date_embauche: "",
    statut: "actif",
    direction: "",
    departement: "",
    service: "",
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
  const [postes, setPostes] = useState([]);
  const [typesContrat, setTypesContrat] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    fetchReferentiels();
    if (isEdit) {
      setFetching(true);
      fetchEmployee();
    }
  }, [id]);

  const fetchReferentiels = async () => {
    try {
      const [dir, dept, srv, pos, tc, cat] = await Promise.all([
        api.get("/ref/directions/"),
        api.get("/ref/departements/"),
        api.get("/ref/services/"),
        api.get("/ref/postes/"),
        api.get("/ref/types-contrat/"),
        api.get("/ref/categories/"),
      ]);
      setDirections(dir.data.results || dir.data);
      setDepartements(dept.data.results || dept.data);
      setServices(srv.data.results || srv.data);
      setPostes(pos.data.results || pos.data);
      setTypesContrat(tc.data.results || tc.data);
      setCategories(cat.data.results || cat.data);
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
        poste: emp.poste || "",
        type_contrat: emp.type_contrat || "",
        categorie: emp.categorie || "",
      };
      setForm(newForm);

      // Pré-filtrer départements et services
      if (emp.direction) {
        setDepartementsFiltres((dept) =>
          dept.filter((d) => d.direction === emp.direction),
        );
      }
      if (emp.departement) {
        setServicesFiltres((srv) =>
          srv.filter((s) => s.departement === emp.departement),
        );
      }
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
  }, [departements, services]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: null });
  };

  const handleDirectionChange = (e) => {
    const dirId = e.target.value;
    setForm({ ...form, direction: dirId, departement: "", service: "" });
    setDepartementsFiltres(departements.filter((d) => d.direction === dirId));
    setServicesFiltres([]);
  };

  const handleDepartementChange = (e) => {
    const deptId = e.target.value;
    setForm({ ...form, departement: deptId, service: "" });
    setServicesFiltres(services.filter((s) => s.departement === deptId));
  };

  const validate = () => {
    const errs = {};
    if (!form.matricule.trim())
      errs.matricule = "Le matricule est obligatoire.";
    if (!form.nom.trim()) errs.nom = "Le nom est obligatoire.";
    if (!form.prenom.trim()) errs.prenom = "Le prénom est obligatoire.";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    // Nettoyer les champs vides pour éviter d'envoyer ""
    const payload = {};
    Object.entries(form).forEach(([k, v]) => {
      payload[k] = v === "" ? null : v;
    });

    setLoading(true);
    try {
      if (isEdit) {
        await api.patch(`/employees/${id}/`, payload);
        setMessage({ type: "success", text: "Employé modifié avec succès." });
        setTimeout(() => navigate(`/employees/${id}`), 1500);
      } else {
        const response = await api.post("/employees/", payload);
        setMessage({ type: "success", text: "Employé créé avec succès." });
        setTimeout(() => navigate(`/employees/${response.data.id}`), 1500);
      }
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === "object") setErrors(data);
      else setMessage({ type: "error", text: "Une erreur est survenue." });
    } finally {
      setLoading(false);
    }
  };

  if (fetching)
    return (
      <div style={{ background: theme.bg, minHeight: "100vh" }}>
        <Navbar />
        <div
          style={{
            color: theme.textSecondary,
            textAlign: "center",
            padding: 80,
          }}
        >
          Chargement...
        </div>
      </div>
    );

  return (
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      <Navbar />
      <div style={{ padding: "32px", maxWidth: 900, margin: "0 auto" }}>
        <button
          onClick={() => navigate(isEdit ? `/employees/${id}` : "/employees")}
          style={{
            background: "transparent",
            border: `1px solid ${theme.primaryBorder}`,
            color: theme.textSecondary,
            padding: "6px 14px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          ← Retour
        </button>

        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 12,
            padding: 32,
            boxShadow: theme.shadow,
          }}
        >
          <h1
            style={{
              color: theme.text,
              margin: "0 0 28px",
              fontSize: 20,
              fontWeight: 800,
            }}
          >
            {isEdit ? "Modifier l'employé" : "Nouvel employé"}
          </h1>

          {message && (
            <div
              style={{
                background:
                  message.type === "success" ? theme.primaryBg : theme.dangerBg,
                border: `1px solid ${message.type === "success" ? theme.primaryBorder : theme.dangerBorder}`,
                color:
                  message.type === "success" ? theme.primary : theme.danger,
                borderRadius: 8,
                padding: "10px 16px",
                marginBottom: 20,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Section identité */}
            <div
              style={{
                color: theme.primary,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 16,
                paddingBottom: 8,
                borderBottom: `1px solid ${theme.primaryBorder}`,
              }}
            >
              Identité
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 24px",
              }}
            >
              <Field label="Matricule" required>
                <Input
                  name="matricule"
                  value={form.matricule}
                  onChange={handleChange}
                  placeholder="024141"
                  disabled={isEdit}
                  style={{ background: isEdit ? "#F5F5F5" : theme.bg }}
                />
                {errors.matricule && (
                  <div
                    style={{ color: theme.danger, fontSize: 12, marginTop: 4 }}
                  >
                    {errors.matricule}
                  </div>
                )}
              </Field>

              <Field label="Statut" required>
                <Select
                  name="statut"
                  value={form.statut}
                  onChange={handleChange}
                >
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                  <option value="archive">Archivé</option>
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

              <Field label="Date d'embauche">
                <Input
                  type="date"
                  name="date_embauche"
                  value={form.date_embauche}
                  onChange={handleChange}
                />
              </Field>
            </div>

            {/* Section organisation */}
            <div
              style={{
                color: theme.primary,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: "24px 0 16px",
                paddingBottom: 8,
                borderBottom: `1px solid ${theme.primaryBorder}`,
              }}
            >
              Organisation
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
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
                  onChange={handleChange}
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

              <Field label="Poste">
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

            {/* Boutons */}
            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "flex-end",
                marginTop: 28,
                paddingTop: 20,
                borderTop: `1px solid ${theme.primaryBorder}`,
              }}
            >
              <button
                type="button"
                onClick={() =>
                  navigate(isEdit ? `/employees/${id}` : "/employees")
                }
                style={{
                  background: "transparent",
                  border: `1px solid ${theme.primaryBorder}`,
                  color: theme.textSecondary,
                  borderRadius: 8,
                  padding: "10px 24px",
                  fontSize: 14,
                  cursor: "pointer",
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
                  borderRadius: 8,
                  padding: "10px 28px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: `0 2px 8px ${theme.primary}44`,
                }}
              >
                {loading
                  ? "Enregistrement..."
                  : isEdit
                    ? "Enregistrer"
                    : "Créer l'employé"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EmployeeForm;
