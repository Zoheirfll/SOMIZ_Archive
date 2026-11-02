# backend/reporting/rapport_pdf.py
"""PDF du rapport mensuel DRH : en-tête, tuiles d'indicateurs (évolution,
objectif), évolution de l'effectif sur 12 mois et répartition par direction
(photos mensuelles EffectifInstantane), points d'attention et faits
marquants. Contenu agrégé uniquement — aucune donnée nominative.

Les couleurs reprennent la palette verte de l'application
(frontend/src/styles/theme.js, thème clair) : le PDF ne peut pas lire les
tokens JS, elles sont donc regroupées ici, en un seul endroit."""
from io import BytesIO

from django.utils import timezone
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# Palette (theme.js clair : primary, directionGrad, success/danger/warning, textMuted, border)
VERT_FONCE = colors.HexColor('#052e16')
VERT = colors.HexColor('#166534')
VERT_CLAIR = colors.HexColor('#dcfce7')
ROUGE = colors.HexColor('#b91c1c')
ROUGE_CLAIR = colors.HexColor('#fee2e2')
ORANGE = colors.HexColor('#b45309')
ORANGE_CLAIR = colors.HexColor('#fef3c7')
BLEU_CLAIR = colors.HexColor('#e0f2fe')
BLEU = colors.HexColor('#0369a1')
GRIS = colors.HexColor('#6b7280')
GRIS_BORD = colors.HexColor('#e5e7eb')
GRIS_FOND = colors.HexColor('#f9fafb')
TEXTE = colors.HexColor('#111827')

MARGE = 15 * mm
LARGEUR = A4[0] - 2 * MARGE
TUILES_PAR_LIGNE = 3

# Indicateurs dont une hausse est défavorable (couleur de la variation inversée).
HAUSSE_DEFAVORABLE = {'sorties', 'turnover', 'taux_depart', 'departs_retraite', 'contrats_echeance'}

_S = {
    'titre': ParagraphStyle('titre', fontName='Helvetica-Bold', fontSize=18, textColor=colors.white, leading=22),
    'sous_titre': ParagraphStyle('sous_titre', fontName='Helvetica', fontSize=9.5, textColor=VERT_CLAIR, leading=13),
    'section': ParagraphStyle('section', fontName='Helvetica-Bold', fontSize=12, textColor=VERT, leading=15,
                              spaceBefore=8, spaceAfter=5),
    'libelle': ParagraphStyle('libelle', fontName='Helvetica', fontSize=8, textColor=GRIS, leading=10),
    'valeur': ParagraphStyle('valeur', fontName='Helvetica-Bold', fontSize=17, textColor=TEXTE, leading=20),
    'detail': ParagraphStyle('detail', fontName='Helvetica', fontSize=7.5, textColor=GRIS, leading=10),
    'texte': ParagraphStyle('texte', fontName='Helvetica', fontSize=9, textColor=TEXTE, leading=12),
    'cellule': ParagraphStyle('cellule', fontName='Helvetica', fontSize=8.5, textColor=TEXTE, leading=11),
    'entete': ParagraphStyle('entete', fontName='Helvetica-Bold', fontSize=8.5, textColor=VERT_FONCE, leading=11),
    'vide': ParagraphStyle('vide', fontName='Helvetica-Oblique', fontSize=9, textColor=GRIS, leading=12),
    'centre': ParagraphStyle('centre', fontName='Helvetica', fontSize=8, textColor=GRIS, alignment=TA_CENTER),
}


def _nombre(v):
    if v is None:
        return '—'
    if isinstance(v, float):
        v = round(v, 1)
        return f'{v:,.1f}'.replace(',', ' ').replace('.', ',') if v != int(v) else f'{int(v):,}'.replace(',', ' ')
    return f'{v:,}'.replace(',', ' ')


def _variation(k):
    v = k.get('variation_pct')
    if v is None:
        return '', GRIS
    if v == 0:
        return '= stable vs mois précédent', GRIS
    defavorable = (v > 0) == (k.get('code') in HAUSSE_DEFAVORABLE)
    # Pas de flèche ▲▼ : absente de la police Helvetica standard du PDF.
    return f"{'+' if v > 0 else ''}{_nombre(float(v))} % vs mois précédent", ROUGE if defavorable else VERT


