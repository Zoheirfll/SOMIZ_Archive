"""Intérim des responsables (2026-10-29) : désignation par le titulaire, validation
par le supérieur direct, effet sur les visas de congé et le périmètre, fin par date."""
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Interim
from conges.models import DemandeConge, MotifConge
from employees.models import Employee

pytestmark = pytest.mark.django_db
User = get_user_model()


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _emp(base, matricule, nom, **champs):
    valeurs = dict(
        matricule=matricule, nom=nom, prenom="P", direction=base.direction, departement=base.departement,
        service=base.service, poste=base.poste, type_contrat=base.type_contrat, categorie=base.categorie,
        created_by=base.created_by,
    )
    valeurs.update(champs)
    return Employee.objects.create(**valeurs)


def _compte(emp, role="CONSULTANT", **extra):
    return User.objects.create_user(
        username=f"u{emp.matricule}", password="x", nom=emp.nom, prenom=emp.prenom, role=role, employee=emp,
        consent_loi1807_accepted_at=timezone.now(), **extra,
    )


@pytest.fixture
def monde(employee, service, departement, direction):
    chefs = {}
    for cle, unite, mat in (("s", service, "S1"), ("d", departement, "D1"), ("r", direction, "R1")):
        emp = _emp(employee, mat, f"Chef{cle}")
        unite.responsable = emp
        unite.save()
        chefs[cle] = _compte(emp)
    # Un collègue du service (candidat à l'intérim) et un étranger à l'équipe
    chefs["equipe"] = _compte(_emp(employee, "E1", "Equipe"))
    autre_service = type(service).objects.create(nom="Autre service", departement=departement)
    chefs["etranger"] = _compte(_emp(employee, "X1", "Etranger", service=autre_service))
    chefs["demandeur"] = User.objects.create_user(
        username="gest", password="x", nom="G", prenom="G", role="GESTIONNAIRE", peut_demander_conge=True,
        consent_loi1807_accepted_at=timezone.now(),
    )
    chefs["demandeur"].scope_directions.add(employee.direction)
    return chefs


def _designer(client, unite_type, unite, interimaire, debut=None, fin=None):
    debut = debut or timezone.localdate()
    fin = fin or debut + timedelta(days=10)
    return client.post("/api/interims/", {
        "unite_type": unite_type, "unite_id": str(unite.pk), "interimaire": str(interimaire.pk),
        "date_debut": debut.isoformat(), "date_fin": fin.isoformat(),
    }, format="json")


def test_titulaire_propose_son_equipe_le_superieur_doit_valider(monde, service):
    resp = _designer(_client(monde["s"]), "service", service, monde["equipe"])
    assert resp.status_code == 201, resp.data
    assert resp.data["statut"] == "en_attente"
    # Tant que le chef de département n'a pas validé, aucun droit ne s'ouvre.
    assert Interim.unites_actives(monde["equipe"]) == []
    assert not monde["equipe"].can_visa_conges


def test_validation_par_le_chef_de_departement_active_l_interim(monde, service):
    interim_id = _designer(_client(monde["s"]), "service", service, monde["equipe"]).data["id"]
    # le titulaire ne peut pas valider sa propre désignation
    assert _client(monde["s"]).post(f"/api/interims/{interim_id}/decider/", {"accepter": True}, format="json").status_code == 400
    resp = _client(monde["d"]).post(f"/api/interims/{interim_id}/decider/", {"accepter": True}, format="json")
    assert resp.status_code == 200 and resp.data["statut"] == "valide"
    assert Interim.unites_actives(monde["equipe"]) == [("service", service.pk)]
    assert monde["equipe"].can_visa_conges


def test_equipe_obligatoire_sauf_superadmin(monde, service, superadmin_user):
    refus = _designer(_client(monde["s"]), "service", service, monde["etranger"])
    assert refus.status_code == 400 and "équipe" in refus.data["error"]
    ok = _designer(_client(superadmin_user), "service", service, monde["etranger"])
    assert ok.status_code == 201 and ok.data["statut"] == "valide"


def test_un_tiers_ne_peut_pas_designer(monde, service):
    resp = _designer(_client(monde["equipe"]), "service", service, monde["demandeur"])
    assert resp.status_code == 400


def test_le_superieur_designe_avec_effet_immediat_et_le_directeur_seul(monde, service, departement, direction):
    par_chef_dept = _designer(_client(monde["d"]), "service", service, monde["equipe"])
    assert par_chef_dept.data["statut"] == "valide"
    # directeur : pas de supérieur, sa désignation vaut validation (chef de département choisi)
    resp = _designer(_client(monde["r"]), "direction", direction, monde["d"])
    assert resp.status_code == 201 and resp.data["statut"] == "valide"


def test_refus_laisse_le_titulaire_sans_remplacant(monde, service):
    interim_id = _designer(_client(monde["s"]), "service", service, monde["equipe"]).data["id"]
    resp = _client(monde["d"]).post(f"/api/interims/{interim_id}/decider/", {"accepter": False, "motif": "non"}, format="json")
    assert resp.data["statut"] == "refuse"
    assert Interim.unites_actives(monde["equipe"]) == []


def test_chevauchement_refuse(monde, service):
    assert _designer(_client(monde["d"]), "service", service, monde["equipe"]).status_code == 201
    assert _designer(_client(monde["d"]), "service", service, monde["equipe"]).status_code == 400


