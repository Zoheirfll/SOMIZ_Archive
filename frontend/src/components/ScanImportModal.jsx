import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useTheme } from "../context/ThemeContext";
import { useConfirm } from "./ConfirmDialog";
import api from "../services/api";

pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.js`;

const MAX_FILES = 50;
const MAX_TOTAL_PAGES = 300;
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

// Ne monte son contenu (la vraie miniature PDF) qu'une fois visible à
// l'écran (2026-09-15) — chaque miniature de page instancie son propre
// <Document>, qui re-parse tout le fichier PDF et ouvre son propre canvas ;
// au-delà d'une vingtaine de pages montées en même temps, les navigateurs
// plafonnent les canvas/contexte concurrents et les miniatures suivantes
// apparaissent tronquées/vides — impossible à identifier pour les
// glisser-déposer sur un dossier. `rootMargin` précharge une marge
// au-dessus/en dessous du viewport pour éviter un flash au scroll ;
// `once` référencé via `hasBeenVisible` pour ne jamais redémonter (donc
// re-parser) une miniature déjà chargée.
const LazyThumb = ({ children, placeholder, rootRef }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible || !ref.current) return undefined;
    // `root: rootRef?.current` scope l'observation au conteneur scrollable
    // de la modale (pas au viewport du navigateur) — sinon un élément
    // clippé par le `overflowY: auto` de la modale mais toujours dans les
    // bornes de la fenêtre serait compté comme visible et monté trop tôt.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible(true);
      },
      { root: rootRef?.current || null, rootMargin: "300px 0px" }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible, rootRef]);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%" }}>
      {visible ? children : placeholder}
    </div>
  );
};

const ScanImportModal = ({ employeeId, typesDocumentsList, onClose, onImported }) => {
  const theme = useTheme();
  const { confirm, ConfirmDialog } = useConfirm();
  const [files, setFiles] = useState([]);
  const [pageCounts, setPageCounts] = useState([]);
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(null);

  const [groups, setGroups] = useState([]); // {id, typeDocId, pageIds: []}
  const [selectedPageIds, setSelectedPageIds] = useState(new Set());
  const [lastClickedId, setLastClickedId] = useState(null);
  const [dragOverTypeId, setDragOverTypeId] = useState(null);

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
    // Une image n'a besoin d'aucun chargement pdf.js pour connaître son
    // nombre de pages (toujours 1) — l'initialiser directement à 1 ici
    // plutôt qu'à null, sinon `pageCounts.every(c => c !== null)` plus bas
    // n'est jamais vrai dès qu'une image se trouve parmi les fichiers
    // sélectionnés (seuls les PDF déclenchent onLoadSuccess), et la grille
    // de pages ne s'affiche jamais — la modale semble bloquée.
    setPageCounts(selected.map((f) => (f.type?.startsWith("image/") ? 1 : null)));
    setPages([]);
    setGroups([]);
    setSelectedPageIds(new Set());
    setResult(null);
  }, []);

  const handlePdfLoadSuccess = useCallback((fileIndex, numPages) => {
    setPageCounts((prev) => {
      const next = [...prev];
      next[fileIndex] = numPages;
      return next;
    });
  }, []);

  // Construit la liste des pages dès que tous les fichiers ont un nombre
  // de pages connu (images = déjà 1 à l'initialisation, PDF = rempli par
  // handlePdfLoadSuccess) — y compris quand la sélection ne contient
  // aucun PDF (aucun onLoadSuccess ne se déclenche alors).
  useEffect(() => {
    if (files.length === 0 || pageCounts.length !== files.length) return;
    if (!pageCounts.every((c) => c !== null)) return;
    const list = buildPageList(files, pageCounts);
    if (list.length > MAX_TOTAL_PAGES) {
      setError(`Maximum ${MAX_TOTAL_PAGES} pages au total.`);
    } else {
      setPages(list);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, pageCounts]);

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
    // Clic simple : bascule la sélection de cette page (re-cliquer la
    // désélectionne) — Shift pour une plage, double-clic pour prendre
    // toutes les pages d'un même fichier source d'un coup.
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      next.has(pageId) ? next.delete(pageId) : next.add(pageId);
      return next;
    });
    setLastClickedId(pageId);
  };

  const selectWholeFile = (fileIndex) => {
    const sameFileIds = pages.filter((p) => p.fileIndex === fileIndex).map((p) => p.id);
    setSelectedPageIds(new Set(sameFileIds));
  };

  // Assigne un ensemble de pages à un type de document — appelée au
  // dépôt (drag & drop) d'une ou plusieurs pages sur un dossier, ou au
  // clic sur un dossier quand des pages sont déjà sélectionnées.
  const assignPagesToType = (pageIds, typeDocId) => {
    if (!typeDocId || pageIds.length === 0) return;
    setGroups((prev) => {
      // Retire les pages concernées de tout groupe existant (une page
      // appartient à au plus un groupe), puis crée/étend le groupe cible.
      const cleaned = prev
        .map((g) => ({ ...g, pageIds: g.pageIds.filter((id) => !pageIds.includes(id)) }))
        .filter((g) => g.pageIds.length > 0);
      const existingTarget = cleaned.find((g) => g.typeDocId === typeDocId);
      if (existingTarget) {
        return cleaned.map((g) =>
          g.id === existingTarget.id
            ? { ...g, pageIds: [...g.pageIds, ...pageIds] }
            : g
        );
      }
      return [...cleaned, { id: `grp-${Date.now()}`, typeDocId, pageIds }];
    });
    setSelectedPageIds(new Set());
  };

  const handlePageDragStart = (page, e) => {
    // Si la page glissée fait partie de la sélection courante, on
    // déplace toute la sélection ; sinon on ne déplace que cette page.
    const idsToDrag = selectedPageIds.has(page.id) && selectedPageIds.size > 0
      ? Array.from(selectedPageIds)
      : [page.id];
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(idsToDrag));
  };

  const handleDropOnDossier = (typeDocId, e) => {
    e.preventDefault();
    setDragOverTypeId(null);
    let pageIds = [];
    try {
      pageIds = JSON.parse(e.dataTransfer.getData("text/plain") || "[]");
    } catch {
      pageIds = [];
    }
    if (pageIds.length === 0) return;
    assignPagesToType(pageIds, typeDocId);
  };

  const handleDossierClick = (typeDocId) => {
    if (selectedPageIds.size === 0) return;
    assignPagesToType(Array.from(selectedPageIds), typeDocId);
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
      const data = err.response?.data;
      const message =
        data?.error ||
        data?.non_field_errors?.[0] ||
        data?.files?.[0] ||
        (typeof data?.plan === "string" ? data.plan : null) ||
        (Array.isArray(data?.plan) ? data.plan[0] : null) ||
        "Erreur lors de l'import.";
      setResult({ created: [], failed: [{ error: message }] });
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

  const scrollRef = useRef(null);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div ref={scrollRef} style={{ background: theme.surface, borderRadius: 16, padding: 24, width: "min(960px, 92vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: theme.shadowMd }}>
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
            {/* Sticky (2026-09-15) : avec beaucoup de pages (jusqu'à 300),
                cette barre défilait hors de vue avec le reste — impossible
                d'y glisser ou même d'y cliquer une fois descendu loin dans
                la grille ("on est trop bas dans la sélection"). Fixée en
                haut du conteneur scrollable de la modale, fond opaque pour
                rester lisible par-dessus les miniatures qui défilent
                dessous. */}
            <div style={{
              position: "sticky", top: 0, zIndex: 5, background: theme.surface,
              paddingTop: 4, paddingBottom: 4,
              borderBottom: `1px solid ${theme.border}`,
            }}>
              <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8 }}>
                Glissez une page (ou plusieurs pages sélectionnées) vers un dossier ci-dessous pour l'assigner. Cliquez une page pour la sélectionner/désélectionner, Shift-clic pour une plage.
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 12 }}>
              {typesDocumentsList.filter((t) => !t.is_categorie).map((t) => {
                const group = groups.find((g) => g.typeDocId === t.id);
                const isDragOver = dragOverTypeId === t.id;
                return (
                  <div
                    key={t.id}
                    data-testid={`scan-dossier-${t.id}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOverTypeId(t.id); }}
                    onDragLeave={() => setDragOverTypeId((prev) => (prev === t.id ? null : prev))}
                    onDrop={(e) => handleDropOnDossier(t.id, e)}
                    onClick={() => handleDossierClick(t.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      border: `2px dashed ${isDragOver ? theme.primary : theme.border}`,
                      background: group ? colorForGroup(group.id) : (isDragOver ? theme.primaryBg : theme.surface),
                      borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: theme.text,
                      cursor: selectedPageIds.size > 0 ? "pointer" : "default",
                    }}
                  >
                    📁 {t.nom}
                    {group && (
                      <span style={{ color: theme.textMuted, fontWeight: 400 }}>
                        ({group.pageIds.length})
                      </span>
                    )}
                  </div>
                );
              })}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, marginBottom: 16, marginTop: 12 }}>
              {pages.map((page) => {
                const groupId = groupIdForPage(page.id);
                const isSelected = selectedPageIds.has(page.id);
                return (
                  <div
                    key={page.id}
                    data-testid={`scan-page-${page.id}`}
                    data-selected={isSelected ? "true" : "false"}
                    draggable
                    onDragStart={(e) => handlePageDragStart(page, e)}
                    onClick={(e) => handlePageClick(page, e)}
                    onDoubleClick={() => selectWholeFile(page.fileIndex)}
                    title="Double-clic : sélectionner tout le fichier"
                    style={{
                      border: `2px solid ${isSelected ? theme.primary : theme.border}`,
                      background: groupId ? colorForGroup(groupId) : theme.surface,
                      borderRadius: 8, padding: 6, cursor: "grab", textAlign: "center", fontSize: 10,
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
                        <LazyThumb rootRef={scrollRef} placeholder={<div style={{ width: "100%", height: "100%" }} />}>
                          <Document file={files[page.fileIndex]} loading="">
                            <Page pageNumber={page.pageNum} width={100} />
                          </Document>
                        </LazyThumb>
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
