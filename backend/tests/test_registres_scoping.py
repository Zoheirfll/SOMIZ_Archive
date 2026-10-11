from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from consultations.models import DemandeConsultation
from registres.services import registre_mouvements

pytestmark = pytest.mark.django_db


def _consultation(reference, demandeur, traiteur, employee):
    maintenant = timezone.now()
    return DemandeConsultation.objects.create(
        reference=reference, type_demande='document', description='x', demandeur=demandeur,
        employee=employee, statut='validee', traite_par=traiteur, date_validation=maintenant,
        date_echeance=maintenant + timedelta(hours=24),
    )


def test_traiteur_voit_consultations_avec_et_sans_employe(traiteur, gestionnaire_user, employee):
    _consultation('C-00010/26', gestionnaire_user, traiteur, employee)
    _consultation('C-00011/26', gestionnaire_user, traiteur, None)
    refs = {ligne.reference for ligne in registre_mouvements(traiteur, timezone.now().year)}
    assert refs == {'C-00010/26', 'C-00011/26'}


def test_compte_restreint_ne_voit_pas_les_employes_hors_perimetre(
    consultant_user, gestionnaire_user, traiteur, employee,
):
    """Un compte à périmètre (jamais traiteur aujourd'hui) ne doit pas voir
    une consultation portant sur un employé hors de son périmètre."""
    _consultation('C-00020/26', gestionnaire_user, traiteur, employee)
    assert registre_mouvements(consultant_user, timezone.now().year) == []


def test_creation_manuelle_refusee_pour_employe_hors_perimetre(traiteur, employee, monkeypatch):
    monkeypatch.setattr(type(traiteur), 'can_access_employee', lambda self, e: False)
    client = APIClient()
    client.force_authenticate(traiteur)
    reponse = client.post('/api/registres/mouvements/', {
        'employee': str(employee.pk), 'type_documents': 'Dossier', 'nombre_documents': 1,
        'date_depart': '2026-03-01',
    }, format='json')
    assert reponse.status_code == 400
