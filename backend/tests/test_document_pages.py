"""
Tests — gestion page par page d'un document PDF (2026-09-14)
Couvre : EmployeeDocumentFilePage + FilePagesView / FilePagesReorderView /
         FilePageDetailView / FilePageReplaceView.

Principe vérifié de bout en bout : le document reste UN SEUL fichier
(EmployeeDocumentFile), et chaque page interne du PDF est nommée,
réorganisable, remplaçable et supprimable individuellement — l'invariant
"lignes EmployeeDocumentFilePage triées par ordre == pages physiques du
PDF, dans le même ordre" doit tenir après chaque opération.
"""

import io
import pytest
from django.core.files.base import ContentFile
from pypdf import PdfReader, PdfWriter
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from employees.models import EmployeeDocument, EmployeeDocumentFile
from employees.views import _create_file_pages

pytestmark = pytest.mark.django_db


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


def pdf_bytes(nb_pages):
    writer = PdfWriter()
    for _ in range(nb_pages):
        writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


@pytest.fixture
def pdf_file(db, employee, type_doc_facultatif, admin_user):
    """Un document dont l'unique fichier est un PDF de 3 pages."""
    doc = EmployeeDocument.objects.create(
        employee=employee, type_doc=type_doc_facultatif, uploaded_by=admin_user
    )
    content = pdf_bytes(3)
    file_obj = EmployeeDocumentFile.objects.create(
        document=doc,
        file=ContentFile(content, name="dossier.pdf"),
        file_name="dossier.pdf",
        file_size=len(content),
        mime_type="application/pdf",
        ordre=1,
        uploaded_by=admin_user,
    )
    _create_file_pages(file_obj)
    return file_obj


def physical_page_count(file_obj):
    file_obj.refresh_from_db()
    with file_obj.file.open("rb") as f:
        return len(PdfReader(f).pages)


class TestPagesCreation:
    def test_pages_creees_avec_nom_et_numero(self, pdf_file):
        noms = list(pdf_file.pages.order_by("ordre").values_list("nom", flat=True))
        assert noms == ["dossier page 1", "dossier page 2", "dossier page 3"]

    def test_pdf_une_seule_page_garde_le_nom_sans_numero(
        self, db, employee, type_doc_facultatif, admin_user
    ):
        doc = EmployeeDocument.objects.create(
            employee=employee, type_doc=type_doc_facultatif, uploaded_by=admin_user
        )
        content = pdf_bytes(1)
        file_obj = EmployeeDocumentFile.objects.create(
            document=doc,
            file=ContentFile(content, name="carte.pdf"),
            file_name="carte.pdf",
            file_size=len(content),
            mime_type="application/pdf",
            ordre=1,
        )
        _create_file_pages(file_obj)
        assert list(file_obj.pages.values_list("nom", flat=True)) == ["carte"]


class TestNommageALaFusion:
    """Plusieurs fichiers uploadés d'un coup = les pages d'un même document
    (fusion systématique depuis 2026-09-14, plus de case à cocher) — chaque
    page doit garder le nom de SON fichier source, jamais le nom combiné du
    fichier fusionné (qui serait commun à toutes les pages)."""

    def test_recto_verso_gardent_chacun_leur_nom(
        self, employee, type_doc_facultatif, admin_user
    ):
        from django.core.files.uploadedfile import SimpleUploadedFile

        resp = auth_client(admin_user).post(
            f"/api/employees/{employee.id}/documents/",
            {
                "type_doc": str(type_doc_facultatif.id),
                "files": [
                    SimpleUploadedFile("recto.pdf", pdf_bytes(1), content_type="application/pdf"),
                    SimpleUploadedFile("verso.pdf", pdf_bytes(1), content_type="application/pdf"),
                ],
            },
            format="multipart",
        )
        assert resp.status_code == 201
        doc = EmployeeDocument.objects.get(pk=resp.json()["id"])
        fichiers = list(doc.fichiers.all())
        assert len(fichiers) == 1, "la fusion doit produire un seul fichier"
        noms = list(fichiers[0].pages.order_by("ordre").values_list("nom", flat=True))
        assert noms == ["recto", "verso"]

    def test_source_multipage_numerotee_sous_son_propre_nom(
        self, employee, type_doc_facultatif, admin_user
    ):
        from django.core.files.uploadedfile import SimpleUploadedFile

        resp = auth_client(admin_user).post(
            f"/api/employees/{employee.id}/documents/",
            {
                "type_doc": str(type_doc_facultatif.id),
                "files": [
                    SimpleUploadedFile("contrat.pdf", pdf_bytes(2), content_type="application/pdf"),
                    SimpleUploadedFile("annexe.pdf", pdf_bytes(1), content_type="application/pdf"),
                ],
            },
            format="multipart",
        )
        assert resp.status_code == 201
        doc = EmployeeDocument.objects.get(pk=resp.json()["id"])
        noms = list(
            doc.fichiers.first().pages.order_by("ordre").values_list("nom", flat=True)
        )
        assert noms == ["contrat page 1", "contrat page 2", "annexe"]


