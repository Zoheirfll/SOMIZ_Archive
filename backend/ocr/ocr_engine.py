"""
ocr/ocr_engine.py
Appel isolé à Tesseract (via pytesseract) — jamais d'appel réseau, tout
tourne localement (conformité Loi 18-07/RGPD, voir spec OCR).
"""

import pytesseract
from PIL import Image
from pdf2image import convert_from_path


class OcrEngineError(Exception):
    pass


def _confidence_from_data(data):
    scores = [int(c) for c in data.get('conf', []) if c not in ('-1', -1)]
    return sum(scores) / len(scores) if scores else 0.0


def _ocr_image(image):
    text = pytesseract.image_to_string(image)
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
    return text, _confidence_from_data(data)


def run_ocr_on_file(file_path, mime_type):
    try:
        if mime_type == 'application/pdf':
            pages = convert_from_path(file_path)
            texts, confidences = [], []
            for page in pages:
                text, confidence = _ocr_image(page)
                texts.append(text)
                confidences.append(confidence)
            full_text = "\n".join(texts).strip()
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            return full_text, avg_confidence

        image = Image.open(file_path)
        text, confidence = _ocr_image(image)
        return text.strip(), confidence
    except Exception as exc:
        raise OcrEngineError(str(exc)) from exc
