"""
Génération du PDF d'attestation de travail.

Reproduit la mise en page du modèle papier SOMIZ en vigueur (voir
docs/superpowers/specs/2026-09-22-demandes-attestation-travail-design.md) :
en-tête société + logo, titre encadré, bloc REF/MATRICULE/CONTRAT aux
deux-points alignés, corps du texte, lieu/date, bloc signature laissé
libre pour le cachet, pied de page avec coordonnées.

Coordonnées exprimées en millimètres DEPUIS LE HAUT de la page (via le
helper `_y`), plus lisible qu'en points depuis le bas comme le veut
ReportLab — les mesures correspondent directement à ce qu'on lit sur le
document papier avec une règle.
"""
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

PAGE_W, PAGE_H = A4

# Colonnes verticales (mm depuis le bord gauche)
X_LABEL = 22          # début des libellés
X_COLON = 47          # deux-points du bloc REF/MATRICULE/CONTRAT et "Né (e) le"
X_VALUE = 53          # valeurs de ce même bloc
X_COLON_LONG = 70     # deux-points des lignes longues ("Et occupe le poste de", "Motif")
X_VALUE_LONG = 76
X_LIEU_LABEL = 95     # "A :" sur la ligne de naissance
X_LIEU_VALUE = 108
X_RIGHT = PAGE_W / mm - 22  # marge droite en mm


def _y(mm_from_top):
    """Convertit une position en mm depuis le haut en coordonnée ReportLab."""
    return PAGE_H - mm_from_top * mm


def _date(valeur):
    return valeur.strftime('%d/%m/%Y') if valeur else ''


def _draw_header(c, config):
    """Logo à gauche + bloc société centré, comme sur le modèle papier."""
    if config.logo:
        try:
            c.drawImage(
                ImageReader(config.logo.path),
                X_LABEL * mm, _y(32),
                width=22 * mm, height=16 * mm,
                preserveAspectRatio=True, anchor='sw', mask='auto',
            )
        except Exception:
            # Logo illisible/supprimé du disque : le document reste
            # générable, l'en-tête textuel suffit.
            pass

    centre = PAGE_W / 2
    c.setFont('Helvetica-Bold', 10)
    c.drawCentredString(centre, _y(18), config.societe_nom or '')
    c.setFont('Helvetica-BoldOblique', 7.5)
    c.drawCentredString(centre, _y(22.5), config.societe_soustitre or '')
    c.setFont('Helvetica-Oblique', 7)
    c.drawCentredString(centre, _y(26.5), config.societe_capital or '')
    c.drawCentredString(centre, _y(30), config.holding or '')


def _draw_title(c):
    """Titre encadré, centré."""
    titre = "ATTESTATION DE TRAVAIL"
    c.setFont('Helvetica-Bold', 12)
    largeur_texte = c.stringWidth(titre, 'Helvetica-Bold', 12)
    pad_x, pad_y = 7 * mm, 3 * mm
    x = PAGE_W / 2 - largeur_texte / 2
    y = _y(57)
    c.rect(x - pad_x, y - pad_y, largeur_texte + 2 * pad_x, 12 + 2 * pad_y - 3)
    c.drawString(x, y, titre)


def _draw_reference_block(c, demande, contrat_numero):
    """REF N° / MATRICULE / CONTRAT N° — deux-points alignés en colonne."""
    lignes = [
        ("REF N°", demande.reference),
        ("MATRICULE", demande.employee.matricule or ''),
    ]
    if contrat_numero:
        lignes.append(("CONTRAT N°", contrat_numero))

    for i, (label, valeur) in enumerate(lignes):
        y = _y(76 + i * 6.5)
        c.setFont('Helvetica', 9)
        c.drawString(X_LABEL * mm, y, label)
        c.drawString(X_COLON * mm, y, ':')
        c.drawString(X_VALUE * mm, y, str(valeur))


