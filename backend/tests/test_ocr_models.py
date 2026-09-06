import pytest
from ocr.models import OcrResult

pytestmark = pytest.mark.django_db


def test_ocr_result_default_status_is_pending(employee_document_file):
    result = OcrResult.objects.create(file=employee_document_file)
    assert result.status == OcrResult.Status.PENDING
    assert result.extracted_fields == []


def test_ocr_result_cascades_on_file_delete(employee_document_file):
    OcrResult.objects.create(file=employee_document_file)
    employee_document_file.delete()
    assert OcrResult.objects.count() == 0
