import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../services/api";
import { logout } from "../services/auth";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import { useTheme } from "../context/ThemeContext";
import useIsMobile from "../hooks/useIsMobile";

const Consentement = () => {
  const theme = useTheme();
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
          Engagement de confidentialité et protection des données
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
            SOMIZ vous donne accès, dans le cadre de vos fonctions, à des données
            personnelles concernant <strong>d'autres employés</strong> de l'organisme
            (identité, documents administratifs, données de contrat) — par exemple les
            membres de votre équipe, de votre département ou service, ou, selon votre
            rôle, certains types de documents pour l'ensemble du personnel (cas d'un
            gestionnaire de la sécurité sociale, par exemple). Conformément à la Loi
            n°18-07 du 10 juin 2018 relative à la protection des personnes physiques
            dans le traitement des données à caractère personnel, cet accès s'accompagne
            d'obligations qui vous engagent personnellement.
          </p>
          <p>
            <strong>Responsable du traitement :</strong> votre organisme employeur, via
            l'application SOMIZ (Système d'Archivage des Dossiers RH).
          </p>
          <p>
            <strong>Finalités autorisées :</strong> vous ne devez consulter, utiliser ou
            traiter les données auxquelles vous accédez que pour la gestion administrative
            du dossier RH des employés relevant de votre périmètre, jamais à d'autres fins
            personnelles ou étrangères à vos fonctions.
          </p>
          <p>
            <strong>Confidentialité :</strong> vous vous engagez à ne pas divulguer, copier,
            exporter ou communiquer à des tiers non autorisés les données personnelles
            d'autrui consultées via SOMIZ, y compris après la fin de vos fonctions ou de
            votre contrat.
          </p>
          <p>
            <strong>Traçabilité :</strong> chaque consultation, modification ou suppression
            effectuée dans SOMIZ est journalisée et associée à votre compte ; cette
            traçabilité peut être utilisée pour vérifier le respect du présent engagement.
          </p>
          <p>
            <strong>Vos propres données :</strong> comme tout employé, vous disposez
            également d'un droit d'accès, de rectification et d'opposition sur vos
            propres données, à exercer auprès du service des ressources humaines de
            votre organisme.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Durée de conservation :</strong> les données consultées sont conservées
            selon les règles internes de l'organisme et les délais légaux applicables ; tout
            manquement au présent engagement peut engager votre responsabilité conformément
            à la Loi 18-07 et au règlement intérieur.
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
          J'ai lu et je m'engage à respecter les obligations de confidentialité et de
          protection des données personnelles d'autrui rappelées ci-dessus, conformément
          à la Loi 18-07.
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
