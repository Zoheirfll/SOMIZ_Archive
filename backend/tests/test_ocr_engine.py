from unittest.mock import patch, MagicMock
import pytest
from ocr.ocr_engine import run_ocr_on_file, OcrEngineError


def _fake_preprocessable_image():
    """Un mock qui traverse _preprocess() (exif_transpose/convert/autocontrast/
    resize) sans lever, en restant le même objet tout du long."""
    img = MagicMock()
    img.size = (2000, 2000)
    img.convert.return_value = img
    img.resize.return_value = img
    return img


@patch('ocr.ocr_engine.ImageOps')
@patch('ocr.ocr_engine.pytesseract')
@patch('ocr.ocr_engine.Image')
def test_run_ocr_on_image_returns_text_and_confidence(mock_image, mock_pytesseract, mock_image_ops):
    img = _fake_preprocessable_image()
    mock_image.open.return_value = img
    mock_image_ops.exif_transpose.return_value = img
    mock_image_ops.autocontrast.return_value = img
    mock_pytesseract.image_to_string.return_value = "Texte détecté"
    mock_pytesseract.image_to_data.return_value = {
        'conf': ['95', '88', '-1']
    }
    mock_pytesseract.Output.DICT = 'dict'

    text, confidence, page_texts = run_ocr_on_file('/fake/path.png', 'image/png')

    assert text == "Texte détecté"
    assert confidence == pytest.approx(91.5)
    assert page_texts == []


@patch('ocr.ocr_engine.ImageOps')
@patch('ocr.ocr_engine.convert_from_path')
@patch('ocr.ocr_engine.pytesseract')
def test_run_ocr_on_pdf_concatenates_pages(mock_pytesseract, mock_convert, mock_image_ops):
    mock_convert.return_value = [_fake_preprocessable_image(), _fake_preprocessable_image()]
    mock_image_ops.exif_transpose.side_effect = lambda img: img
    mock_image_ops.autocontrast.side_effect = lambda img: img
    mock_pytesseract.image_to_string.side_effect = ["Page 1", "Page 2"]
    mock_pytesseract.image_to_data.return_value = {'conf': ['80']}
    mock_pytesseract.Output.DICT = 'dict'

    text, confidence, page_texts = run_ocr_on_file('/fake/path.pdf', 'application/pdf')

    assert text == "Page 1\nPage 2"
    assert page_texts == ["Page 1", "Page 2"]


@patch('ocr.ocr_engine.pytesseract')
@patch('ocr.ocr_engine.Image')
def test_run_ocr_raises_ocr_engine_error_on_failure(mock_image, mock_pytesseract):
    mock_image.open.side_effect = OSError("fichier corrompu")

    with pytest.raises(OcrEngineError):
        run_ocr_on_file('/fake/path.png', 'image/png')
