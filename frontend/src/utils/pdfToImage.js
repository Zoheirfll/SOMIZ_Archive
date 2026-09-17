import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.js`;

/**
 * Rend la première page d'un fichier PDF sur un <canvas> et renvoie une
 * Object URL de l'image PNG résultante — utilisé pour permettre à
 * PhotoCropModal (qui ne sait afficher qu'une image) de cadrer une photo
 * fournie en PDF (ex. scan de photo d'identité).
 *
 * Lève une erreur si le PDF n'a aucune page ou ne peut pas être rendu.
 */
export async function pdfFirstPageToImageUrl(file, scale = 2) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  if (pdf.numPages < 1) {
    throw new Error("Ce PDF ne contient aucune page.");
  }
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Impossible de convertir ce PDF en image."));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}
