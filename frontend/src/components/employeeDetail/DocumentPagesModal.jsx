import { useEffect, useRef, useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { useConfirm, usePrompt } from "../ConfirmDialog";
import api from "../../services/api";

// Panneau "Modifier" d'un document (2026-09-14) — gestion page par page.
// Le document reste UN SEUL fichier PDF (jamais éclaté en plusieurs
// fichiers) : chaque page interne est nommée, réorganisable, remplaçable,
// supprimable, et on peut en insérer de nouvelles. Voir le modèle
// EmployeeDocumentFilePage côté backend.
const DocumentPagesModal = ({ doc, docLabel, onClose, onChanged }) => {
  const theme = useTheme();
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();

  // Fichier "principal" du document — avec la fusion à l'upload, un
  // document a normalement un seul fichier. Les documents plus anciens
  // peuvent en avoir plusieurs : on les liste alors tous, chacun avec ses
  // propres pages.
  const files = [...(doc.fichiers || [])].sort((a, b) => a.ordre - b.ordre);

  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [addTarget, setAddTarget] = useState(null); // { fileId, position }
  const addInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const replaceTargetRef = useRef(null);

  useEffect(() => {
    if (addTarget) addInputRef.current?.click();
  }, [addTarget]);

  const showError = (text) => {
    setMessage({ type: "error", text });
    setTimeout(() => setMessage(null), 5000);
  };

  const run = async (key, fn, errLabel) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      showError(err.response?.data?.error || errLabel);
    } finally {
      setBusy(null);
    }
  };

  const movePage = (file, page, direction) => {
    const pages = [...(file.pages || [])].sort((a, b) => a.ordre - b.ordre);
    const idx = pages.findIndex((p) => p.id === page.id);
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || swap < 0 || swap >= pages.length) return;
    const next = [...pages];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    run(
      page.id,
      () =>
        api.put(`/files/${file.id}/pages/reorder/`, {
          order: next.map((p) => p.id),
        }),
      "Impossible de réorganiser les pages.",
    );
  };

  const renamePage = async (file, page) => {
    const nom = await prompt("Nom de la page :", page.nom);
    if (nom === null || !nom.trim()) return;
    run(
      page.id,
      () => api.patch(`/files/${file.id}/pages/${page.id}/`, { nom: nom.trim() }),
      "Impossible de renommer cette page.",
    );
  };

  const deletePage = async (file, page) => {
    const isLast = (file.pages || []).length <= 1;
    const question = isLast
      ? `"${page.nom}" est la dernière page — supprimer supprimera tout le document. Continuer ?`
      : `Supprimer la page "${page.nom}" ?`;
    if (!(await confirm(question))) return;
    await run(
      page.id,
      () => api.delete(`/files/${file.id}/pages/${page.id}/`),
      "Impossible de supprimer cette page.",
    );
    if (isLast) onClose();
  };

  const replacePage = (file, page) => {
    replaceTargetRef.current = { fileId: file.id, pageId: page.id };
    replaceInputRef.current?.click();
  };

  const onReplaceChosen = async (e) => {
    const chosen = e.target.files[0];
    const target = replaceTargetRef.current;
    e.target.value = "";
    if (!chosen || !target) return;
    const formData = new FormData();
    formData.append("file", chosen);
    run(
      target.pageId,
      () =>
        api.post(
          `/files/${target.fileId}/pages/${target.pageId}/replace/`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } },
        ),
      "Impossible de remplacer cette page.",
    );
  };

  const onAddChosen = async (e) => {
    const chosen = Array.from(e.target.files);
    const target = addTarget;
    e.target.value = "";
    setAddTarget(null);
    if (!chosen.length || !target) return;
    const formData = new FormData();
    chosen.forEach((f) => formData.append("files", f));
    if (target.position) formData.append("position", String(target.position));
    run(
      `add-${target.fileId}`,
      () =>
        api.post(`/files/${target.fileId}/pages/`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        }),
      "Impossible d'ajouter des pages.",
    );
  };

  const smallBtn = (extra = {}) => ({
    background: "none",
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    color: theme.textSecondary,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    ...extra,
  });

  const totalPages = files.reduce(
    (n, f) => n + (f.pages?.length || (f.mime_type === "application/pdf" ? 0 : 1)),
    0,
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Modifier ${docLabel}`}
        className="anim-scale-in"
        style={{
          background: theme.surface,
          borderRadius: 16,
          padding: 24,
          width: 520,
          maxWidth: "92vw",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 48px rgba(15,23,42,0.25)",
          border: `1px solid ${theme.border}`,
          fontFamily: theme.fontFamily,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <div style={{ color: theme.text, fontWeight: 700, fontSize: 15 }}>
            Modifier — {docLabel}
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "none",
              border: "none",
              color: theme.textMuted,
              fontSize: 18,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 14 }}>
          {totalPages} page{totalPages > 1 ? "s" : ""} — renommez, réorganisez,
          remplacez ou supprimez chaque page, ou insérez-en de nouvelles. Le
          document reste un seul fichier.
        </div>

        {message && (
          <div
            style={{
              background: theme.dangerBg,
              border: `1px solid ${theme.dangerBorder}`,
              color: theme.danger,
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {message.text}
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1 }}>
          {files.map((file) => {
            const pages = [...(file.pages || [])].sort((a, b) => a.ordre - b.ordre);
            const isPdf = file.mime_type === "application/pdf";
            return (
              <div key={file.id} style={{ marginBottom: 14 }}>
                {files.length > 1 && (
                  <div
                    style={{
                      color: theme.textMuted,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 6,
                    }}
                  >
                    {file.file_name}
                  </div>
                )}

                {!isPdf ? (
                  <div
                    style={{
                      border: `1px solid ${theme.border}`,
                      borderRadius: 10,
                      background: theme.bg,
                      padding: "10px 12px",
                      fontSize: 12,
                      color: theme.textSecondary,
                    }}
                  >
                    Image ({file.file_name}) — une image est une page
                    indivisible : utilisez le crayon dans la liste des
                    documents pour la renommer ou la remplacer.
                  </div>
                ) : (
                  <div
                    style={{
                      border: `1px solid ${theme.border}`,
                      borderRadius: 10,
                      background: theme.bg,
                    }}
                  >
                    {pages.map((page, idx) => {
                      const rowBusy = busy === page.id;
                      return (
                        <div
                          key={page.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 10px",
                            borderBottom:
                              idx < pages.length - 1
                                ? `1px solid ${theme.border}`
                                : "none",
                            opacity: rowBusy ? 0.5 : 1,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 1,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => movePage(file, page, "up")}
                              disabled={idx === 0 || !!busy}
                              title="Monter"
                              aria-label={`Monter ${page.nom}`}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                lineHeight: 1,
                                fontSize: 10,
                                color: idx === 0 ? theme.textMuted : theme.primary,
                                cursor: idx === 0 ? "default" : "pointer",
                              }}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => movePage(file, page, "down")}
                              disabled={idx === pages.length - 1 || !!busy}
                              title="Descendre"
                              aria-label={`Descendre ${page.nom}`}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                lineHeight: 1,
                                fontSize: 10,
                                color:
                                  idx === pages.length - 1
                                    ? theme.textMuted
                                    : theme.primary,
                                cursor:
                                  idx === pages.length - 1 ? "default" : "pointer",
                              }}
                            >
                              ▼
                            </button>
                          </div>
                          <span
                            style={{
                              color: theme.textMuted,
                              fontSize: 11,
                              minWidth: 16,
                              textAlign: "right",
                            }}
                          >
                            {idx + 1}
                          </span>
                          <div
                            title={page.nom}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              color: theme.text,
                              fontSize: 13,
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {page.nom}
                          </div>
                          <button
                            type="button"
                            onClick={() => renamePage(file, page)}
                            disabled={!!busy}
                            title="Renommer cette page"
                            aria-label={`Renommer ${page.nom}`}
                            style={smallBtn({
                              cursor: busy ? "not-allowed" : "pointer",
                            })}
                          >
                            Renommer
                          </button>
                          <button
                            type="button"
                            onClick={() => replacePage(file, page)}
                            disabled={!!busy}
                            title="Remplacer le contenu de cette page"
                            aria-label={`Remplacer ${page.nom}`}
                            style={smallBtn({
                              cursor: busy ? "not-allowed" : "pointer",
                            })}
                          >
                            Remplacer
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setAddTarget({ fileId: file.id, position: idx + 1 })
                            }
                            disabled={!!busy}
                            title="Insérer une page avant celle-ci"
                            aria-label={`Insérer une page avant ${page.nom}`}
                            style={smallBtn({
                              cursor: busy ? "not-allowed" : "pointer",
                            })}
                          >
                            + avant
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePage(file, page)}
                            disabled={!!busy}
                            title="Supprimer cette page"
                            aria-label={`Supprimer ${page.nom}`}
                            style={smallBtn({
                              border: `1px solid ${theme.dangerBorder}`,
                              color: theme.danger,
                              cursor: busy ? "not-allowed" : "pointer",
                            })}
                          >
                            Supprimer
                          </button>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() =>
                        setAddTarget({ fileId: file.id, position: null })
                      }
                      disabled={!!busy}
                      style={{
                        width: "100%",
                        background: theme.primaryBg,
                        border: "none",
                        borderTop: `1px solid ${theme.border}`,
                        borderRadius: "0 0 10px 10px",
                        color: theme.primary,
                        padding: "9px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: busy ? "not-allowed" : "pointer",
                        fontFamily: theme.fontFamily,
                      }}
                    >
                      {busy === `add-${file.id}`
                        ? "Ajout en cours..."
                        : "+ Ajouter une ou plusieurs pages à la fin"}
                    </button>

                  </div>
                )}
              </div>
            );
          })}
        </div>

        <input
          ref={addInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.tiff"
          multiple
          style={{ display: "none" }}
          onChange={onAddChosen}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.tiff"
          style={{ display: "none" }}
          onChange={onReplaceChosen}
        />
      </div>
      {ConfirmDialog}
      {PromptDialog}
    </div>
  );
};

export default DocumentPagesModal;
