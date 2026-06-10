import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";

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
      setForm({
        ancien_mot_de_passe: "",
        nouveau_mot_de_passe: "",
        confirmation: "",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.error || "Erreur.",
      });
    } finally {
      setLoading(false);
    }
  };

  const PasswordField = ({ label, name, show, onToggle }) => (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          color: theme.text,
          fontSize: 13,
          fontWeight: 600,
          display: "block",
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          name={name}
          value={form[name]}
          onChange={handleChange}
          style={{
            width: "100%",
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 8,
            padding: "10px 40px 10px 14px",
            color: theme.text,
            fontSize: 14,
            outline: "none",
            background: theme.bg,
            boxSizing: "border-box",
          }}
          placeholder="••••••••••"
        />
        <button
          type="button"
          onClick={onToggle}
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            color: theme.textSecondary,
            padding: 0,
          }}
        >
          {show ? "🙈" : "👁️"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      <Navbar />
      <div className="anim-fade-in" style={{ padding: "32px", maxWidth: 600, margin: "0 auto" }}>
        <button
          onClick={() => navigate(-1)}
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

        {/* Infos profil */}
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 12,
            padding: 24,
            marginBottom: 20,
            boxShadow: theme.shadow,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: theme.primaryBg,
                border: `2px solid ${theme.primaryBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: theme.primary,
                fontWeight: 800,
                fontSize: 20,
              }}
            >
              {user?.prenom?.[0]}
              {user?.nom?.[0]}
            </div>
            <div>
              <div style={{ color: theme.text, fontWeight: 800, fontSize: 18 }}>
                {user?.prenom} {user?.nom}
              </div>
              <div style={{ color: theme.textSecondary, fontSize: 13 }}>
                {user?.username}
              </div>
              <span
                style={{
                  background:
                    user?.role === "ADMIN" ? theme.dangerBg : theme.primaryBg,
                  color: user?.role === "ADMIN" ? theme.danger : theme.primary,
                  border: `1px solid ${user?.role === "ADMIN" ? theme.dangerBorder : theme.primaryBorder}`,
                  borderRadius: 6,
                  padding: "2px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* Changer mot de passe */}
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 12,
            padding: 24,
            boxShadow: theme.shadow,
          }}
        >
          <h2
            style={{
              color: theme.text,
              margin: "0 0 20px",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            Changer le mot de passe
          </h2>

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
                marginBottom: 16,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
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

            <div
              style={{ color: theme.textMuted, fontSize: 12, marginBottom: 16 }}
            >
              Minimum 10 caractères.
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background: loading ? `${theme.primary}88` : theme.primary,
                border: "none",
                color: "#fff",
                borderRadius: 8,
                padding: "11px",
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: `0 2px 8px ${theme.primary}44`,
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
