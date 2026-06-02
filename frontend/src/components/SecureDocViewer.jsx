import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { theme } from "../styles/theme";

pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.js`;

const SecureDocViewer = ({ url, mimeType, fileName }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);

  const isPdf = mimeType?.includes("pdf") || fileName?.endsWith(".pdf");
  const isImage =
    mimeType?.includes("image") ||
    [".jpg", ".jpeg", ".png", ".tiff"].some((ext) => fileName?.endsWith(ext));

  if (!url) return null;

  // ─── IMAGE ────────────────────────────────────────────────────────────────
  if (isImage) {
    return (
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: 20,
          background: "#F0F0F0",
          userSelect: "none",
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img
          src={url}
          alt={fileName}
          style={{
            maxWidth: "100%",
            height: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            pointerEvents: "none", // empêche drag
          }}
          draggable={false}
        />
      </div>
    );
  }

  // ─── PDF ──────────────────────────────────────────────────────────────────
  if (isPdf) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Barre de navigation custom — PAS de bouton télécharger */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px",
            background: theme.bg,
            borderBottom: `1px solid ${theme.primaryBorder}`,
          }}
        >
          {/* Navigation pages */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
              style={{
                background: theme.primaryBg,
                border: `1px solid ${theme.primaryBorder}`,
                color: theme.primary,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 13,
                cursor: pageNumber <= 1 ? "not-allowed" : "pointer",
                opacity: pageNumber <= 1 ? 0.5 : 1,
              }}
            >
              ←
            </button>
            <span style={{ color: theme.text, fontSize: 13 }}>
              Page <strong>{pageNumber}</strong> / {numPages || "..."}
            </span>
            <button
              onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
              disabled={pageNumber >= numPages}
              style={{
                background: theme.primaryBg,
                border: `1px solid ${theme.primaryBorder}`,
                color: theme.primary,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 13,
                cursor: pageNumber >= numPages ? "not-allowed" : "pointer",
                opacity: pageNumber >= numPages ? 0.5 : 1,
              }}
            >
              →
            </button>
          </div>

          {/* Zoom */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
              style={{
                background: theme.primaryBg,
                border: `1px solid ${theme.primaryBorder}`,
                color: theme.primary,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              −
            </button>
            <span
              style={{
                color: theme.textSecondary,
                fontSize: 12,
                minWidth: 40,
                textAlign: "center",
              }}
            >
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => Math.min(3, s + 0.2))}
              style={{
                background: theme.primaryBg,
                border: `1px solid ${theme.primaryBorder}`,
                color: theme.primary,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              +
            </button>
            <button
              onClick={() => setScale(1.2)}
              style={{
                background: "transparent",
                border: `1px solid ${theme.primaryBorder}`,
                color: theme.textSecondary,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Viewer PDF — sans aucun contrôle natif du navigateur */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            background: "#525659",
            display: "flex",
            justifyContent: "center",
            padding: 20,
            userSelect: "none",
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Document
            file={url}
            onLoadSuccess={({ numPages }) => {
              setNumPages(numPages);
              setPageNumber(1);
            }}
            onLoadError={(err) => console.error("PDF load error:", err)}
            loading={
              <div style={{ color: "#fff", padding: 40 }}>
                Chargement du PDF...
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={
                <div style={{ color: "#fff", padding: 20 }}>
                  Chargement page...
                </div>
              }
            />
          </Document>
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
        <div style={{ fontSize: 40, marginBottom: 12 }}>📎</div>
        <div>Format non prévisualisable</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>{fileName}</div>
      </div>
    </div>
  );
};

export default SecureDocViewer;