def _draw_body(c, demande, config, lieu_naissance):
    employee = demande.employee

    # "Nous soussigné(e)s: <titre du signataire>"
    y = _y(103)
    c.setFont('Helvetica', 9)
    c.drawString(X_LABEL * mm, y, "Nous soussigné(e)s:")
    c.drawString((X_LABEL + 30) * mm, y, (config.signataire_titre or '').upper())

    # "Attestons que M(r) (elle) (me) : <NOM Prénom>"
    y = _y(117)
    c.drawString(X_LABEL * mm, y, "Attestons que M(r) (elle) (me) :")
    c.setFont('Helvetica-Bold', 9)
    c.drawString(X_VALUE_LONG * mm, y, f"{employee.nom}  {employee.prenom}".upper())

    # "Né (e) le : <date>    A : <lieu>"
    y = _y(130)
    c.setFont('Helvetica', 9)
    c.drawString(X_LABEL * mm, y, "Né (e) le")
    c.drawString(X_COLON * mm, y, ':')
    c.drawString(X_VALUE * mm, y, _date(employee.date_naissance))
    if lieu_naissance:
        c.drawString(X_LIEU_LABEL * mm, y, "A :")
        c.drawString(X_LIEU_VALUE * mm, y, str(lieu_naissance).upper())

    # "Exerce au sein de la Société du : <date> à ce jour."
    y = _y(143)
    c.drawString(X_LABEL * mm, y, "Exerce au sein de la Société du :")
    c.drawString(X_VALUE_LONG * mm, y, _date(employee.date_embauche))
    c.drawString((X_VALUE_LONG + 22) * mm, y, "à ce jour.")

    # "Et occupe le poste de : <fonction>"
    y = _y(159)
    c.drawString(X_LABEL * mm, y, "Et occupe le poste de")
    c.drawString(X_COLON_LONG * mm, y, ':')
    poste = employee.poste.nom if employee.poste_id else ''
    c.drawString(X_VALUE_LONG * mm, y, poste.upper())

    # "Motif : <motif>"
    y = _y(171)
    c.drawString(X_LABEL * mm, y, "Motif")
    c.drawString(X_COLON_LONG * mm, y, ':')
    c.drawString(X_VALUE_LONG * mm, y, (demande.motif or '').upper())

    # Formule de clôture
    c.drawString(
        X_LABEL * mm, _y(186),
        "La présente Attestation lui est délivrée pour servir et valoir ce que de droit .",
    )


def _draw_signature(c, config, date_generation):
    """Lieu/date à droite, bloc signataire à gauche — l'espace en dessous
    reste vide pour la signature et le cachet apposés à la main."""
    c.setFont('Helvetica', 9)
    ville = config.ville or ''
    c.drawRightString(X_RIGHT * mm, _y(205), f"{ville} le : {_date(date_generation)}")

    y = _y(220)
    c.drawString(X_LABEL * mm, y, "LE")
    c.drawString((X_LABEL + 10) * mm, y, (config.signataire_titre or '').upper())
    c.drawString(X_LABEL * mm, _y(228), config.signataire_nom or '')


def _draw_footer(c, config, date_generation):
    c.setFont('Helvetica', 6.5)
    c.drawRightString(X_RIGHT * mm, _y(252), f"Édité le : {_date(date_generation)}")

    c.setLineWidth(0.5)
    c.line(X_LABEL * mm, _y(262), X_RIGHT * mm, _y(262))

    parties = [f"{config.societe_nom or ''} {config.adresse or ''}".strip()]
    if config.telephone:
        parties.append(f"Tél. {config.telephone}")
    if config.fax:
        parties.append(f"Fax {config.fax}")
    if config.telex:
        parties.append(f"Télex {config.telex}")
    c.setFont('Helvetica', 6.5)
    c.drawCentredString(PAGE_W / 2, _y(265.5), "    ".join(parties))


def build_attestation_pdf(demande, config, date_generation, lieu_naissance='', contrat_numero=''):
    """Retourne le PDF de l'attestation sous forme de bytes."""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Attestation de travail — {demande.reference}")

    _draw_header(c, config)
    _draw_title(c)
    _draw_reference_block(c, demande, contrat_numero)
    _draw_body(c, demande, config, lieu_naissance)
    _draw_signature(c, config, date_generation)
    _draw_footer(c, config, date_generation)

    c.showPage()
    c.save()
    return buffer.getvalue()
