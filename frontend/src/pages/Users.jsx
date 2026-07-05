import { useState, useEffect } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import Skeleton from "../components/Skeleton";
import "../styles/animations.css";

// SVG icons
const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const IconKey = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
);

const EyeIcon = ({ open }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const Users = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
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
  const [resetModal, setResetModal] = useState(null);
  const [resetForm, setResetForm] = useState({
    nouveau_mot_de_passe: "",
    confirmation: "",
  });
  const [resetting, setResetting] = useState(false);
  const [showResetMdp, setShowResetMdp] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

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
      setForm({ username: "", nom: "", prenom: "", role: "CONSULTANT", password: "", password2: "" });
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
      await api.patch(`/admin-users/${user.id}/`, { is_active: !user.is_active });
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetPassword = async () => {
    if (resetForm.nouveau_mot_de_passe !== resetForm.confirmation) {
      setMessage({ type: "error", text: "Les mots de passe ne correspondent pas." });
      return;
    }
    if (resetForm.nouveau_mot_de_passe.length < 10) {
      setMessage({ type: "error", text: "Minimum 10 caractères." });
      return;
    }
    setResetting(true);
    try {
      await api.post(`/admin-users/${resetModal.id}/reset-password/`, resetForm);
      setMessage({ type: "success", text: `Mot de passe de ${resetModal.username} réinitialisé.` });
      setResetModal(null);
      setResetForm({ nouveau_mot_de_passe: "", confirmation: "" });
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Erreur." });
    } finally {
      setResetting(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const inputStyle = {
    width: "100%",
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    padding: "10px 14px",
    color: theme.text,
    fontSize: 13,
    outline: "none",
    background: theme.bg,
    boxSizing: "border-box",
    fontFamily: theme.fontFamily,
  };

  const labelStyle = {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    display: "block",
    marginBottom: 6,
  };

  return (
    <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: theme.fontFamily }}>
      <Navbar />

      {/* Hero header */}
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: "32px 32px 36px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
              Gestion des utilisateurs
            </h1>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 }}>
              Gérer les accès à SOMIZ
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowForm(!showForm)}
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "1.5px solid rgba(255,255,255,0.3)",
                color: "#fff",
                borderRadius: 10,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "inherit",
                backdropFilter: "blur(4px)",
              }}
            >
              <IconPlus /> Nouvel utilisateur
            </button>
          )}
        </div>
      </div>

      <div className="anim-fade-in" style={{ padding: "32px", maxWidth: 1000, margin: "0 auto" }}>

        {message && (
          <div style={{
            background: message.type === "success" ? theme.primaryBg : theme.dangerBg,
            border: `1px solid ${message.type === "success" ? theme.primaryBorder : theme.dangerBorder}`,
            color: message.type === "success" ? theme.primary : theme.danger,
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13,
            fontWeight: 600,
          }}>
            {message.text}
          </div>
        )}

        {/* Formulaire création */}
        {showForm && (
          <div style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 16,
            padding: 28,
            marginBottom: 24,
            boxShadow: theme.shadowMd,
          }}>
            <h2 style={{ color: theme.text, margin: "0 0 24px", fontSize: 16, fontWeight: 700 }}>
              Créer un compte utilisateur
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
                {[
                  { name: "username", label: "Identifiant", placeholder: "prenom.nom" },
                  { name: "nom", label: "Nom", placeholder: "BENALI" },
                  { name: "prenom", label: "Prénom", placeholder: "Ahmed" },
                ].map((f) => (
                  <div key={f.name}>
                    <label style={labelStyle}>{f.label}</label>
                    <input
                      name={f.name}
                      value={form[f.name]}
                      onChange={handleChange}
                      placeholder={f.placeholder}
                      className="input-focus" style={inputStyle}
                    />
                    {errors[f.name] && (
                      <div style={{ color: theme.danger, fontSize: 11, marginTop: 4 }}>
                        {errors[f.name]}
                      </div>
                    )}
                  </div>
                ))}

                <div>
                  <label style={labelStyle}>Rôle</label>
                  <select name="role" value={form.role} onChange={handleChange} className="input-focus" style={inputStyle}>
                    <option value="CONSULTANT">Consultant (lecture seule)</option>
                    <option value="ADMIN">Administrateur</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Mot de passe</label>
                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Min. 10 caractères"
                    className="input-focus" style={inputStyle}
                  />
                  {errors.password && (
                    <div style={{ color: theme.danger, fontSize: 11, marginTop: 4 }}>{errors.password}</div>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Confirmer le mot de passe</label>
                  <input
                    type="password"
                    name="password2"
                    value={form.password2}
                    onChange={handleChange}
                    placeholder="Répétez le mot de passe"
                    className="input-focus" style={inputStyle}
                  />
                  {errors.password2 && (
                    <div style={{ color: theme.danger, fontSize: 11, marginTop: 4 }}>{errors.password2}</div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{
                    background: theme.surface,
                    border: `1.5px solid ${theme.border}`,
                    color: theme.textSecondary,
                    borderRadius: 10,
                    padding: "9px 20px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
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
                    borderRadius: 10,
                    padding: "9px 24px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: saving ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {saving ? "Création..." : "Créer le compte"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Liste utilisateurs */}
        <div style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: theme.shadowMd,
        }}>
          {loading ? (
            <div style={{ padding: 24 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0" }}>
                  <Skeleton width={32} height={32} radius={16} />
                  <Skeleton width="35%" height={14} />
                </div>
              ))}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: theme.bg, borderBottom: `2px solid ${theme.border}` }}>
                  {["Identifiant", "Nom & Prénom", "Rôle", "Dernière connexion", "Statut", "Actions"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "13px 16px",
                        textAlign: "left",
                        color: theme.textSecondary,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: `1px solid ${theme.border}`,
                      background: idx % 2 === 0 ? theme.surface : "#fafbfc",
                    }}
                  >
                    <td style={{ padding: "13px 16px", color: theme.primary, fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>
                      {u.username}
                    </td>
                    <td style={{ padding: "13px 16px", color: theme.text, fontWeight: 600, fontSize: 14 }}>
                      {u.nom} {u.prenom}
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{
                        background: u.role === "ADMIN" ? theme.dangerBg : theme.primaryBg,
                        color: u.role === "ADMIN" ? theme.danger : theme.primary,
                        border: `1px solid ${u.role === "ADMIN" ? theme.dangerBorder : theme.primaryBorder}`,
                        borderRadius: 20,
                        padding: "3px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px", color: theme.textSecondary, fontSize: 13 }}>
                      {u.last_login
                        ? new Date(u.last_login).toLocaleDateString("fr-FR")
                        : "Jamais"}
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{
                        background: u.is_active ? theme.primaryBg : theme.dangerBg,
                        color: u.is_active ? theme.primary : theme.danger,
                        border: `1px solid ${u.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                        borderRadius: 20,
                        padding: "3px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        {u.is_active ? "Actif" : "Désactivé"}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      {isAdmin && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => toggleActive(u)}
                            style={{
                              background: u.is_active ? theme.dangerBg : theme.primaryBg,
                              border: `1px solid ${u.is_active ? theme.dangerBorder : theme.primaryBorder}`,
                              color: u.is_active ? theme.danger : theme.primary,
                              borderRadius: 8,
                              padding: "5px 12px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {u.is_active ? "Désactiver" : "Activer"}
                          </button>
                          <button
                            onClick={() => {
                              setResetModal(u);
                              setResetForm({ nouveau_mot_de_passe: "", confirmation: "" });
                              setShowResetMdp(false);
                              setShowResetConfirm(false);
                            }}
                            style={{
                              background: "#FFF8E1",
                              border: "1px solid #FFE082",
                              color: theme.warning,
                              borderRadius: 8,
                              padding: "5px 12px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              fontFamily: "inherit",
                            }}
                          >
                            <IconKey /> Reset MDP
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal Reset Mot de Passe */}
      {resetModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(2px)",
          }}
          onClick={() => setResetModal(null)}
        >
          <div
            style={{
              background: theme.surface,
              borderRadius: 16,
              padding: 32,
              width: 440,
              maxWidth: "90vw",
              boxShadow: "0 16px 48px rgba(15,23,42,0.2)",
              border: `1px solid ${theme.border}`,
              fontFamily: theme.fontFamily,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: theme.text, margin: "0 0 6px", fontSize: 17, fontWeight: 800 }}>
              Réinitialiser le mot de passe
            </h2>
            <div style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 24 }}>
              Compte :{" "}
              <strong style={{ color: theme.primary }}>{resetModal.username}</strong>
              {" "}— {resetModal.prenom} {resetModal.nom}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{
                color: theme.textSecondary,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 6,
              }}>
                Nouveau mot de passe
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showResetMdp ? "text" : "password"}
                  value={resetForm.nouveau_mot_de_passe}
                  onChange={(e) => setResetForm({ ...resetForm, nouveau_mot_de_passe: e.target.value })}
                  className="input-focus"
                  style={{
                    width: "100%",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    padding: "10px 40px 10px 14px",
                    color: theme.text,
                    fontSize: 13,
                    outline: "none",
                    background: theme.bg,
                    boxSizing: "border-box",
                    fontFamily: theme.fontFamily,
                  }}
                  placeholder="••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowResetMdp(!showResetMdp)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: theme.textSecondary, padding: 0, display: "flex" }}
                >
                  <EyeIcon open={showResetMdp} />
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{
                color: theme.textSecondary,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 6,
              }}>
                Confirmer
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showResetConfirm ? "text" : "password"}
                  value={resetForm.confirmation}
                  onChange={(e) => setResetForm({ ...resetForm, confirmation: e.target.value })}
                  className="input-focus"
                  style={{
                    width: "100%",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    padding: "10px 40px 10px 14px",
                    color: theme.text,
                    fontSize: 13,
                    outline: "none",
                    background: theme.bg,
                    boxSizing: "border-box",
                    fontFamily: theme.fontFamily,
                  }}
                  placeholder="••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(!showResetConfirm)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: theme.textSecondary, padding: 0, display: "flex" }}
                >
                  <EyeIcon open={showResetConfirm} />
                </button>
              </div>
            </div>

            <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 24 }}>
              Minimum 10 caractères. Le compte sera déverrouillé automatiquement.
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setResetModal(null)}
                style={{
                  background: theme.surface,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.textSecondary,
                  borderRadius: 10,
                  padding: "9px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetting}
                style={{
                  background: resetting ? `${theme.warning}88` : theme.warning,
                  border: "none",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "9px 24px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: resetting ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {resetting ? "Réinitialisation..." : "Réinitialiser"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
