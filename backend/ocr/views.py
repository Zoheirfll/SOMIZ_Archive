"""
ocr/views.py
Lecture et validation manuelle des suggestions OCR — ADMIN uniquement
(voir contrainte de la spec : aucune écriture automatique sur
Employee/EmployeeChampValeur, toujours une action explicite).
"""

from datetime import datetime
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

# Seuls date_naissance/date_embauche restent de vraies colonnes Employee
# exposées côté UI — nin/rib/numero_secu_sociale/groupe_sanguin ont été
# migrés en ChampPersonnalise (codes NIN/RIB/NUM_SECU/GROUPE_SANGUIN,
# voir CLAUDE.md section "Champs personnalisés... Migration des 4 anciens
# champs") : les colonnes Employee correspondantes existent encore en
# base mais ne sont plus exposées par aucun serializer, donc y écrire ne
# serait visible nulle part côté UI. Toute valeur hors de ces deux codes
# doit passer par ChampPersonnalise/EmployeeChampValeur.
SYSTEM_FIELD_CODES = {'date_naissance', 'date_embauche'}


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
            try:
                ancienne_valeur = self._appliquer_champ(employee, champ_code, valeur)
            except ValueError:
                return Response(
                    {'error': "Format de valeur invalide pour ce champ."},
                    status=status.HTTP_400_BAD_REQUEST
                )
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
        if champ_code.lower() in SYSTEM_FIELD_CODES:
            attr = champ_code.lower()
            ancienne_date = getattr(employee, attr, None)
            ancienne_valeur = ancienne_date.strftime('%d/%m/%Y') if ancienne_date else ''
            # date_naissance/date_embauche sont des DateField — leur affecter
            # directement la chaîne "JJ/MM/AAAA" produite par l'extracteur
            # ferait échouer le save() (ValueError levée ici, gérée par
            # l'appelant en 400) ; ValueError se propage aussi si le format
            # est inattendu.
            employee_date = datetime.strptime(valeur, '%d/%m/%Y').date()
            setattr(employee, attr, employee_date)
            employee.save(update_fields=[attr])
            return ancienne_valeur

        try:
            # code__iexact : champ_source est un champ texte libre, sa casse
            # peut différer de celle du ChampPersonnalise.code visé (voir
            # même correctif que extract_fields()).
            champ = ChampPersonnalise.objects.get(code__iexact=champ_code, is_active=True)
        except ChampPersonnalise.DoesNotExist:
            raise Http404("Champ cible introuvable.")

        valeur_obj, _ = EmployeeChampValeur.objects.get_or_create(
            employee=employee, champ=champ, defaults={'valeur': valeur}
        )
        ancienne_valeur = valeur_obj.valeur
        valeur_obj.valeur = valeur
        valeur_obj.save(update_fields=['valeur'])
        return ancienne_valeur
