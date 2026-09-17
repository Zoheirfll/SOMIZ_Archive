"""
ocr/ocr_engine.py
Appel isolé à Tesseract (via pytesseract) — jamais d'appel réseau, tout
tourne localement (conformité Loi 18-07/RGPD, voir spec OCR).
"""

import pytesseract
from PIL import Image, ImageOps
from pdf2image import convert_from_path


class OcrEngineError(Exception):
    pass


# Documents RH algériens : rédigés en arabe (état civil, CNI...), parfois en
# français, occasionnellement avec du texte anglais — les 3 packs sont
# chargés ensemble (Tesseract choisit le meilleur script par bloc).
OCR_LANGUAGES = 'ara+fra+eng'

# Un scan à 200 DPI (défaut pdf2image) ou une petite photo de document donne
# un texte quasi illisible pour Tesseract (confondu avec du bruit) — 300 DPI
# + agrandissement des petites images + passage en niveaux de gris/contraste
# accru sont le minimum pour des documents administratifs scannés au
# téléphone ou sur un scanner bureautique classique.
PDF_RENDER_DPI = 300
MIN_DIMENSION_PX = 1800


def _preprocess(image):
    image = ImageOps.exif_transpose(image)
    image = image.convert('L')
    image = ImageOps.autocontrast(image)
    width, height = image.size
    largest_side = max(width, height)
    if largest_side < MIN_DIMENSION_PX:
        scale = MIN_DIMENSION_PX / largest_side
        image = image.resize((round(width * scale), round(height * scale)), Image.LANCZOS)
    return image


def _confidence_from_data(data):
    scores = [int(c) for c in data.get('conf', []) if c not in ('-1', -1)]
    return sum(scores) / len(scores) if scores else 0.0


def _ocr_image(image):
    image = _preprocess(image)
    text = pytesseract.image_to_string(image, lang=OCR_LANGUAGES)
    data = pytesseract.image_to_data(image, lang=OCR_LANGUAGES, output_type=pytesseract.Output.DICT)
    return text, _confidence_from_data(data)


def run_ocr_on_file(file_path, mime_type):
    """
    Retourne (texte_complet, confiance_moyenne, textes_par_page). Le 3ᵉ
    élément suit l'ordre physique des pages du PDF (index 0 = page 1) —
    aligné 1:1 avec EmployeeDocumentFilePage.ordre (voir son invariant,
    employees/models.py) — pour permettre à la recherche globale de
    retrouver la page exacte d'un résultat. Liste vide pour une image
    (page indivisible, pas de EmployeeDocumentFilePage associé).
    """
    try:
        if mime_type == 'application/pdf':
            pages = convert_from_path(file_path, dpi=PDF_RENDER_DPI)
            texts, confidences = [], []
            for page in pages:
                text, confidence = _ocr_image(page)
                texts.append(text.strip())
                confidences.append(confidence)
            full_text = "\n".join(texts).strip()
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            return full_text, avg_confidence, texts

        image = Image.open(file_path)
        text, confidence = _ocr_image(image)
        return text.strip(), confidence, []
    except Exception as exc:
        raise OcrEngineError(str(exc)) from exc
