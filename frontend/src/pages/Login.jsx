import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../services/auth";
import { useAuth } from "../context/AuthContext";
import { theme } from "../styles/theme";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { loginSuccess } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await login(username, password);
      loginSuccess(data.user);
      navigate("/employees");
    } catch (err) {
      setError(err.response?.data?.error || "Identifiants incorrects.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Décoration fond */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${theme.primary}, ${theme.primaryLight})`,
        }}
      />

      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.primaryBorder}`,
          borderRadius: 16,
          padding: "48px 48px",
          width: 420,
          boxShadow: theme.shadowMd,
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              background: theme.primary,
              borderRadius: 16,
              width: 64,
              height: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 900,
              color: "#fff",
              margin: "0 auto 16px",
              boxShadow: `0 4px 16px ${theme.primary}44`,
            }}
          >
            S
          </div>
          <div style={{ color: theme.text, fontWeight: 800, fontSize: 22 }}>
            SOMIZ
          </div>
          <div
            style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}
          >
            Système d'Archivage des Dossiers RH
          </div>
        </div>

        <form onSubmit={handleSubmit}>
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
              Identifiant
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                width: "100%",
                border: `1px solid ${theme.primaryBorder}`,
                borderRadius: 8,
                padding: "10px 14px",
                color: theme.text,
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                background: theme.bg,
                transition: "border 0.15s",
              }}
              placeholder="votre.identifiant"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                color: theme.text,
                fontSize: 13,
                fontWeight: 600,
                display: "block",
                marginBottom: 6,
              }}
            >
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                border: `1px solid ${theme.primaryBorder}`,
                borderRadius: 8,
                padding: "10px 14px",
                color: theme.text,
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                background: theme.bg,
              }}
              placeholder="••••••••••"
            />
          </div>

          {error && (
            <div
              style={{
                background: theme.dangerBg,
                border: `1px solid ${theme.dangerBorder}`,
                borderRadius: 8,
                padding: "10px 14px",
                color: theme.danger,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: loading ? `${theme.primary}88` : theme.primary,
              border: "none",
              borderRadius: 8,
              padding: "12px",
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: `0 2px 8px ${theme.primary}44`,
              transition: "all 0.2s",
            }}
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <div
          style={{
            textAlign: "center",
            marginTop: 24,
            color: theme.textMuted,
            fontSize: 12,
          }}
        >
          Accès intranet SOMIZ uniquement
        </div>
      </div>
    </div>
  );
};

export default Login;
