"""Filigrane incrusté dans la copie servie au demandeur : nom + référence +
date/heure, en diagonale répétée sur toute la page. Calculé à la volée (rien
n'est stocké) — l'original livré n'est jamais servi tel quel au demandeur,
ce qui rend toute fuite attribuable même après capture ou téléchargement."""
import math
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

ANGLE_DEGRES = 35
ALPHA_PDF = 0.16
ALPHA_IMAGE = 55  # sur 255


def _filigrane_pdf(contenu, texte):
    # clone_from : les pages sont rattachées au writer avant la fusion
    # (merge_page sur une page orpheline est déprécié, retiré en pypdf 7).
    ecrivain = PdfWriter(clone_from=BytesIO(contenu))
    for page in ecrivain.pages:
        largeur = float(page.mediabox.width)
        hauteur = float(page.mediabox.height)
        calque = BytesIO()
        c = canvas.Canvas(calque, pagesize=(largeur, hauteur))
        c.setFillAlpha(ALPHA_PDF)
        c.setFillGray(0.2)
        taille = max(10, min(largeur, hauteur) / 38)
        c.setFont('Helvetica-Bold', taille)
        pas_y = taille * 7
        pas_x = c.stringWidth(texte, 'Helvetica-Bold', taille) + taille * 3
        c.saveState()
        c.translate(largeur / 2, hauteur / 2)
        c.rotate(ANGLE_DEGRES)
        diag = math.hypot(largeur, hauteur)
        y = -diag
        ligne = 0
        while y < diag:
            x = -diag + (pas_x / 2 if ligne % 2 else 0)
            while x < diag:
                c.drawString(x, y, texte)
                x += pas_x
            y += pas_y
            ligne += 1
        c.restoreState()
        c.showPage()
        c.save()
        calque.seek(0)
        page.merge_page(PdfReader(calque).pages[0])
    sortie = BytesIO()
    ecrivain.write(sortie)
    return sortie.getvalue()


def _police(taille):
    try:
        return ImageFont.load_default(size=taille)
    except TypeError:  # Pillow < 10.1 : pas de paramètre size
        return ImageFont.load_default()


def _filigrane_image(contenu, mime, texte):
    image = Image.open(BytesIO(contenu)).convert('RGBA')
    largeur, hauteur = image.size
    taille = max(12, min(largeur, hauteur) // 28)
    police = _police(taille)
    calque = Image.new('RGBA', (largeur, hauteur), (0, 0, 0, 0))
    dessin = ImageDraw.Draw(calque)
    boite = dessin.textbbox((0, 0), texte, font=police)
    pas_x = (boite[2] - boite[0]) + taille * 3
    pas_y = taille * 6
    diag = int(math.hypot(largeur, hauteur))
    grand = Image.new('RGBA', (diag * 2, diag * 2), (0, 0, 0, 0))
    dessin_grand = ImageDraw.Draw(grand)
    ligne = 0
    for y in range(0, diag * 2, pas_y):
        decalage = pas_x // 2 if ligne % 2 else 0
        for x in range(-pas_x, diag * 2, pas_x):
            dessin_grand.text((x + decalage, y), texte, font=police, fill=(40, 40, 40, ALPHA_IMAGE))
        ligne += 1
    grand = grand.rotate(ANGLE_DEGRES, resample=Image.BICUBIC)
    gauche = (grand.width - largeur) // 2
    haut = (grand.height - hauteur) // 2
    calque.alpha_composite(grand.crop((gauche, haut, gauche + largeur, haut + hauteur)))
    resultat = Image.alpha_composite(image, calque)
    sortie = BytesIO()
    if mime == 'image/jpeg':
        resultat.convert('RGB').save(sortie, format='JPEG', quality=88)
        return sortie.getvalue(), 'image/jpeg'
    resultat.save(sortie, format='PNG')
    return sortie.getvalue(), 'image/png'


def appliquer_filigrane(contenu, mime, texte):
    """(octets filigranés, mime de sortie). TIFF et PNG sortent en PNG (un
    navigateur n'affiche pas le TIFF)."""
    if mime == 'application/pdf':
        return _filigrane_pdf(contenu, texte), 'application/pdf'
    if mime in ('image/jpeg', 'image/png', 'image/tiff'):
        return _filigrane_image(contenu, mime, texte)
    raise ValueError(f"Type non géré pour le filigrane : {mime}")