def _tuile(k):
    unite = f" {k['unite']}" if k.get('unite') and k.get('valeur') is not None else ''
    texte_var, couleur = _variation(k)
    lignes = [
        Paragraph(k['libelle'].upper(), _S['libelle']),
        Paragraph(f"{_nombre(k.get('valeur'))}{unite}", _S['valeur']),
    ]
    if texte_var:
        lignes.append(Paragraph(f'<font color="#{couleur.hexval()[2:]}">{texte_var}</font>', _S['detail']))
    fond = GRIS_FOND
    if k.get('cible') is not None:
        signe = '≥' if k.get('sens') == 'au_moins' else '≤'
        atteint = k.get('atteint')
        etat = 'atteint' if atteint else 'non atteint'
        lignes.append(Paragraph(f"Objectif {signe} {_nombre(k['cible'])}{unite} — <b>{etat}</b>", _S['detail']))
        fond = VERT_CLAIR if atteint else ROUGE_CLAIR
    return lignes, fond


def _tuiles(kpis):
    cellules, fonds = [], []
    for k in kpis:
        contenu, fond = _tuile(k)
        cellules.append(contenu)
        fonds.append(fond)
    while len(cellules) % TUILES_PAR_LIGNE:
        cellules.append('')
        fonds.append(colors.white)
    lignes = [cellules[i:i + TUILES_PAR_LIGNE] for i in range(0, len(cellules), TUILES_PAR_LIGNE)]
    largeur = LARGEUR / TUILES_PAR_LIGNE
    t = Table(lignes, colWidths=[largeur] * TUILES_PAR_LIGNE)
    style = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]
    for i, fond in enumerate(fonds):
        col, lig = i % TUILES_PAR_LIGNE, i // TUILES_PAR_LIGNE
        if fond is colors.white:
            continue
        style += [('BACKGROUND', (col, lig), (col, lig), fond),
                  ('BOX', (col, lig), (col, lig), 2, colors.white),
                  ('LINEBEFORE', (col, lig), (col, lig), 3, VERT)]
    t.setStyle(TableStyle(style))
    return t


def _graphique_effectif(evolution):
    """evolution : [(libellé du mois, effectif)] — barres, valeur au-dessus."""
    hauteur = 55 * mm
    d = Drawing(LARGEUR, hauteur)
    valeurs = [nb for _m, nb in evolution]
    graphe = VerticalBarChart()
    graphe.x, graphe.y = 12 * mm, 10 * mm
    graphe.width, graphe.height = LARGEUR - 16 * mm, hauteur - 18 * mm
    graphe.data = [valeurs]
    graphe.categoryAxis.categoryNames = [m for m, _nb in evolution]
    graphe.categoryAxis.labels.fontSize = 7
    graphe.categoryAxis.labels.fillColor = GRIS
    graphe.categoryAxis.strokeColor = GRIS_BORD
    haut = max(valeurs) if valeurs else 1
    graphe.valueAxis.valueMin = 0
    graphe.valueAxis.valueMax = max(1, int(haut * 1.2) + 1)
    graphe.valueAxis.labels.fontSize = 7
    graphe.valueAxis.labels.fillColor = GRIS
    graphe.valueAxis.strokeColor = GRIS_BORD
    graphe.valueAxis.gridStrokeColor = GRIS_BORD
    graphe.valueAxis.visibleGrid = True
    graphe.bars[0].fillColor = VERT
    graphe.bars[0].strokeColor = None
    graphe.barLabelFormat = '%d'
    graphe.barLabels.fontSize = 7
    graphe.barLabels.fillColor = TEXTE
    graphe.barLabels.nudge = 6
    d.add(graphe)
    if not valeurs:
        d.add(String(LARGEUR / 2, hauteur / 2, 'Aucune photo mensuelle disponible.', fontSize=9,
                     fillColor=GRIS, textAnchor='middle'))
    return d


