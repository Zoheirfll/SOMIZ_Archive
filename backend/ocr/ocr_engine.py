"""
ocr/ocr_engine.py
Appel isolé à Tesseract (via pytesseract) — jamais d'appel réseau, tout
tourne localement (conformité Loi 18-07/RGPD, voir spec OCR).
"""

import re

import cv2
import numpy as np
import pytesseract
from PIL import Image, ImageOps
from pdf2image import convert_from_path


class OcrEngineError(Exception):
    pass


# Documents RH algériens, souvent mixtes (note en français avec en-tête ou
# cachet arabe). Charger ara+fra+eng d'un bloc faisait inventer du texte
# arabe parasite sur le français et déformait les mots latins : on fait donc
# deux passes séparées par page — latin (fra+eng) et arabe (ara) — puis on
# fusionne (voir _ocr_image). Les modèles installés doivent être les
# « tessdata_best » (les « fast » donnent beaucoup plus de mots faux).
LATIN_LANGUAGES = 'fra+eng'
ARABIC_LANGUAGES = 'ara'

# 300 DPI + agrandissement des petites images : minimum pour des scans
# administratifs.
PDF_RENDER_DPI = 300
MIN_DIMENSION_PX = 1800

# Confiance minimale (0-100) d'un mot pour être gardé. Écarte le pire du bruit
# des tampons et plis. Volontairement bas : à 50+ de vrais mots (« SAADI »,
# mesuré sur un scan réel) étaient supprimés.
MIN_WORD_CONFIDENCE = 30
MIN_ARABIC_WORD_CONFIDENCE = 60

_ARABIC_RE = re.compile(r'[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]')


def _fix_orientation(image):
    """Remet à l'endroit une page scannée à 90/180/270° (pack osd)."""
    try:
        osd = pytesseract.image_to_osd(image, output_type=pytesseract.Output.DICT)
        rotation = int(osd.get('rotate', 0))
        if rotation:
            return image.rotate(-rotation, expand=True, fillcolor=255)
    except Exception:
        pass  # OSD échoue sur les pages quasi vides : on garde l'image telle quelle
    return image


def _preprocess(image):
    image = ImageOps.exif_transpose(image).convert('L')
    image = ImageOps.autocontrast(image)
    width, height = image.size
    largest_side = max(width, height)
    if largest_side < MIN_DIMENSION_PX:
        scale = MIN_DIMENSION_PX / largest_side
        image = image.resize((round(width * scale), round(height * scale)), Image.LANCZOS)
    image = _fix_orientation(image)

    # Débruitage léger uniquement (grain, poussière). Redressement par
    # minAreaRect et binarisation adaptative ont été testés puis ABANDONNÉS :
    # sur un scan réel ils faisaient chuter la lecture (235 caractères lus
    # contre 674) — Tesseract LSTM travaille mieux sur le niveau de gris.
    return Image.fromarray(cv2.medianBlur(np.array(image), 3))


def _lines_from_data(data, min_conf):
    """Reconstruit les lignes de texte à partir des mots dont la confiance
    est suffisante. Retourne (liste de (texte_ligne, confiances_mots))."""
    lines = {}
    for i, word in enumerate(data['text']):
        word = word.strip()
        try:
            conf = float(data['conf'][i])
        except (TypeError, ValueError):
            continue
        if not word or conf < min_conf:
            continue
        key = (data['block_num'][i], data['par_num'][i], data['line_num'][i])
        lines.setdefault(key, []).append((word, conf))
    return [
        (' '.join(w for w, _ in words), [c for _, c in words])
        for _, words in sorted(lines.items())
    ]


def _ocr_image(image):
    prepared = _preprocess(image)

    latin = pytesseract.image_to_data(
        prepared, lang=LATIN_LANGUAGES, output_type=pytesseract.Output.DICT,
    )
    latin_lines = _lines_from_data(latin, MIN_WORD_CONFIDENCE)
    texts = [text for text, _ in latin_lines]
    confs = [c for _, cs in latin_lines for c in cs]

    # Passe arabe : on ne garde que les lignes réellement arabes, à confiance
    # élevée — sur une page française elle ne produit que du bruit, écarté ici.
    arabic = pytesseract.image_to_data(
        prepared, lang=ARABIC_LANGUAGES, output_type=pytesseract.Output.DICT,
    )
    for text, cs in _lines_from_data(arabic, MIN_ARABIC_WORD_CONFIDENCE):
        if _ARABIC_RE.search(text):
            texts.append(text)
            confs.extend(cs)

    return "\n".join(texts), (sum(confs) / len(confs) if confs else 0.0)


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
