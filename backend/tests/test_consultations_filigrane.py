from io import BytesIO

import pytest
from PIL import Image
from pypdf import PdfReader

from consultations.filigrane import appliquer_filigrane

TEXTE = "Zoheir F. — C-00001/26 — 08/10/2026 11:00"


def _png_blanc(taille=(400, 300)):
    buf = BytesIO()
    Image.new('RGB', taille, 'white').save(buf, format='PNG')
    return buf.getvalue()


def test_pdf_filigrane_contient_le_texte(pdf_bytes):
    sortie, mime = appliquer_filigrane(pdf_bytes, 'application/pdf', TEXTE)
    assert mime == 'application/pdf'
    lecteur = PdfReader(BytesIO(sortie))
    assert len(lecteur.pages) == 1
    texte = lecteur.pages[0].extract_text()
    assert 'Contenu confidentiel' in texte      # contenu d'origine conservé
    assert 'C-00001/26' in texte                # filigrane présent


def test_pdf_multipage_filigrane_sur_chaque_page():
    from reportlab.pdfgen import canvas
    buf = BytesIO()
    c = canvas.Canvas(buf)
    for i in range(3):
        c.drawString(100, 750, f"Page {i + 1}")
        c.showPage()
    c.save()
    sortie, _ = appliquer_filigrane(buf.getvalue(), 'application/pdf', TEXTE)
    lecteur = PdfReader(BytesIO(sortie))
    assert len(lecteur.pages) == 3
    for page in lecteur.pages:
        assert 'C-00001/26' in page.extract_text()


def test_image_png_est_modifiee_et_reste_un_png():
    original = _png_blanc()
    sortie, mime = appliquer_filigrane(original, 'image/png', TEXTE)
    assert mime == 'image/png'
    assert sortie != original
    image = Image.open(BytesIO(sortie)).convert('RGB')
    assert image.size == (400, 300)
    assert image.getcolors(maxcolors=100000) != [(400 * 300, (255, 255, 255))]  # plus unie


def test_image_jpeg_reste_un_jpeg():
    buf = BytesIO()
    Image.new('RGB', (300, 200), 'white').save(buf, format='JPEG')
    sortie, mime = appliquer_filigrane(buf.getvalue(), 'image/jpeg', TEXTE)
    assert mime == 'image/jpeg'
    assert Image.open(BytesIO(sortie)).format == 'JPEG'


def test_tiff_est_converti_en_png():
    buf = BytesIO()
    Image.new('RGB', (300, 200), 'white').save(buf, format='TIFF')
    sortie, mime = appliquer_filigrane(buf.getvalue(), 'image/tiff', TEXTE)
    assert mime == 'image/png'
    assert Image.open(BytesIO(sortie)).format == 'PNG'


def test_mime_non_gere_leve_une_erreur():
    with pytest.raises(ValueError):
        appliquer_filigrane(b'abc', 'text/plain', TEXTE)
