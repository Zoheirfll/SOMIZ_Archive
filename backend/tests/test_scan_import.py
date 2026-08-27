import io
import json
import pytest
from unittest.mock import patch
from pypdf import PdfWriter
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from employees.pdf_utils import pdf_page_count, extract_pdf_pages, PdfExtractionError
from employees.serializers import ScanImportSerializer
from employees.models import TypeDocument, EmployeeDocument
from audit.models import AuditLog


def make_pdf(nb_pages):
    writer = PdfWriter()
    for _ in range(nb_pages):
        writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


def pdf_upload_file(nb_pages, name="scan.pdf"):
    return SimpleUploadedFile(name, make_pdf(nb_pages).read(), content_type="application/pdf")


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


@pytest.mark.django_db
class TestScanImportSerializer:
    def test_valid_single_group_whole_file(self):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        file = pdf_upload_file(3)
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "notes": "", "parts": [
                {"file_index": 0, "pages": [1, 2, 3]},
            ]},
        ]})
        with patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            serializer = ScanImportSerializer(data={"files": [file], "plan": plan})
            assert serializer.is_valid(), serializer.errors
        groups = serializer.validated_data["groups"]
        assert len(groups) == 1
        assert groups[0]["type_doc"] == type_doc
        assert groups[0]["parts"][0]["pages"] == [1, 2, 3]

    def test_valid_group_with_image_part(self):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        image = SimpleUploadedFile("photo.jpg", b"fake-jpeg", content_type="image/jpeg")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "notes": "", "parts": [
                {"file_index": 0, "is_image": True},
            ]},
        ]})
        with patch("employees.serializers.magic.from_buffer", return_value="image/jpeg"):
            serializer = ScanImportSerializer(data={"files": [image], "plan": plan})
            assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["groups"][0]["parts"][0]["is_image"] is True

    def test_invalid_plan_json_rejected(self):
        file = pdf_upload_file(1)
        with patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            serializer = ScanImportSerializer(data={"files": [file], "plan": "not json"})
            assert not serializer.is_valid()
        assert "plan" in serializer.errors

    def test_category_type_doc_rejected(self):
        parent = TypeDocument.objects.create(nom="Etat civil", code="ETAT_CIVIL", is_active=True)
        TypeDocument.objects.create(nom="Acte", code="ACTE", is_active=True, parent=parent)
        file = pdf_upload_file(1)
        plan = json.dumps({"groups": [
            {"type_doc": str(parent.id), "notes": "", "parts": [
                {"file_index": 0, "pages": [1]},
            ]},
        ]})
        with patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            serializer = ScanImportSerializer(data={"files": [file], "plan": plan})
            assert not serializer.is_valid()

    def test_too_many_files_rejected(self):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        files = [pdf_upload_file(1, name=f"f{i}.pdf") for i in range(21)]
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "notes": "", "parts": [{"file_index": i, "pages": [1]}]}
            for i in range(21)
        ]})
        with patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            serializer = ScanImportSerializer(data={"files": files, "plan": plan})
            assert not serializer.is_valid()
        assert "files" in serializer.errors

    def test_too_many_total_pages_rejected(self):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        file = pdf_upload_file(1)
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "notes": "", "parts": [
                {"file_index": 0, "pages": list(range(1, 102))},
            ]},
        ]})
        with patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            serializer = ScanImportSerializer(data={"files": [file], "plan": plan})
            assert not serializer.is_valid()


