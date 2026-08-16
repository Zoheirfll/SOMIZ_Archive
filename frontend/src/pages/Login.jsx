import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../services/auth";
import { useAuth } from "../context/AuthContext";
import { theme } from "../styles/theme";
import { EyeIcon } from "../components/icons";
import useIsMobile from "../hooks/useIsMobile";
import "../styles/animations.css";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { loginSuccess } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const isMobile = useIsMobile();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await login(username, password);
      // Les tokens JWT sont dans les cookies httpOnly — on stocke uniquement les infos user
      sessionStorage.setItem("user", JSON.stringify(data.user));
      loginSuccess(data.user);
      navigate("/employees");
    } catch (err) {
      setError(err.response?.data?.error || "Identifiants incorrects.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    padding: "12px 14px",
    color: theme.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    background: theme.surface,
    fontFamily: theme.fontFamily,
    transition: "border-color 0.15s",
  };

  return (
    <div
      className="anim-fade-in"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        fontFamily: theme.fontFamily,
      }}
    >
      {/* Left panel — brand */}
      {!isMobile && (
      <div
        style={{
          width: "45%",
          background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 48,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative circles */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.04)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -60,
            left: -60,
            width: 240,
            height: 240,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.04)",
          }}
        />
        <div
          data-testid="hero-decor"
          style={{
            position: "absolute",
            top: -40,
            right: 40,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "rgba(251,191,36,0.12)",
          }}
        />

        {/* Logo mark */}
        <div
          style={{
            width: 80,
            height: 80,
            background: "rgba(255,255,255,0.12)",
            border: "2px solid rgba(255,255,255,0.25)",
            borderRadius: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>S</span>
        </div>

        <div
          style={{
            color: "#ffffff",
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: "-0.03em",
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          SOMIZ
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: 14,
            textAlign: "center",
            lineHeight: 1.6,
            maxWidth: 260,
          }}
        >
          Système d'Archivage des Dossiers des Ressources Humaines
        </div>

      </div>
      )}

      {/* Right panel — form */}
      <div
        style={{
          flex: 1,
          background: theme.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? "32px 20px" : 48,
        }}
      >
        <div
          className="anim-scale-in"
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 20,
            padding: isMobile ? "32px 24px" : "44px 40px",
            width: "100%",
            maxWidth: 400,
            boxShadow: theme.shadowMd,
          }}
        >
          <div style={{ marginBottom: 32 }}>
            <h1
              style={{
                color: theme.text,
                fontWeight: 800,
                fontSize: 22,
                margin: "0 0 6px",
                letterSpacing: "-0.02em",
              }}
            >
              Connexion
            </h1>
            <div style={{ color: theme.textSecondary, fontSize: 14 }}>
              Accès intranet SOMIZ uniquement
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Identifiant */}
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
                Identifiant
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-focus"
                style={inputStyle}
                placeholder="votre.identifiant"
              />
            </div>

            {/* Mot de passe */}
            <div style={{ marginBottom: 20 }}>
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
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-focus"
                  style={{ ...inputStyle, paddingRight: 44 }}
                  placeholder="••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    color: theme.textSecondary,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  <EyeIcon open={!showPassword} />
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  background: theme.dangerBg,
                  border: `1px solid ${theme.dangerBorder}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  color: theme.danger,
                  fontSize: 13,
                  marginBottom: 16,
                  fontWeight: 500,
                }}
              >
                {error}
              </div>
            )}

            {/* Remember me */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 20,
              }}
            >
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{
                  width: 15,
                  height: 15,
                  cursor: "pointer",
                  accentColor: theme.primary,
                }}
              />
              <label
                htmlFor="rememberMe"
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Se rappeler de moi
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background: loading ? `${theme.primary}88` : theme.primary,
                border: "none",
                borderRadius: 10,
                padding: "13px",
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: theme.fontFamily,
                letterSpacing: "-0.01em",
                boxShadow: loading ? "none" : `0 2px 8px ${theme.primary}33`,
                transition: "background 0.15s, box-shadow 0.15s",
              }}
            >
              {loading ? "Connexion en cours..." : "Se connecter"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
