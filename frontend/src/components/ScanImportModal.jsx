import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { theme } from "../styles/theme";
import { useConfirm } from "./ConfirmDialog";
import api from "../services/api";

pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.js`;

const MAX_FILES = 20;
const MAX_TOTAL_PAGES = 100;
const GROUP_COLORS = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe", "#fee2e2"];

// Construit une liste plate d'entrées "page" à partir des fichiers
// sélectionnés — un PDF de N pages contribue N entrées, une image en
// contribue une seule. Ordre = ordre des fichiers, puis ordre des pages.
export function buildPageList(files, pageCounts) {
  const entries = [];
  files.forEach((file, fileIndex) => {
    const isImage = file.type?.startsWith("image/");
    const count = pageCounts[fileIndex] || 1;
    for (let pageNum = 1; pageNum <= count; pageNum++) {
      entries.push({
        id: `${fileIndex}-${pageNum}`,
        fileIndex,
        fileName: file.name,
        pageNum,
        isImage,
      });
    }
  });
  return entries;
}

const ScanImportModal = ({ employeeId, typesDocumentsList, onClose, onImported }) => {
  const { confirm, ConfirmDialog } = useConfirm();
  const [files, setFiles] = useState([]);
  const [pageCounts, setPageCounts] = useState([]);
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(null);

  const [groups, setGroups] = useState([]); // {id, typeDocId, pageIds: []}
  const [selectedPageIds, setSelectedPageIds] = useState(new Set());
  const [lastClickedId, setLastClickedId] = useState(null);
  const [assignTypeId, setAssignTypeId] = useState(typesDocumentsList[0]?.id || "");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleFilesSelected = useCallback((e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    if (selected.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} fichiers par import.`);
      return;
    }
    setError(null);
    setFiles(selected);
    setPageCounts(new Array(selected.length).fill(null));
    setPages([]);
    setGroups([]);
    setSelectedPageIds(new Set());
    setResult(null);
  }, []);

  const handlePdfLoadSuccess = useCallback((fileIndex, numPages) => {
    setPageCounts((prev) => {
      const next = [...prev];
      next[fileIndex] = numPages;
      if (next.every((c) => c !== null)) {
        const list = buildPageList(files, next);
        if (list.length > MAX_TOTAL_PAGES) {
          setError(`Maximum ${MAX_TOTAL_PAGES} pages au total.`);
        } else {
          setPages(list);
        }
      }
      return next;
    });
  }, [files]);

  const groupIdForPage = (pageId) => {
    const g = groups.find((grp) => grp.pageIds.includes(pageId));
    return g ? g.id : null;
  };

  const handlePageClick = (page, e) => {
    const pageId = page.id;
    if (e.shiftKey && lastClickedId) {
      const [lastFileIndex, lastPageNum] = lastClickedId.split("-").map(Number);
      if (lastFileIndex === page.fileIndex) {
        const [lo, hi] = [lastPageNum, page.pageNum].sort((a, b) => a - b);
        const rangeIds = pages
          .filter((p) => p.fileIndex === page.fileIndex && p.pageNum >= lo && p.pageNum <= hi)
          .map((p) => p.id);
        setSelectedPageIds(new Set(rangeIds));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedPageIds((prev) => {
        const next = new Set(prev);
        next.has(pageId) ? next.delete(pageId) : next.add(pageId);
        return next;
      });
      setLastClickedId(pageId);
      return;
    }
    // Clic simple : sélectionne uniquement cette page (comportement
    // standard d'une grille de fichiers) — Shift pour une plage, Ctrl
    // pour ajouter/retirer une page, ou "Sélectionner tout le fichier"
    // pour prendre toutes les pages d'un même fichier source d'un coup.
    setSelectedPageIds(new Set([pageId]));
    setLastClickedId(pageId);
  };

  const selectWholeFile = (fileIndex) => {
    const sameFileIds = pages.filter((p) => p.fileIndex === fileIndex).map((p) => p.id);
    setSelectedPageIds(new Set(sameFileIds));
  };

  const assignSelectionToType = () => {
    if (!assignTypeId || selectedPageIds.size === 0) return;
    const selectedIds = Array.from(selectedPageIds);
    setGroups((prev) => {
      // Retire les pages sélectionnées de tout groupe existant (une page
      // appartient à au plus un groupe), puis crée/étend le groupe cible.
      const cleaned = prev
        .map((g) => ({ ...g, pageIds: g.pageIds.filter((id) => !selectedIds.includes(id)) }))
        .filter((g) => g.pageIds.length > 0);
      const existingTarget = cleaned.find((g) => g.typeDocId === assignTypeId);
      if (existingTarget) {
        return cleaned.map((g) =>
          g.id === existingTarget.id
            ? { ...g, pageIds: [...g.pageIds, ...selectedIds] }
            : g
        );
      }
      return [...cleaned, { id: `grp-${Date.now()}`, typeDocId: assignTypeId, pageIds: selectedIds }];
    });
    setSelectedPageIds(new Set());
  };

  const unassignedCount = pages.filter((p) => !groupIdForPage(p.id)).length;

  const colorForGroup = (groupId) => {
    const idx = groups.findIndex((g) => g.id === groupId);
    return GROUP_COLORS[idx % GROUP_COLORS.length];
  };

  const buildPlan = () => {
    // Regroupe les pages consécutives d'un même fichier au sein d'un
    // groupe en une seule "part" avec la liste ordonnée des numéros de
    // page — le backend n'a pas besoin qu'elles soient contiguës.
    return {
      groups: groups.map((g) => {
        const groupPages = pages.filter((p) => g.pageIds.includes(p.id));
        const byFile = groupPages.reduce((acc, p) => {
          (acc[p.fileIndex] = acc[p.fileIndex] || []).push(p);
          return acc;
        }, {});
        const parts = Object.entries(byFile).map(([fileIndex, pgs]) => {
          const isImage = pgs[0].isImage;
          return isImage
            ? { file_index: Number(fileIndex), is_image: true }
            : { file_index: Number(fileIndex), pages: pgs.map((p) => p.pageNum).sort((a, b) => a - b) };
        });
        return { type_doc: g.typeDocId, notes: "", parts };
      }),
    };
  };

  const handleSubmit = async () => {
    if (groups.length === 0) return;
    setSubmitting(true);
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    formData.append("plan", JSON.stringify(buildPlan()));
    try {
      const resp = await api.post(`/employees/${employeeId}/documents/scan-import/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(resp.data);
      if (resp.data.created.length > 0) onImported();
    } catch (err) {
      setResult({ created: [], failed: [{ error: err.response?.data?.error || "Erreur lors de l'import." }] });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (pages.length > 0 && !result) {
      if (!(await confirm("Fermer sans importer ? Le tri effectué sera perdu."))) return;
    }
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: theme.surface, borderRadius: 16, padding: 24, width: "min(960px, 92vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: theme.shadowMd }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Scanner un dossier</div>
          <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", color: theme.textMuted, fontSize: 20 }}>×</button>
        </div>

        {error && (
          <div style={{ color: theme.danger, fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}

        {files.length === 0 && (
          <label
            htmlFor="scan-file-input"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `2px dashed ${theme.border}`, borderRadius: 12, padding: 40,
              cursor: "pointer", color: theme.textSecondary, fontSize: 13,
            }}
          >
            Cliquez ou déposez un ou plusieurs fichiers PDF / images
            <input
              id="scan-file-input"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.tiff"
              onChange={handleFilesSelected}
              style={{ display: "none" }}
            />
          </label>
        )}

        {files.filter((f) => f.type === "application/pdf").map((file) => {
          const fileIndex = files.indexOf(file);
          return (
            <div key={fileIndex} style={{ display: "none" }}>
              <Document file={file} onLoadSuccess={({ numPages }) => handlePdfLoadSuccess(fileIndex, numPages)}>
                <Page pageNumber={1} width={1} />
              </Document>
            </div>
          );
        })}

        {pages.length > 0 && !result && (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <select
                data-testid="scan-assign-type-select"
                value={assignTypeId}
                onChange={(e) => setAssignTypeId(e.target.value)}
                className="input-focus"
                style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12 }}
              >
                {typesDocumentsList.filter((t) => !t.is_categorie).map((t) => (
                  <option key={t.id} value={t.id}>{t.nom}</option>
                ))}
              </select>
              <button
                data-testid="scan-assign-button"
                onClick={assignSelectionToType}
                disabled={selectedPageIds.size === 0}
                className="btn-lift"
                style={{
                  background: selectedPageIds.size === 0 ? theme.border : theme.primary,
                  color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px",
                  fontSize: 12, fontWeight: 700, cursor: selectedPageIds.size === 0 ? "not-allowed" : "pointer",
                }}
              >
                Assigner ({selectedPageIds.size})
              </button>
              {selectedPageIds.size > 0 && (
                <button
                  onClick={() => {
                    const selectedPage = pages.find((p) => selectedPageIds.has(p.id));
                    if (selectedPage) selectWholeFile(selectedPage.fileIndex);
                  }}
                  style={{
                    background: "none", border: `1px solid ${theme.border}`, borderRadius: 6,
                    padding: "6px 12px", fontSize: 11, color: theme.textSecondary, cursor: "pointer",
                  }}
                >
                  Sélectionner tout le fichier
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>
              Cliquez une page pour la sélectionner seule, Shift-clic pour une plage, Ctrl-clic pour ajouter/retirer une page.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, marginBottom: 16 }}>
              {pages.map((page) => {
                const groupId = groupIdForPage(page.id);
                const isSelected = selectedPageIds.has(page.id);
                return (
                  <div
                    key={page.id}
                    data-testid={`scan-page-${page.id}`}
                    data-selected={isSelected ? "true" : "false"}
                    onClick={(e) => handlePageClick(page, e)}
                    style={{
                      border: `2px solid ${isSelected ? theme.primary : theme.border}`,
                      background: groupId ? colorForGroup(groupId) : theme.surface,
                      borderRadius: 8, padding: 6, cursor: "pointer", textAlign: "center", fontSize: 10,
                    }}
                  >
                    <div style={{ width: "100%", aspectRatio: "3/4", background: "#F1F5F9", borderRadius: 4, marginBottom: 4, overflow: "hidden" }}>
                      {page.isImage ? (
                        <img
                          src={URL.createObjectURL(files[page.fileIndex])}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <Document file={files[page.fileIndex]}>
                          <Page pageNumber={page.pageNum} width={100} />
                        </Document>
                      )}
                    </div>
                    <div style={{ color: theme.textMuted }}>{page.fileName} — p.{page.pageNum}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginBottom: 16 }}>
              {groups.map((g) => {
                const type = typesDocumentsList.find((t) => t.id === g.typeDocId);
                return (
                  <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: colorForGroup(g.id), borderRadius: 6, fontSize: 12, marginBottom: 6 }}>
                    <span>{type?.nom} — {g.pageIds.length} page{g.pageIds.length > 1 ? "s" : ""}</span>
                    <button
                      onClick={() => setGroups((prev) => prev.filter((x) => x.id !== g.id))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: theme.danger, fontSize: 11 }}
                    >
                      Dissoudre
                    </button>
                  </div>
                );
              })}
              {unassignedCount > 0 && (
                <div style={{ color: theme.warning, fontSize: 11 }}>
                  {unassignedCount} page{unassignedCount > 1 ? "s" : ""} non assignée{unassignedCount > 1 ? "s" : ""} — ne sera pas importée.
                </div>
              )}
            </div>

            <button
              data-testid="scan-import-submit"
              onClick={handleSubmit}
              disabled={groups.length === 0 || submitting}
              className="btn-lift"
              style={{
                background: groups.length === 0 || submitting ? theme.border : theme.primary,
                color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px",
                fontSize: 13, fontWeight: 700,
                cursor: groups.length === 0 || submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Import en cours..." : "Importer"}
            </button>
          </>
        )}

        {result && (
          <div style={{ fontSize: 13, color: theme.text }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {result.created.length} document{result.created.length !== 1 ? "s" : ""} importé{result.created.length !== 1 ? "s" : ""}
            </div>
            {result.failed.length > 0 && (
              <div style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>
                {result.failed.length} échec(s) : {result.failed.map((f) => f.type_doc_nom || f.error).join(", ")}
              </div>
            )}
            <button onClick={onClose} style={{ background: theme.primary, color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Fermer
            </button>
          </div>
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
};

export default ScanImportModal;
