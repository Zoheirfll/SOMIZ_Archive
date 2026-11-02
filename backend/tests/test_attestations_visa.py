"""Validation du supérieur direct des demandes d'attestation (2026-10-29) : un seul
niveau, aucun traitement (aperçu, prête, scan) avant sa validation."""
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Interim
from attestations.models import DemandeAttestation
from employees.models import Employee

pytestmark = pytest.mark.django_db
User = get_user_model()


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _emp(base, matricule, nom):
    return Employee.objects.create(
        matricule=matricule, nom=nom, prenom="P", direction=base.direction, departement=base.departement,
        service=base.service, poste=base.poste, type_contrat=base.type_contrat, categorie=base.categorie,
        created_by=base.created_by,
    )


def _compte(emp, **extra):
    return User.objects.create_user(
        username=f"u{emp.matricule}", password="x", nom=emp.nom, prenom=emp.prenom, role="CONSULTANT",
        employee=emp, consent_loi1807_accepted_at=timezone.now(), **extra,
    )


@pytest.fixture
def monde(employee, service, departement, gestionnaire_user, motif_attestation):
    chef_emp = _emp(employee, "S1", "ChefService")
    service.responsable = chef_emp
    service.save()
    gestionnaire_user.scope_directions.add(employee.direction)
    return {
        "chef": _compte(chef_emp), "demandeur": gestionnaire_user, "employee": employee, "service": service,
        "chef_emp": chef_emp,
        "traiteur": User.objects.create_user(
            username="traiteur_att", password="x", nom="T", prenom="T", role="ADMIN", charge_attestation=True,
            consent_loi1807_accepted_at=timezone.now(),
        ),
        "motif": motif_attestation,
    }


def _demander(m, user=None):
    resp = _client(user or m["demandeur"]).post("/api/attestations/demandes/", {
        "employee": str(m["employee"].id), "motif": str(m["motif"].id),
    }, format="json")
    assert resp.status_code == 201, resp.data
    return resp.data


def _ref(data):
    return data["reference"].replace("/", "-")


def test_demande_en_attente_de_validation_du_chef_direct(monde):
    data = _demander(monde)
    assert data["statut"] == "visa"
    assert data["visa"]["responsable_nom"].endswith("ChefService") and data["visa"]["decision"] == "en_attente"


def test_le_traiteur_ne_peut_rien_faire_avant_la_validation(monde):
    ref = _ref(_demander(monde))
    t = _client(monde["traiteur"])
    assert t.get(f"/api/attestations/demandes/{ref}/apercu/").status_code == 409
    resp = t.patch(f"/api/attestations/demandes/{ref}/statut/", {"statut": "prete"}, format="json")
    assert resp.status_code == 400 and "supérieur direct" in str(resp.data)
    assert t.patch(f"/api/attestations/demandes/{ref}/statut/",
                   {"statut": "rejetee", "motif_rejet": "x"}, format="json").status_code == 400
    assert t.post(f"/api/attestations/demandes/{ref}/scan/", {}, format="multipart").status_code == 409
    bulk = t.post("/api/attestations/demandes/bulk-statut/",
                  {"ids": [DemandeAttestation.objects.get().id.hex], "statut": "prete"}, format="json")
    assert bulk.data.get("updated") == []


def test_le_chef_valide_puis_le_traiteur_peut_traiter(monde):
    ref = _ref(_demander(monde))
    resp = _client(monde["chef"]).post(f"/api/attestations/demandes/{ref}/viser/")
    assert resp.status_code == 200 and resp.data["statut"] == "recue"
    ok = _client(monde["traiteur"]).patch(f"/api/attestations/demandes/{ref}/statut/", {"statut": "prete"}, format="json")
    assert ok.status_code == 200 and ok.data["statut"] == "prete"


def test_le_refus_du_chef_rejette_avec_motif(monde):
    ref = _ref(_demander(monde))
    assert _client(monde["chef"]).post(f"/api/attestations/demandes/{ref}/refuser-visa/", {}, format="json").status_code == 400
    resp = _client(monde["chef"]).post(f"/api/attestations/demandes/{ref}/refuser-visa/", {"motif": "Pas justifié"}, format="json")
    assert resp.status_code == 200 and resp.data["statut"] == "rejetee"
    assert "Pas justifié" in resp.data["motif_rejet"]


def test_un_tiers_ne_peut_pas_valider(monde, other_gestionnaire):
    ref = _ref(_demander(monde))
    resp = _client(other_gestionnaire).post(f"/api/attestations/demandes/{ref}/viser/")
    assert resp.status_code == 404
    assert DemandeAttestation.objects.get().statut == "visa"


def test_le_chef_qui_saisit_la_demande_la_valide_d_office(monde):
    monde["chef"].peut_demander_attestation = True
    monde["chef"].save()
    monde["chef"].scope_directions.add(monde["employee"].direction)
    data = _demander(monde, monde["chef"])
    assert data["statut"] == "recue" and data["visa"]["decision"] == "vise"


def test_sans_chef_direct_pas_d_attente(monde):
    monde["service"].responsable = None
    monde["service"].save()
    data = _demander(monde)
    assert data["statut"] == "recue" and data["visa"] is None


def test_chef_sans_compte_pas_d_attente(monde):
    monde["chef"].delete()
    assert _demander(monde)["statut"] == "recue"


def test_l_interimaire_valide_a_la_place_du_chef(monde):
    interimaire = _compte(_emp(monde["employee"], "I1", "Interim"))
    Interim.objects.create(
        unite_type="service", unite_id=monde["service"].pk, unite_nom=monde["service"].nom,
        titulaire=monde["chef_emp"], titulaire_nom="x", interimaire=interimaire,
        date_debut=timezone.localdate(), date_fin=timezone.localdate() + timedelta(days=5),
        statut=Interim.Statut.VALIDE,
    )
    ref = _ref(_demander(monde))
    resp = _client(interimaire).post(f"/api/attestations/demandes/{ref}/viser/")
    assert resp.status_code == 200 and resp.data["statut"] == "recue"
    assert "intérimaire" in resp.data["visa"]["motif"]


def test_le_chef_voit_les_demandes_a_valider_et_le_filtre_a_viser(monde):
    _demander(monde)
    liste = _client(monde["chef"]).get("/api/attestations/demandes/", {"a_viser": 1})
    assert liste.status_code == 200
    assert (liste.data["count"] if isinstance(liste.data, dict) else len(liste.data)) == 1
    t = _client(monde["traiteur"]).get("/api/attestations/demandes/", {"statut": "visa"})
    assert (t.data["count"] if isinstance(t.data, dict) else len(t.data)) == 1


def test_le_demandeur_peut_annuler_pendant_la_validation(monde):
    ref = _ref(_demander(monde))
    assert _client(monde["demandeur"]).delete(f"/api/attestations/demandes/{ref}/").status_code == 204
