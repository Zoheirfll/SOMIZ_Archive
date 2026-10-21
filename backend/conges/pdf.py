"""
Titre de congé (PDF ReportLab) — calé sur le modèle papier officiel (photo du
2026-10-20) : en-tête société + logo, cadre « TITRE DE CONGE » avec sous-titre
(« - RELIQUAT - »…), bloc REF/MATRICULE/CONTRAT, corps (Nom & Prénom, Fonction,
Structure + Affectation, Nombre de jour, Date de Départ + Date de Retour,
Adresse durant Congé, Exercice), « Fait à <ville>, le : », bloc signataire,
pied de page. Aucun cadre « réservé à l'administration » sur le papier.

Réutilise le gabarit d'en-tête/titre/bloc de référence de attestations.pdf.
Coordonnées en millimètres DEPUIS LE HAUT de la page (helper `_y`) : les
constantes Y_*/X_* ci-dessous sont à affiner en comparant le rendu au papier.
"""
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

from attestations.pdf import (
    PAGE_W, POLICE, POLICE_GRAS, POLICE_ITAL, TAILLE_LABEL, TAILLE_PIED, TAILLE_VALEUR,
    X_LABEL, X_RIGHT,
    _date, _draw_header, _draw_reference_block, _draw_title, _maj, _y,
)

TITRE = "TITRE DE CONGE"

# Ordonnées (mm depuis le haut) — relevées sur le papier officiel.
Y_SOUS_TITRE = 80
Y_MENTION = 86
Y_NOM = 118
Y_FONCTION = 126
Y_STRUCTURE = 134
Y_AFFECTATION = 144   # sous la structure (qui peut occuper 2 lignes)
Y_JOURS = 156
Y_DEPART = 164
Y_ADRESSE = 174
Y_EXERCICE = 186
Y_FAIT_A = 205
Y_SIGNATAIRE_TITRE = 222
Y_SIGNATAIRE_NOM = 232
Y_FILET = 52         # filet horizontal sous l'en-tête, au-dessus du cadre de titre
X_COLON_CONGE = 78   # deux-points du corps : au-delà du plus long libellé (« Adresse durant Congé »)
X_VALEUR_CONGE = 83
X_COL2_LABEL = 118   # « Affectation : », « Date de Retour : » (valeur placée juste après le libellé)
TAILLE_CORPS_VALEUR = 11.5  # sur le papier, les valeurs sont presque de la taille des libellés
X_MAX_VALEUR = 188   # limite droite des valeurs, à l'intérieur du cadre
TAILLE_VALEUR_MIN = 8.5
INTERLIGNE_VALEUR = 4.5
SOUS_TITRES_CP ={'RELIQUAT': "- RELIQUAT -", 'ACTUEL': "- ANNUEL -", 'ANTICIPE': "- ANTICIPE -"}


def sous_titre(titre) -> str:
    """Mention sous le cadre : groupe de l'exercice de départ (figé à la
    validation) pour un CP, sinon le type."""
    if titre.type_conge == 'CE':
        return "- CONGE EXCEPTIONNEL -"
    if titre.type_conge == 'CS':
        return "- CONGE SANS SOLDE -"
    return SOUS_TITRES_CP.get(titre.categorie_exercice, "")


def _ligne(c, y_mm, label, valeur):
    y = _y(y_mm)
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(X_LABEL * mm, y, label)
    c.drawString(X_COLON_CONGE * mm, y, ':')
    c.setFont(POLICE, TAILLE_CORPS_VALEUR)
    c.drawString(X_VALEUR_CONGE * mm, y, str(valeur or ''))


def _colonne2(c, y_mm, label, valeur):
    """Libellé en 2e colonne ; la valeur suit juste après (largeur réelle du
    libellé), jamais à une abscisse fixe : « Date de Retour » est plus long
    qu'« Affectation »."""
    y = _y(y_mm)
    texte = f"{label} :"
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(X_COL2_LABEL * mm, y, texte)
    x_valeur = X_COL2_LABEL * mm + c.stringWidth(texte, POLICE_GRAS, TAILLE_LABEL) + 2.5 * mm
    c.setFont(POLICE, TAILLE_CORPS_VALEUR)
    c.drawString(x_valeur, y, str(valeur or ''))


def _ligne_ajustee(c, y_mm, label, valeur):
    """Comme _ligne, mais une valeur trop longue (ex. structure « DIRECTION DES
    RESSOURCES HUMAINES / DEPARTEMENT ADMINISTRATION… ») ne déborde jamais : la
    police réduit jusqu'à TAILLE_VALEUR_MIN, puis le texte passe sur 2 lignes."""
    y = _y(y_mm)
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(X_LABEL * mm, y, label)
    c.drawString(X_COLON_CONGE * mm, y, ':')
    texte = str(valeur or '')
    largeur = X_MAX_VALEUR * mm - X_VALEUR_CONGE * mm
    taille = TAILLE_CORPS_VALEUR
    while taille > TAILLE_VALEUR_MIN and c.stringWidth(texte, POLICE, taille) > largeur:
        taille -= 0.5
    c.setFont(POLICE, taille)
    for i, morceau in enumerate(simpleSplit(texte, POLICE, taille, largeur)[:2]):
        c.drawString(X_VALEUR_CONGE * mm, y - i * INTERLIGNE_VALEUR * mm, morceau)


