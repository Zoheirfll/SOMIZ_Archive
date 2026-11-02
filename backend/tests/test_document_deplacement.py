"""Déplacer un document mal classé vers le bon type (2026-11-01) — vraies
routes, vrais PDF. Voir employees/deplacement.py."""
import pytest
from django.core.files.base import ContentFile

from audit.models import AuditLog
from employees.models import EmployeeDocument, EmployeeDocumentFile, TypeDocument
from employees.views import _create_file_pages
from tests.test_document_pages import auth_client, pdf_bytes, physical_page_count

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _media(media_tmp):
    return media_tmp


@pytest.fixture
def types(db):
    avenant = TypeDocument.objects.create(nom='Avenant au contrat', code='AVENANT_T')
    initial = TypeDocument.objects.create(nom='Contrat de travail initial', code='CONTRAT_INI_T')
    return avenant, initial


def _document(employee, type_doc, admin_user, nb_pages=3, nom='scan.pdf'):
    doc = EmployeeDocument.objects.create(employee=employee, type_doc=type_doc, uploaded_by=admin_user)
    contenu = pdf_bytes(nb_pages)
    f = EmployeeDocumentFile.objects.create(
        document=doc, file=ContentFile(contenu, name=nom), file_name=nom, file_size=len(contenu),
        mime_type='application/pdf', ordre=1, uploaded_by=admin_user,
    )
    _create_file_pages(f)
    return doc, f


def test_deplacer_une_page_cree_le_document_cible(admin_user, employee, types):
    avenant, initial = types
    doc, f = _document(employee, avenant, admin_user)
    page = f.pages.order_by('ordre').last()
    page.nom = 'CONTRAT INITIAL'
    page.save()
    resp = auth_client(admin_user).post(f'/api/files/{f.id}/pages/deplacer/',
                                        {'pages': [str(page.id)], 'type_doc': initial.id}, format='json')
    assert resp.status_code == 200, resp.data
    assert physical_page_count(f) == 2 and f.pages.count() == 2
    cible = EmployeeDocument.objects.get(employee=employee, type_doc=initial)
    fichier = cible.fichiers.get()
    assert physical_page_count(fichier) == 1
    assert list(fichier.pages.values_list('nom', flat=True)) == ['CONTRAT INITIAL']
    log = AuditLog.objects.filter(action=AuditLog.Action.MODIFY_DOC).latest('id')
    assert log.details['action'] == 'deplacer_pages' and log.details['pages'] == ['CONTRAT INITIAL']


def test_deplacer_des_pages_vers_un_document_existant_les_ajoute_a_la_fin(admin_user, employee, types):
    avenant, initial = types
    _doc, f = _document(employee, avenant, admin_user, nb_pages=3)
    doc_ini, f_ini = _document(employee, initial, admin_user, nb_pages=2, nom='initial.pdf')
    ids = [str(p.id) for p in f.pages.order_by('ordre')[:2]]
    resp = auth_client(admin_user).post(f'/api/files/{f.id}/pages/deplacer/',
                                        {'pages': ids, 'type_doc': initial.id}, format='json')
    assert resp.status_code == 200, resp.data
    assert physical_page_count(f_ini) == 4 and f_ini.pages.count() == 4
    assert list(f_ini.pages.order_by('ordre').values_list('ordre', flat=True)) == [1, 2, 3, 4]
    assert physical_page_count(f) == 1
    assert EmployeeDocument.objects.filter(employee=employee, type_doc=initial).count() == 1


def test_deplacer_toutes_les_pages_supprime_le_document_source(admin_user, employee, types):
    avenant, initial = types
    doc, f = _document(employee, avenant, admin_user, nb_pages=2)
    ids = [str(p.id) for p in f.pages.all()]
    auth_client(admin_user).post(f'/api/files/{f.id}/pages/deplacer/', {'pages': ids, 'type_doc': initial.id},
                                 format='json')
    assert not EmployeeDocument.objects.filter(pk=doc.pk).exists()
    assert not EmployeeDocumentFile.objects.filter(pk=f.pk).exists()


def test_deplacer_le_document_entier(admin_user, employee, types):
    avenant, initial = types
    doc, f = _document(employee, avenant, admin_user)
    resp = auth_client(admin_user).post(f'/api/documents/{doc.id}/deplacer/', {'type_doc': initial.id},
                                        format='json')
    assert resp.status_code == 200, resp.data
    doc.refresh_from_db()
    assert doc.type_doc == initial and doc.fichiers.count() == 1


def test_deplacer_le_document_entier_fusionne_avec_l_existant(admin_user, employee, types):
    avenant, initial = types
    doc, f = _document(employee, avenant, admin_user)
    doc_ini, _f = _document(employee, initial, admin_user, nom='initial.pdf')
    auth_client(admin_user).post(f'/api/documents/{doc.id}/deplacer/', {'type_doc': initial.id}, format='json')
    assert not EmployeeDocument.objects.filter(pk=doc.pk).exists()
    assert doc_ini.fichiers.count() == 2


def test_refus_categorie_meme_type_et_non_admin(admin_user, consultant_user, employee, types):
    avenant, initial = types
    doc, f = _document(employee, avenant, admin_user)
    categorie = TypeDocument.objects.create(nom='Contrats', code='CAT_T')
    initial.parent = categorie
    initial.save()
    client = auth_client(admin_user)
    assert client.post(f'/api/documents/{doc.id}/deplacer/', {'type_doc': categorie.id},
                       format='json').status_code == 400
    assert client.post(f'/api/documents/{doc.id}/deplacer/', {'type_doc': avenant.id},
                       format='json').status_code == 400
    assert auth_client(consultant_user).post(f'/api/documents/{doc.id}/deplacer/', {'type_doc': initial.id},
                                             format='json').status_code == 403
