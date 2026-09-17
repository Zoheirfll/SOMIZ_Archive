"""
Tests — synchro sortante SOMIZ → plateforme-sps (employees/webhook_client.py,
employees/signals.py).
"""
import hashlib
import hmac
import json
from unittest.mock import patch

import pytest
from employees.models import Contrat, Employee
from employees.webhook_client import envoyer_webhook_employe

pytestmark = pytest.mark.django_db

WEBHOOK_URL = "http://localhost:8001/api/employes/webhook/somiz/"
WEBHOOK_SECRET = "test-plateforme-sps-secret"


@pytest.fixture(autouse=True)
def _webhook_configure(settings):
    """Par défaut, activé pour tous les tests de ce fichier — les tests qui
    veulent vérifier le comportement "non configuré" écrasent explicitement."""
    settings.PLATEFORME_SPS_WEBHOOK_URL = WEBHOOK_URL
    settings.PLATEFORME_SPS_WEBHOOK_SECRET = WEBHOOK_SECRET


class TestWebhookNonConfigure:
    def test_url_vide_ne_fait_rien(self, settings, employee):
        settings.PLATEFORME_SPS_WEBHOOK_URL = ""
        with patch("employees.webhook_client.urllib.request.urlopen") as mock_urlopen:
            envoyer_webhook_employe(employee, "employee.updated")
        mock_urlopen.assert_not_called()

    def test_secret_vide_ne_fait_rien(self, settings, employee):
        settings.PLATEFORME_SPS_WEBHOOK_SECRET = ""
        with patch("employees.webhook_client.urllib.request.urlopen") as mock_urlopen:
            envoyer_webhook_employe(employee, "employee.updated")
        mock_urlopen.assert_not_called()


class TestSignatureHMAC:
    def test_signature_correcte(self, employee):
        captured = {}

        def fake_urlopen(request, timeout=None):
            captured["body"] = request.data
            captured["signature_header"] = request.headers.get("X-somiz-signature")

            class FakeResponse:
                status = 200

                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    return False

                def read(self, *a):
                    return b""

            return FakeResponse()

        with patch("employees.webhook_client.urllib.request.urlopen", side_effect=fake_urlopen):
            envoyer_webhook_employe(employee, "employee.updated")

        expected_signature = "sha256=" + hmac.new(
            WEBHOOK_SECRET.encode(), captured["body"], hashlib.sha256
        ).hexdigest()
        assert captured["signature_header"] == expected_signature

        # Le payload envoyé doit bien être du JSON valide décrivant l'event demandé
        payload = json.loads(captured["body"])
        assert payload["event"] == "employee.updated"
        assert payload["employee"]["somiz_id"] == str(employee.id)


class TestEmployeeSignals:
    def test_creation_declenche_employee_created(self, direction, admin_user):
        with patch("employees.signals.envoyer_webhook_employe") as mock_send:
            emp = Employee.objects.create(
                matricule="EMP-900",
                nom="Nouveau",
                prenom="Salarie",
                direction=direction,
                created_by=admin_user,
            )
        mock_send.assert_called_once_with(emp, "employee.created")

    def test_maj_champ_simple_declenche_employee_updated(self, employee):
        with patch("employees.signals.envoyer_webhook_employe") as mock_send:
            employee.nom = "Dupont-Martin"
            employee.save()
        mock_send.assert_called_once_with(employee, "employee.updated")

    def test_passage_a_archive_declenche_employee_archived(self, employee):
        with patch("employees.signals.envoyer_webhook_employe") as mock_send:
            employee.statut = Employee.Statut.ARCHIVE
            employee.save()
        mock_send.assert_called_once_with(employee, "employee.archived")

    def test_deja_archive_reste_updated(self, employee):
        employee.statut = Employee.Statut.ARCHIVE
        employee.save()
        with patch("employees.signals.envoyer_webhook_employe") as mock_send:
            employee.nom = "Encore un changement"
            employee.save()
        # Toujours archivé avant/après ce save → pas une transition, donc 'updated'
        mock_send.assert_called_once_with(employee, "employee.updated")


class TestContratSignal:
    def test_contrat_qui_change_statut_employe_pas_de_doublon(self, employee, type_contrat, admin_user):
        with patch("employees.signals.envoyer_webhook_employe") as mock_send:
            Contrat.objects.create(
                numero_contrat="CTR-2026-999",
                employee=employee,
                type_contrat=type_contrat,
                statut=Contrat.Statut.ARCHIVE,
                created_by=admin_user,
            )
        # Le contrat archivé fait passer l'employé à 'archive' -> le signal
        # Employee post_save envoie déjà le webhook ; le signal Contrat ne
        # doit pas en envoyer un second.
        events = [call.args[1] for call in mock_send.call_args_list]
        assert events.count("employee.archived") == 1
        assert "employee.updated" not in events

    def test_contrat_sans_impact_statut_envoie_updated(self, employee, type_contrat, admin_user):
        # Un contrat déjà 'actif', identique au statut employé courant : la
        # sync ne modifie rien sur l'employé -> le signal Contrat doit
        # envoyer lui-même 'employee.updated'.
        with patch("employees.signals.envoyer_webhook_employe") as mock_send:
            Contrat.objects.create(
                numero_contrat="CTR-2026-001",
                employee=employee,
                type_contrat=type_contrat,
                statut=Contrat.Statut.ACTIF,
                created_by=admin_user,
            )
        events = [call.args[1] for call in mock_send.call_args_list]
        assert events == ["employee.updated"]


class TestEchecReseauNeCasseRienEtNeLeveRien:
    def test_timeout_n_empeche_pas_la_sauvegarde(self, employee):
        with patch(
            "employees.webhook_client.urllib.request.urlopen",
            side_effect=TimeoutError("boom"),
        ):
            # Ne doit lever aucune exception
            employee.nom = "ToujoursSauvegardable"
            employee.save()
        employee.refresh_from_db()
        assert employee.nom == "ToujoursSauvegardable"


class TestPayloadHierarchie:
    def test_service_inclut_departement_et_direction(self, employee):
        # La fixture `employee` (conftest.py) a direction+departement+service renseignés
        captured = {}

        def fake_urlopen(request, timeout=None):
            captured["body"] = request.data

            class FakeResponse:
                status = 200

                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    return False

                def read(self, *a):
                    return b""

            return FakeResponse()

        with patch("employees.webhook_client.urllib.request.urlopen", side_effect=fake_urlopen):
            envoyer_webhook_employe(employee, "employee.updated")

        payload = json.loads(captured["body"])["employee"]
        assert payload["service"]["somiz_id"] == str(employee.service.id)
        assert payload["service"]["departement"]["somiz_id"] == str(employee.departement.id)
        assert payload["service"]["departement"]["direction"]["somiz_id"] == str(employee.direction.id)

    def test_pas_de_service_donne_null(self, direction, admin_user):
        emp = Employee.objects.create(
            matricule="EMP-901",
            nom="SansService",
            prenom="Test",
            direction=direction,
            created_by=admin_user,
        )
        captured = {}

        def fake_urlopen(request, timeout=None):
            captured["body"] = request.data

            class FakeResponse:
                status = 200

                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    return False

                def read(self, *a):
                    return b""

            return FakeResponse()

        with patch("employees.webhook_client.urllib.request.urlopen", side_effect=fake_urlopen):
            envoyer_webhook_employe(emp, "employee.updated")

        payload = json.loads(captured["body"])["employee"]
        assert payload["service"] is None
        assert payload["direction"]["somiz_id"] == str(direction.id)
