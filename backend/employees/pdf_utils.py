"""
apps/employees/pdf_utils.py
Découpage/fusion de PDF pour l'import groupé (scan/import) et l'upload
multi-fichiers (recto/verso). Fonctions pures — pas de dépendance à Django
models/settings.
"""

import io
import os
from PIL import Image
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


def image_to_single_page_reader(image_file):
    """Convertit une image (jpg/png/tiff) en PDF d'UNE page et retourne
    (PdfReader, buffer). Le buffer doit rester référencé tant que le reader
    est utilisé (pypdf lit paresseusement le flux sous-jacent) — d'où le
    retour du couple plutôt que du seul reader. Utilisé par la gestion des
    pages internes d'un document (ajout/remplacement d'une page par une
    image, voir employees/views.py FilePages*)."""
    image_file.seek(0)
    image = Image.open(image_file)
    if image.mode not in ('RGB', 'L'):
        image = image.convert('RGB')
    buf = io.BytesIO()
    image.save(buf, format='PDF')
    buf.seek(0)
    image_file.seek(0)
    return PdfReader(buf), buf


def write_pdf(writer):
    """Sérialise un PdfWriter en io.BytesIO positionné à 0."""
    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf


def merge_group_parts(parts):
    """Fusionne les 'parts' d'un groupe de scan-import (2026-09-15) en un
    seul PDF multi-page, chaque page gardant le nom de SA source — même
    règle que l'upload manuel multi-fichiers (`merge_files_to_pdf` +
    `_page_names_from_sources` dans employees/views.py), mais ici une
    'part' peut être une sélection de pages précises au sein d'un PDF
    source (`{'file', 'is_image', 'pages'}`, voir ScanImportSerializer),
    pas forcément le fichier entier.
    Retourne (buf: io.BytesIO, page_names: list[str], base_names: list[str])
    — `base_names` sert à composer le nom du fichier fusionné côté appelant.
    Lève PdfExtractionError si une part PDF est invalide ou si une page
    demandée n'existe pas."""
    writer = PdfWriter()
    page_names = []
    base_names = []
    for part in parts:
        source_file = part['file']
        base = os.path.splitext(source_file.name)[0]
        base_names.append(base)
        source_file.seek(0)
        if part['is_image']:
            image = Image.open(source_file)
            if image.mode not in ('RGB', 'L'):
                image = image.convert('RGB')
            page_pdf = io.BytesIO()
            image.save(page_pdf, format='PDF')
            page_pdf.seek(0)
            reader = PdfReader(page_pdf)
            writer.add_page(reader.pages[0])
            page_names.append(base)
        else:
            try:
                reader = PdfReader(source_file)
            except PdfReadError as exc:
                raise PdfExtractionError(f"PDF invalide : {exc}") from exc
            total = len(reader.pages)
            pages = part['pages'] if part['pages'] is not None else list(range(1, total + 1))
            for p in pages:
                if p < 1 or p > total:
                    raise PdfExtractionError(
                        f"Page {p} inexistante (le PDF a {total} page(s))."
                    )
                writer.add_page(reader.pages[p - 1])
            if len(pages) == 1 and total == 1:
                page_names.append(base)
            else:
                page_names.extend(f"{base} page {p}" for p in pages)
        source_file.seek(0)

    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf, page_names, base_names


def merge_files_to_pdf(files, mime_types):
    """Fusionne plusieurs fichiers (PDF et/ou images) en un seul PDF
    multi-page, dans l'ordre donné (ex. recto.pdf + verso.pdf → un PDF de
    2 pages). Une image (jpg/png/tiff) devient une page à sa taille propre
    — convertie en RGB si besoin (CMYK/palette non supportés tels quels par
    pypdf/Pillow.save('PDF')). `mime_types[i]` correspond à `files[i]`.
    Retourne un io.BytesIO positionné à 0. Lève PdfExtractionError si un
    fichier prétendument PDF est invalide."""
    writer = PdfWriter()
    for file_obj, mime in zip(files, mime_types):
        file_obj.seek(0)
        if mime == 'application/pdf':
            try:
                reader = PdfReader(file_obj)
            except PdfReadError as exc:
                raise PdfExtractionError(f"PDF invalide : {exc}") from exc
            for page in reader.pages:
                writer.add_page(page)
        else:
            image = Image.open(file_obj)
            if image.mode not in ('RGB', 'L'):
                image = image.convert('RGB')
            page_pdf = io.BytesIO()
            image.save(page_pdf, format='PDF')
            page_pdf.seek(0)
            reader = PdfReader(page_pdf)
            writer.add_page(reader.pages[0])
        file_obj.seek(0)

    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf
