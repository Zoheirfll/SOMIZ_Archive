import { useState, useEffect } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    username: "",
    nom: "",
    prenom: "",
    role: "CONSULTANT",
    password: "",
    password2: "",
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get("/admin-users/");
      setUsers(response.data.results || response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: null });
  };

  const validate = () => {
    const errs = {};
    if (!form.username.trim()) errs.username = "Identifiant obligatoire.";
    if (!form.nom.trim()) errs.nom = "Nom obligatoire.";
    if (!form.prenom.trim()) errs.prenom = "Prénom obligatoire.";
    if (!form.password) errs.password = "Mot de passe obligatoire.";
    if (form.password.length < 10) errs.password = "Minimum 10 caractères.";
    if (form.password !== form.password2)
      errs.password2 = "Les mots de passe ne correspondent pas.";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin-users/", {
        username: form.username,
        nom: form.nom,
        prenom: form.prenom,
        role: form.role,
        password: form.password,
      });
      setMessage({ type: "success", text: "Utilisateur créé avec succès." });
      setShowForm(false);
      setForm({
        username: "",
        nom: "",
        prenom: "",
        role: "CONSULTANT",
        password: "",
        password2: "",
      });
      fetchUsers();
    } catch (err) {
      const data = err.response?.data;
      if (data) setErrors(data);
      else setMessage({ type: "error", text: "Erreur lors de la création." });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const toggleActive = async (user) => {
    try {
      await api.patch(`/admin-users/${user.id}/`, {
        is_active: !user.is_active,
      });
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const inputStyle = {
    width: "100%",
    border: `1px solid ${theme.primaryBorder}`,
    borderRadius: 8,
    padding: "9px 14px",
    color: theme.text,
    fontSize: 13,
    outline: "none",
    background: theme.bg,
    boxSizing: "border-box",
  };

  return (
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      <Navbar />
      <div style={{ padding: "32px", maxWidth: 1000, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                color: theme.text,
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              Utilisateurs
            </h1>
            <div
              style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}
            >
              Comptes ayant accès au système
            </div>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              background: theme.primary,
              border: "none",
              color: "#fff",
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: `0 2px 8px ${theme.primary}44`,
            }}
          >
            + Nouvel utilisateur
          </button>
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

        {/* Formulaire création */}
        {showForm && (
          <div
            style={{
              background: theme.surface,
              border: `1px solid ${theme.primaryBorder}`,
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
              boxShadow: theme.shadow,
            }}
          >
            <h2
              style={{
                color: theme.text,
                margin: "0 0 20px",
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              Créer un compte
            </h2>
            <form onSubmit={handleSubmit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px 24px",
                }}
              >
                {[
                  {
                    name: "username",
                    label: "Identifiant",
                    placeholder: "prenom.nom",
                  },
                  { name: "nom", label: "Nom", placeholder: "BENALI" },
                  { name: "prenom", label: "Prénom", placeholder: "Ahmed" },
                ].map((f) => (
                  <div key={f.name}>
                    <label
                      style={{
                        color: theme.text,
                        fontSize: 12,
                        fontWeight: 600,
                        display: "block",
                        marginBottom: 5,
                      }}
                    >
                      {f.label}
                    </label>
                    <input
                      name={f.name}
                      value={form[f.name]}
                      onChange={handleChange}
                      placeholder={f.placeholder}
                      style={inputStyle}
                    />
                    {errors[f.name] && (
                      <div
                        style={{
                          color: theme.danger,
                          fontSize: 11,
                          marginTop: 3,
                        }}
                      >
                        {errors[f.name]}
                      </div>
                    )}
                  </div>
                ))}

                <div>
                  <label
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: 600,
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    Rôle
                  </label>
                  <select
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="CONSULTANT">
                      Consultant (lecture seule)
                    </option>
                    <option value="ADMIN">Administrateur</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: 600,
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Min. 10 caractères"
                    style={inputStyle}
                  />
                  {errors.password && (
                    <div
                      style={{
                        color: theme.danger,
                        fontSize: 11,
                        marginTop: 3,
                      }}
                    >
                      {errors.password}
                    </div>
                  )}
                </div>

                <div>
                  <label
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: 600,
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    Confirmer le mot de passe
                  </label>
                  <input
                    type="password"
                    name="password2"
                    value={form.password2}
                    onChange={handleChange}
                    placeholder="Répétez le mot de passe"
                    style={inputStyle}
                  />
                  {errors.password2 && (
                    <div
                      style={{
                        color: theme.danger,
                        fontSize: 11,
                        marginTop: 3,
                      }}
                    >
                      {errors.password2}
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 20,
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${theme.primaryBorder}`,
                    color: theme.textSecondary,
                    borderRadius: 8,
                    padding: "8px 20px",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: saving ? `${theme.primary}88` : theme.primary,
                    border: "none",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "8px 24px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "Création..." : "Créer"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Liste */}
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: theme.shadow,
          }}
        >
          {loading ? (
            <div
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                padding: 60,
              }}
            >
              Chargement...
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: theme.primaryBg }}>
                  {[
                    "Identifiant",
                    "Nom & Prénom",
                    "Rôle",
                    "Dernière connexion",
                    "Statut",
                    "Action",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        color: theme.primary,
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderBottom: `2px solid ${theme.primaryBorder}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    style={{ borderBottom: `1px solid ${theme.primaryBorder}` }}
                  >
                    <td
                      style={{
                        padding: "12px 16px",
                        color: theme.primary,
                        fontFamily: "monospace",
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {u.username}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        color: theme.text,
                        fontWeight: 600,
                      }}
                    >
                      {u.nom} {u.prenom}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          background:
                            u.role === "ADMIN"
                              ? theme.dangerBg
                              : theme.primaryBg,
                          color:
                            u.role === "ADMIN" ? theme.danger : theme.primary,
                          border: `1px solid ${u.role === "ADMIN" ? theme.dangerBorder : theme.primaryBorder}`,
                          borderRadius: 6,
                          padding: "3px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        color: theme.textSecondary,
                        fontSize: 13,
                      }}
                    >
                      {u.last_login
                        ? new Date(u.last_login).toLocaleDateString("fr-FR")
                        : "Jamais"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          background: u.is_active
                            ? theme.primaryBg
                            : theme.dangerBg,
                          color: u.is_active ? theme.primary : theme.danger,
                          border: `1px solid ${u.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                          borderRadius: 6,
                          padding: "3px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {u.is_active ? "Actif" : "Désactivé"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        onClick={() => toggleActive(u)}
                        style={{
                          background: u.is_active
                            ? theme.dangerBg
                            : theme.primaryBg,
                          border: `1px solid ${u.is_active ? theme.dangerBorder : theme.primaryBorder}`,
                          color: u.is_active ? theme.danger : theme.primary,
                          borderRadius: 6,
                          padding: "5px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {u.is_active ? "Désactiver" : "Activer"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Users;
