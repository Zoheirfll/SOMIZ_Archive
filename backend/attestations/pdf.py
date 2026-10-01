"""
Génération du PDF d'attestation de travail.

Reproduit la mise en page du modèle papier SOMIZ en vigueur (voir
docs/superpowers/specs/2026-09-22-demandes-attestation-travail-design.md) :
en-tête société + logo tout en haut, titre encadré, bloc REF/MATRICULE/
CONTRAT aux deux-points alignés, corps du texte réparti sur toute la
hauteur de la page, bloc signature laissé libre pour le cachet, pied de
page avec coordonnées tout en bas — comme sur le document papier, qui
utilise toute la page plutôt qu'un bloc compact en haut.

Typographie calée sur le document papier (relevé 2026-09-23, à partir d'un
exemplaire signé) :

- **Libellés fixes en gras, valeurs en normal** (corrigé le 2026-09-27
  d'après une photo de l'original signé du 21/09/2026 — le relevé du
  2026-09-23 affirmait l'inverse, "rien n'est en gras", et c'était faux :
  libellés, "Arzew le :" et bloc signataire sont bien en gras sur le
  papier). Taille 12,5 pt calée par la largeur de la ligne "La présente
  Attestation..." (~75 % de la page sur l'original).
- **Les valeurs saisies sont dans un corps plus petit que les libellés**
  (TAILLE_VALEUR vs TAILLE_LABEL), en majuscules SANS accents (`_maj`,
  "DEPARTEMENT" comme sur le papier).
- Titre sans espacement inter-lettres, cadre épais avec ombre portée ;
  pied de page en italique.
- Interlignes du corps resserrés (~13 mm), avec un intervalle plus large
  avant "Et occupe le poste de" — le papier n'a pas un pas régulier.

Coordonnées exprimées en millimètres DEPUIS LE HAUT de la page (via le
helper `_y`), plus lisible qu'en points depuis le bas comme le veut
ReportLab — les mesures correspondent directement à ce qu'on lit sur le
document papier avec une règle.
"""
import unicodedata
from io import BytesIO
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

PAGE_W, PAGE_H = A4

# Logo embarqué, utilisé tant qu'aucun logo n'a été téléversé dans
# /parametres — sans lui le document sortirait sans identité visuelle à la
# première utilisation. Un logo téléversé par un ADMIN le remplace toujours.
LOGO_PAR_DEFAUT = Path(__file__).resolve().parent / 'assets' / 'logo_somiz.png'

# Polices — Helvetica est métriquement équivalente à l'Arial du document
# papier, c'est la police de base ReportLab qui s'en approche le plus sans
# embarquer de fichier de fontes.
POLICE = 'Helvetica'
POLICE_GRAS = 'Helvetica-Bold'
POLICE_ITAL = 'Helvetica-Oblique'
POLICE_GRAS_ITAL = 'Helvetica-BoldOblique'

TAILLE_LABEL = 12.5   # texte fixe du formulaire, en gras
TAILLE_VALEUR = 10.5  # données de l'employé/de la demande, en normal
TAILLE_PIED = 7.5

# Colonnes verticales (mm depuis le bord gauche)
X_LABEL = 15          # début des libellés
X_COLON = 47          # deux-points du bloc REF/MATRICULE/CONTRAT et "Né (e) le"
X_VALUE = 52         # valeurs de ce même bloc
X_COLON_LONG = 61     # deux-points des lignes longues ("Et occupe le poste de", "Motif")
X_VALUE_LONG = 66
X_LIEU_LABEL = 94     # "A :" sur la ligne de naissance
X_LIEU_VALUE = 126
X_RIGHT = 195         # marge droite en mm (filet et mentions alignées à droite)

# Ordonnées du corps (mm depuis le haut) — relevées une à une sur le
# document papier, pas déduites d'un pas régulier.
Y_SOUSSIGNES = 115
Y_ATTESTONS = 126.5
Y_NAISSANCE = 139
Y_EXERCE = 152
Y_POSTE = 170         # intervalle volontairement plus large ici (cf. papier)
Y_MOTIF = 183
Y_CLOTURE = 195.5