class TestRenamePage:
    def test_admin_renomme_une_page(self, pdf_file, admin_user):
        page = pdf_file.pages.order_by("ordre").first()
        resp = auth_client(admin_user).patch(
            f"/api/files/{pdf_file.id}/pages/{page.id}/",
            {"nom": "Recto CIN"},
            format="json",
        )
        assert resp.status_code == 200
        page.refresh_from_db()
        assert page.nom == "Recto CIN"

    def test_nom_vide_refuse(self, pdf_file, admin_user):
        page = pdf_file.pages.order_by("ordre").first()
        resp = auth_client(admin_user).patch(
            f"/api/files/{pdf_file.id}/pages/{page.id}/", {"nom": "  "}, format="json"
        )
        assert resp.status_code == 400


class TestReorderPages:
    def test_reorganiser_change_ordre_et_pdf_physique(self, pdf_file, admin_user):
        pages = list(pdf_file.pages.order_by("ordre"))
        nouvel_ordre = [str(pages[2].id), str(pages[0].id), str(pages[1].id)]
        resp = auth_client(admin_user).put(
            f"/api/files/{pdf_file.id}/pages/reorder/",
            {"order": nouvel_ordre},
            format="json",
        )
        assert resp.status_code == 200
        apres = list(pdf_file.pages.order_by("ordre").values_list("id", "nom"))
        assert [str(i) for i, _ in apres] == nouvel_ordre
        # Les noms suivent leur page (ils ne restent pas collés à la position)
        assert [n for _, n in apres] == [
            "dossier page 3",
            "dossier page 1",
            "dossier page 2",
        ]
        assert physical_page_count(pdf_file) == 3

    def test_liste_incomplete_refusee(self, pdf_file, admin_user):
        page = pdf_file.pages.order_by("ordre").first()
        resp = auth_client(admin_user).put(
            f"/api/files/{pdf_file.id}/pages/reorder/",
            {"order": [str(page.id)]},
            format="json",
        )
        assert resp.status_code == 400


class TestDeletePage:
    def test_supprimer_une_page_reecrit_le_pdf(self, pdf_file, admin_user):
        page = pdf_file.pages.order_by("ordre")[1]
        resp = auth_client(admin_user).delete(
            f"/api/files/{pdf_file.id}/pages/{page.id}/"
        )
        assert resp.status_code == 200
        restantes = list(pdf_file.pages.order_by("ordre").values_list("nom", "ordre"))
        assert restantes == [("dossier page 1", 1), ("dossier page 3", 2)]
        assert physical_page_count(pdf_file) == 2

    def test_supprimer_la_derniere_page_supprime_le_fichier(
        self, db, employee, type_doc_facultatif, admin_user
    ):
        doc = EmployeeDocument.objects.create(
            employee=employee, type_doc=type_doc_facultatif, uploaded_by=admin_user
        )
        content = pdf_bytes(1)
        file_obj = EmployeeDocumentFile.objects.create(
            document=doc,
            file=ContentFile(content, name="seule.pdf"),
            file_name="seule.pdf",
            file_size=len(content),
            mime_type="application/pdf",
            ordre=1,
        )
        _create_file_pages(file_obj)
        page = file_obj.pages.first()
        resp = auth_client(admin_user).delete(
            f"/api/files/{file_obj.id}/pages/{page.id}/"
        )
        assert resp.status_code == 204
        assert not EmployeeDocumentFile.objects.filter(pk=file_obj.pk).exists()
        assert not EmployeeDocument.objects.filter(pk=doc.pk).exists()