def _nom_de(objet):
    return getattr(objet, 'nom', '') if objet is not None else ''


def _abreviation(objet):
    """Code du référentiel (« DAT », « GMO », « GL3/Z » comme sur le papier) ;
    le nom complet seulement si le code n'est pas renseigné."""
    if objet is None:
        return ''
    return (getattr(objet, 'code', '') or '').strip() or _nom_de(objet)


def _draw_filigrane_annule(c):
    c.saveState()
    c.setFillGray(0.82)
    c.setFont(POLICE_GRAS, 110)
    c.translate(PAGE_W / 2, _y(150))
    c.rotate(35)
    c.drawCentredString(0, 0, "ANNULE")
    c.restoreState()


def _draw_sous_titre(c, titre, mention):
    texte = sous_titre(titre)
    if texte:
        c.setFont(POLICE_GRAS, 14)
        c.drawCentredString(PAGE_W / 2, _y(Y_SOUS_TITRE), texte)
    if mention:
        c.setFillColorRGB(0.8, 0, 0)
        c.setFont(POLICE_GRAS, 8)
        c.drawCentredString(PAGE_W / 2, _y(Y_MENTION), mention)
        c.setFillColorRGB(0, 0, 0)


def _draw_corps(c, titre):
    employe = titre.employee
    _ligne(c, Y_NOM, "Nom & Prénom", _maj(f"{employe.nom}   {employe.prenom}"))
    _ligne(c, Y_FONCTION, "Fonction", _maj(employe.poste.nom if employe.poste_id else ''))
    # Abréviations (codes) pour la structure et l'affectation, comme sur le papier officiel.
    structure = ' / '.join(p for p in (_abreviation(employe.direction), _abreviation(employe.departement)) if p)
    # Structure et Affectation sur deux lignes distinctes : côte à côte, une
    # structure longue chevauchait « Affectation » (constaté le 2026-10-21).
    _ligne_ajustee(c, Y_STRUCTURE, "Structure", _maj(structure))
    _ligne_ajustee(c, Y_AFFECTATION, "Affectation", _maj(_abreviation(employe.service)))
    _ligne(c, Y_JOURS, "Nombre de jour", f"{titre.nb_jours}  j")
    _ligne(c, Y_DEPART, "Date de Départ", _date(titre.date_depart))
    _colonne2(c, Y_DEPART, "Date de Retour", _date(titre.date_retour))
    _ligne_ajustee(c, Y_ADRESSE, "Adresse durant Congé", _maj(titre.adresse_conge))
    # CE et CS ne relèvent d'aucun exercice : la ligne n'est imprimée que pour un CP.
    if titre.type_conge == 'CP':
        _ligne(c, Y_EXERCICE, "Exercice", titre.exercice)


def _draw_signature(c, titre, config):
    """« Fait à <ville>, le : <date> » puis le bloc signataire FIGÉ sur le titre
    (« P.I » si signé par intérim). L'espace en dessous reste libre pour la
    signature et le cachet apposés à la main."""
    date_txt = _date(titre.date_etablissement)
    y = _y(Y_FAIT_A)
    c.setFont(POLICE, TAILLE_VALEUR + 1)
    c.drawRightString(X_RIGHT * mm, y, date_txt)
    x_date = X_RIGHT * mm - c.stringWidth(date_txt, POLICE, TAILLE_VALEUR + 1)
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawRightString(x_date - 4 * mm, y, f"Fait à {config.ville or ''}, le :")

    ligne = f"LE  {_maj(titre.signataire_titre)}"
    if titre.signataire_interim:
        ligne += ", P.I"
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(X_LABEL * mm, _y(Y_SIGNATAIRE_TITRE), ligne)
    c.drawString(X_LABEL * mm, _y(Y_SIGNATAIRE_NOM), titre.signataire_nom or '')


def _draw_pied(c, config):
    """Filet + coordonnées en bas de page (le papier ne porte pas « Édité le »)."""
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


def build_conge_pdf(titre, config, date_generation, contrat_numero='', mention=''):
    """PDF du titre de congé (bytes). `date_generation` est conservée pour la
    symétrie avec l'attestation ; la date imprimée est `titre.date_etablissement`.
    `mention` : « (mode test) » en rouge — vide pour un titre officiel."""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Titre de congé — {titre.reference}")

    if getattr(titre, 'statut', '') == 'annulee':
        _draw_filigrane_annule(c)  # dessiné en premier : sous le texte
    _draw_header(c, config)
    c.setLineWidth(0.8)
    c.line(X_LABEL * mm, _y(Y_FILET), X_RIGHT * mm, _y(Y_FILET))
    c.setLineWidth(1)
    _draw_title(c, '', titre=TITRE)
    _draw_sous_titre(c, titre, mention)
    _draw_reference_block(c, titre, contrat_numero)
    _draw_corps(c, titre)
    _draw_signature(c, titre, config)
    _draw_pied(c, config)

    c.showPage()
    c.save()
    return buffer.getvalue()