def test_droits_calcules_par_date_fin_automatique(monde, service):
    hier = timezone.localdate() - timedelta(days=1)
    Interim.objects.create(
        unite_type="service", unite_id=service.pk, unite_nom=service.nom, titulaire=service.responsable,
        titulaire_nom="x", interimaire=monde["equipe"], date_debut=hier - timedelta(days=5), date_fin=hier,
        statut=Interim.Statut.VALIDE,
    )
    assert Interim.unites_actives(monde["equipe"]) == []
    assert not monde["equipe"].can_visa_conges


def test_fin_anticipee_par_le_titulaire(monde, service):
    interim_id = _designer(_client(monde["d"]), "service", service, monde["equipe"]).data["id"]
    resp = _client(monde["s"]).post(f"/api/interims/{interim_id}/terminer/")
    assert resp.status_code == 200 and resp.data["statut"] == "termine"
    assert Interim.unites_actives(monde["equipe"]) == []


def test_un_tiers_recoit_404_sur_un_interim_qui_ne_le_concerne_pas(monde, service):
    interim_id = _designer(_client(monde["d"]), "service", service, monde["equipe"]).data["id"]
    assert _client(monde["demandeur"]).post(f"/api/interims/{interim_id}/terminer/").status_code == 404


def _creer_demande(user, employee):
    motif = MotifConge.objects.get_or_create(nom="Congé spécial", type_conge="CS")[0]
    resp = _client(user).post("/api/conges/demandes/", {
        "employee": str(employee.id), "type_conge": "CS", "motif": motif.id,
        "date_depart": "2026-11-01", "date_retour": "2026-11-04", "nb_jours": 3, "adresse_conge": "Oran",
    }, format="json")
    assert resp.status_code == 201, resp.data
    return resp.data["reference"].replace("/", "-")


def test_l_interimaire_voit_et_vise_a_la_place_du_titulaire(monde, service, employee):
    _designer(_client(monde["d"]), "service", service, monde["equipe"])
    ref = _creer_demande(monde["demandeur"], employee)
    intérimaire = _client(monde["equipe"])
    liste = intérimaire.get("/api/conges/demandes/", {"a_viser": 1}).data
    assert (liste.get("count") if isinstance(liste, dict) else len(liste)) == 1
    resp = intérimaire.post(f"/api/conges/demandes/{ref}/viser/")
    assert resp.status_code == 200, resp.data
    visa = DemandeConge.objects.get(reference=ref.replace("-", "/")).visas.get(niveau=1)
    assert visa.decision == "vise" and "intérimaire de" in visa.motif and visa.decide_par_id == monde["equipe"].id


def test_sans_interimaire_un_non_responsable_ne_voit_pas_la_demande(monde, employee):
    _creer_demande(monde["demandeur"], employee)
    liste = _client(monde["equipe"]).get("/api/conges/demandes/", {"a_viser": 1})
    assert liste.status_code == 403 or (liste.data.get("count", 0) == 0)


def test_le_perimetre_de_l_interimaire_s_ouvre_puis_se_ferme(monde, service, employee):
    equipe = monde["equipe"]
    assert not equipe.can_access_employee(employee)
    interim_id = _designer(_client(monde["d"]), "service", service, equipe).data["id"]
    assert equipe.can_access_employee(employee)
    _client(monde["d"]).post(f"/api/interims/{interim_id}/terminer/")
    assert not equipe.can_access_employee(employee)


def test_les_notifications_partent_au_superieur_puis_a_l_interimaire(monde, service, django_capture_on_commit_callbacks):
    from notifications.models import Notification
    with django_capture_on_commit_callbacks(execute=True):
        interim_id = _designer(_client(monde["s"]), "service", service, monde["equipe"]).data["id"]
    assert Notification.objects.filter(recipient=monde["d"], type="INTERIM_A_VALIDER").count() == 1
    with django_capture_on_commit_callbacks(execute=True):
        _client(monde["d"]).post(f"/api/interims/{interim_id}/decider/", {"accepter": True}, format="json")
    assert Notification.objects.filter(recipient=monde["equipe"], type="INTERIM_DECIDE").count() == 1


def test_me_expose_can_gerer_interim(monde, superadmin_user):
    assert _client(monde["s"]).get("/api/auth/me/").data["can_gerer_interim"] is True
    assert _client(monde["equipe"]).get("/api/auth/me/").data["can_gerer_interim"] is False
    assert _client(superadmin_user).get("/api/auth/me/").data["can_gerer_interim"] is True


def test_admin_lit_tous_les_interims_sans_pouvoir_agir_superadmin_peut_tout(monde, service, admin_user, superadmin_user):
    interim_id = _designer(_client(monde["s"]), "service", service, monde["equipe"]).data["id"]
    vu_admin = _client(admin_user).get("/api/interims/").data
    assert [i["id"] for i in vu_admin["interims"]] == [interim_id]
    assert vu_admin["unites"] == [] and vu_admin["interims"][0]["peut_decider"] is False
    assert vu_admin["interims"][0]["peut_terminer"] is False
    # ni désigner, ni valider, ni terminer
    assert _designer(_client(admin_user), "service", service, monde["equipe"]).status_code == 400
    assert _client(admin_user).post(f"/api/interims/{interim_id}/decider/", {"accepter": True}, format="json").status_code == 400
    assert _client(admin_user).post(f"/api/interims/{interim_id}/terminer/").status_code == 400
    vu_super = _client(superadmin_user).get("/api/interims/").data
    assert vu_super["interims"][0]["peut_decider"] is True and vu_super["interims"][0]["peut_terminer"] is True

