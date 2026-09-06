"""
Fixtures partagées pour tous les tests backend SOMIZ.
"""

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from employees.models import (
    Direction, Departement, Service, Poste,
    TypeContrat, Categorie, TypeDocument, Employee, Contrat
)

User = get_user_model()


@pytest.fixture(autouse=True)
def _celery_eager_for_tests(settings):
    """
    Sans ceci, chaque test qui déclenche un upload (`_enqueue_ocr()`,
    voir employees/views.py) publie une VRAIE tâche Celery sur le Redis
    de dev (le même que `manage.py runserver`/le worker réel) — les
    tests polluaient silencieusement la file d'attente en production
    locale, provoquant un arriéré de tâches fantômes référençant des
    fichiers de la base de test (déjà détruite) traitées bien plus tard
    par le worker de dev. CELERY_TASK_ALWAYS_EAGER exécute la tâche en
    synchrone dans le process de test, sans jamais toucher au broker.
    """
    settings.CELERY_TASK_ALWAYS_EAGER = True


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="admin_test",
        password="AdminPass123!",
        nom="Admin",
        prenom="Test",
        role="ADMIN",
        consent_loi1807_accepted_at=timezone.now(),
    )


@pytest.fixture
def consultant_user(db):
    return User.objects.create_user(
        username="consultant_test",
        password="ConsultPass123!",
        nom="Consultant",
        prenom="Test",
        role="CONSULTANT",
        consent_loi1807_accepted_at=timezone.now(),
    )


@pytest.fixture
def direction(db):
    return Direction.objects.create(nom="Direction Générale", code="DG")


@pytest.fixture
def departement(db, direction):
    return Departement.objects.create(nom="RH", direction=direction, code="RH")


@pytest.fixture
def service(db, departement):
    return Service.objects.create(nom="Paie", departement=departement)


@pytest.fixture
def poste(db):
    return Poste.objects.create(nom="Ingénieur")


@pytest.fixture
def type_contrat(db):
    return TypeContrat.objects.create(nom="CDI")


@pytest.fixture
def categorie(db):
    return Categorie.objects.create(nom="Cadre")


@pytest.fixture
def echelle(db):
    from employees.models import Echelle
    return Echelle.objects.create(nom="Échelle 10")


@pytest.fixture
def type_doc_obligatoire(db):
    return TypeDocument.objects.create(
        nom="Carte Nationale", code="CIN", obligatoire=True, ordre=1
    )


@pytest.fixture
def type_doc_facultatif(db):
    return TypeDocument.objects.create(
        nom="CV", code="CV", obligatoire=False, ordre=2
    )


@pytest.fixture
def champ_personnel(db):
    from employees.models import ChampPersonnalise
    return ChampPersonnalise.objects.create(
        nom="RIB", code="RIB", categorie=ChampPersonnalise.Categorie.PERSONNEL,
        type_champ="texte", is_active=True,
    )


@pytest.fixture
def champ_personnel_2(db):
    from employees.models import ChampPersonnalise
    return ChampPersonnalise.objects.create(
        nom="NIN", code="NIN", categorie=ChampPersonnalise.Categorie.PERSONNEL,
        type_champ="texte", is_active=True,
    )


@pytest.fixture
def employee(db, admin_user, direction, departement, service, poste, type_contrat, categorie):
    return Employee.objects.create(
        matricule="EMP-001",
        nom="Dupont",
        prenom="Jean",
        direction=direction,
        departement=departement,
        service=service,
        poste=poste,
        type_contrat=type_contrat,
        categorie=categorie,
        created_by=admin_user,
    )


@pytest.fixture
def employee_document_file(db, employee, type_doc_facultatif, admin_user):
    from employees.models import EmployeeDocument, EmployeeDocumentFile
    from django.core.files.uploadedfile import SimpleUploadedFile

    doc = EmployeeDocument.objects.create(
        employee=employee, type_doc=type_doc_facultatif, uploaded_by=admin_user
    )
    return EmployeeDocumentFile.objects.create(
        document=doc,
        file=SimpleUploadedFile("test.pdf", b"%PDF-1.4 fake", content_type="application/pdf"),
        file_name="test.pdf",
        file_size=13,
        mime_type="application/pdf",
    )


@pytest.fixture
def contrat(db, employee, type_contrat, admin_user):
    return Contrat.objects.create(
        numero_contrat="CTR-2024-001",
        employee=employee,
        type_contrat=type_contrat,
        date_debut="2024-01-01",
        statut="actif",
        created_by=admin_user,
    )