def _table_directions(par_direction):
    total = sum(nb for _n, nb in par_direction) or 1
    lignes = [[Paragraph(t, _S['entete']) for t in ('Direction', 'Effectif', 'Part')]]
    for nom, nb in par_direction:
        lignes.append([Paragraph(nom or 'Non rattaché', _S['cellule']), _nombre(nb), f'{_nombre(nb * 100 / total)} %'])
    lignes.append([Paragraph('<b>Total</b>', _S['cellule']), _nombre(sum(nb for _n, nb in par_direction)), '100 %'])
    t = Table(lignes, colWidths=[LARGEUR * 0.64, LARGEUR * 0.18, LARGEUR * 0.18], repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), VERT_CLAIR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, GRIS_FOND]),
        ('LINEABOVE', (0, -1), (-1, -1), 0.8, VERT),
        ('FONTNAME', (1, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5), ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, GRIS_BORD),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return t


def _encadres(elements, fond, bord):
    if not elements:
        return [Paragraph('Aucun élément sur la période.', _S['vide'])]
    t = Table([[Paragraph(e['texte'], _S['texte'])] for e in elements], colWidths=[LARGEUR])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), fond), ('LINEBEFORE', (0, 0), (0, -1), 3, bord),
        ('LINEBELOW', (0, 0), (-1, -2), 1.5, colors.white),
        ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    return [t]


def _en_tete(titre, periode):
    genere = timezone.localtime().strftime('%d/%m/%Y à %H:%M')
    debut, fin = (_date_fr(periode['debut']), _date_fr(periode['fin']))
    t = Table([[Paragraph(titre, _S['titre'])],
               [Paragraph(f'Période du {debut} au {fin} — généré le {genere}', _S['sous_titre'])]],
              colWidths=[LARGEUR])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), VERT_FONCE), ('LINEBELOW', (0, -1), (-1, -1), 3, VERT),
        ('LEFTPADDING', (0, 0), (-1, -1), 12), ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 11),
    ]))
    return t


def _date_fr(iso):
    a, m, j = iso.split('-')
    return f'{j}/{m}/{a}'


def _pied(c, doc):
    c.saveState()
    c.setStrokeColor(GRIS_BORD)
    c.line(MARGE, 11 * mm, A4[0] - MARGE, 11 * mm)
    c.setFont('Helvetica', 7)
    c.setFillColor(GRIS)
    c.drawString(MARGE, 7 * mm, 'SOMIZ — Document interne DRH, données agrégées (Loi 18-07 / RGPD). Diffusion restreinte.')
    c.drawRightString(A4[0] - MARGE, 7 * mm, f'Page {doc.page}')
    c.restoreState()


def generer_pdf(titre, periode, synthese, evolution=None, par_direction=None):
    """evolution : [(mois, effectif)] sur 12 mois ; par_direction : [(nom, effectif)]
    à la fin du mois — tous deux issus des photos mensuelles (facultatifs)."""
    tampon = BytesIO()
    doc = SimpleDocTemplate(tampon, pagesize=A4, leftMargin=MARGE, rightMargin=MARGE,
                            topMargin=MARGE, bottomMargin=16 * mm, title=titre, author='SOMIZ')
    flux = [_en_tete(titre, periode), Spacer(1, 6 * mm),
            Paragraph('Indicateurs clés', _S['section']), _tuiles(synthese.get('kpis') or [])]
    if evolution is not None:
        flux.append(KeepTogether([Paragraph("Évolution de l'effectif (12 derniers mois)", _S['section']),
                                  _graphique_effectif(evolution)]))
    if par_direction:
        flux += [Paragraph('Répartition par direction (fin de mois)', _S['section']), _table_directions(par_direction)]
    flux.append(KeepTogether([Paragraph("Points d'attention", _S['section']),
                              *_encadres(synthese.get('alertes') or [], ORANGE_CLAIR, ORANGE)]))
    flux.append(KeepTogether([Paragraph('Faits marquants', _S['section']),
                              *_encadres(synthese.get('faits_marquants') or [], BLEU_CLAIR, BLEU)]))
    flux += [Spacer(1, 6 * mm), Paragraph(
        'Détail, définitions des indicateurs et exports : menu Statistiques de SOMIZ (/statistiques).', _S['centre'])]
    doc.build(flux, onFirstPage=_pied, onLaterPages=_pied)
    return tampon.getvalue()
