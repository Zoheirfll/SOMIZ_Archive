"""
Tests — employees/models.py
Couvre : Employee, EmployeeDocument (versioning), EmployeeDocumentFile, TypeDocument
"""

import pytest
from employees.models import (
    Employee, EmployeeDocument, EmployeeDocumentFile,
    TypeDocument, Direction, Departement, Service
)

pytestmark = pytest.mark.django_db


class TestEmployeeModel:
    def test_create_employee(self, employee):
        assert employee.matricule == "EMP-001"
        assert employee.statut == "actif"
        assert str(employee) == "EMP-001 — Jean Dupont"

    def test_full_name(self, employee):
        assert employee.full_name == "Jean Dupont"

    def test_documents_actifs_empty(self, employee):
        assert list(employee.documents_actifs) == []

    def test_dossier_complet_no_required_docs(self, employee):
        # Aucun TypeDocument obligatoire → dossier considéré complet
        assert employee.dossier_complet is True

    def test_dossier_complet_missing_required_doc(self, employee, type_doc_obligatoire):
        assert employee.dossier_complet is False

    def test_dossier_complet_with_required_doc(self, employee, admin_user, type_doc_obligatoire):
        doc = EmployeeDocument.objects.create(
            employee=employee,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        assert employee.dossier_complet is True

    def test_taux_completude_zero_without_docs(self, employee, type_doc_obligatoire, type_doc_facultatif):
        assert employee.taux_completude == 0

    def test_taux_completude_100_with_all_docs(self, employee, admin_user, type_doc_obligatoire, type_doc_facultatif):
        EmployeeDocument.objects.create(
            employee=employee, type_doc=type_doc_obligatoire, uploaded_by=admin_user
        )
        EmployeeDocument.objects.create(
            employee=employee, type_doc=type_doc_facultatif, uploaded_by=admin_user
        )
        assert employee.taux_completude == 100

    def test_taux_completude_no_types(self, employee):
        assert employee.taux_completude == 0

    def test_employee_soft_delete_via_statut(self, employee):
        employee.statut = Employee.Statut.ARCHIVE
        employee.save()
        employee.refresh_from_db()
        assert employee.statut == "archive"


class TestEmployeeDocumentVersioning:
    def test_first_document_version_1(self, employee, admin_user, type_doc_obligatoire):
        doc = EmployeeDocument.objects.create(
            employee=employee,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        assert doc.version == 1
        assert doc.is_active is True

    def test_second_upload_creates_version_2_and_deactivates_v1(
        self, employee, admin_user, type_doc_obligatoire
    ):
        # Le PK étant un UUID généré avant save(), on simule la logique de versioning
        # en construisant les objets comme le fait la vue (instance sans pk)
        doc1 = EmployeeDocument(
            employee=employee,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        doc1.pk = None
        doc1.save()

        doc2 = EmployeeDocument(
            employee=employee,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        doc2.pk = None
        doc2.save()

        doc1.refresh_from_db()
        doc2.refresh_from_db()
        assert doc2.version == 2
        assert doc2.is_active is True
        assert doc1.is_active is False

    def test_different_type_docs_dont_interfere(
        self, employee, admin_user, type_doc_obligatoire, type_doc_facultatif
    ):
        doc1 = EmployeeDocument.objects.create(
            employee=employee,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        doc2 = EmployeeDocument.objects.create(
            employee=employee,
            type_doc=type_doc_facultatif,
            uploaded_by=admin_user,
        )
        assert doc1.version == 1
        assert doc2.version == 1
        assert doc1.is_active is True
        assert doc2.is_active is True

    def test_nb_fichiers_property(self, employee, admin_user, type_doc_obligatoire):
        doc = EmployeeDocument.objects.create(
            employee=employee,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        assert doc.nb_fichiers == 0

    def test_file_size_kb_none_without_files(self, employee, admin_user, type_doc_obligatoire):
        doc = EmployeeDocument.objects.create(
            employee=employee,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        assert doc.file_size_kb is None

    def test_type_document_property(self, employee, admin_user, type_doc_obligatoire):
        doc = EmployeeDocument.objects.create(
            employee=employee,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        assert doc.type_document == "CIN"
        assert doc.type_document_label == "Carte Nationale"

    def test_str_representation(self, employee, admin_user, type_doc_obligatoire):
        doc = EmployeeDocument.objects.create(
            employee=employee,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        assert "EMP-001" in str(doc)
        assert "v1" in str(doc)


class TestTypeDocument:
    def test_str_obligatoire(self, type_doc_obligatoire):
        assert "*" in str(type_doc_obligatoire)

    def test_str_facultatif(self, type_doc_facultatif):
        assert "CV" in str(type_doc_facultatif)
        assert "*" not in str(type_doc_facultatif).strip()

    def test_ordering(self, type_doc_obligatoire, type_doc_facultatif):
        docs = list(TypeDocument.objects.all())
        assert docs[0].code == "CIN"
        assert docs[1].code == "CV"


class TestReferentials:
    def test_direction_str(self, direction):
        assert str(direction) == "Direction Générale"

    def test_departement_str(self, departement):
        assert "Direction Générale" in str(departement)
        assert "RH" in str(departement)

    def test_service_str(self, service):
        assert "RH" in str(service)
        assert "Paie" in str(service)
