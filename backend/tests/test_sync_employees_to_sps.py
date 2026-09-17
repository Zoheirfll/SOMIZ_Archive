"""
Tests — commande de backfill manuel employees/management/commands/sync_employees_to_sps.py
(rejoue le webhook plateforme-sps pour les employés déjà en base, voir
tests/test_webhook_sps_sync.py pour les tests du webhook/signaux eux-mêmes).
"""
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command

from employees.models import Employee

pytestmark = pytest.mark.django_db

WEBHOOK_URL = "http://localhost:8001/api/employes/webhook/somiz/"
WEBHOOK_SECRET = "test-plateforme-sps-secret"


@pytest.fixture(autouse=True)
def _webhook_configure(settings):
    settings.PLATEFORME_SPS_WEBHOOK_URL = WEBHOOK_URL
    settings.PLATEFORME_SPS_WEBHOOK_SECRET = WEBHOOK_SECRET


def _creer_employe(matricule, direction, admin_user, **kwargs):
    # La création déclenche déjà le signal post_save (employee.created) — les
    # tests patchent envoyer_webhook_employe côté commande seulement APRÈS
    # création, pour ne compter que les appels faits par la commande elle-même.
    return Employee.objects.create(
        matricule=matricule,
        nom="Nom",
        prenom="Prenom",
        direction=direction,
        created_by=admin_user,
        **kwargs,
    )


class TestDryRun:
    def test_dry_run_n_envoie_rien(self, direction, admin_user):
        _creer_employe("EMP-D1", direction, admin_user)
        _creer_employe("EMP-D2", direction, admin_user)

        out = StringIO()
        with patch("employees.management.commands.sync_employees_to_sps.envoyer_webhook_employe") as mock_send:
            call_command('sync_employees_to_sps', '--dry-run', stdout=out)

        mock_send.assert_not_called()
        assert "2 employé" in out.getvalue()


class TestSyncReel:
    def test_appelle_le_webhook_une_fois_par_employe_avec_event_updated(self, direction, admin_user):
        emp1 = _creer_employe("EMP-S1", direction, admin_user)
        emp2 = _creer_employe("EMP-S2", direction, admin_user)
        emp3 = _creer_employe("EMP-S3", direction, admin_user)

        out = StringIO()
        with patch("employees.management.commands.sync_employees_to_sps.envoyer_webhook_employe") as mock_send:
            call_command('sync_employees_to_sps', stdout=out)

        assert mock_send.call_count == 3
        appeles = {call.args[0].matricule for call in mock_send.call_args_list}
        assert appeles == {"EMP-S1", "EMP-S2", "EMP-S3"}
        for call in mock_send.call_args_list:
            assert call.args[1] == 'employee.updated'
        assert "3 employé" in out.getvalue()


class TestConfigurationManquante:
    def test_url_ou_secret_vide_bloque_avant_tout_traitement(self, settings, direction, admin_user):
        _creer_employe("EMP-C1", direction, admin_user)
        settings.PLATEFORME_SPS_WEBHOOK_URL = ""

        with patch("employees.management.commands.sync_employees_to_sps.envoyer_webhook_employe") as mock_send:
            with pytest.raises(SystemExit):
                call_command('sync_employees_to_sps', stderr=StringIO())

        mock_send.assert_not_called()


class TestExceptionInattendueSurUnEmploye:
    def test_une_exception_n_arrete_pas_les_autres(self, direction, admin_user):
        _creer_employe("EMP-X1", direction, admin_user)
        _creer_employe("EMP-X2", direction, admin_user)
        _creer_employe("EMP-X3", direction, admin_user)

        with patch(
            "employees.management.commands.sync_employees_to_sps.envoyer_webhook_employe",
            side_effect=[None, RuntimeError("FK cassée"), None],
        ) as mock_send:
            call_command('sync_employees_to_sps', stdout=StringIO(), stderr=StringIO())

        assert mock_send.call_count == 3
