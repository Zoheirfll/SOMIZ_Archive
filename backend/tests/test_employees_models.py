"""
Tests — employees/models.py
Couvre : Employee, EmployeeDocument (versioning), EmployeeDocumentFile, TypeDocument
"""

import pytest
from django.core.exceptions import ValidationError
from employees.models import (
    Employee, EmployeeDocument, EmployeeDocumentFile,
    TypeDocument, Direction, Departement, Service, Contrat, Section
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


class TestVoieHierarchique:
    def test_empty_without_responsables(self, employee):
        assert employee.voie_hierarchique() == []

    def test_chain_for_service_employee(self, employee, admin_user, direction, departement, service):
        chef_service = Employee.objects.create(
            matricule="CHEF-SVC", nom="Kader", prenom="Amina", created_by=admin_user
        )
        chef_dept = Employee.objects.create(
            matricule="CHEF-DEPT", nom="Larbi", prenom="Yacine", created_by=admin_user
        )
        directeur = Employee.objects.create(
            matricule="DIR", nom="Haddad", prenom="Karim", created_by=admin_user
        )
        service.responsable = chef_service
        service.save()
        departement.responsable = chef_dept
        departement.save()
        direction.responsable = directeur
        direction.save()

        chaine = employee.voie_hierarchique()

        assert chaine == [
            {
                "role": "Chef de service", "employee_id": str(chef_service.id),
                "nom": "Kader", "prenom": "Amina", "matricule": "CHEF-SVC", "has_photo": False,
            },
            {
                "role": "Chef de département", "employee_id": str(chef_dept.id),
                "nom": "Larbi", "prenom": "Yacine", "matricule": "CHEF-DEPT", "has_photo": False,
            },
            {
                "role": "Directeur", "employee_id": str(directeur.id),
                "nom": "Haddad", "prenom": "Karim", "matricule": "DIR", "has_photo": False,
            },
        ]

    def test_level_without_responsable_is_omitted(self, employee, admin_user, direction):
        directeur = Employee.objects.create(
            matricule="DIR", nom="Haddad", prenom="Karim", created_by=admin_user
        )
        direction.responsable = directeur
        direction.save()
        # service/departement sans responsable renseigné

        chaine = employee.voie_hierarchique()

        assert chaine == [
            {
                "role": "Directeur", "employee_id": str(directeur.id),
                "nom": "Haddad", "prenom": "Karim", "matricule": "DIR", "has_photo": False,
            },
        ]

    def test_self_as_responsable_is_omitted(self, employee, service):
        # L'employé est lui-même le chef de son propre service : ce niveau
        # ne doit pas apparaître dans sa propre chaîne.
        service.responsable = employee
        service.save()

        assert employee.voie_hierarchique() == []

    def test_chain_for_cellule_attached_to_direction(self, admin_user, direction):
        from employees.models import Cellule

        cellule = Cellule.objects.create(nom="Cellule Audit", direction=direction)
        directeur = Employee.objects.create(
            matricule="DIR2", nom="Haddad", prenom="Karim", created_by=admin_user
        )
        direction.responsable = directeur
        direction.save()
        chef_cellule = Employee.objects.create(
            matricule="CHEF-CEL", nom="Belkacem", prenom="Sofiane", created_by=admin_user
        )
        cellule.responsable = chef_cellule
        cellule.save()
        emp = Employee.objects.create(
            matricule="EMP-CEL", nom="Ali", prenom="Nadia", cellule=cellule, created_by=admin_user
        )

        assert emp.voie_hierarchique() == [
            {
                "role": "Chef de cellule", "employee_id": str(chef_cellule.id),
                "nom": "Belkacem", "prenom": "Sofiane", "matricule": "CHEF-CEL", "has_photo": False,
            },
            {
                "role": "Directeur", "employee_id": str(directeur.id),
                "nom": "Haddad", "prenom": "Karim", "matricule": "DIR2", "has_photo": False,
            },
        ]


class TestEmployeeDocumentVersioning:
    def test_first_document_version_1(self, employee, admin_user, type_doc_obligatoire):
        doc = EmployeeDocument.objects.create(
            employee=employee,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        assert doc.version == 1
        assert doc.is_active is True

    def test_second_upload_creates_version_2_and_keeps_v1_active(
        self, employee, admin_user, type_doc_obligatoire
    ):
        # Historique conservé (2026-08-30) : un nouvel upload du même type
        # n'écrase/ne désactive plus l'ancien — les deux versions restent
        # actives, seule la suppression manuelle explicite (DocumentDeleteView)
        # les retire. Le PK étant un UUID généré avant save(), on simule la
        # logique de versioning en construisant les objets comme le fait la
        # vue (instance sans pk).
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
        assert doc1.is_active is True

    def test_third_upload_increments_from_highest_active_version(
        self, employee, admin_user, type_doc_obligatoire
    ):
        doc1 = EmployeeDocument(employee=employee, type_doc=type_doc_obligatoire, uploaded_by=admin_user)
        doc1.pk = None
        doc1.save()
        doc2 = EmployeeDocument(employee=employee, type_doc=type_doc_obligatoire, uploaded_by=admin_user)
        doc2.pk = None
        doc2.save()
        doc3 = EmployeeDocument(employee=employee, type_doc=type_doc_obligatoire, uploaded_by=admin_user)
        doc3.pk = None
        doc3.save()

        assert doc3.version == 3
        assert EmployeeDocument.objects.filter(
            employee=employee, type_doc=type_doc_obligatoire, is_active=True
        ).count() == 3

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


class TestContratModel:
    def test_create_contrat(self, contrat, employee):
        assert contrat.numero_contrat == "CTR-2024-001"
        assert contrat.employee == employee
        assert contrat.statut == "actif"

    def test_str_representation(self, contrat):
        assert "CTR-2024-001" in str(contrat)
        assert "EMP-001" in str(contrat)

    def test_numero_contrat_uppercased_via_serializer(self, contrat):
        assert contrat.numero_contrat == contrat.numero_contrat.upper()

    def test_nb_documents_empty(self, contrat):
        assert contrat.nb_documents == 0

    def test_nb_documents_with_doc(self, contrat, admin_user, type_doc_obligatoire):
        EmployeeDocument.objects.create(
            employee=contrat.employee,
            contrat=contrat,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        assert contrat.nb_documents == 1

    def test_documents_actifs(self, contrat, admin_user, type_doc_obligatoire):
        doc = EmployeeDocument.objects.create(
            employee=contrat.employee,
            contrat=contrat,
            type_doc=type_doc_obligatoire,
            uploaded_by=admin_user,
        )
        assert doc in contrat.documents_actifs

    def test_versioning_scoped_to_contrat(self, contrat, employee, admin_user, type_doc_obligatoire):
        doc1 = EmployeeDocument(
            employee=employee, contrat=contrat,
            type_doc=type_doc_obligatoire, uploaded_by=admin_user,
        )
        doc1.pk = None
        doc1.save()

        doc2 = EmployeeDocument(
            employee=employee, contrat=contrat,
            type_doc=type_doc_obligatoire, uploaded_by=admin_user,
        )
        doc2.pk = None
        doc2.save()

        doc1.refresh_from_db()
        assert doc2.version == 2
        assert doc1.is_active is True

    def test_versioning_independent_between_contrats(self, employee, type_contrat, admin_user, type_doc_obligatoire):
        contrat_a = Contrat.objects.create(
            numero_contrat="CTR-A", employee=employee, type_contrat=type_contrat
        )
        contrat_b = Contrat.objects.create(
            numero_contrat="CTR-B", employee=employee, type_contrat=type_contrat
        )
        doc_a = EmployeeDocument.objects.create(
            employee=employee, contrat=contrat_a,
            type_doc=type_doc_obligatoire, uploaded_by=admin_user,
        )
        doc_b = EmployeeDocument.objects.create(
            employee=employee, contrat=contrat_b,
            type_doc=type_doc_obligatoire, uploaded_by=admin_user,
        )
        assert doc_a.version == 1
        assert doc_b.version == 1

    def test_delete_contrat_cascades_documents(self, contrat, admin_user, type_doc_obligatoire):
        doc = EmployeeDocument.objects.create(
            employee=contrat.employee, contrat=contrat,
            type_doc=type_doc_obligatoire, uploaded_by=admin_user,
        )
        doc_pk = doc.pk
        contrat.delete()
        assert not EmployeeDocument.objects.filter(pk=doc_pk).exists()

    def test_multiple_contrats_per_employee(self, employee, type_contrat, admin_user):
        c1 = Contrat.objects.create(numero_contrat="CTR-X1", employee=employee, type_contrat=type_contrat)
        c2 = Contrat.objects.create(numero_contrat="CTR-X2", employee=employee, type_contrat=type_contrat)
        assert employee.contrats.count() == 2

    def test_unique_numero_contrat(self, contrat, employee, db):
        import pytest as _pytest
        with _pytest.raises(Exception):
            Contrat.objects.create(
                numero_contrat="CTR-2024-001",
                employee=employee,
            )


class TestReferentials:
    def test_direction_str(self, direction):
        assert str(direction) == "Direction Générale"

    def test_departement_str(self, departement):
        assert "Direction Générale" in str(departement)
        assert "RH" in str(departement)

    def test_service_str(self, service):
        assert "RH" in str(service)
        assert "Paie" in str(service)


class TestSectionModel:
    def test_clean_rejects_both_direction_and_departement(self, direction, departement):
        s = Section(nom="Section Test", direction=direction, departement=departement)
        with pytest.raises(ValidationError):
            s.clean()

    def test_clean_rejects_neither(self):
        s = Section(nom="Section Test")
        with pytest.raises(ValidationError):
            s.clean()

    def test_clean_accepts_direction_only(self, direction):
        s = Section(nom="Section Test", direction=direction)
        s.clean()  # ne lève pas

    def test_str_shows_parent(self, departement):
        s = Section.objects.create(nom="Section Paie", departement=departement)
        assert str(s) == f"{departement.nom} → Section Paie"


class TestEmployeeCreateUpdateSerializerSection:
    def test_section_aligns_direction_departement_and_clears_service_cellule(
        self, employee, departement
    ):
        from employees.serializers import EmployeeCreateUpdateSerializer
        section = Section.objects.create(nom="Section Paie", departement=departement)
        serializer = EmployeeCreateUpdateSerializer(
            instance=employee, data={'section': str(section.id)}, partial=True
        )
        assert serializer.is_valid(), serializer.errors
        emp = serializer.save()
        assert emp.section_id == section.id
        assert emp.departement_id == departement.id
        assert emp.direction_id == departement.direction_id
        assert emp.service_id is None
        assert emp.cellule_id is None

    def test_cellule_still_clears_section(self, employee, departement):
        from employees.models import Cellule
        from employees.serializers import EmployeeCreateUpdateSerializer
        section = Section.objects.create(nom="Section Paie", departement=departement)
        employee.section = section
        employee.save()
        cellule = Cellule.objects.create(nom="Cellule Test", departement=departement)
        serializer = EmployeeCreateUpdateSerializer(
            instance=employee, data={'cellule': str(cellule.id)}, partial=True
        )
        assert serializer.is_valid(), serializer.errors
        emp = serializer.save()
        assert emp.cellule_id == cellule.id
        assert emp.section_id is None
