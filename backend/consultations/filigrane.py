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

    # Un seul petit « motif » (le texte, déjà pivoté), collé à répétition
    # directement sur l'image : la mémoire reste ~1 tampon de l'image, au lieu
    # d'un calque géant de (2·diagonale)² pixels (bombe de décompression).
    boite = ImageDraw.Draw(Image.new('RGBA', (1, 1))).textbbox((0, 0), texte, font=police)
    largeur_texte, hauteur_texte = boite[2] - boite[0], boite[3] - boite[1]
    marge = taille
    motif = Image.new('RGBA', (largeur_texte + 2 * marge, hauteur_texte + 2 * marge), (0, 0, 0, 0))
    ImageDraw.Draw(motif).text(
        (marge - boite[0], marge - boite[1]), texte, font=police, fill=(40, 40, 40, ALPHA_IMAGE),
    )
    motif = motif.rotate(ANGLE_DEGRES, resample=Image.BICUBIC, expand=True)
    mw, mh = motif.size

    pas_u = largeur_texte + taille * 3     # pas le long du texte
    pas_v = taille * 6                     # pas entre deux lignes
    cos_a = math.cos(math.radians(ANGLE_DEGRES))
    sin_a = math.sin(math.radians(ANGLE_DEGRES))
    centre_x, centre_y = largeur / 2, hauteur / 2
    diag = math.hypot(largeur, hauteur)
    n_u, n_v = int(diag // pas_u) + 2, int(diag // pas_v) + 2
    for j in range(-n_v, n_v + 1):
        decalage = pas_u / 2 if j % 2 else 0
        for i in range(-n_u, n_u + 1):
            u, v = i * pas_u + decalage, j * pas_v
            # Repère pivoté : u suit la direction du texte, v lui est perpendiculaire.
            x0 = int(centre_x + u * cos_a + v * sin_a - mw / 2)
            y0 = int(centre_y - u * sin_a + v * cos_a - mh / 2)
            gauche, haut = max(x0, 0), max(y0, 0)
            droite, bas = min(x0 + mw, largeur), min(y0 + mh, hauteur)
            if droite <= gauche or bas <= haut:
                continue  # motif entièrement hors de l'image
            image.alpha_composite(
                motif.crop((gauche - x0, haut - y0, droite - x0, bas - y0)), dest=(gauche, haut),
            )

    sortie = BytesIO()
    if mime == 'image/jpeg':
        image.convert('RGB').save(sortie, format='JPEG', quality=88)
        return sortie.getvalue(), 'image/jpeg'
    image.save(sortie, format='PNG')
    return sortie.getvalue(), 'image/png'


def appliquer_filigrane(contenu, mime, texte):
    """(octets filigranés, mime de sortie). TIFF et PNG sortent en PNG (un
    navigateur n'affiche pas le TIFF)."""
    if mime == 'application/pdf':
        return _filigrane_pdf(contenu, texte), 'application/pdf'
    if mime in ('image/jpeg', 'image/png', 'image/tiff'):
        return _filigrane_image(contenu, mime, texte)
    raise ValueError(f"Type non géré pour le filigrane : {mime}")