@pytest.mark.django_db
class TestScanImportView:
    def _url(self, employee):
        return f"/api/employees/{employee.id}/documents/scan-import/"

    def _patches(self):
        return (
            patch("employees.views.magic.from_buffer", return_value="application/pdf"),
            patch("employees.serializers.magic.from_buffer", return_value="application/pdf"),
        )

    def test_admin_can_import_whole_file_group(self, admin_user, employee):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        client = auth_client(admin_user)
        file = pdf_upload_file(2, name="cv.pdf")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "parts": [{"file_index": 0, "pages": [1, 2]}]}
        ]})
        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        assert resp.status_code == 201, resp.data
        assert len(resp.data["created"]) == 1
        assert len(resp.data["failed"]) == 0
        doc = EmployeeDocument.objects.get(employee=employee, type_doc=type_doc)
        assert doc.nb_fichiers == 1

    def test_split_single_pdf_into_two_groups(self, admin_user, employee):
        type_a = TypeDocument.objects.create(nom="Acte naissance", code="ACTE_NAISS", is_active=True)
        type_b = TypeDocument.objects.create(nom="CV", code="CV2", is_active=True)
        client = auth_client(admin_user)
        file = pdf_upload_file(5, name="scan.pdf")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_a.id), "parts": [{"file_index": 0, "pages": [1, 2, 3]}]},
            {"type_doc": str(type_b.id), "parts": [{"file_index": 0, "pages": [4, 5]}]},
        ]})
        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        assert resp.status_code == 201, resp.data
        assert len(resp.data["created"]) == 2
        doc_a = EmployeeDocument.objects.get(employee=employee, type_doc=type_a)
        doc_b = EmployeeDocument.objects.get(employee=employee, type_doc=type_b)
        assert doc_a.nb_fichiers == 1
        assert doc_b.nb_fichiers == 1

    def test_split_part_file_size_matches_extracted_content_not_original(self, admin_user, employee):
        """Regression: le Content-Length servi par FileViewerView vient de
        EmployeeDocumentFile.file_size — s'il reprend la taille du fichier
        original (non decoupe) au lieu de la taille reelle du PDF extrait,
        le navigateur reste bloque a attendre des octets qui n'arrivent
        jamais (Content-Length trop grand)."""
        from employees.models import EmployeeDocumentFile
        type_a = TypeDocument.objects.create(nom="Acte naissance", code="ACTE_NAISS2", is_active=True)
        client = auth_client(admin_user)
        # Fichier source à 10 pages : la part extraite (1 page) doit être
        # nettement plus petite que le fichier original entier.
        file = pdf_upload_file(10, name="scan.pdf")
        original_size = file.size
        plan = json.dumps({"groups": [
            {"type_doc": str(type_a.id), "parts": [{"file_index": 0, "pages": [4]}]},
        ]})
        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        assert resp.status_code == 201, resp.data
        doc = EmployeeDocument.objects.get(employee=employee, type_doc=type_a)
        stored_file = doc.fichiers.get(is_active=True)
        assert stored_file.file_size < original_size
        # La taille enregistrée doit correspondre au fichier physique réel.
        assert stored_file.file_size == stored_file.file.size

    def test_consultant_forbidden(self, consultant_user, employee):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        client = auth_client(consultant_user)
        file = pdf_upload_file(1, name="cv.pdf")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "parts": [{"file_index": 0, "pages": [1]}]}
        ]})
        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        assert resp.status_code == 403

    def test_creates_new_version_if_type_already_has_active_document(self, admin_user, employee):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc)
        client = auth_client(admin_user)
        file = pdf_upload_file(1, name="cv.pdf")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "parts": [{"file_index": 0, "pages": [1]}]}
        ]})
        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        assert resp.status_code == 201
        docs = EmployeeDocument.objects.filter(employee=employee, type_doc=type_doc)
        assert docs.count() == 2
        assert docs.get(is_active=True).version == 2

    def test_one_group_failure_does_not_block_others(self, admin_user, employee):
        type_ok = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        type_fail = TypeDocument.objects.create(nom="Diplome", code="DIPLOME", is_active=True)
        client = auth_client(admin_user)
        file = pdf_upload_file(2, name="scan.pdf")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_ok.id), "parts": [{"file_index": 0, "pages": [1]}]},
            {"type_doc": str(type_fail.id), "parts": [{"file_index": 0, "pages": [99]}]},
        ]})
        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        assert resp.status_code == 201, resp.data
        assert len(resp.data["created"]) == 1
        assert len(resp.data["failed"]) == 1
        assert EmployeeDocument.objects.filter(employee=employee, type_doc=type_ok).exists()
        assert not EmployeeDocument.objects.filter(employee=employee, type_doc=type_fail).exists()

    def test_audit_log_entry_per_document_created(self, admin_user, employee):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        client = auth_client(admin_user)
        file = pdf_upload_file(1, name="cv.pdf")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "parts": [{"file_index": 0, "pages": [1]}]}
        ]})
        before = AuditLog.objects.filter(action=AuditLog.Action.UPLOAD).count()
        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        after = AuditLog.objects.filter(action=AuditLog.Action.UPLOAD).count()
        assert after == before + 1
