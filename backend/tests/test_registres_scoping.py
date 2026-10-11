import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_creation_manuelle_refusee_pour_employe_hors_perimetre(registre_admin, employee, monkeypatch):
    monkeypatch.setattr(type(registre_admin), 'can_access_employee', lambda self, e: False)
    client = APIClient()
    client.force_authenticate(registre_admin)
    reponse = client.post('/api/registres/mouvements/', {
        'employee': str(employee.pk), 'type_documents': 'Dossier', 'nombre_documents': 1,
        'date_depart': '2026-03-01',
    }, format='json')
    assert reponse.status_code == 400
    assert 'employee' in reponse.data