def _y(mm_from_top):
    """Convertit une position en mm depuis le haut en coordonnée ReportLab."""
    return PAGE_H - mm_from_top * mm


def _maj(texte):
    """Majuscules sans accents, comme sur le papier ("DEPARTEMENT", jamais
    "DÉPARTEMENT")."""
    decompose = unicodedata.normalize('NFD', str(texte or ''))
    return ''.join(ch for ch in decompose if unicodedata.category(ch) != 'Mn').upper()


def _date(valeur):
    return valeur.strftime('%d/%m/%Y') if valeur else ''


def _label_valeur(c, y, label, valeur, ecart=4):
    """Libellé suivi de sa valeur, placée dynamiquement juste après lui.

    Utilisé pour les lignes dont le libellé est trop long pour la colonne
    fixe X_VALUE_LONG ("Nous soussigné(e)s", "Attestons que...") — la
    valeur ne doit jamais chevaucher le libellé, quelle que soit la
    longueur du titre de signataire configuré.
    """
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(X_LABEL * mm, y, label)
    x_valeur = X_LABEL * mm + c.stringWidth(label, POLICE_GRAS, TAILLE_LABEL) + ecart * mm
    c.setFont(POLICE, TAILLE_VALEUR)
    c.drawString(x_valeur, y, valeur)
    return x_valeur


def _draw_header(c, config):
    """Logo à gauche + bloc société centré, tout en haut de la page."""
    logo_source = config.logo.path if config.logo else LOGO_PAR_DEFAUT
    try:
        c.drawImage(
            ImageReader(str(logo_source)),
            X_LABEL * mm, _y(35),
            width=19 * mm, height=19 * mm,
            preserveAspectRatio=True, anchor='sw', mask='auto',
        )
    except Exception:
        # Logo illisible/supprimé du disque : le document reste générable,
        # l'en-tête textuel suffit.
        pass

    centre = PAGE_W / 2
    c.setFont(POLICE_GRAS, 12)
    c.drawCentredString(centre, _y(12.5), config.societe_nom or '')
    c.setFont(POLICE_GRAS_ITAL, 9.5)
    c.drawCentredString(centre, _y(20.5), config.societe_soustitre or '')
    c.setFont(POLICE_GRAS_ITAL, 8)
    c.drawCentredString(centre, _y(25.5), config.societe_capital or '')
    c.setFont(POLICE_ITAL, 8)
    c.drawCentredString(centre, _y(30.5), config.holding or '')


def _draw_title(c, mention=''):
    """Titre encadré, centré — seul élément du corps réellement en gras.

    Légèrement chassé (`setCharSpace`) comme sur le papier, où le titre est
    plus large que ne le donnerait un simple Helvetica-Bold à cette taille.

    `mention` (ex. "(mode test)") s'affiche juste sous le titre, en rouge —
    utilisé uniquement par l'aperçu de configuration (données fictives, PDF
    jamais destiné à être imprimé/signé), pour qu'on ne confonde jamais ce
    PDF d'aperçu avec une vraie attestation. Absent (chaîne vide) sur toute
    attestation réelle (AttestationApercuView)."""
    titre = "ATTESTATION DE TRAVAIL"
    taille, chasse = 17, 0
    largeur_texte = c.stringWidth(titre, POLICE_GRAS, taille) + chasse * len(titre)
    pad_x, pad_y = 6 * mm, 3 * mm
    x = PAGE_W / 2 - largeur_texte / 2
    y = _y(66.5)
    largeur_cadre = largeur_texte + 2 * pad_x
    hauteur_cadre = taille + 2 * pad_y - 3
    # Cadre épais avec ombre portée à droite/en bas, comme sur le papier.
    c.rect(x - pad_x + 1.2 * mm, y - pad_y - 1.2 * mm, largeur_cadre, hauteur_cadre, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1)
    c.setLineWidth(1.2)
    c.rect(x - pad_x, y - pad_y, largeur_cadre, hauteur_cadre, stroke=1, fill=1)
    c.setFillColorRGB(0, 0, 0)
    c.setLineWidth(1)
    # La chasse ne se règle que sur un objet texte (`Canvas` n'expose pas
    # setCharSpace), d'où ce détour plutôt qu'un simple drawString. Le
    # save/restoreState est indispensable : l'espacement inter-lettres fait
    # partie de l'état graphique PDF et resterait actif sur TOUT le reste du
    # document (texte étiré, valeurs qui chevauchent leur libellé).
    c.saveState()
    texte = c.beginText(x, y)
    texte.setFont(POLICE_GRAS, taille)
    texte.setCharSpace(chasse)
    texte.textOut(titre)
    c.drawText(texte)
    c.restoreState()

    if mention:
        c.setFillColorRGB(0.8, 0, 0)
        c.setFont(POLICE_GRAS, 9)
        c.drawCentredString(PAGE_W / 2, y - pad_y - 9 * mm, mention)
        c.setFillColorRGB(0, 0, 0)