class TestAddPages:
    def test_ajouter_une_page_a_la_fin(self, pdf_file, admin_user):
        from django.core.files.uploadedfile import SimpleUploadedFile

        nouvelle = SimpleUploadedFile(
            "annexe.pdf", pdf_bytes(1), content_type="application/pdf"
        )
        resp = auth_client(admin_user).post(
            f"/api/files/{pdf_file.id}/pages/", {"files": nouvelle}, format="multipart"
        )
        assert resp.status_code == 201
        noms = list(pdf_file.pages.order_by("ordre").values_list("nom", flat=True))
        assert noms == [
            "dossier page 1",
            "dossier page 2",
            "dossier page 3",
            "annexe",
        ]
        assert physical_page_count(pdf_file) == 4

    def test_inserer_une_page_a_une_position(self, pdf_file, admin_user):
        from django.core.files.uploadedfile import SimpleUploadedFile

        nouvelle = SimpleUploadedFile(
            "intercalaire.pdf", pdf_bytes(1), content_type="application/pdf"
        )
        resp = auth_client(admin_user).post(
            f"/api/files/{pdf_file.id}/pages/",
            {"files": nouvelle, "position": 2},
            format="multipart",
        )
        assert resp.status_code == 201
        noms = list(pdf_file.pages.order_by("ordre").values_list("nom", flat=True))
        assert noms == [
            "dossier page 1",
            "intercalaire",
            "dossier page 2",
            "dossier page 3",
        ]
        assert physical_page_count(pdf_file) == 4

    def test_source_multipage_devient_plusieurs_pages(self, pdf_file, admin_user):
        from django.core.files.uploadedfile import SimpleUploadedFile

        nouvelle = SimpleUploadedFile(
            "lot.pdf", pdf_bytes(2), content_type="application/pdf"
        )
        resp = auth_client(admin_user).post(
            f"/api/files/{pdf_file.id}/pages/", {"files": nouvelle}, format="multipart"
        )
        assert resp.status_code == 201
        noms = list(pdf_file.pages.order_by("ordre").values_list("nom", flat=True))
        assert noms[-2:] == ["lot page 1", "lot page 2"]
        assert physical_page_count(pdf_file) == 5


class TestReplacePage:
    def test_remplacer_le_contenu_dune_page_garde_son_nom(self, pdf_file, admin_user):
        from django.core.files.uploadedfile import SimpleUploadedFile

        page = pdf_file.pages.order_by("ordre")[1]
        remplacement = SimpleUploadedFile(
            "neuf.pdf", pdf_bytes(1), content_type="application/pdf"
        )
        resp = auth_client(admin_user).post(
            f"/api/files/{pdf_file.id}/pages/{page.id}/replace/",
            {"file": remplacement},
            format="multipart",
        )
        assert resp.status_code == 200
        page.refresh_from_db()
        assert page.nom == "dossier page 2"
        assert physical_page_count(pdf_file) == 3

    def test_source_multipage_refusee(self, pdf_file, admin_user):
        from django.core.files.uploadedfile import SimpleUploadedFile

        page = pdf_file.pages.order_by("ordre").first()
        remplacement = SimpleUploadedFile(
            "gros.pdf", pdf_bytes(3), content_type="application/pdf"
        )
        resp = auth_client(admin_user).post(
            f"/api/files/{pdf_file.id}/pages/{page.id}/replace/",
            {"file": remplacement},
            format="multipart",
        )
        assert resp.status_code == 400
        assert "Ajouter des pages" in resp.json()["error"]


class TestPermissions:
    def test_consultant_ne_peut_pas_modifier_les_pages(self, pdf_file, consultant_user):
        page = pdf_file.pages.order_by("ordre").first()
        resp = auth_client(consultant_user).patch(
            f"/api/files/{pdf_file.id}/pages/{page.id}/",
            {"nom": "Tentative"},
            format="json",
        )
        assert resp.status_code == 403
