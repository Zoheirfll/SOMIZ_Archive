import { useState, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { theme } from "../styles/theme";
import { PaperclipIcon } from "./icons";

pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.js`;

const SecureDocViewer = ({ url, mimeType, fileName }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragStart = useRef(null);

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
      setPos({ x: 0, y: 0 });
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
            style={{ width: `${scale * 100}%`, maxWidth: "none", height: "auto", transform: `translate(${pos.x}px, ${pos.y}px)`, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", pointerEvents: "none", transition: dragging ? "none" : "transform 0.1s" }}
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

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Barre navigation + zoom */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: theme.bg, borderBottom: `1px solid ${theme.primaryBorder}` }}>
          {/* Navigation pages */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setPageNumber((p) => Math.max(1, p - 1))} disabled={pageNumber <= 1}
              style={{ background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, color: theme.primary, borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: pageNumber <= 1 ? "not-allowed" : "pointer", opacity: pageNumber <= 1 ? 0.5 : 1 }}>←</button>
            <span style={{ color: theme.text, fontSize: 13 }}>
              Page <strong>{pageNumber}</strong> / {numPages || "..."}
            </span>
            <button onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages}
              style={{ background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, color: theme.primary, borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: pageNumber >= numPages ? "not-allowed" : "pointer", opacity: pageNumber >= numPages ? 0.5 : 1 }}>→</button>
          </div>

          {/* Zoom + hint drag */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
              style={{ background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, color: theme.primary, borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: "pointer" }}>−</button>
            <span style={{ color: theme.textSecondary, fontSize: 12, minWidth: 40, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale((s) => Math.min(3, s + 0.2))}
              style={{ background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, color: theme.primary, borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: "pointer" }}>+</button>
            <button onClick={() => { setScale(1.2); setPos({ x: 0, y: 0 }); }}
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
              onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPageNumber(1); }}
              onLoadError={(err) => console.error("PDF load error:", err)}
              loading={<div style={{ color: "#fff", padding: 40 }}>Chargement du PDF...</div>}
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
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
