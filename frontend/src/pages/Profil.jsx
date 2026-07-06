import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import HeroDecor from "../components/HeroDecor";
import "../styles/animations.css";

// SVG icons
const IconChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const IconShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
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

const Profil = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    ancien_mot_de_passe: "",
    nouveau_mot_de_passe: "",
    confirmation: "",
  });
  const [showAncien, setShowAncien] = useState(false);
  const [showNouveau, setShowNouveau] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.post("/auth/change-password/", form);
      setMessage({ type: "success", text: response.data.message });
      setForm({ ancien_mot_de_passe: "", nouveau_mot_de_passe: "", confirmation: "" });
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Erreur." });
    } finally {
      setLoading(false);
    }
  };

  const initials = `${user?.prenom?.[0] ?? ""}${user?.nom?.[0] ?? ""}`.toUpperCase();

  const PasswordField = ({ label, name, show, onToggle }) => (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        color: theme.textSecondary,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        display: "block",
        marginBottom: 6,
      }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          name={name}
          value={form[name]}
          onChange={handleChange}
          className="input-focus"
          style={{
            width: "100%",
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: "11px 42px 11px 14px",
            color: theme.text,
            fontSize: 14,
            outline: "none",
            background: theme.bg,
            boxSizing: "border-box",
            fontFamily: theme.fontFamily,
          }}
          placeholder="••••••••••"
        />
        <button
          type="button"
          aria-label="Afficher/masquer le mot de passe"
          onClick={onToggle}
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: theme.textSecondary,
            padding: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: theme.fontFamily }}>
      <Navbar />

      {/* Hero header */}
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: "32px 32px 36px", position: "relative", overflow: "hidden" }}>
        <HeroDecor />
        <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
              Mon profil
            </h1>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 }}>
              Gérer vos informations et votre mot de passe
            </div>
          </div>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1.5px solid rgba(255,255,255,0.25)",
              color: "rgba(255,255,255,0.85)",
              padding: "8px 16px",
              borderRadius: 10,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "inherit",
            }}
          >
            <IconChevronLeft /> Retour
          </button>
        </div>
      </div>

      <div className="anim-fade-in" style={{ padding: "32px", maxWidth: 680, margin: "0 auto" }}>

        {/* Carte profil */}
        <div style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          padding: 28,
          marginBottom: 20,
          boxShadow: theme.shadowMd,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* Avatar cercle avec initiales */}
            <div style={{
              width: 68,
              height: 68,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #14532d, #166534)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 22,
              letterSpacing: "-0.02em",
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(22,101,52,0.35)",
            }}>
              {initials || "?"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: theme.text, fontWeight: 800, fontSize: 20, marginBottom: 2 }}>
                {user?.prenom} {user?.nom}
              </div>
              <div style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 8, fontFamily: "monospace" }}>
                @{user?.username}
              </div>
              <span style={{
                background: user?.role === "ADMIN" ? theme.dangerBg : theme.primaryBg,
                color: user?.role === "ADMIN" ? theme.danger : theme.primary,
                border: `1px solid ${user?.role === "ADMIN" ? theme.dangerBorder : theme.primaryBorder}`,
                borderRadius: 20,
                padding: "3px 12px",
                fontSize: 12,
                fontWeight: 600,
              }}>
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* Changer mot de passe */}
        <div style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          padding: 28,
          boxShadow: theme.shadowMd,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: theme.primaryBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme.primary,
            }}>
              <IconShield />
            </div>
            <h2 style={{ color: theme.text, margin: 0, fontSize: 16, fontWeight: 700 }}>
              Changer le mot de passe
            </h2>
          </div>

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

          <form onSubmit={handleSubmit}>
            <PasswordField
              label="Ancien mot de passe"
              name="ancien_mot_de_passe"
              show={showAncien}
              onToggle={() => setShowAncien(!showAncien)}
            />
            <PasswordField
              label="Nouveau mot de passe"
              name="nouveau_mot_de_passe"
              show={showNouveau}
              onToggle={() => setShowNouveau(!showNouveau)}
            />
            <PasswordField
              label="Confirmer le nouveau mot de passe"
              name="confirmation"
              show={showConfirmation}
              onToggle={() => setShowConfirmation(!showConfirmation)}
            />

            <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 20 }}>
              Minimum 10 caractères.
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background: loading
                  ? `${theme.primary}88`
                  : "linear-gradient(135deg, #14532d, #166534)",
                border: "none",
                color: "#fff",
                borderRadius: 10,
                padding: "12px",
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 4px 12px rgba(22,101,52,0.3)",
                fontFamily: "inherit",
                letterSpacing: "0.01em",
              }}
            >
              {loading ? "Enregistrement..." : "Modifier le mot de passe"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profil;
