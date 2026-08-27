"""
apps/employees/pdf_utils.py
Découpage de PDF pour l'import groupé (scan/import).
Fonctions pures — pas de dépendance à Django models/settings.
"""

import io
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError


class PdfExtractionError(Exception):
    """PDF invalide ou plage de pages demandée hors limites."""


def pdf_page_count(file_obj):
    """Retourne le nombre de pages d'un PDF. Remet file_obj en position 0."""
    file_obj.seek(0)
    try:
        reader = PdfReader(file_obj)
        count = len(reader.pages)
    except PdfReadError as exc:
        raise PdfExtractionError(f"PDF invalide : {exc}") from exc
    finally:
        file_obj.seek(0)
    return count


def extract_pdf_pages(file_obj, pages):
    """Construit un nouveau PDF contenant uniquement `pages` (1-indexées,
    dans l'ordre donné). Retourne un io.BytesIO positionné à 0.
    Lève PdfExtractionError si le fichier n'est pas un PDF valide ou si
    une page demandée n'existe pas."""
    file_obj.seek(0)
    try:
        reader = PdfReader(file_obj)
    except PdfReadError as exc:
        raise PdfExtractionError(f"PDF invalide : {exc}") from exc
    finally:
        file_obj.seek(0)

    total = len(reader.pages)
    writer = PdfWriter()
    for page_num in pages:
        if page_num < 1 or page_num > total:
            raise PdfExtractionError(
                f"Page {page_num} inexistante (le PDF a {total} page(s))."
            )
        writer.add_page(reader.pages[page_num - 1])

    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf
