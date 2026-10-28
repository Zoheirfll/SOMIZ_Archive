from unittest.mock import patch
import pytest
from PIL import Image
from ocr.ocr_engine import run_ocr_on_file, OcrEngineError


def _page():
    return Image.new('RGB', (2000, 2000), 'white')


def _data(words, conf='90'):
    """Réponse image_to_data factice : un mot par ligne."""
    n = len(words)
    return {
        'text': list(words), 'conf': [conf] * n,
        'block_num': [1] * n, 'par_num': [1] * n, 'line_num': list(range(1, n + 1)),
    }


def _fake_tesseract(mock_pytesseract, latin_words, arabic_words=()):
    mock_pytesseract.Output.DICT = 'dict'
    mock_pytesseract.image_to_osd.side_effect = RuntimeError('osd')

    def image_to_data(image, lang=None, output_type=None):
        return _data(arabic_words) if lang == 'ara' else _data(latin_words)

    mock_pytesseract.image_to_data.side_effect = image_to_data


@patch('ocr.ocr_engine.pytesseract')
@patch('ocr.ocr_engine.Image.open')
def test_run_ocr_on_image_returns_text_and_confidence(mock_open, mock_pytesseract):
    mock_open.return_value = _page()
    _fake_tesseract(mock_pytesseract, ['Texte', 'détecté'])

    text, confidence, page_texts = run_ocr_on_file('/fake/path.png', 'image/png')

    assert text == "Texte\ndétecté"
    assert confidence == pytest.approx(90)
    assert page_texts == []


@patch('ocr.ocr_engine.convert_from_path')
@patch('ocr.ocr_engine.pytesseract')
def test_run_ocr_on_pdf_concatenates_pages(mock_pytesseract, mock_convert):
    mock_convert.return_value = [_page(), _page()]
    _fake_tesseract(mock_pytesseract, ['Page'])

    text, confidence, page_texts = run_ocr_on_file('/fake/path.pdf', 'application/pdf')

    assert text == "Page\nPage"
    assert page_texts == ["Page", "Page"]


@patch('ocr.ocr_engine.pytesseract')
@patch('ocr.ocr_engine.Image.open')
def test_run_ocr_merges_arabic_pass_and_drops_latin_noise(mock_open, mock_pytesseract):
    mock_open.return_value = _page()
    _fake_tesseract(mock_pytesseract, ['Note'], arabic_words=['الجمهورية', 'xqzv'])

    text, _, _ = run_ocr_on_file('/fake/path.png', 'image/png')

    assert 'Note' in text
    assert 'الجمهورية' in text
    assert 'xqzv' not in text


@patch('ocr.ocr_engine.pytesseract')
@patch('ocr.ocr_engine.Image.open')
def test_run_ocr_drops_low_confidence_words(mock_open, mock_pytesseract):
    mock_open.return_value = _page()
    _fake_tesseract(mock_pytesseract, ['SAADI'])
    mock_pytesseract.image_to_data.side_effect = lambda image, lang=None, output_type=None: (
        _data(['SAADI']) if lang == 'fra+eng' else _data(['junk'], conf='20')
    )

    text, _, _ = run_ocr_on_file('/fake/path.png', 'image/png')

    assert text == 'SAADI'


@patch('ocr.ocr_engine.pytesseract')
@patch('ocr.ocr_engine.Image')
def test_run_ocr_raises_ocr_engine_error_on_failure(mock_image, mock_pytesseract):
    mock_image.open.side_effect = OSError("fichier corrompu")

    with pytest.raises(OcrEngineError):
        run_ocr_on_file('/fake/path.png', 'image/png')
