from io import StringIO
from unittest.mock import patch
import pytest
from django.core.management import call_command

pytestmark = pytest.mark.django_db


@patch('ocr.management.commands.backfill_ocr.run_ocr')
def test_backfill_enqueues_files_without_ocr_result(mock_run_ocr, employee_document_file):
    out = StringIO()
    call_command('backfill_ocr', stdout=out)

    mock_run_ocr.delay.assert_called_once_with(str(employee_document_file.id))
    assert "1 fichier" in out.getvalue()


@patch('ocr.management.commands.backfill_ocr.run_ocr')
def test_backfill_skips_files_already_analyzed(mock_run_ocr, employee_document_file):
    from ocr.models import OcrResult
    OcrResult.objects.create(file=employee_document_file, status=OcrResult.Status.DONE)

    call_command('backfill_ocr', stdout=StringIO())

    mock_run_ocr.delay.assert_not_called()


@patch('ocr.management.commands.backfill_ocr.run_ocr')
def test_backfill_dry_run_does_not_enqueue(mock_run_ocr, employee_document_file):
    out = StringIO()
    call_command('backfill_ocr', '--dry-run', stdout=out)

    mock_run_ocr.delay.assert_not_called()
    assert "dry-run" in out.getvalue()
