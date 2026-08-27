import io
import pytest
from pypdf import PdfWriter
from employees.pdf_utils import pdf_page_count, extract_pdf_pages, PdfExtractionError


def make_pdf(nb_pages):
    writer = PdfWriter()
    for _ in range(nb_pages):
        writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf


class TestPdfUtils:
    def test_pdf_page_count(self):
        buf = make_pdf(5)
        assert pdf_page_count(buf) == 5

    def test_pdf_page_count_resets_position(self):
        buf = make_pdf(3)
        pdf_page_count(buf)
        assert buf.tell() == 0

    def test_extract_pdf_pages_subset(self):
        buf = make_pdf(5)
        result = extract_pdf_pages(buf, [2, 3])
        reader_buf = io.BytesIO(result.read())
        from pypdf import PdfReader
        reader = PdfReader(reader_buf)
        assert len(reader.pages) == 2

    def test_extract_pdf_pages_invalid_page_raises(self):
        buf = make_pdf(2)
        with pytest.raises(PdfExtractionError):
            extract_pdf_pages(buf, [1, 5])

    def test_extract_pdf_pages_not_a_pdf_raises(self):
        buf = io.BytesIO(b"not a pdf")
        with pytest.raises(PdfExtractionError):
            extract_pdf_pages(buf, [1])
