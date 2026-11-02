# backend/reporting/export.py
import openpyxl
from django.http import HttpResponse
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

from audit.models import AuditLog

XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def reponse_xlsx(request, page, data):
    """Un onglet par table d'export du constructeur ; valeurs masquées
    (None) laissées vides. Export tracé dans l'audit."""
    classeur = openpyxl.Workbook()
    classeur.remove(classeur.active)
    for t in data.get('exports', []):
        # Titre d'onglet : 31 caractères max, unique (le bilan social en
        # concatène plusieurs pages, des titres tronqués peuvent coïncider).
        titre, n = t['titre'][:31], 2
        while titre in classeur.sheetnames:
            suffixe = f' ({n})'
            titre, n = t['titre'][:31 - len(suffixe)] + suffixe, n + 1
        feuille = classeur.create_sheet(titre)
        feuille.append(t['colonnes'])
        for cellule in feuille[1]:
            cellule.font = Font(bold=True)
        for ligne in t['lignes']:
            feuille.append(['' if v is None else v for v in ligne])
        for i, colonne in enumerate(t['colonnes'], start=1):
            feuille.column_dimensions[get_column_letter(i)].width = max(len(str(colonne)) + 2, 14)
    if not classeur.sheetnames:
        classeur.create_sheet('Rapport')
    reponse = HttpResponse(content_type=XLSX)
    periode = data['periode']
    reponse['Content-Disposition'] = (
        f'attachment; filename="rapport_{page}_{periode["debut"]}_au_{periode["fin"]}.xlsx"'
    )
    classeur.save(reponse)
    AuditLog.log(request, AuditLog.Action.EXPORT,
                 details={'type': 'reporting_rh', 'page': page, 'periode': periode})
    return reponse
