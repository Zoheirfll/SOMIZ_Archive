"""
ocr/views.py
Lecture et validation manuelle des suggestions OCR — ADMIN uniquement
(voir contrainte de la spec : aucune écriture automatique sur
Employee/EmployeeChampValeur, toujours une action explicite).
"""

from django.http import Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from accounts.permissions import IsAdmin
from employees.views import resolve_employee
from employees.models import ChampPersonnalise, EmployeeChampValeur
from audit.models import AuditLog
from ocr.models import OcrResult
from ocr.serializers import OcrSuggestionSerializer

SYSTEM_FIELD_CODES = {
    'nin', 'date_naissance', 'date_embauche', 'rib',
    'numero_secu_sociale', 'groupe_sanguin',
}


class OcrSuggestionListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, emp_id):
        employee = resolve_employee(emp_id)
        results = OcrResult.objects.filter(
            file__document__employee=employee, status=OcrResult.Status.DONE
        ).select_related('file__document')

        suggestions = []
        for result in results:
            for index, field in enumerate(result.extracted_fields):
                if field.get('statut') != 'en_attente':
                    continue
                suggestions.append({
                    'ocr_result_id': result.id,
                    'field_index': index,
                    'champ_code': field['champ_code'],
                    'valeur': field['valeur'],
                    'confiance': field['confiance'],
                    'document_id': result.file.document_id,
                    'file_id': result.file_id,
                })
        serializer = OcrSuggestionSerializer(suggestions, many=True)
        return Response(serializer.data)


class OcrSuggestionActionView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, ocr_result_id, field_index, action):
        if action not in ('appliquer', 'ignorer'):
            raise Http404

        try:
            result = OcrResult.objects.select_related(
                'file__document__employee'
            ).get(pk=ocr_result_id)
        except OcrResult.DoesNotExist:
            raise Http404

        try:
            field = result.extracted_fields[field_index]
        except IndexError:
            raise Http404

        if field.get('statut') != 'en_attente':
            return Response(
                {'error': 'Suggestion déjà traitée.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        employee = result.file.document.employee
        champ_code = field['champ_code']
        valeur = field['valeur']

        if action == 'appliquer':
            ancienne_valeur = self._appliquer_champ(employee, champ_code, valeur)
            AuditLog.log(
                request, AuditLog.Action.MODIFY_EMP,
                target=employee,
                details={
                    'transfer': {champ_code: {'de': ancienne_valeur, 'vers': valeur}},
                    'source': 'ocr',
                }
            )
            field['statut'] = 'appliquee'
        else:
            field['statut'] = 'ignoree'

        result.extracted_fields[field_index] = field
        result.save(update_fields=['extracted_fields'])
        return Response({'statut': field['statut']})

    def _appliquer_champ(self, employee, champ_code, valeur):
        if champ_code in SYSTEM_FIELD_CODES:
            ancienne_valeur = getattr(employee, champ_code, '')
            setattr(employee, champ_code, valeur)
            employee.save(update_fields=[champ_code])
            return ancienne_valeur

        try:
            champ = ChampPersonnalise.objects.get(code=champ_code, is_active=True)
        except ChampPersonnalise.DoesNotExist:
            raise Http404("Champ cible introuvable.")

        valeur_obj, _ = EmployeeChampValeur.objects.get_or_create(
            employee=employee, champ=champ, defaults={'valeur': valeur}
        )
        ancienne_valeur = valeur_obj.valeur
        valeur_obj.valeur = valeur
        valeur_obj.save(update_fields=['valeur'])
        return ancienne_valeur