def _draw_reference_block(c, demande, contrat_numero):
    """REF N° / MATRICULE / CONTRAT N° — deux-points alignés en colonne."""
    lignes = [
        ("REF  N°", demande.reference),
        ("MATRICULE", demande.employee.matricule or ''),
    ]
    if contrat_numero:
        lignes.append(("CONTRAT N°", contrat_numero))

    for i, (label, valeur) in enumerate(lignes):
        y = _y(90.5 + i * 7)
        c.setFont(POLICE_GRAS, TAILLE_LABEL)
        c.drawString(X_LABEL * mm, y, label)
        c.drawString(X_COLON * mm, y, ':')
        c.setFont(POLICE, TAILLE_VALEUR)
        c.drawString(X_VALUE * mm, y, str(valeur))


def _draw_body(c, demande, config, lieu_naissance):
    """Corps du texte, réparti sur toute la partie centrale de la page
    (~113mm à ~196mm) plutôt que compacté en haut, comme sur le modèle
    papier."""
    employee = demande.employee

    # "Nous soussigné(e)s: <titre du signataire>" — pas d'espace avant les
    # deux-points sur le papier, contrairement aux lignes suivantes.
    _label_valeur(
        c, _y(Y_SOUSSIGNES),
        "Nous soussigné(e)s:", _maj(config.signataire_titre),
    )

    # "Attestons que M(r) (elle) (me) : <NOM Prénom>"
    _label_valeur(
        c, _y(Y_ATTESTONS),
        "Attestons que M(r) (elle) (me) :",
        _maj(f"{employee.nom}  {employee.prenom}"),
    )

    # "Né (e) le : <date>    A : <lieu>"
    y = _y(Y_NAISSANCE)
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(X_LABEL * mm, y, "Né (e)  le")
    c.drawString(X_COLON * mm, y, ':')
    c.setFont(POLICE, TAILLE_VALEUR)
    c.drawString(X_VALUE * mm, y, _date(employee.date_naissance))
    if lieu_naissance:
        c.setFont(POLICE_GRAS, TAILLE_LABEL)
        c.drawString(X_LIEU_LABEL * mm, y, "A :")
        c.setFont(POLICE, TAILLE_VALEUR)
        c.drawString(X_LIEU_VALUE * mm, y, _maj(lieu_naissance))

    # "Exerce au sein de la Société du : <date> à ce jour."
    x_valeur = _label_valeur(
        c, _y(Y_EXERCE),
        "Exerce au sein de la Société du :", _date(employee.date_embauche),
    )
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(x_valeur + 28 * mm, _y(Y_EXERCE), "à ce jour.")

    # "Et occupe le poste de : <fonction>"
    y = _y(Y_POSTE)
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(X_LABEL * mm, y, "Et occupe le poste de")
    c.drawString(X_COLON_LONG * mm, y, ':')
    c.setFont(POLICE, TAILLE_VALEUR)
    poste = employee.poste.nom if employee.poste_id else ''
    c.drawString(X_VALUE_LONG * mm, y, _maj(poste))

    # "Motif : <motif>"
    y = _y(Y_MOTIF)
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(X_LABEL * mm, y, "Motif")
    c.drawString(X_COLON_LONG * mm, y, ':')
    c.setFont(POLICE, TAILLE_VALEUR)
    c.drawString(X_VALUE_LONG * mm, y, _maj(demande.motif.nom))

    # Formule de clôture
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(
        X_LABEL * mm, _y(Y_CLOTURE),
        "La présente Attestation lui est délivrée pour servir et valoir ce que de droit .",
    )


