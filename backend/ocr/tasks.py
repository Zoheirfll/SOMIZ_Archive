"""
ocr/tasks.py
Tâche de fond déclenchée à chaque création de EmployeeDocumentFile —
voir employees/views.py (DocumentListUploadView.post, ScanImportView.post,
ContratDocumentListUploadView.post). Idempotente : un ré-appel sur le même
file_id met à jour l'OcrResult existant plutôt que d'en créer un second
(OneToOneField).
"""

from django.utils import timezone
from celery import shared_task

from ocr.models import OcrResult
from ocr.ocr_engine import run_ocr_on_file, OcrEngineError
from ocr.extractors import extract_fields


@shared_task
def run_ocr(file_id):
    from employees.models import EmployeeDocumentFile

    try:
        file_obj = EmployeeDocumentFile.objects.select_related(
            'document__type_doc'
        ).get(pk=file_id)
    except EmployeeDocumentFile.DoesNotExist:
        return

    result, _ = OcrResult.objects.get_or_create(file=file_obj)

    try:
        text, confidence = run_ocr_on_file(file_obj.file.path, file_obj.mime_type)
    except OcrEngineError as exc:
        result.status = OcrResult.Status.FAILED
        result.error_message = str(exc)
        result.processed_at = timezone.now()
        result.save(update_fields=['status', 'error_message', 'processed_at'])
        return

    champ_source = file_obj.document.type_doc.champ_source
    fields = []
    if champ_source:
        for candidate in extract_fields(champ_source, text):
            fields.append({**candidate, 'statut': 'en_attente'})

    result.status = OcrResult.Status.DONE
    result.raw_text = text
    result.confidence = confidence
    result.extracted_fields = fields
    result.processed_at = timezone.now()
    result.error_message = ''
    result.save(update_fields=[
        'status', 'raw_text', 'confidence', 'extracted_fields',
        'processed_at', 'error_message',
    ])
