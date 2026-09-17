import { useState, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { useTheme } from "../context/ThemeContext";
import { PaperclipIcon } from "./icons";

pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.js`;

const SecureDocViewer = ({
  url,
  mimeType,
  fileName,
  pages,
  onRenamePage,
  initialPage,
  savedRotation,
  canSaveRotation,
  onSaveRotation,
}) => {
  const theme = useTheme();
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(initialPage || 1);
  const [scale, setScale] = useState(1.2);
  // Rotation image — initialisée depuis le réglage par défaut enregistré par
  // un ADMIN/SUPERADMIN (savedRotation), 0 sinon. Un CONSULTANT peut la
  // modifier localement (setRotation) sans jamais toucher à savedRotation.
  const [rotation, setRotation] = useState(savedRotation || 0);
  // PDF : { [pageNumber]: degrés } — initialisé depuis la rotation par
  // défaut de chaque page (pages[].rotation), même principe que ci-dessus.
  const [pageRotations, setPageRotations] = useState(() => {
    const initial = {};
    (pages || []).forEach((p, idx) => {
      if (p?.rotation) initial[idx + 1] = p.rotation;
    });
    return initial;
  });
  const [savingRotation, setSavingRotation] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragStart = useRef(null);

  const rotateBtnStyle = {
    background: theme.primaryBg,
    border: `1px solid ${theme.primaryBorder}`,
    color: theme.primary,
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: 13,
    cursor: "pointer",
  };

  const isPdf = mimeType?.includes("pdf") || fileName?.endsWith(".pdf");
  const isImage =
    mimeType?.includes("image") ||
    [".jpg", ".jpeg", ".png", ".tiff"].some((ext) => fileName?.endsWith(ext));

  if (!url) return null;

  // ─── IMAGE ────────────────────────────────────────────────────────────────
  if (isImage) {
    const handleMouseDown = (e) => {
      e.preventDefault();
      setDragging(true);
      dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    };
    const handleMouseMove = (e) => {
      if (!dragStart.current) return;
      setPos({
        x: dragStart.current.px + (e.clientX - dragStart.current.mx),
        y: dragStart.current.py + (e.clientY - dragStart.current.my),
      });
    };
    const handleMouseUp = () => {
      setDragging(false);
      dragStart.current = null;
    };
    const resetView = () => {
      setScale(1);
      setRotation(0);
      setPos({ x: 0, y: 0 });
    };
    const handleSaveRotation = async () => {
      if (savingRotation) return;
      setSavingRotation(true);
      try {
        await onSaveRotation(rotation);
      } finally {
        setSavingRotation(false);
      }
    };

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Barre zoom image */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 16px", background: theme.bg, borderBottom: `1px solid ${theme.primaryBorder}`, gap: 8 }}>
          <button onClick={() => setScale((s) => Math.max(0.2, s - 0.2))}
            style={{ background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, color: theme.primary, borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: "pointer" }}>−</button>
          <span style={{ color: theme.textSecondary, fontSize: 12, minWidth: 40, textAlign: "center" }}>
            {Math.round(scale * 100)}%
          </span>
          <button onClick={() => setScale((s) => Math.min(4, s + 0.2))}
            style={{ background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, color: theme.primary, borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: "pointer" }}>+</button>
          <button onClick={() => setRotation((r) => (r + 90) % 360)}
            title="Pivoter de 90°" aria-label="Pivoter de 90°" style={rotateBtnStyle}>⟳</button>
          {canSaveRotation && (
            <button
              onClick={handleSaveRotation}
              disabled={savingRotation || rotation === (savedRotation || 0)}
              title="Enregistrer cette rotation comme réglage par défaut pour tout le monde"
              aria-label="Enregistrer la rotation par défaut"
              style={{
                background: theme.primary,
                border: "none",
                color: "#fff",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 600,
                cursor: savingRotation || rotation === (savedRotation || 0) ? "not-allowed" : "pointer",
                opacity: savingRotation || rotation === (savedRotation || 0) ? 0.6 : 1,
              }}
            >
              {savingRotation ? "…" : "💾 Enregistrer"}
            </button>
          )}
          <button onClick={resetView}
            style={{ background: "transparent", border: `1px solid ${theme.primaryBorder}`, color: theme.textSecondary, borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>Reset</button>
        </div>
        <div
          style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#F0F0F0", userSelect: "none", cursor: dragging ? "grabbing" : "grab" }}
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <img
            src={url}
            alt={fileName}
            style={{
              maxWidth: "92%",
              maxHeight: "92%",
              width: "auto",
              height: "auto",
              transform: `scale(${scale}) translate(${pos.x}px, ${pos.y}px) rotate(${rotation}deg)`,
              transformOrigin: "center center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
              pointerEvents: "none",
              transition: dragging ? "none" : "transform 0.1s",
            }}
            draggable={false}
          />
        </div>
      </div>
    );
  }

  // ─── PDF ──────────────────────────────────────────────────────────────────
  if (isPdf) {
    const handlePdfMouseDown = (e) => {
      e.preventDefault();
      setDragging(true);
      dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    };
    const handlePdfMouseMove = (e) => {
      if (!dragStart.current) return;
      setPos({
        x: dragStart.current.px + (e.clientX - dragStart.current.mx),
        y: dragStart.current.py + (e.clientY - dragStart.current.my),
      });
    };
    const handlePdfMouseUp = () => {
      setDragging(false);
      dragStart.current = null;
    };
    const currentPageRotation = pageRotations[pageNumber] || 0;
    const rotateCurrentPage = () =>
      setPageRotations((r) => ({
        ...r,
        [pageNumber]: ((r[pageNumber] || 0) + 90) % 360,
      }));
    const currentPageSavedRotation = pages?.[pageNumber - 1]?.rotation || 0;
    const currentPageId = pages?.[pageNumber - 1]?.id;
    const handleSaveRotation = async () => {
      if (savingRotation || !currentPageId) return;
      setSavingRotation(true);
      try {
        await onSaveRotation(currentPageRotation, currentPageId);
      } finally {
        setSavingRotation(false);
      }
    };

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Barre navigation (nom de page à largeur variable — jamais sur la même ligne que le zoom/rotation) */}
        <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", background: theme.bg, borderBottom: `1px solid ${theme.primaryBorder}` }}>
          {/* Navigation pages */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <button onClick={() => setPageNumber((p) => Math.max(1, p - 1))} disabled={pageNumber <= 1}
              style={{ background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, color: theme.primary, borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: pageNumber <= 1 ? "not-allowed" : "pointer", opacity: pageNumber <= 1 ? 0.5 : 1 }}>←</button>
            <span style={{ color: theme.text, fontSize: 13 }}>
              Page <strong>{pageNumber}</strong> / {numPages || "..."}
            </span>
            {/* Nom propre de la page courante (EmployeeDocumentFilePage) —
                cliquable pour le renommer sur place quand l'utilisateur en
                a le droit (ADMIN) ; sinon simple libellé. */}
            {pages?.[pageNumber - 1]?.nom &&
              (onRenamePage ? (
                <button
                  type="button"
                  onClick={() => onRenamePage(pages[pageNumber - 1])}
                  title="Cliquer pour renommer cette page"
                  style={{
                    background: theme.primaryBg,
                    border: `1px solid ${theme.primaryBorder}`,
                    borderRadius: 6,
                    color: theme.primary,
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "3px 10px",
                    cursor: "pointer",
                    width: 220,
                    flexShrink: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "center",
                    fontFamily: "inherit",
                  }}
                >
                  {pages[pageNumber - 1].nom} ✏️
                </button>
              ) : (
                <span
                  title={pages[pageNumber - 1].nom}
                  style={{
                    color: theme.textSecondary,
                    fontSize: 12,
                    fontWeight: 600,
                    width: 220,
                    flexShrink: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "center",
                  }}
                >
                  · {pages[pageNumber - 1].nom}
                </span>
              ))}
            <button onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages}
              style={{ background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, color: theme.primary, borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: pageNumber >= numPages ? "not-allowed" : "pointer", opacity: pageNumber >= numPages ? 0.5 : 1 }}>→</button>
          </div>
        </div>

        {/* Barre zoom + rotation — ligne dédiée, position fixe indépendante du nom de page */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "6px 16px", background: theme.bg, borderBottom: `1px solid ${theme.primaryBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
              style={{ background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, color: theme.primary, borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: "pointer" }}>−</button>
            <span style={{ color: theme.textSecondary, fontSize: 12, minWidth: 40, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale((s) => Math.min(3, s + 0.2))}
              style={{ background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, color: theme.primary, borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: "pointer" }}>+</button>
            <button onClick={rotateCurrentPage}
              title="Pivoter cette page de 90°" aria-label="Pivoter cette page de 90°" style={rotateBtnStyle}>⟳</button>
            {canSaveRotation && (
              <button
                onClick={handleSaveRotation}
                disabled={savingRotation || !currentPageId || currentPageRotation === currentPageSavedRotation}
                title="Enregistrer la rotation de cette page comme réglage par défaut pour tout le monde"
                aria-label="Enregistrer la rotation par défaut de cette page"
                style={{
                  background: theme.primary,
                  border: "none",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor:
                    savingRotation || !currentPageId || currentPageRotation === currentPageSavedRotation
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    savingRotation || !currentPageId || currentPageRotation === currentPageSavedRotation ? 0.6 : 1,
                }}
              >
                {savingRotation ? "…" : "💾 Enregistrer"}
              </button>
            )}
            <button onClick={() => { setScale(1.2); setPageRotations((r) => ({ ...r, [pageNumber]: 0 })); setPos({ x: 0, y: 0 }); }}
              style={{ background: "transparent", border: `1px solid ${theme.primaryBorder}`, color: theme.textSecondary, borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>Reset</button>
          </div>
        </div>

        {/* Viewer PDF avec drag */}
        <div
          style={{ flex: 1, overflow: "hidden", background: "#525659", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 20, userSelect: "none", cursor: dragging ? "grabbing" : "grab" }}
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={handlePdfMouseDown}
          onMouseMove={handlePdfMouseMove}
          onMouseUp={handlePdfMouseUp}
          onMouseLeave={handlePdfMouseUp}
        >
          <div style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, transition: dragging ? "none" : "transform 0.1s" }}>
            <Document
              file={url}
              onLoadSuccess={({ numPages }) => {
                setNumPages(numPages);
                const target = initialPage && initialPage >= 1 && initialPage <= numPages ? initialPage : 1;
                setPageNumber(target);
              }}
              onLoadError={(err) => console.error("PDF load error:", err)}
              loading={<div style={{ color: "#fff", padding: 40 }}>Chargement du PDF...</div>}
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                rotate={currentPageRotation}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={<div style={{ color: "#fff", padding: 20 }}>Chargement page...</div>}
              />
            </Document>
          </div>
        </div>
      </div>
    );
  }

  // ─── Type non supporté ────────────────────────────────────────────────────
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: theme.textMuted,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><PaperclipIcon size={36} /></div>
        <div>Format non prévisualisable</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>{fileName}</div>
      </div>
    </div>
  );
};

export default SecureDocViewer;
