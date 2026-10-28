import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { logout } from "../services/auth";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import usePageTitle from "../hooks/usePageTitle";

// Écran bloquant affiché tant que le mot de passe temporaire (compte créé par
// validation d'une proposition, voir accounts/propositions.py) n'a pas été
// remplacé : l'API refuse toute autre route (cookie_auth.py).
const ChangementMotDePasse = () => {
  usePageTitle("Nouveau mot de passe");
  const theme = useTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { logoutSuccess, refreshUser } = useAuth();
  const [form, setForm] = useState({ ancien_mot_de_passe: "", nouveau_mot_de_passe: "", confirmation: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/change-password/", form);
      if (refreshUser) await refreshUser();
      navigate("/employees", { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || "Une erreur est survenue, merci de réessayer.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    logoutSuccess && logoutSuccess();
    navigate("/login", { replace: true });
  };

  const labelStyle = {
    display: "block", marginBottom: 6, fontSize: 11, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.06em", color: theme.textSecondary,
  };
  const inputStyle = {
    width: "100%", boxSizing: "border-box", marginBottom: 16, padding: "12px 14px", fontSize: 14,
    border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.surface, color: theme.text,
    fontFamily: theme.fontFamily,
  };

  return (
    <div
      style={{
        minHeight: "100vh", background: theme.bg, fontFamily: theme.fontFamily,
        display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? 16 : 32,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%", maxWidth: 440, background: theme.surface, border: `1px solid ${theme.border}`,
          borderRadius: theme.cardRadius, padding: isMobile ? 20 : 32, boxShadow: theme.shadowMd,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: theme.text }}>Choisissez votre mot de passe</h1>
        <p style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 1.6, margin: "8px 0 20px" }}>
          Votre compte vient d'être créé avec un mot de passe temporaire. Vous devez le remplacer par un mot de
          passe personnel avant d'utiliser SOMIZ.
        </p>

        <label style={labelStyle} htmlFor="ancien_mot_de_passe">Mot de passe temporaire</label>
        <input
          id="ancien_mot_de_passe" name="ancien_mot_de_passe" type="password" autoComplete="current-password"
          value={form.ancien_mot_de_passe} onChange={handleChange} className="input-focus" style={inputStyle} required
        />
        <label style={labelStyle} htmlFor="nouveau_mot_de_passe">Nouveau mot de passe</label>
        <input
          id="nouveau_mot_de_passe" name="nouveau_mot_de_passe" type="password" autoComplete="new-password"
          value={form.nouveau_mot_de_passe} onChange={handleChange} className="input-focus" style={inputStyle} required
        />
        <label style={labelStyle} htmlFor="confirmation">Confirmer le nouveau mot de passe</label>
        <input
          id="confirmation" name="confirmation" type="password" autoComplete="new-password"
          value={form.confirmation} onChange={handleChange} className="input-focus" style={inputStyle} required
        />

        {error && (
          <div
            role="alert"
            style={{
              background: theme.dangerBg, border: `1px solid ${theme.dangerBorder}`, color: theme.danger,
              borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit" disabled={loading}
          style={{
            width: "100%", padding: "12px 16px", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700,
            background: theme.primary, color: theme.surface, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Enregistrement…" : "Enregistrer mon mot de passe"}
        </button>
        <button
          type="button" onClick={handleLogout}
          style={{
            width: "100%", marginTop: 10, padding: "10px 16px", background: "none", border: "none",
            color: theme.textSecondary, fontSize: 13, cursor: "pointer",
          }}
        >
          Se déconnecter
        </button>
      </form>
    </div>
  );
};

export default ChangementMotDePasse;
