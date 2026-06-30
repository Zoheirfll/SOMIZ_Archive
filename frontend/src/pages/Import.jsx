import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";

const Import = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) setFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await api.post("/employees/import/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(response.data);
    } catch (err) {
      setResult({
        error: err.response?.data?.error || "Erreur lors de l'import.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get("/employees/import/template/", {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "template_import_employes.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const cardStyle = {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 16,
    padding: 24,
    boxShadow: theme.shadowMd,
  };

  return (
    <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: theme.fontFamily }}>
      <Navbar />

      {/* Hero header */}
      <div
        style={{
          background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
          padding: "32px 32px 36px",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1
              style={{
                color: "#FFFFFF",
                margin: 0,
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              Import CSV
            </h1>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 }}>
              Importez vos employés en masse depuis un fichier CSV
            </div>
          </div>
          <button
            onClick={handleDownloadTemplate}
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#ffffff",
              borderRadius: 10,
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: theme.fontFamily,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
          >
            Telecharger le template
          </button>
        </div>
      </div>

      <div className="anim-fade-in" style={{ padding: "32px", maxWidth: 900, margin: "0 auto" }}>

        {/* Instructions card */}
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div
            style={{
              color: theme.text,
              fontWeight: 700,
              fontSize: 14,
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 4,
                height: 16,
                background: theme.primary,
                borderRadius: 2,
              }}
            />
            Format du fichier CSV
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
          >
            <div>
              <div
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 10,
                }}
              >
                Colonnes{" "}
                <span style={{ color: theme.danger }}>obligatoires</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["matricule", "numero_contrat", "nom", "prenom"].map((c) => (
                  <div
                    key={c}
                    style={{
                      background: theme.dangerBg,
                      color: theme.danger,
                      border: `1px solid ${theme.dangerBorder}`,
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "monospace",
                    }}
                  >
                    {c}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 10,
                }}
              >
                Colonnes{" "}
                <span style={{ color: theme.primary }}>optionnelles</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[
                  "date_naissance",
                  "date_embauche",
                  "statut",
                  "direction",
                  "departement",
                  "service",
                  "poste",
                  "type_contrat",
                  "categorie",
                ].map((c) => (
                  <div
                    key={c}
                    style={{
                      background: theme.primaryBg,
                      color: theme.primary,
                      border: `1px solid ${theme.primaryBorder}`,
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontFamily: "monospace",
                    }}
                  >
                    {c}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 16,
              color: theme.textMuted,
              fontSize: 12,
              padding: "10px 14px",
              background: theme.bg,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}
          >
            Les dates doivent être au format <strong>YYYY-MM-DD</strong> (ex:
            2002-03-22). Les colonnes direction/département/service/poste sont
            liées par leur <strong>nom exact</strong> tel que configuré dans
            Paramètres.
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("csv-input").click()}
          style={{
            background: dragOver ? theme.primaryBg : theme.surface,
            border: `2px dashed ${dragOver ? theme.primary : theme.border}`,
            borderRadius: 16,
            padding: "56px 40px",
            textAlign: "center",
            marginBottom: 20,
            transition: "all 0.2s",
            cursor: "pointer",
            boxShadow: dragOver ? `0 0 0 4px ${theme.primaryBg}` : theme.shadowMd,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              background: dragOver ? theme.primary : theme.bg,
              border: `2px solid ${dragOver ? theme.primary : theme.border}`,
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              margin: "0 auto 16px",
              transition: "all 0.2s",
            }}
          >
            {file ? "✓" : "📂"}
          </div>

          {file ? (
            <div>
              <div
                style={{ color: theme.primary, fontWeight: 700, fontSize: 16 }}
              >
                {file.name}
              </div>
              <div
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  marginTop: 6,
                }}
              >
                {(file.size / 1024).toFixed(1)} Ko — Cliquez pour changer le fichier
              </div>
            </div>
          ) : (
            <div>
              <div style={{ color: theme.text, fontWeight: 700, fontSize: 16 }}>
                Glissez votre fichier CSV ici
              </div>
              <div
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  marginTop: 6,
                }}
              >
                ou{" "}
                <span style={{ color: theme.primary, fontWeight: 600 }}>
                  cliquez pour parcourir
                </span>
              </div>
              <div
                style={{
                  color: theme.textMuted,
                  fontSize: 12,
                  marginTop: 8,
                }}
              >
                Format accepté : .csv uniquement
              </div>
            </div>
          )}
          <input
            id="csv-input"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </div>

        {/* Import button */}
        <button
          onClick={handleImport}
          disabled={!file || loading}
          style={{
            width: "100%",
            background: !file || loading ? `${theme.primary}66` : theme.primary,
            border: "none",
            color: "#fff",
            borderRadius: 12,
            padding: "15px",
            fontSize: 15,
            fontWeight: 700,
            cursor: !file || loading ? "not-allowed" : "pointer",
            fontFamily: theme.fontFamily,
            letterSpacing: "-0.01em",
            boxShadow: !file || loading ? "none" : `0 2px 8px ${theme.primary}33`,
            marginBottom: 28,
            transition: "background 0.15s",
          }}
        >
          {loading ? "Import en cours..." : "Lancer l'import"}
        </button>

        {/* Results */}
        {result && (
          <div>
            {result.error ? (
              <div
                style={{
                  background: theme.dangerBg,
                  border: `1px solid ${theme.dangerBorder}`,
                  borderRadius: 16,
                  padding: 24,
                  color: theme.danger,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {result.error}
              </div>
            ) : (
              <>
                {/* Summary stats */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 16,
                    marginBottom: 20,
                  }}
                >
                  {[
                    {
                      label: "Lignes traitées",
                      value: result.nb_lignes,
                      color: theme.textSecondary,
                      bg: theme.bg,
                    },
                    {
                      label: "Employés créés",
                      value: result.nb_crees,
                      color: theme.primary,
                      bg: theme.primaryBg,
                    },
                    {
                      label: "Erreurs",
                      value: result.nb_erreurs,
                      color: result.nb_erreurs > 0 ? theme.danger : theme.primary,
                      bg: result.nb_erreurs > 0 ? theme.dangerBg : theme.primaryBg,
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      style={{
                        background: theme.surface,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 16,
                        padding: "20px 24px",
                        textAlign: "center",
                        boxShadow: theme.shadowMd,
                        borderTop: `3px solid ${s.color}`,
                      }}
                    >
                      <div
                        style={{
                          color: s.color,
                          fontSize: 32,
                          fontWeight: 800,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {s.value}
                      </div>
                      <div
                        style={{
                          color: theme.textSecondary,
                          fontSize: 12,
                          fontWeight: 600,
                          marginTop: 4,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Error details */}
                {result.nb_erreurs > 0 && (
                  <div
                    style={{
                      background: theme.surface,
                      border: `1px solid ${theme.dangerBorder}`,
                      borderRadius: 16,
                      overflow: "hidden",
                      marginBottom: 20,
                      boxShadow: theme.shadowMd,
                    }}
                  >
                    <div
                      style={{
                        padding: "14px 20px",
                        background: theme.dangerBg,
                        color: theme.danger,
                        fontWeight: 700,
                        fontSize: 13,
                        borderBottom: `1px solid ${theme.dangerBorder}`,
                      }}
                    >
                      {result.nb_erreurs} erreur(s) — ces lignes n'ont pas été importées
                    </div>
                    <table
                      style={{ width: "100%", borderCollapse: "collapse" }}
                    >
                      <thead>
                        <tr style={{ background: "#FFF5F5" }}>
                          {["Ligne", "Matricule", "Erreur(s)"].map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "10px 20px",
                                textAlign: "left",
                                color: theme.danger,
                                fontSize: 12,
                                fontWeight: 700,
                                borderBottom: `1px solid ${theme.dangerBorder}`,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.erreurs.map((err, i) => (
                          <tr
                            key={i}
                            style={{ borderBottom: `1px solid #FFE0E0` }}
                          >
                            <td
                              style={{
                                padding: "10px 20px",
                                color: theme.textSecondary,
                                fontSize: 13,
                              }}
                            >
                              {err.ligne}
                            </td>
                            <td
                              style={{
                                padding: "10px 20px",
                                color: theme.text,
                                fontFamily: "monospace",
                                fontSize: 13,
                              }}
                            >
                              {err.matricule}
                            </td>
                            <td
                              style={{
                                padding: "10px 20px",
                                color: theme.danger,
                                fontSize: 13,
                              }}
                            >
                              {err.erreurs.join(" · ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Success table */}
                {result.nb_crees > 0 && (
                  <div
                    style={{
                      background: theme.surface,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 16,
                      overflow: "hidden",
                      boxShadow: theme.shadowMd,
                    }}
                  >
                    <div
                      style={{
                        padding: "14px 20px",
                        background: theme.primaryBg,
                        color: theme.primary,
                        fontWeight: 700,
                        fontSize: 13,
                        borderBottom: `1px solid ${theme.primaryBorder}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>
                        {result.nb_crees} employe(s) importe(s) avec succes
                      </span>
                      <button
                        onClick={() => navigate("/employees")}
                        style={{
                          background: theme.primary,
                          border: "none",
                          color: "#fff",
                          borderRadius: 8,
                          padding: "7px 16px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: theme.fontFamily,
                        }}
                      >
                        Voir la liste
                      </button>
                    </div>
                    {result.succes?.length > 0 && (
                      <table
                        style={{ width: "100%", borderCollapse: "collapse" }}
                      >
                        <thead>
                          <tr style={{ background: theme.bg }}>
                            {["Ligne", "Matricule", "Nom & Prenom"].map((h) => (
                              <th
                                key={h}
                                style={{
                                  padding: "10px 20px",
                                  textAlign: "left",
                                  color: theme.textSecondary,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  borderBottom: `1px solid ${theme.border}`,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.succes.map((s, i) => (
                            <tr
                              key={i}
                              style={{
                                borderBottom: `1px solid ${theme.border}`,
                              }}
                            >
                              <td
                                style={{
                                  padding: "10px 20px",
                                  color: theme.textSecondary,
                                  fontSize: 13,
                                }}
                              >
                                {s.ligne}
                              </td>
                              <td
                                style={{
                                  padding: "10px 20px",
                                  color: theme.primary,
                                  fontFamily: "monospace",
                                  fontSize: 13,
                                  fontWeight: 600,
                                }}
                              >
                                {s.matricule}
                              </td>
                              <td
                                style={{
                                  padding: "10px 20px",
                                  color: theme.text,
                                  fontSize: 13,
                                }}
                              >
                                {s.nom}
                              </td>
                            </tr>
                          ))}
                          {result.nb_crees > 10 && (
                            <tr>
                              <td
                                colSpan={3}
                                style={{
                                  padding: "12px 20px",
                                  color: theme.textMuted,
                                  fontSize: 12,
                                  textAlign: "center",
                                  fontStyle: "italic",
                                  background: theme.bg,
                                }}
                              >
                                ... et {result.nb_crees - 10} autre(s) employe(s)
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Import;
