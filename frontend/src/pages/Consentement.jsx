import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../services/api";
import { logout } from "../services/auth";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import { theme } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";

const Consentement = () => {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { logoutSuccess, refreshUser } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();
  const isMobile = useIsMobile();

  const handleAccept = async () => {
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/consent/");
      if (refreshUser) await refreshUser();
      const redirectTo = location.state?.from || "/employees";
      navigate(redirectTo, { replace: true });
    } catch {
      setError("Une erreur est survenue, merci de réessayer.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefuse = async () => {
    if (!(await confirm("Refuser entraînera votre déconnexion, continuer ?"))) return;
    await logout();
    logoutSuccess && logoutSuccess();
    navigate("/login", { replace: true });
  };

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, fontFamily: theme.fontFamily }}>
      <div
        style={{
          background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
          padding: isMobile ? "28px 20px 24px" : "40px 32px 32px",
        }}
      >
        <h1 style={{ color: "#fff", fontWeight: 800, fontSize: 24, margin: 0, letterSpacing: "-0.02em" }}>
          Protection de vos données personnelles
        </h1>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 6 }}>
          Loi n°18-07 du 10 juin 2018 (Algérie)
        </div>
      </div>

      <div style={{ padding: isMobile ? "20px" : "32px", maxWidth: 720, margin: "0 auto" }}>
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 16,
            padding: isMobile ? 20 : 28,
            boxShadow: theme.shadowMd,
            color: theme.text,
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          <p>
            Conformément à la Loi n°18-07 du 10 juin 2018 relative à la protection des
            personnes physiques dans le traitement des données à caractère personnel,
            nous vous informons des éléments suivants avant tout accès à votre compte SOMIZ.
          </p>
          <p>
            <strong>Responsable du traitement :</strong> votre organisme employeur, via
            l'application SOMIZ (Système d'Archivage des Dossiers RH).
          </p>
          <p>
            <strong>Finalités :</strong> gestion administrative de votre dossier des
            ressources humaines (archivage de documents, contrats, informations relatives
            à votre situation professionnelle).
          </p>
          <p>
            <strong>Données concernées :</strong> vos données d'identité, vos documents
            administratifs et les données relatives à votre contrat de travail.
          </p>
          <p>
            <strong>Vos droits :</strong> vous disposez d'un droit d'accès, de rectification
            et d'opposition sur vos données, à exercer auprès du service des ressources
            humaines de votre organisme.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Durée de conservation :</strong> vos données sont conservées pendant
            la durée de votre relation contractuelle, puis selon les délais légaux
            applicables.
          </p>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            marginTop: 20,
            cursor: "pointer",
            fontSize: 14,
            color: theme.text,
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: 3, width: 16, height: 16, cursor: "pointer", accentColor: theme.primary }}
          />
          J'ai lu et j'accepte le traitement de mes données personnelles conformément à la
          Loi 18-07.
        </label>

        {error && (
          <div
            style={{
              background: theme.dangerBg,
              border: `1px solid ${theme.dangerBorder}`,
              borderRadius: 10,
              padding: "10px 14px",
              color: theme.danger,
              fontSize: 13,
              marginTop: 14,
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleAccept}
            disabled={!checked || loading}
            style={{
              background: !checked || loading ? `${theme.primary}88` : theme.primary,
              border: "none",
              borderRadius: 10,
              padding: "12px 22px",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: !checked || loading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {loading ? "Enregistrement..." : "J'accepte"}
          </button>
          <button
            type="button"
            onClick={handleRefuse}
            style={{
              background: "transparent",
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: "12px 22px",
              color: theme.textSecondary,
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Refuser
          </button>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
};

export default Consentement;
