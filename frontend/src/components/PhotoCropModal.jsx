import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { useTheme } from "../context/ThemeContext";

// Découpe la zone cadrée dans un <canvas> et renvoie un Blob JPEG.
async function getCroppedBlob(imageSrc, cropPixels) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = cropPixels.width;
  canvas.height = cropPixels.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    cropPixels.width,
    cropPixels.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
  });
}

/**
 * Modale de cadrage d'une photo avant upload (zoom + déplacement),
 * appelée avec l'URL locale (object URL) du fichier choisi.
 *
 * <PhotoCropModal imageSrc={url} shape="round" onCancel={...} onValidate={(blob) => ...} />
 */
export default function PhotoCropModal({ imageSrc, shape = "rect", onCancel, onValidate }) {
  const theme = useTheme();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cropError, setCropError] = useState(null);

  const onCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleValidate = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    setCropError(null);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      if (!blob) {
        setCropError("Impossible de traiter cette image. Essayez un autre fichier.");
        return;
      }
      await onValidate(blob);
    } catch {
      setCropError("Impossible de traiter cette image. Essayez un autre fichier.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2100,
        backdropFilter: "blur(2px)",
      }}
      onClick={() => !saving && onCancel()}
    >
      <div
        style={{
          background: theme.surface,
          borderRadius: 16,
          padding: 24,
          width: 420,
          maxWidth: "92vw",
          boxShadow: "0 16px 48px rgba(15,23,42,0.3)",
          border: `1px solid ${theme.border}`,
          fontFamily: theme.fontFamily,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ color: theme.text, fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
          Ajuster la photo
        </div>

        <div
          style={{
            position: "relative",
            width: "100%",
            height: 320,
            borderRadius: 12,
            overflow: "hidden",
            background: "#111",
          }}
        >
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape={shape}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
          <span style={{ fontSize: 12, color: theme.textSecondary, fontWeight: 600 }}>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: theme.primary }}
          />
        </div>

        {cropError && (
          <div
            style={{
              background: theme.dangerBg,
              border: `1px solid ${theme.dangerBorder}`,
              color: theme.danger,
              borderRadius: 10,
              padding: "9px 12px",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            {cropError}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              background: theme.surface,
              border: `1.5px solid ${theme.border}`,
              color: theme.textSecondary,
              borderRadius: 10,
              padding: "9px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleValidate}
            disabled={saving || !croppedAreaPixels}
            style={{
              background: theme.primary,
              border: "none",
              color: "#fff",
              borderRadius: 10,
              padding: "9px 24px",
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "wait" : "pointer",
              fontFamily: "inherit",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Envoi…" : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}
