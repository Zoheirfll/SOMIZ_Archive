"""
ocr/views.py
Recherche plein texte dans le contenu OCR des documents — ADMIN uniquement.
"""

from rest_framework.views import APIView
from rest_framework.response import Response

from accounts.permissions import IsAdmin
from employees.models import EmployeeDocumentFilePage
from audit.models import AuditLog
from ocr.models import OcrResult

# Nombre max de résultats retournés par une recherche globale — un plafond
# large suffit très largement en usage réel (RH, pas un moteur de recherche
# public) et évite de renvoyer une réponse énorme sur un terme trop courant.
GLOBAL_SEARCH_MAX_RESULTS = 100
GLOBAL_SEARCH_SNIPPET_CONTEXT = 80

# Seuls date_naissance/date_embauche restent de vraies colonnes Employee
# exposées côté UI — nin/rib/numero_secu_sociale/groupe_sanguin ont été
# migrés en ChampPersonnalise (codes NIN/RIB/NUM_SECU/GROUPE_SANGUIN,
# voir CLAUDE.md section "Champs personnalisés... Migration des 4 anciens
# champs") : les colonnes Employee correspondantes existent encore en
# base mais ne sont plus exposées par aucun serializer, donc y écrire ne
# serait visible nulle part côté UI. Toute valeur hors de ces deux codes
# doit passer par ChampPersonnalise/EmployeeChampValeur.
SYSTEM_FIELD_CODES = {'date_naissance', 'date_embauche'}


def _build_snippet(text, query, context=GLOBAL_SEARCH_SNIPPET_CONTEXT):
    """
    Extrait une fenêtre de texte autour de la première occurrence de
    `query` dans `text` (comparaison insensible à la casse) — permet à
    l'ADMIN de voir immédiatement le contexte du passage trouvé (ex. "...
    et son épouse Fatima BENALI, née le ...") sans ouvrir le document.
    """
    lower_text = text.lower()
    idx = lower_text.find(query.lower())
    if idx == -1:
        return text[:context * 2]
    start = max(0, idx - context)
    end = min(len(text), idx + len(query) + context)
    prefix = '…' if start > 0 else ''
    suffix = '…' if end < len(text) else ''
    return f"{prefix}{text[start:end].strip()}{suffix}"


def _find_matching_page_ordre(result, q):
    """
    Retrouve la page physique (ordre EmployeeDocumentFilePage, 1-indexé) où
    `q` apparaît, via `OcrResult.page_texts` (aligné 1:1 avec les pages du
    PDF, voir son invariant, employees/models.py). None pour une image
    (page_texts toujours vide) ou si le terme n'apparaît que sur la
    frontière entre deux pages (raw_text les joint avec "\n").
    """
    q_lower = q.lower()
    for idx, page_text in enumerate(result.page_texts or []):
        if q_lower in page_text.lower():
            return idx + 1
    return None


class OcrGlobalSearchView(APIView):
    """
    GET /api/ocr/search/?q=<terme>
    Recherche plein texte à travers TOUS les documents analysés par OCR
    (tous employés confondus) — pas seulement les employés eux-mêmes :
    un document appartenant à l'employé A peut mentionner une tierce
    personne (ex. l'acte de naissance d'un employé mentionne son épouse
    ou ses enfants), et cette recherche la retrouve même si elle n'a
    jamais été elle-même employée. ADMIN uniquement, pas de scoping
    CONSULTANT (voir contrainte globale de la spec OCR).
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        if len(q) < 2:
            return Response({'results': [], 'truncated': False})

        queryset = OcrResult.objects.filter(
            status=OcrResult.Status.DONE, raw_text__icontains=q
        ).select_related(
            'file__document__employee', 'file__document__type_doc'
        ).order_by('file__document__employee__nom', 'file__document__employee__prenom')

        total = queryset.count()
        results = []
        for result in queryset[:GLOBAL_SEARCH_MAX_RESULTS]:
            employee = result.file.document.employee
            page_ordre = _find_matching_page_ordre(result, q)
            page_id = None
            page_nom = None
            snippet_source = result.raw_text
            if page_ordre:
                page = EmployeeDocumentFilePage.objects.filter(
                    file_id=result.file_id, ordre=page_ordre
                ).first()
                if page:
                    page_id = str(page.id)
                    page_nom = page.nom
                    snippet_source = result.page_texts[page_ordre - 1]
            results.append({
                'employee_id': str(employee.id),
                'employee_matricule': employee.matricule,
                'employee_nom': employee.nom,
                'employee_prenom': employee.prenom,
                'type_doc_nom': result.file.document.type_doc.nom,
                'file_id': str(result.file_id),
                'file_name': result.file.file_name,
                'page_ordre': page_ordre,
                'page_id': page_id,
                'page_nom': page_nom,
                'snippet': _build_snippet(snippet_source, q),
            })

        AuditLog.log(
            request, AuditLog.Action.VIEW,
            details={'action': 'ocr_global_search', 'q': q, 'nb_resultats': total},
        )

        return Response({
            'results': results,
            'total': total,
            'truncated': total > GLOBAL_SEARCH_MAX_RESULTS,
        })