def _draw_signature(c, config, date_generation):
    """Lieu/date à droite, bloc signataire à gauche — l'espace en dessous
    reste vide pour la signature et le cachet apposés à la main.

    "P.I" (Pour Intérim, 2026-09-23) : si la config porte
    signataire_interim=True (voir /parametres, panneau "Attestation de
    travail"), le nom imprimé est celui de l'intérimaire
    (config.signataire_interim_nom) plutôt que le signataire habituel, et la
    ligne de titre se termine par ", P.I" (ex. "LE CHEF DE DÉPARTEMENT
    ADMINISTRATION DU PERSONNEL, P.I") — réglage global, actif pour toutes
    les attestations générées tant qu'un ADMIN ne le désactive pas."""
    # "Arzew le :" en gras, la date (valeur) en normal — aligné à droite.
    ville = config.ville or ''
    date_txt = _date(date_generation)
    c.setFont(POLICE, TAILLE_VALEUR + 1)
    c.drawRightString(X_RIGHT * mm, _y(219.5), date_txt)
    x_date = X_RIGHT * mm - c.stringWidth(date_txt, POLICE, TAILLE_VALEUR + 1)
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawRightString(x_date - 1.5 * mm, _y(219.5), f"{ville} le :")

    interim = config.signataire_interim and (config.signataire_interim_nom or '').strip()
    titre = _maj(config.signataire_titre)

    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    ligne_titre = f"LE  {titre}, P.I" if interim else f"LE  {titre}"
    c.drawString(X_LABEL * mm, _y(234.5), ligne_titre)

    nom_signataire = config.signataire_interim_nom.strip() if interim else (config.signataire_nom or '')
    c.drawString(X_LABEL * mm, _y(246.5), nom_signataire)


def _draw_footer(c, config, date_generation):
    """Tout en bas de la page, comme sur le modèle papier."""
    c.setFont(POLICE_ITAL, TAILLE_PIED)
    c.drawRightString(X_RIGHT * mm, _y(284), f"Édité le : {_date(date_generation)}")

    c.setLineWidth(0.5)
    c.line(X_LABEL * mm, _y(288), X_RIGHT * mm, _y(288))

    parties = [f"{config.societe_nom or ''} {config.adresse or ''}".strip()]
    if config.telephone:
        parties.append(f"Tél. {config.telephone}")
    if config.fax:
        parties.append(f"Fax {config.fax}")
    if config.telex:
        parties.append(f"Télex {config.telex}")
    c.setFont(POLICE_ITAL, TAILLE_PIED)
    c.drawCentredString(PAGE_W / 2, _y(291.5), "    ".join(parties))


def build_attestation_pdf(demande, config, date_generation, lieu_naissance='', contrat_numero='', mention=''):
    """Retourne le PDF de l'attestation sous forme de bytes.

    `mention` : voir `_draw_title` — laissé vide pour toute vraie attestation."""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Attestation de travail — {demande.reference}")

    _draw_header(c, config)
    _draw_title(c, mention)
    _draw_reference_block(c, demande, contrat_numero)
    _draw_body(c, demande, config, lieu_naissance)
    _draw_signature(c, config, date_generation)
    _draw_footer(c, config, date_generation)

    c.showPage()
    c.save()
    return buffer.getvalue()
