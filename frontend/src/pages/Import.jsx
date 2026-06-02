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

  return (
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      <Navbar />
      <div style={{ padding: "32px", maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                color: theme.text,
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              Import CSV
            </h1>
            <div
              style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}
            >
              Importez vos employés en masse depuis un fichier CSV
            </div>
          </div>
          <button
            onClick={handleDownloadTemplate}
            style={{
              background: theme.primaryBg,
              border: `1px solid ${theme.primaryBorder}`,
              color: theme.primary,
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            📥 Télécharger le template
          </button>
        </div>

        {/* Instructions */}
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
            boxShadow: theme.shadow,
          }}
        >
          <div
            style={{
              color: theme.text,
              fontWeight: 700,
              fontSize: 14,
              marginBottom: 12,
            }}
          >
            Format du fichier CSV
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            <div>
              <div
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  marginBottom: 8,
                }}
              >
                Colonnes{" "}
                <span style={{ color: theme.danger, fontWeight: 700 }}>
                  obligatoires
                </span>
              </div>
              {["matricule", "nom", "prenom"].map((c) => (
                <div
                  key={c}
                  style={{
                    display: "inline-block",
                    margin: "0 6px 6px 0",
                    background: theme.dangerBg,
                    color: theme.danger,
                    border: `1px solid ${theme.dangerBorder}`,
                    borderRadius: 6,
                    padding: "3px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "monospace",
                  }}
                >
                  {c}
                </div>
              ))}
            </div>
            <div>
              <div
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  marginBottom: 8,
                }}
              >
                Colonnes{" "}
                <span style={{ color: theme.primary, fontWeight: 700 }}>
                  optionnelles
                </span>
              </div>
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
                    display: "inline-block",
                    margin: "0 6px 6px 0",
                    background: theme.primaryBg,
                    color: theme.primary,
                    border: `1px solid ${theme.primaryBorder}`,
                    borderRadius: 6,
                    padding: "3px 10px",
                    fontSize: 12,
                    fontFamily: "monospace",
                  }}
                >
                  {c}
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12, color: theme.textMuted, fontSize: 12 }}>
            Les dates doivent être au format <strong>YYYY-MM-DD</strong> (ex:
            2002-03-22). Les colonnes direction/département/service/poste sont
            liées par leur <strong>nom exact</strong> tel que configuré dans
            Paramètres.
          </div>
        </div>

        {/* Zone de dépôt */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            background: dragOver ? theme.primaryBg : theme.surface,
            border: `2px dashed ${dragOver ? theme.primary : theme.primaryBorder}`,
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            marginBottom: 20,
            transition: "all 0.2s",
            cursor: "pointer",
            boxShadow: theme.shadow,
          }}
          onClick={() => document.getElementById("csv-input").click()}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
          {file ? (
            <div>
              <div
                style={{ color: theme.primary, fontWeight: 700, fontSize: 15 }}
              >
                ✓ {file.name}
              </div>
              <div
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                {(file.size / 1024).toFixed(1)} Ko — Cliquez pour changer
              </div>
            </div>
          ) : (
            <div>
              <div style={{ color: theme.text, fontWeight: 600, fontSize: 15 }}>
                Glissez votre fichier CSV ici
              </div>
              <div
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                ou cliquez pour parcourir
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

        {/* Bouton import */}
        <button
          onClick={handleImport}
          disabled={!file || loading}
          style={{
            width: "100%",
            background: !file || loading ? `${theme.primary}88` : theme.primary,
            border: "none",
            color: "#fff",
            borderRadius: 10,
            padding: "14px",
            fontSize: 15,
            fontWeight: 700,
            cursor: !file || loading ? "not-allowed" : "pointer",
            boxShadow: `0 2px 8px ${theme.primary}44`,
            marginBottom: 24,
          }}
        >
          {loading ? "Import en cours..." : "🚀 Lancer l'import"}
        </button>

        {/* Résultats */}
        {result && (
          <div>
            {result.error ? (
              <div
                style={{
                  background: theme.dangerBg,
                  border: `1px solid ${theme.dangerBorder}`,
                  borderRadius: 12,
                  padding: 20,
                  color: theme.danger,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                ❌ {result.error}
              </div>
            ) : (
              <>
                {/* Résumé */}
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
                    },
                    {
                      label: "Employés créés",
                      value: result.nb_crees,
                      color: theme.primary,
                    },
                    {
                      label: "Erreurs",
                      value: result.nb_erreurs,
                      color:
                        result.nb_erreurs > 0 ? theme.danger : theme.primary,
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      style={{
                        background: theme.surface,
                        border: `1px solid ${theme.primaryBorder}`,
                        borderRadius: 12,
                        padding: "16px 20px",
                        textAlign: "center",
                        boxShadow: theme.shadow,
                        borderTop: `3px solid ${s.color}`,
                      }}
                    >
                      <div
                        style={{
                          color: s.color,
                          fontSize: 28,
                          fontWeight: 800,
                        }}
                      >
                        {s.value}
                      </div>
                      <div
                        style={{
                          color: theme.textSecondary,
                          fontSize: 12,
                          marginTop: 4,
                        }}
                      >
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Erreurs détaillées */}
                {result.nb_erreurs > 0 && (
                  <div
                    style={{
                      background: theme.surface,
                      border: `1px solid ${theme.dangerBorder}`,
                      borderRadius: 12,
                      overflow: "hidden",
                      marginBottom: 20,
                      boxShadow: theme.shadow,
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 16px",
                        background: theme.dangerBg,
                        color: theme.danger,
                        fontWeight: 700,
                        fontSize: 13,
                        borderBottom: `1px solid ${theme.dangerBorder}`,
                      }}
                    >
                      ❌ {result.nb_erreurs} erreur(s) — ces lignes n'ont pas
                      été importées
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
                                padding: "10px 16px",
                                textAlign: "left",
                                color: theme.danger,
                                fontSize: 12,
                                fontWeight: 700,
                                borderBottom: `1px solid ${theme.dangerBorder}`,
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
                                padding: "10px 16px",
                                color: theme.textSecondary,
                                fontSize: 13,
                              }}
                            >
                              {err.ligne}
                            </td>
                            <td
                              style={{
                                padding: "10px 16px",
                                color: theme.text,
                                fontFamily: "monospace",
                                fontSize: 13,
                              }}
                            >
                              {err.matricule}
                            </td>
                            <td
                              style={{
                                padding: "10px 16px",
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

                {/* Succès */}
                {result.nb_crees > 0 && (
                  <div
                    style={{
                      background: theme.surface,
                      border: `1px solid ${theme.primaryBorder}`,
                      borderRadius: 12,
                      overflow: "hidden",
                      boxShadow: theme.shadow,
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 16px",
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
                        ✅ {result.nb_crees} employé(s) importé(s) avec succès
                      </span>
                      <button
                        onClick={() => navigate("/employees")}
                        style={{
                          background: theme.primary,
                          border: "none",
                          color: "#fff",
                          borderRadius: 6,
                          padding: "6px 14px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Voir la liste →
                      </button>
                    </div>
                    {result.succes?.length > 0 && (
                      <table
                        style={{ width: "100%", borderCollapse: "collapse" }}
                      >
                        <thead>
                          <tr style={{ background: theme.primaryBg }}>
                            {["Ligne", "Matricule", "Nom & Prénom"].map((h) => (
                              <th
                                key={h}
                                style={{
                                  padding: "10px 16px",
                                  textAlign: "left",
                                  color: theme.primary,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  borderBottom: `1px solid ${theme.primaryBorder}`,
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
                                borderBottom: `1px solid ${theme.primaryBorder}`,
                              }}
                            >
                              <td
                                style={{
                                  padding: "10px 16px",
                                  color: theme.textSecondary,
                                  fontSize: 13,
                                }}
                              >
                                {s.ligne}
                              </td>
                              <td
                                style={{
                                  padding: "10px 16px",
                                  color: theme.primary,
                                  fontFamily: "monospace",
                                  fontSize: 13,
                                }}
                              >
                                {s.matricule}
                              </td>
                              <td
                                style={{
                                  padding: "10px 16px",
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
                                  padding: "10px 16px",
                                  color: theme.textMuted,
                                  fontSize: 12,
                                  textAlign: "center",
                                  fontStyle: "italic",
                                }}
                              >
                                ... et {result.nb_crees - 10} autre(s)
                                employé(s)
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
