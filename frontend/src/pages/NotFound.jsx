import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import PageBackground from "../components/PageBackground";
import useIsMobile from "../hooks/useIsMobile";
import usePageTitle from "../hooks/usePageTitle";

// Route inconnue — remplace l'ancienne redirection silencieuse vers
// /login (peu claire pour un utilisateur déjà connecté qui a mal tapé une
// URL ou suivi un lien cassé). Ne fuite aucune information sur les routes
// existantes, juste un renvoi vers un point d'entrée connu selon l'état
// de connexion.
const NotFound = () => {
  usePageTitle("Page introuvable");
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily, minHeight: "100vh" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? 20 : 32,
        }}
      >
        <div
          style={{
            background: theme.surface,
            borderRadius: 16,
            boxShadow: theme.shadowMd,
            padding: isMobile ? "32px 24px" : "48px 56px",
            maxWidth: 440,
            width: "100%",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 56, fontWeight: 800, color: theme.primary, lineHeight: 1 }}>
            404
          </div>
          <h1 style={{ color: theme.text, fontSize: 20, fontWeight: 700, margin: "16px 0 8px" }}>
            Page introuvable
          </h1>
          <p style={{ color: theme.textSecondary, fontSize: 14, margin: "0 0 28px" }}>
            Cette page n'existe pas ou a été déplacée.
          </p>
          <button
            className="btn-lift"
            onClick={() => navigate(user ? "/employees" : "/login")}
            style={{
              background: theme.primary,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: theme.fontFamily,
            }}
          >
            {user ? "Retour à l'accueil" : "Retour à la connexion"}
          </button>
        </div>
      </div>
    </PageBackground>
  );
};

export default NotFound;
