import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import SecureDocViewer from "../SecureDocViewer";
import ScanImportModal from "../ScanImportModal";
import {
  TrashIcon,
  PencilIcon,
  PaperclipIcon,
  FileTextIcon,
  ImageIcon,
  Spinner,
  TagIcon,
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
  showScanImport,
  setShowScanImport,
  setUploadType,
  uploadType,
  uploading,
  typesDocuments,
  typesDocumentsList,
  sortContratsByDate,
  loadFile,
  handleAutoRenameFile,
  handleDeleteDoc,
  handleDeleteFile,
  handleRenameFile,
  handleSelectDoc,
  handleUpload,
  dossierSectionRef,
  setMessage,
  id,
  user,
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
                      <button
                        onClick={(e) => handleDeleteDoc(doc, e)}
                        title="Supprimer ce document"
                        aria-label="Supprimer ce document"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: theme.danger,
                          cursor: "pointer",
                          display: "flex",
                          padding: "2px 4px",
                          opacity: 0.5,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.opacity = 1)
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.opacity = 0.5)
                        }
                      >
                        <TrashIcon />
                      </button>
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
                            </div>
                          </div>
                          {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                            <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={(e) => handleAutoRenameFile(file, typesDocuments[doc.type_document] || doc.type_document, e)}
                              title="Renommer d'après le type de document"
                              aria-label="Renommer d'après le type de document"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: theme.textSecondary,
                                cursor: "pointer",
                                display: "flex",
                                opacity: 0.5,
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                              onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.5)}
                            >
                              <TagIcon size={16} />
                            </button>
                            <button
                              onClick={(e) => handleRenameFile(file, e)}
                              title="Renommer ce fichier"
                              aria-label="Renommer ce fichier"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: theme.textSecondary,
                                cursor: "pointer",
                                display: "flex",
                                opacity: 0.5,
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.opacity = 1)
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.opacity = 0.5)
                              }
                            >
                              <PencilIcon size={16} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteFile(file, e)}
                              title="Supprimer ce fichier"
                              aria-label="Supprimer ce fichier"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: theme.danger,
                                cursor: "pointer",
                                display: "flex",
                                opacity: 0.5,
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.opacity = 1)
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.opacity = 0.5)
                              }
                            >
                              <TrashIcon size={16} />
                            </button>
                            </div>
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
                            title="Supprimer cette version"
                            aria-label="Supprimer cette version"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: theme.danger,
                              cursor: "pointer",
                              display: "flex",
                              padding: "2px 4px",
                              opacity: 0.5,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.5)}
                          >
                            <TrashIcon size={13} />
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
                              text: `${doc.label} uploadé avec succès.`,
                            });
                            fetchEmployee(true);
                          } catch (err) {
                            setMessage({
                              type: "error",
                              text:
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

              {/* Upload ADMIN */}
              {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                <div
                  style={{
                    order: 999999,
                    padding: 16,
                    borderTop: `2px solid ${theme.border}`,
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

            {/* Viewer */}
            <div
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: theme.shadow,
                minHeight: 600,
                display: "flex",
                flexDirection: "column",
              }}
            >
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
                        {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                          <button
                            onClick={(e) => handleAutoRenameFile(selectedFile, typesDocuments[selectedDoc?.type_document] || selectedDoc?.type_document, e)}
                            title="Renommer d'après le type de document"
                            aria-label="Renommer d'après le type de document"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: theme.textSecondary,
                              cursor: "pointer",
                              display: "flex",
                              opacity: 0.6,
                              padding: 0,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.6)}
                          >
                            <TagIcon size={16} />
                          </button>
                        )}
                        {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                          <button
                            onClick={(e) => handleRenameFile(selectedFile, e)}
                            title="Renommer ce fichier"
                            aria-label="Renommer ce fichier"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: theme.textSecondary,
                              cursor: "pointer",
                              display: "flex",
                              opacity: 0.6,
                              padding: 0,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.6)}
                          >
                            <PencilIcon size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      {/* Onglets fichiers */}
                      {selectedDoc?.fichiers?.length > 1 && (
                        <div style={{ display: "flex", gap: 6 }}>
                          {selectedDoc.fichiers.map((file, index) => (
                            <button
                              key={file.id}
                              onClick={() => loadFile(file)}
                              title={file.file_name}
                              style={{
                                background:
                                  selectedFile.id === file.id
                                    ? theme.primary
                                    : theme.primaryBg,
                                border: `1px solid ${theme.border}`,
                                color:
                                  selectedFile.id === file.id
                                    ? "#fff"
                                    : theme.primary,
                                borderRadius: 6,
                                padding: "4px 10px",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                maxWidth: 140,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {stripExt(file.file_name) || `Page ${index + 1}`}
                            </button>
                          ))}
                        </div>
                      )}
                      <span
                        style={{ color: theme.textSecondary, fontSize: 12 }}
                      >
                        {formatSizeMo(selectedFile.file_size_kb)} · {formatDateTime(selectedFile.uploaded_at)}
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
                      url={docUrl}
                      mimeType={selectedFile?.mime_type}
                      fileName={selectedFile?.file_name}
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
