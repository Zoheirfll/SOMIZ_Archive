import pytest
from rest_framework.test import APIClient
from employees.models import Direction, Departement, Employee
from audit.models import AuditLog


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestReferentielMerge:
    def test_fusion_departement_reassigne_employes_et_supprime_source(self, admin_user, direction):
        source = Departement.objects.create(nom="Personnal", direction=direction)
        target = Departement.objects.create(nom="Personnel", direction=direction)
        emp = Employee.objects.create(
            matricule="M100", nom="X", prenom="Y", direction=direction, departement=source,
        )
        resp = auth_client(admin_user).post(
            "/api/ref/merge/departements/",
            {"target_id": str(target.id), "source_ids": [str(source.id)]},
            format="json",
        )
        assert resp.status_code == 200, resp.data
        emp.refresh_from_db()
        assert emp.departement_id == target.id
        assert not Departement.objects.filter(pk=source.pk).exists()

    def test_fusion_tracee_dans_audit_log(self, admin_user, direction):
        source = Departement.objects.create(nom="Personnal", direction=direction)
        target = Departement.objects.create(nom="Personnel", direction=direction)
        auth_client(admin_user).post(
            "/api/ref/merge/departements/",
            {"target_id": str(target.id), "source_ids": [str(source.id)]},
            format="json",
        )
        entry = AuditLog.objects.filter(action=AuditLog.Action.MERGE_REFERENTIEL).latest('id')
        assert entry.details["model"] == "departements"
        assert entry.details["target"]["nom"] == "Personnel"
        assert entry.details["sources"][0]["nom"] == "Personnal"

    def test_consultant_ne_peut_pas_fusionner(self, consultant_user, direction):
        source = Departement.objects.create(nom="A", direction=direction)
        target = Departement.objects.create(nom="B", direction=direction)
        resp = auth_client(consultant_user).post(
            "/api/ref/merge/departements/",
            {"target_id": str(target.id), "source_ids": [str(source.id)]},
            format="json",
        )
        assert resp.status_code == 403

    def test_modele_inconnu_rejete(self, admin_user):
        resp = auth_client(admin_user).post(
            "/api/ref/merge/types-documents/",
            {"target_id": "00000000-0000-0000-0000-000000000000", "source_ids": []},
            format="json",
        )
        assert resp.status_code == 400

    def test_cible_ne_peut_pas_etre_source(self, admin_user, direction):
        target = Departement.objects.create(nom="B", direction=direction)
        resp = auth_client(admin_user).post(
            "/api/ref/merge/departements/",
            {"target_id": str(target.id), "source_ids": [str(target.id)]},
            format="json",
        )
        assert resp.status_code == 400

    def test_fusion_de_plusieurs_sources_vers_une_cible(self, admin_user, direction):
        s1 = Departement.objects.create(nom="RH1", direction=direction)
        s2 = Departement.objects.create(nom="RH2", direction=direction)
        target = Departement.objects.create(nom="RH", direction=direction)
        Employee.objects.create(matricule="M200", nom="A", prenom="B", direction=direction, departement=s1)
        Employee.objects.create(matricule="M201", nom="C", prenom="D", direction=direction, departement=s2)
        resp = auth_client(admin_user).post(
            "/api/ref/merge/departements/",
            {"target_id": str(target.id), "source_ids": [str(s1.id), str(s2.id)]},
            format="json",
        )
        assert resp.status_code == 200, resp.data
        assert Employee.objects.filter(departement=target).count() == 2
        assert not Departement.objects.filter(pk__in=[s1.pk, s2.pk]).exists()

    def test_fusion_reassigne_le_perimetre_consultant(self, admin_user, consultant_user, direction):
        source = Departement.objects.create(nom="Personnal", direction=direction)
        target = Departement.objects.create(nom="Personnel", direction=direction)
        consultant_user.scope_departements.add(source)
        auth_client(admin_user).post(
            "/api/ref/merge/departements/",
            {"target_id": str(target.id), "source_ids": [str(source.id)]},
            format="json",
        )
        assert list(consultant_user.scope_departements.values_list('id', flat=True)) == [target.id]
