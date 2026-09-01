"""
Tests — upload de documents et validation MIME/taille
Couvre : DocumentListUploadView (/employees/<id>/documents/)
         ContratDocumentListUploadView (/employees/<id>/contrats/<ctr_id>/documents/)
"""

import io
import pytest
from unittest.mock import patch, MagicMock
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from employees.models import EmployeeDocument

pytestmark = pytest.mark.django_db


# ─── Helpers ─────────────────────────────────────────────────────────────────

def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


def small_pdf(name="test.pdf", size=1024):
    """Simule un fichier PDF minimal."""
    content = b"%PDF-1.4 fake content" + b"x" * size
    return io.BytesIO(content), name


def make_upload_file(name="test.pdf", size=1024):
    """Retourne un objet compatible InMemoryUploadedFile."""
    from django.core.files.uploadedfile import SimpleUploadedFile
    content = b"%PDF-1.4 " + b"A" * size
    return SimpleUploadedFile(name, content, content_type="application/pdf")


def doc_url(employee_id):
    return f"/api/employees/{employee_id}/documents/"


# ─── Tests : Upload employé (ADMIN) ─────────────────────────────────────────

class TestDocumentUpload:
    """Upload via /employees/<uuid>/documents/ — réservé aux ADMIN."""

    def test_upload_pdf_success(self, admin_user, employee, type_doc_obligatoire):
        """Un PDF valide est accepté et crée un EmployeeDocument."""
        client = auth_client(admin_user)
        pdf = make_upload_file("cin.pdf")

        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(
                doc_url(employee.pk),
                {"files": pdf, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )

        assert resp.status_code == 201
        assert EmployeeDocument.objects.filter(employee=employee).count() == 1

    def test_upload_sets_uploaded_by(self, admin_user, employee, type_doc_obligatoire):
        """Le champ uploaded_by est bien rattaché à l'utilisateur connecté."""
        client = auth_client(admin_user)
        pdf = make_upload_file("cin.pdf")

        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(
                doc_url(employee.pk),
                {"files": pdf, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )

        assert resp.status_code == 201
        doc = EmployeeDocument.objects.get(employee=employee)
        assert doc.uploaded_by == admin_user

    def test_upload_forbidden_mime_type(self, admin_user, employee, type_doc_obligatoire):
        """Un fichier HTML déguisé en PDF est rejeté avec 400."""
        client = auth_client(admin_user)
        fake = make_upload_file("malicious.pdf")

        with patch("employees.serializers.magic.from_buffer", return_value="text/html"):
            resp = client.post(
                doc_url(employee.pk),
                {"files": fake, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )

        assert resp.status_code == 400
        body = str(resp.data)
        assert "text/html" in body or "MIME" in body or "autorisé" in body.lower()

    def test_upload_file_too_large(self, admin_user, employee, type_doc_obligatoire):
        """Un fichier > 20 Mo est rejeté avec 400."""
        client = auth_client(admin_user)
        # 21 Mo > limite 20 Mo
        big_file = make_upload_file("big.pdf", size=21 * 1024 * 1024)

        with patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(
                doc_url(employee.pk),
                {"files": big_file, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )

        assert resp.status_code == 400
        body = str(resp.data)
        assert "20" in body or "lourd" in body.lower() or "taille" in body.lower()

    def test_upload_no_files_returns_400(self, admin_user, employee, type_doc_obligatoire):
        """Une requête sans fichier retourne 400."""
        client = auth_client(admin_user)
        resp = client.post(
            doc_url(employee.pk),
            {"type_doc": str(type_doc_obligatoire.pk)},
            format="multipart",
        )
        assert resp.status_code == 400
        assert "Aucun fichier" in str(resp.data.get("error", ""))

    def test_consultant_cannot_upload(self, consultant_user, employee, type_doc_obligatoire):
        """Un CONSULTANT reçoit 403 en essayant d'uploader."""
        client = auth_client(consultant_user)
        pdf = make_upload_file("cin.pdf")

        with patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(
                doc_url(employee.pk),
                {"files": pdf, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )

        assert resp.status_code == 403

    def test_unauthenticated_cannot_upload(self, employee, type_doc_obligatoire):
        """Un utilisateur non-authentifié reçoit 401."""
        client = APIClient()
        pdf = make_upload_file("cin.pdf")
        resp = client.post(
            doc_url(employee.pk),
            {"files": pdf, "type_doc": str(type_doc_obligatoire.pk)},
            format="multipart",
        )
        assert resp.status_code == 401

    def test_upload_employee_not_found_returns_404(self, admin_user, type_doc_obligatoire):
        """Un emp_id inexistant retourne 404."""
        import uuid
        client = auth_client(admin_user)
        pdf = make_upload_file("cin.pdf")

        with patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(
                doc_url(uuid.uuid4()),
                {"files": pdf, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )

        assert resp.status_code == 404

    def test_upload_jpeg_accepted(self, admin_user, employee, type_doc_obligatoire):
        """Un JPEG valide est accepté."""
        client = auth_client(admin_user)
        jpeg = make_upload_file("photo.jpg")

        with patch("employees.views.magic.from_buffer", return_value="image/jpeg"), \
             patch("employees.serializers.magic.from_buffer", return_value="image/jpeg"):
            resp = client.post(
                doc_url(employee.pk),
                {"files": jpeg, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )

        assert resp.status_code == 201

    def test_upload_png_accepted(self, admin_user, employee, type_doc_obligatoire):
        """Un PNG valide est accepté."""
        client = auth_client(admin_user)
        png = make_upload_file("image.png")

        with patch("employees.views.magic.from_buffer", return_value="image/png"), \
             patch("employees.serializers.magic.from_buffer", return_value="image/png"):
            resp = client.post(
                doc_url(employee.pk),
                {"files": png, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )

        assert resp.status_code == 201

    def test_upload_without_type_doc_returns_400(self, admin_user, employee):
        """Un upload sans type_doc retourne 400 (champ requis)."""
        client = auth_client(admin_user)
        pdf = make_upload_file("cin.pdf")

        with patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(
                doc_url(employee.pk),
                {"files": pdf},
                format="multipart",
            )

        assert resp.status_code == 400

    def test_get_documents_consultant_allowed(self, consultant_user, employee):
        """Un CONSULTANT peut lire la liste des documents (GET), à
        condition d'être dans son périmètre — un CONSULTANT sans aucun
        périmètre configuré n'a plus accès par défaut depuis 2026-09-01."""
        consultant_user.scope_directions.set([employee.direction])
        client = auth_client(consultant_user)
        resp = client.get(doc_url(employee.pk))
        assert resp.status_code == 200

    def test_get_documents_returns_list(self, admin_user, employee):
        """GET retourne une liste (même vide)."""
        client = auth_client(admin_user)
        resp = client.get(doc_url(employee.pk))
        assert resp.status_code == 200
        assert isinstance(resp.data, list)


# ─── Tests : Upload contrat ──────────────────────────────────────────────────

class TestContratDocumentUpload:
    """Upload via /employees/<uuid>/contrats/<ctr_id>/documents/"""

    def _url(self, emp_id, ctr_id):
        return f"/api/contrats/{ctr_id}/documents/"

    def test_upload_pdf_contrat_success(self, admin_user, employee, contrat, type_doc_obligatoire):
        """Un PDF valide est accepté pour un contrat."""
        client = auth_client(admin_user)
        pdf = make_upload_file("contrat.pdf")

        with patch("employees.views.magic.from_buffer", return_value="application/pdf"), \
             patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(
                self._url(employee.pk, contrat.pk),
                {"files": pdf, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )

        assert resp.status_code == 201

    def test_consultant_cannot_upload_contrat_doc(self, consultant_user, employee, contrat, type_doc_obligatoire):
        """Un CONSULTANT reçoit 403 pour upload contrat."""
        client = auth_client(consultant_user)
        pdf = make_upload_file("contrat.pdf")

        with patch("employees.serializers.magic.from_buffer", return_value="application/pdf"):
            resp = client.post(
                self._url(employee.pk, contrat.pk),
                {"files": pdf, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )

        assert resp.status_code == 403

    def test_upload_contrat_forbidden_mime(self, admin_user, employee, contrat, type_doc_obligatoire):
        """Un fichier EXE déguisé est rejeté par validation MIME."""
        client = auth_client(admin_user)
        fake = make_upload_file("virus.pdf")

        with patch("employees.serializers.magic.from_buffer", return_value="application/x-msdownload"):
            resp = client.post(
                self._url(employee.pk, contrat.pk),
                {"files": fake, "type_doc": str(type_doc_obligatoire.pk)},
                format="multipart",
            )

        assert resp.status_code == 400
