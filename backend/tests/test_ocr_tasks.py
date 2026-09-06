from unittest.mock import patch
import pytest
from ocr.models import OcrResult
from ocr.tasks import run_ocr

pytestmark = pytest.mark.django_db


@patch('ocr.tasks.run_ocr_on_file')
def test_run_ocr_creates_done_result_with_no_champ_source(mock_engine, employee_document_file):
    mock_engine.return_value = ("Texte libre sans champ source", 88.0)

    run_ocr(str(employee_document_file.id))

    result = OcrResult.objects.get(file=employee_document_file)
    assert result.status == OcrResult.Status.DONE
    assert result.raw_text == "Texte libre sans champ source"
    assert result.confidence == 88.0
    assert result.extracted_fields == []


@patch('ocr.tasks.run_ocr_on_file')
def test_run_ocr_extracts_fields_when_champ_source_set(mock_engine, employee_document_file):
    employee_document_file.document.type_doc.champ_source = 'nin'
    employee_document_file.document.type_doc.save()
    mock_engine.return_value = ("NIN: 123456789012345678", 92.0)

    run_ocr(str(employee_document_file.id))

    result = OcrResult.objects.get(file=employee_document_file)
    assert len(result.extracted_fields) == 1
    assert result.extracted_fields[0]['champ_code'] == 'nin'
    assert result.extracted_fields[0]['statut'] == 'en_attente'


@patch('ocr.tasks.run_ocr_on_file')
def test_run_ocr_marks_failed_on_engine_error(mock_engine, employee_document_file):
    from ocr.ocr_engine import OcrEngineError
    mock_engine.side_effect = OcrEngineError("tesseract absent")

    run_ocr(str(employee_document_file.id))

    result = OcrResult.objects.get(file=employee_document_file)
    assert result.status == OcrResult.Status.FAILED
    assert "tesseract absent" in result.error_message


def test_run_ocr_is_idempotent_on_rerun(employee_document_file):
    OcrResult.objects.create(file=employee_document_file, status=OcrResult.Status.DONE, raw_text="ancien")
    with patch('ocr.tasks.run_ocr_on_file', return_value=("nouveau", 50.0)):
        run_ocr(str(employee_document_file.id))
    result = OcrResult.objects.get(file=employee_document_file)
    assert result.raw_text == "nouveau"
    assert OcrResult.objects.filter(file=employee_document_file).count() == 1
