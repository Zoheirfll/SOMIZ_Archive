import { createPortal } from "react-dom";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import SecureDocViewer from "../SecureDocViewer";
import ScanImportModal from "../ScanImportModal";
import {
  PaperclipIcon,
  FileTextIcon,
  ImageIcon,
  Spinner,
} from "../icons";
import {
  stripExt,
  formatSizeMo,
  formatDateTime,
  folderHeaderStyle,
  folderRowExtraStyle,
  folderRowBorder,
  hexToRgba,
} from "../../utils/employeeDocsDisplay";

// En plein écran, le viewer doit sortir du flux : les classes d'animation
// des conteneurs parents (.tab-content/.anim-fade-in, animation d'opacité
// en fill-mode both) créent un contexte d'empilement qui enferme un
// `position: fixed` — l'overlay se retrouvait peint SOUS la navbar, qui
// masquait son en-tête et le bouton de sortie. Un portail vers
// document.body échappe à tous ces contextes.
const MaybePortal = ({ active, children }) =>
  active ? createPortal(children, document.body) : children;

// Onglet "Dossier" de la fiche employé (sidebar Documents + viewer + import
// scanné) — extrait de EmployeeDetail.jsx pour garder la page principale
// sous les 1000 lignes. Aucun état local : entièrement piloté par les
// props de la page parente (upload, sélection de fichier, viewer).
const DossierTab = ({
  activeTab,
  contrats,
  docLoading,
  docUrl,
  documentsAffiches,
  docOrderMap,
  docHeaderBefore,
  docGroupEnd,
  employee,
  expandedHistory,
  setExpandedHistory,
  fetchEmployee,
  fetchContrats,
  highlightedMissingCode,
  isMobile,
  missingRowRefs,
  quickUploadingCode,
  setQuickUploadingCode,
  selectedContratId,
  setSelectedContratId,
  selectedDoc,
  selectedFile,
  initialPageNumber,
  showScanImport,
  setShowScanImport,
  setUploadType,
  uploadType,
  uploading,
  setEditingDoc,
  viewerFullscreen,
  setViewerFullscreen,
  typesDocuments,
  typesDocumentsList,
  sortContratsByDate,
  loadFile,
  handleAutoRenameFile,
  handleRenamePage,
  handleSaveRotation,
  handleDeleteDoc,
  handleDeleteFile,
  handleRenameFile,
  handleSelectDoc,
  handleUpload,
  dossierSectionRef,
  setMessage,
  id,
  user,
  busyIds,
}) => {
  const theme = useTheme();
  return (
  <>
    {activeTab === "dossier" && (
          <div
            ref={dossierSectionRef}
            className="tab-content"
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "340px 1fr",
              gap: 20,
            }}
          >
            {/* Sidebar */}
            <div
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: theme.shadow,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  order: -2,
                  padding: "14px 16px",
                  borderBottom: `1px solid ${theme.border}`,
                  color: theme.primary,
                  fontWeight: 700,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  background: theme.primaryBg,
                }}
              >
                Documents ({documentsAffiches.length})
              </div>

              {contrats.length > 0 && (
                <div
                  style={{
                    order: -1,
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    padding: "10px 16px",
                    borderBottom: `1px solid ${theme.border}`,
                    background: theme.bg,
                  }}
                >
                  {sortContratsByDate(contrats).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={selectedContratId === c.id}
                        onClick={() => setSelectedContratId(c.id)}
                        style={{
                          background: selectedContratId === c.id ? theme.primary : theme.surface,
                          border: `1px solid ${selectedContratId === c.id ? theme.primary : theme.border}`,
                          color: selectedContratId === c.id ? "#fff" : theme.text,
                          borderRadius: 6,
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: "monospace",
                          cursor: "pointer",
                        }}
                      >
                        {c.numero_contrat}
                      </button>
                    ))}
                </div>
              )}

              {/* Documents présents */}
              {documentsAffiches.map((doc) => (
                <div key={doc.id} style={{ order: docOrderMap.get(`p-${doc.id}`) ?? 0 }}>
                {docHeaderBefore.get(`p-${doc.id}`) && (
                  <div style={folderHeaderStyle(doc.couleur)}>
                    📁 {docHeaderBefore.get(`p-${doc.id}`)}
                  </div>
                )}
                <div
                  style={{
                    borderBottom: doc.type_document_parent ? folderRowBorder(doc.couleur) : `1px solid ${theme.border}`,
                    borderLeft: `3px solid ${selectedDoc?.id === doc.id ? theme.primary : (doc.couleur || "transparent")}`,
                    ...(doc.type_document_parent ? folderRowExtraStyle(doc.couleur) : {}),
                    background: selectedDoc?.id === doc.id
                      ? theme.primaryBg
                      : hexToRgba(doc.couleur, doc.type_document_parent ? 0.05 : 0.045) || "transparent",
                    ...(docGroupEnd.has(`p-${doc.id}`)
                      ? { borderRadius: "0 0 8px 8px", borderBottom: folderRowBorder(doc.couleur), marginBottom: 10 }
                      : {}),
                  }}
                >
                  {/* En-tête du document */}
                  <div
                    onClick={() => handleSelectDoc(doc)}
                    style={{
                      padding: "10px 16px",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            color: theme.text,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {typesDocuments[doc.type_document] || doc.type_document}
                        </span>
                        {doc.contrat && (() => {
                          const c = contrats.find((c) => c.id === doc.contrat);
                          return c ? (
                            <span style={{
                              background: theme.primaryBg, border: `1px solid ${theme.border}`,
                              color: theme.primary, borderRadius: 4, padding: "1px 7px",
                              fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                            }}>
                              {c.numero_contrat}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                      <div style={{ display: "flex", gap: 2 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingDoc(doc);
                          }}
                          disabled={busyIds?.has(doc.id)}
                          title="Modifier les pages de ce document"
                          aria-label="Modifier les pages de ce document"
                          style={{
                            background: "transparent",
                            border: `1px solid ${theme.border}`,
                            borderRadius: 6,
                            color: theme.textSecondary,
                            cursor: busyIds?.has(doc.id) ? "not-allowed" : "pointer",
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 8px",
                            opacity: busyIds?.has(doc.id) ? 0.3 : 0.7,
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.opacity = 1)
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.opacity = 0.7)
                          }
                        >
                          Modifier
                        </button>
                        <button
                          onClick={(e) => handleDeleteDoc(doc, e)}
                          disabled={busyIds?.has(doc.id)}
                          title="Supprimer ce document"
                          aria-label="Supprimer ce document"
                          style={{
                            background: "transparent",
                            border: `1px solid ${theme.dangerBorder}`,
                            borderRadius: 6,
                            color: theme.danger,
                            cursor: busyIds?.has(doc.id) ? "not-allowed" : "pointer",
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 8px",
                            opacity: busyIds?.has(doc.id) ? 0.3 : 0.7,
                            fontFamily: theme.fontFamily,
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.opacity = 1)
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.opacity = 0.7)
                          }
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Fichiers du document — affichés si document sélectionné */}
                  {selectedDoc?.id === doc.id && doc.fichiers?.length > 0 && (
                    <div
                      style={{
                        borderTop: `1px dashed ${theme.border}`,
                        background: theme.bg,
                      }}
                    >
                      {doc.fichiers.map((file, index) => (
                        <div
                          key={file.id}
                          onClick={() => loadFile(file)}
                          style={{
                            padding: "8px 16px 8px 24px",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background:
                              selectedFile?.id === file.id
                                ? `${theme.primary}18`
                                : "transparent",
                            borderLeft: `3px solid ${selectedFile?.id === file.id ? theme.primaryLight : "transparent"}`,
                            transition: "all 0.15s",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{ color: theme.textMuted, fontSize: 11, display: "flex" }}
                            >
                              {file.mime_type?.includes("pdf") ? <FileTextIcon size={13} /> : <ImageIcon size={13} />}
                            </span>
                            <div>
                              <div
                                title={file.file_name}
                                style={{
                                  color: theme.text,
                                  fontSize: 12,
                                  fontWeight:
                                    selectedFile?.id === file.id ? 600 : 400,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: 210,
                                }}
                              >
                                {stripExt(file.file_name) || `Page ${index + 1}`}
                              </div>
                              {file.uploaded_by_name && (
                                <div
                                  style={{
                                    color: theme.textMuted,
                                    fontSize: 10,
                                    marginTop: 1,
                                  }}
                                >
                                  Ajouté par {file.uploaded_by_name}
                                </div>
                              )}
                            </div>
                          </div>
                          {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                            <button
                              onClick={(e) => handleDeleteFile(file, e)}
                              disabled={busyIds?.has(file.id)}
                              title="Supprimer ce fichier"
                              aria-label={`Supprimer ${file.file_name}`}
                              style={{
                                background: "transparent",
                                border: `1px solid ${theme.dangerBorder}`,
                                borderRadius: 6,
                                color: theme.danger,
                                cursor: busyIds?.has(file.id) ? "not-allowed" : "pointer",
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "2px 8px",
                                flexShrink: 0,
                                opacity: busyIds?.has(file.id) ? 0.3 : 0.8,
                                fontFamily: theme.fontFamily,
                              }}
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Historique — versions antérieures conservées (2026-08-30),
                    repliées par défaut, consultables/supprimables une par une. */}
                {doc.__history?.length > 0 && (
                  <div style={{ borderTop: `1px dashed ${theme.border}`, background: theme.bg }}>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedHistory((prev) => {
                          const next = new Set(prev);
                          if (next.has(doc.id)) next.delete(doc.id);
                          else next.add(doc.id);
                          return next;
                        });
                      }}
                      style={{
                        padding: "6px 16px 6px 24px",
                        cursor: "pointer",
                        fontSize: 11,
                        color: theme.textSecondary,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      🕘 Historique ({doc.__history.length} version{doc.__history.length > 1 ? "s" : ""} antérieure{doc.__history.length > 1 ? "s" : ""}) {expandedHistory.has(doc.id) ? "▲" : "▼"}
                    </div>
                    {expandedHistory.has(doc.id) && doc.__history.map((h) => (
                      <div
                        key={h.id}
                        onClick={() => handleSelectDoc(h)}
                        style={{
                          padding: "6px 16px 6px 34px",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          background: selectedDoc?.id === h.id ? theme.primaryBg : "transparent",
                          borderLeft: `3px solid ${selectedDoc?.id === h.id ? theme.primary : "transparent"}`,
                        }}
                      >
                        <div style={{ fontSize: 11, color: theme.textMuted }}>
                          v{h.version} · {formatDateTime(h.uploaded_at)}
                          {h.file_size_kb ? ` · ${formatSizeMo(h.file_size_kb)}` : ""}
                        </div>
                        {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                          <button
                            onClick={(e) => handleDeleteDoc(h, e)}
                            disabled={busyIds?.has(h.id)}
                            title="Supprimer cette version"
                            aria-label="Supprimer cette version"
                            style={{
                              background: "transparent",
                              border: `1px solid ${theme.dangerBorder}`,
                              borderRadius: 6,
                              color: theme.danger,
                              cursor: busyIds?.has(h.id) ? "not-allowed" : "pointer",
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "1px 7px",
                              opacity: busyIds?.has(h.id) ? 0.3 : 0.7,
                              fontFamily: theme.fontFamily,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.7)}
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                </div>
              ))}

              {/* Documents manquants */}
              {(employee.documents_manquants || []).map((doc) => (
                <div key={doc.code} style={{ order: docOrderMap.get(`m-${doc.code}`) ?? 0 }}>
                {docHeaderBefore.get(`m-${doc.code}`) && (
                  <div style={folderHeaderStyle(doc.couleur)}>
                    📁 {docHeaderBefore.get(`m-${doc.code}`)}
                  </div>
                )}
                <div
                  ref={(el) => { missingRowRefs.current[doc.code] = el; }}
                  style={{
                    padding: "10px 16px",
                    borderBottom: doc.parent_nom ? folderRowBorder(doc.couleur) : `1px solid ${theme.border}`,
                    borderLeft: `3px solid ${doc.couleur || "transparent"}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    ...(doc.parent_nom ? folderRowExtraStyle(doc.couleur) : {}),
                    background: highlightedMissingCode === doc.code
                      ? theme.primaryBg
                      : (hexToRgba(doc.couleur, doc.parent_nom ? 0.05 : 0.035) || "#FAFAFA"),
                    transition: "background 0.3s ease",
                    ...(docGroupEnd.has(`m-${doc.code}`)
                      ? { borderRadius: "0 0 8px 8px", borderBottom: folderRowBorder(doc.couleur), marginBottom: 10 }
                      : {}),
                  }}
                >
                  <div>
                    <div style={{ color: theme.textMuted, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                      {doc.required && (
                        <span style={{ color: theme.danger, marginRight: 4 }}>
                          *
                        </span>
                      )}
                      {doc.label}
                    </div>
                    <div
                      style={{
                        color: theme.textMuted,
                        fontSize: 11,
                        marginTop: 2,
                        fontStyle: "italic",
                      }}
                    >
                      Non uploadé
                    </div>
                  </div>
                  {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                    <label
                      title={`Uploader ${doc.label}`}
                      aria-label={`Uploader ${doc.label}`}
                      style={{
                        background:
                          quickUploadingCode === doc.code
                            ? `${theme.primary}88`
                            : theme.primaryBg,
                        border: `1px solid ${theme.border}`,
                        color: theme.primary,
                        borderRadius: 6,
                        padding: "4px 8px",
                        display: "flex",
                        alignItems: "center",
                        cursor:
                          quickUploadingCode === doc.code
                            ? "not-allowed"
                            : "pointer",
                        flexShrink: 0,
                      }}
                    >
                      {quickUploadingCode === doc.code ? <Spinner size={13} /> : <PaperclipIcon size={13} />}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.tiff"
                        multiple
                        style={{ display: "none" }}
                        disabled={quickUploadingCode === doc.code}
                        onChange={async (e) => {
                          const files = Array.from(e.target.files);
                          if (!files.length) return;
                          setQuickUploadingCode(doc.code);
                          const typeDoc = typesDocumentsList.find(
                            (t) => t.code === doc.code,
                          );
                          const formData = new FormData();
                          formData.append("type_doc", typeDoc?.id || doc.code);
                          files.forEach((f) => formData.append("files", f));
                          // Upload rapide sur un document manquant : un seul
                          // fichier attendu par nature (une ligne = un type).
                          // Si plusieurs sont sélectionnés d'un coup (recto +
                          // verso), fusion automatique en un seul PDF — pas
                          // de case à cocher ici, contrairement à "Ajouter un
                          // document" où plusieurs fichiers séparés restent
                          // un cas d'usage normal.
                          if (files.length > 1) formData.append("merge", "true");
                          try {
                            await api.post(
                              `/employees/${id}/documents/`,
                              formData,
                              {
                                headers: {
                                  "Content-Type": "multipart/form-data",
                                },
                              },
                            );
                            setMessage({
                              type: "success",
                              text:
                                files.length > 1
                                  ? `${doc.label} uploadé (${files.length} fichiers fusionnés).`
                                  : `${doc.label} uploadé avec succès.`,
                            });
                            fetchEmployee(true);
                          } catch (err) {
                            setMessage({
                              type: "error",
                              text:
                                err.response?.data?.error ||
                                err.response?.data?.files?.[0] ||
                                "Erreur lors de l'upload.",
                            });
                          } finally {
                            setQuickUploadingCode(null);
                            e.target.value = "";
                            setTimeout(() => setMessage(null), 4000);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
                </div>
              ))}

              {documentsAffiches.length === 0 && (employee.documents_manquants || []).length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: theme.textMuted, fontSize: 13 }}>
                  Aucun document
                </div>
              )}

              {/* Upload ADMIN — remonté en haut de la sidebar sur mobile
                  (order négatif) : en layout 1 colonne, le laisser tout en
                  bas obligeait à scroller sous la liste complète des
                  documents pour accéder à une action pourtant fréquente
                  (upload). Inchangé sur desktop, où la sidebar entière
                  reste visible. */}
              {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                <div
                  style={{
                    order: isMobile ? -3 : 999999,
                    padding: 16,
                    borderTop: isMobile ? "none" : `2px solid ${theme.border}`,
                    borderBottom: isMobile ? `2px solid ${theme.border}` : "none",
                    background: theme.bg,
                  }}
                >
                  <button
                    onClick={() => setShowScanImport(true)}
                    className="btn-lift"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      width: "100%",
                      background: theme.surface,
                      color: theme.primary,
                      border: `1px solid ${theme.primaryBorder}`,
                      borderRadius: 6,
                      padding: "8px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      marginBottom: 12,
                    }}
                  >
                    <PaperclipIcon size={13} /> Scanner un dossier
                  </button>
                  <div
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: 700,
                      marginBottom: 8,
                    }}
                  >
                    Ajouter un document
                  </div>
                  <select
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                    className="input-focus"
                    style={{
                      width: "100%",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 6,
                      padding: "7px 10px",
                      fontSize: 12,
                      color: theme.text,
                      background: theme.surface,
                      marginBottom: 8,
                      outline: "none",
                    }}
                  >
                    {typesDocumentsList.filter((t) => !t.parent_nom).map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.nom}
                      </option>
                    ))}
                    {Object.entries(
                      typesDocumentsList
                        .filter((t) => t.parent_nom)
                        .reduce((acc, t) => {
                          (acc[t.parent_nom] = acc[t.parent_nom] || []).push(t);
                          return acc;
                        }, {}),
                    ).map(([label, items]) => (
                      <optgroup key={label} label={label}>
                        {items.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.nom}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div
                    style={{
                      color: theme.textMuted,
                      fontSize: 10.5,
                      marginBottom: 8,
                      lineHeight: 1.4,
                    }}
                  >
                    Plusieurs fichiers sélectionnés d'un coup (recto + verso…)
                    deviennent les pages d'un même document, chacune gardant
                    le nom de son fichier.
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      width: "100%",
                      background: uploading
                        ? `${theme.primary}88`
                        : theme.primary,
                      color: "#fff",
                      borderRadius: 6,
                      padding: "8px",
                      textAlign: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: uploading ? "not-allowed" : "pointer",
                      boxSizing: "border-box",
                    }}
                  >
                    {uploading ? "Upload en cours..." : <><PaperclipIcon size={13} /> Choisir fichier(s)</>}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.tiff"
                      onChange={handleUpload}
                      style={{ display: "none" }}
                      disabled={uploading}
                      multiple
                    />
                  </label>
                  <div
                    style={{
                      color: theme.textMuted,
                      fontSize: 10,
                      marginTop: 6,
                      textAlign: "center",
                    }}
                  >
                    Maintenez Ctrl pour sélectionner plusieurs fichiers
                  </div>
                </div>
              )}
            </div>

            {/* Viewer — hors flux (portail) en plein écran, sinon panneau
                de hauteur fixe dans la grille. */}
            <MaybePortal active={viewerFullscreen}>
            <div
              style={
                viewerFullscreen
                  ? {
                      // Plein écran : le viewer couvre toute la fenêtre
                      // (Échap pour sortir, voir EmployeeDetail.jsx).
                      position: "fixed",
                      inset: 0,
                      zIndex: 1500,
                      background: theme.surface,
                      display: "flex",
                      flexDirection: "column",
                      borderRadius: 0,
                      border: "none",
                    }
                  : {
                      background: theme.surface,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      overflow: "hidden",
                      boxShadow: theme.shadow,
                      // Hauteur fixe, proportionnée à une page portrait
                      // (A4) : `alignSelf: start` évite que la grille
                      // l'étire à la hauteur de la liste des types (très
                      // longue → immense zone vide), sans pour autant le
                      // rabaisser à la hauteur d'écran, trop court pour
                      // lire un document debout. On fait défiler la page.
                      alignSelf: "start",
                      height: isMobile ? "75vh" : 1100,
                      display: "flex",
                      flexDirection: "column",
                    }
              }
            >
              {/* Sortie du plein écran — bouton flottant toujours visible,
                  indépendant de la barre d'en-tête (qui peut déborder). */}
              {viewerFullscreen && (
                <button
                  type="button"
                  onClick={() => setViewerFullscreen(false)}
                  title="Quitter le plein écran (Échap)"
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 18,
                    zIndex: 10,
                    background: theme.danger,
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    padding: "8px 16px",
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(15,23,42,0.3)",
                    fontFamily: theme.fontFamily,
                  }}
                >
                  ✕ Quitter le plein écran (Échap)
                </button>
              )}
              {selectedFile ? (
                <>
                  <div
                    style={{
                      padding: "14px 20px",
                      borderBottom: `1px solid ${theme.border}`,
                      background: theme.primaryBg,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <span
                        style={{
                          color: theme.text,
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        {typesDocuments[selectedDoc?.type_document] ||
                          selectedDoc?.type_document}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 3,
                        }}
                      >
                        {/* Titre du fichier — cliquable pour le renommer,
                            même geste que le nom de page à côté des flèches. */}
                        {["ADMIN", "SUPERADMIN"].includes(user?.role) ? (
                          <button
                            type="button"
                            onClick={(e) => handleRenameFile(selectedFile, e)}
                            disabled={busyIds?.has(selectedFile.id)}
                            title="Cliquer pour renommer ce fichier"
                            style={{
                              background: "transparent",
                              border: `1px solid ${theme.border}`,
                              borderRadius: 6,
                              color: theme.textSecondary,
                              fontSize: 12,
                              padding: "2px 8px",
                              cursor: busyIds?.has(selectedFile.id)
                                ? "not-allowed"
                                : "pointer",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 280,
                              fontFamily: theme.fontFamily,
                            }}
                          >
                            {stripExt(selectedFile.file_name)} ✏️
                          </button>
                        ) : null}
                        {/* Nommer le fichier d'après le type de document
                            ("Infos personnelles" au lieu du nom technique du
                            scan) — l'ancienne icône 🏷️, désormais écrite. */}
                        {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                          <button
                            type="button"
                            onClick={(e) =>
                              handleAutoRenameFile(
                                selectedFile,
                                typesDocuments[selectedDoc?.type_document] ||
                                  selectedDoc?.type_document,
                                e,
                              )
                            }
                            disabled={busyIds?.has(selectedFile.id)}
                            title="Nommer ce fichier d'après le type de document"
                            style={{
                              background: "transparent",
                              border: `1px solid ${theme.border}`,
                              borderRadius: 6,
                              color: theme.textSecondary,
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "2px 8px",
                              cursor: busyIds?.has(selectedFile.id)
                                ? "not-allowed"
                                : "pointer",
                              whiteSpace: "nowrap",
                              fontFamily: theme.fontFamily,
                            }}
                          >
                            Nommer d'après le type
                          </button>
                        )}
                        {!["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                          <span
                            title={selectedFile.file_name}
                            style={{
                              color: theme.textSecondary,
                              fontSize: 12,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 260,
                            }}
                          >
                            {stripExt(selectedFile.file_name)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      {/* Navigation page par page (2026-09-14) — un document
                          à plusieurs fichiers se parcourt comme un PDF
                          multi-page, plutôt que par onglets : chaque
                          fichier reste géré individuellement (renommer/
                          supprimer déjà ci-dessus), seule la navigation
                          change de forme. */}
                      {selectedDoc?.fichiers?.length > 1 && (() => {
                        const sorted = [...selectedDoc.fichiers].sort(
                          (a, b) => a.ordre - b.ordre,
                        );
                        const idx = sorted.findIndex(
                          (f) => f.id === selectedFile.id,
                        );
                        const goTo = (i) => {
                          if (i >= 0 && i < sorted.length) loadFile(sorted[i]);
                        };
                        return (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => goTo(idx - 1)}
                              disabled={idx <= 0}
                              title="Page précédente"
                              aria-label="Page précédente"
                              style={{
                                background: theme.primaryBg,
                                border: `1px solid ${theme.border}`,
                                color: idx <= 0 ? theme.textMuted : theme.primary,
                                borderRadius: 6,
                                padding: "4px 10px",
                                fontSize: 12,
                                cursor: idx <= 0 ? "default" : "pointer",
                              }}
                            >
                              ←
                            </button>
                            <span
                              style={{
                                color: theme.textSecondary,
                                fontSize: 12,
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                              }}
                            >
                              Page {idx + 1}/{sorted.length}
                            </span>
                            <button
                              type="button"
                              onClick={() => goTo(idx + 1)}
                              disabled={idx >= sorted.length - 1}
                              title="Page suivante"
                              aria-label="Page suivante"
                              style={{
                                background: theme.primaryBg,
                                border: `1px solid ${theme.border}`,
                                color:
                                  idx >= sorted.length - 1
                                    ? theme.textMuted
                                    : theme.primary,
                                borderRadius: 6,
                                padding: "4px 10px",
                                fontSize: 12,
                                cursor:
                                  idx >= sorted.length - 1 ? "default" : "pointer",
                              }}
                            >
                              →
                            </button>
                          </div>
                        );
                      })()}
                      <span
                        style={{ color: theme.textSecondary, fontSize: 12 }}
                      >
                        {formatSizeMo(selectedFile.file_size_kb)} · {formatDateTime(selectedFile.uploaded_at)}
                        {selectedFile.uploaded_by_name && (
                          <> · Ajouté par {selectedFile.uploaded_by_name}</>
                        )}
                        {selectedFile.modified_by_name && (
                          <>
                            {" "}
                            · Modifié par {selectedFile.modified_by_name}
                            {selectedFile.modified_at
                              ? ` le ${formatDateTime(selectedFile.modified_at)}`
                              : ""}
                          </>
                        )}
                        {selectedFile.ocr_status === "pending" && (
                          <span style={{ marginLeft: 8 }}>⏳ Analyse en cours</span>
                        )}
                        {selectedFile.ocr_status === "done" && (
                          <span style={{ marginLeft: 8, color: theme.primary }}>✓ Analysé</span>
                        )}
                        {selectedFile.ocr_status === "failed" && (
                          <span style={{ marginLeft: 8, color: theme.danger }}>✗ Échec d'analyse</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewerFullscreen((v) => !v)}
                        title={
                          viewerFullscreen
                            ? "Quitter le plein écran (Échap)"
                            : "Afficher en plein écran"
                        }
                        style={{
                          background: viewerFullscreen ? theme.primary : theme.primaryBg,
                          border: `1px solid ${theme.primaryBorder}`,
                          borderRadius: 6,
                          color: viewerFullscreen ? "#fff" : theme.primary,
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "4px 10px",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          fontFamily: theme.fontFamily,
                        }}
                      >
                        {viewerFullscreen ? "Quitter le plein écran" : "Plein écran"}
                      </button>
                    </div>
                  </div>

                  {docLoading ? (
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: theme.textSecondary,
                      }}
                    >
                      Chargement...
                    </div>
                  ) : docUrl ? (
                    <SecureDocViewer
                      key={selectedFile?.id}
                      url={docUrl}
                      mimeType={selectedFile?.mime_type}
                      fileName={selectedFile?.file_name}
                      initialPage={initialPageNumber}
                      pages={[...(selectedFile?.pages || [])].sort(
                        (a, b) => a.ordre - b.ordre,
                      )}
                      onRenamePage={
                        ["ADMIN", "SUPERADMIN"].includes(user?.role)
                          ? handleRenamePage
                          : undefined
                      }
                      savedRotation={selectedFile?.rotation}
                      canSaveRotation={["ADMIN", "SUPERADMIN"].includes(user?.role)}
                      onSaveRotation={handleSaveRotation}
                    />
                  ) : (
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: theme.danger,
                      }}
                    >
                      Impossible de charger le fichier.
                    </div>
                  )}
                </>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.textMuted,
                  }}
                >
                  <div style={{ marginBottom: 16 }}><FileTextIcon size={48} /></div>
                  <div style={{ fontSize: 14 }}>
                    Sélectionnez un document pour le visualiser
                  </div>
                </div>
              )}
            </div>
            </MaybePortal>
          </div>
        )}

    {showScanImport && (
      <ScanImportModal
        employeeId={id}
        typesDocumentsList={typesDocumentsList}
        onClose={() => setShowScanImport(false)}
        onImported={() => {
          fetchEmployee(true);
          fetchContrats();
        }}
      />
    )}
  </>
  );
};

export default DossierTab;
