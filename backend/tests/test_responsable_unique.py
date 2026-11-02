# backend/tests/test_responsable_unique.py
"""Un employé ne dirige qu'une seule unité active, tous niveaux confondus
(2026-11-01) — vérifié sur les vraies routes de l'organigramme/paramètres."""
import pytest
from rest_framework.test import APIClient

from employees.models import Departement, Service

pytestmark = pytest.mark.django_db


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def test_meme_employe_refuse_sur_un_second_service(admin_user, employee, departement, service):
    autre = Service.objects.create(nom='Service bis', departement=departement)
    client = _client(admin_user)
    assert client.patch(f'/api/ref/services/{service.id}/', {'responsable': str(employee.id)},
                        format='json').status_code == 200
    resp = client.patch(f'/api/ref/services/{autre.id}/', {'responsable': str(employee.id)}, format='json')
    assert resp.status_code == 400
    assert 'déjà' in str(resp.data['responsable'][0]) and service.nom in str(resp.data['responsable'][0])
    autre.refresh_from_db()
    assert autre.responsable_id is None


def test_refuse_aussi_entre_niveaux_differents(admin_user, employee, departement, service):
    client = _client(admin_user)
    client.patch(f'/api/ref/services/{service.id}/', {'responsable': str(employee.id)}, format='json')
    resp = client.patch(f'/api/ref/departements/{departement.id}/', {'responsable': str(employee.id)}, format='json')
    assert resp.status_code == 400
    assert Departement.objects.get(pk=departement.pk).responsable_id is None


def test_redesigner_la_meme_unite_reste_possible(admin_user, employee, service):
    client = _client(admin_user)
    url = f'/api/ref/services/{service.id}/'
    assert client.patch(url, {'responsable': str(employee.id)}, format='json').status_code == 200
    assert client.patch(url, {'responsable': str(employee.id), 'nom': service.nom}, format='json').status_code == 200


def test_liberer_puis_designer_ailleurs(admin_user, employee, departement, service):
    autre = Service.objects.create(nom='Service ter', departement=departement)
    client = _client(admin_user)
    client.patch(f'/api/ref/services/{service.id}/', {'responsable': str(employee.id)}, format='json')
    assert client.patch(f'/api/ref/services/{service.id}/', {'responsable': None}, format='json').status_code == 200
    assert client.patch(f'/api/ref/services/{autre.id}/', {'responsable': str(employee.id)},
                        format='json').status_code == 200


def test_unite_desactivee_ne_bloque_pas(admin_user, employee, departement, service):
    autre = Service.objects.create(nom='Service quater', departement=departement)
    Service.objects.filter(pk=service.pk).update(responsable=employee, is_active=False)
    assert _client(admin_user).patch(f'/api/ref/services/{autre.id}/', {'responsable': str(employee.id)},
                                     format='json').status_code == 200
