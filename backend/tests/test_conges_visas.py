import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from conges.models import DemandeConge, MotifConge
from employees.models import Departement, Direction, Employee
from notifications.models import Notification

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


def _compte(emp, role="CONSULTANT", **extra):
    return User.objects.create_user(
        username=f"u{emp.matricule}", password="x", nom=emp.nom, prenom=emp.prenom, role=role, employee=emp,
        consent_loi1807_accepted_at=timezone.now(), **extra,
    )


@pytest.fixture
def monde(employee, service, departement, direction):
    """Chaîne complète : chef de service, chef de département, directeur, tous avec compte."""
    chefs = {}
    for cle, unite, mat in (("s", service, "S1"), ("d", departement, "D1"), ("r", direction, "R1")):
        emp = _emp(employee, mat, f"Chef{cle}")
        unite.responsable = emp
        unite.save()
        chefs[cle] = _compte(emp)
    chefs["demandeur"] = User.objects.create_user(
        username="gest", password="x", nom="G", prenom="G", role="GESTIONNAIRE", peut_demander_conge=True,
        consent_loi1807_accepted_at=timezone.now(),
    )
    chefs["demandeur"].scope_directions.add(employee.direction)
    return chefs


def _creer(user, employee):
    motif = MotifConge.objects.get_or_create(nom="Congé spécial", type_conge="CS")[0]
    resp = _client(user).post("/api/conges/demandes/", {
        "employee": str(employee.id), "type_conge": "CS", "motif": motif.id,
        "date_depart": "2026-11-01", "date_retour": "2026-11-04", "nb_jours": 3,
        "adresse_conge": "Oran",
    }, format="json")
    assert resp.status_code == 201, resp.data
    return DemandeConge.objects.get(pk=resp.data["id"])


def _ref(d):
    return d.reference.replace("/", "-")


def _rows(data):
    return data["results"] if isinstance(data, dict) else data


def test_demande_avec_chaine_passe_en_visa_et_notifie_les_trois_niveaux(
        monde, employee, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):  # notify() diffère via on_commit
        d = _creer(monde["demandeur"], employee)
    assert d.statut == "visa"
    assert list(d.visas.values_list("niveau", flat=True)) == [1, 2, 3]
    for cle in ("s", "d", "r"):
        assert Notification.objects.filter(recipient=monde[cle]).exists()


def test_demande_sans_chaine_reste_recue(employee, monde):
    Departement.objects.update(responsable=None)
    Direction.objects.update(responsable=None)
    employee.service.responsable = None
    employee.service.save()
    d = _creer(monde["demandeur"], employee)
    assert d.statut == "recue" and not d.visas.exists()


def test_chaine_complete_ordre_normal_puis_recue(monde, employee):
    d = _creer(monde["demandeur"], employee)
    for cle, attendu in (("s", "visa"), ("d", "visa"), ("r", "recue")):
        resp = _client(monde[cle]).post(f"/api/conges/demandes/{_ref(d)}/viser/")
        assert resp.status_code == 200, resp.data
        assert resp.data["statut"] == attendu
    assert set(d.visas.values_list("decision", flat=True)) == {"vise"}
    assert AuditLog.objects.filter(action="VISER_CONGE").count() == 3


def test_niveau_superieur_vise_sans_attendre_et_solde_les_inferieurs(monde, employee):
    d = _creer(monde["demandeur"], employee)
    resp = _client(monde["d"]).post(f"/api/conges/demandes/{_ref(d)}/viser/")
    assert resp.status_code == 200
    decisions = {v.niveau: v for v in d.visas.all()}
    assert decisions[1].decision == "vise_par_superieur"
    assert "en lieu et place" in decisions[1].motif
    assert decisions[2].decision == "vise"
    assert decisions[3].decision == "en_attente"
    d.refresh_from_db()
    assert d.statut == "visa"  # le directeur doit encore viser


def test_niveau_inferieur_ne_peut_pas_viser_a_la_place_du_superieur(monde, employee):
    d = _creer(monde["demandeur"], employee)
    _client(monde["s"]).post(f"/api/conges/demandes/{_ref(d)}/viser/")
    assert d.visas.get(niveau=2).decision == "en_attente"
    assert d.visas.get(niveau=3).decision == "en_attente"
    # Déjà visé : un second visa du même chef n'a rien à signer.
    assert _client(monde["s"]).post(f"/api/conges/demandes/{_ref(d)}/viser/").status_code == 400


def test_etranger_a_la_chaine_ne_peut_ni_voir_ni_viser(monde, employee):
    d = _creer(monde["demandeur"], employee)
    autre = _compte(_emp(employee, "X9", "Autre"))
    c = _client(autre)
    assert c.post(f"/api/conges/demandes/{_ref(d)}/viser/").status_code in (400, 403)
    assert d.visas.filter(decision="en_attente").count() == 3


def test_refus_a_une_etape_rejette_la_demande_et_previent_le_demandeur(
        monde, employee, django_capture_on_commit_callbacks):
    d = _creer(monde["demandeur"], employee)
    sans_motif = _client(monde["d"]).post(f"/api/conges/demandes/{_ref(d)}/refuser-visa/", {}, format="json")
    assert sans_motif.status_code == 400
    with django_capture_on_commit_callbacks(execute=True):
        resp = _client(monde["d"]).post(
            f"/api/conges/demandes/{_ref(d)}/refuser-visa/", {"motif": "Période chargée"}, format="json")
    assert resp.status_code == 200 and resp.data["statut"] == "rejetee"
    assert "Période chargée" in resp.data["motif_rejet"]
    assert Notification.objects.filter(recipient=monde["demandeur"]).exists()
    assert AuditLog.objects.filter(action="REFUSER_VISA_CONGE").exists()
    # Plus aucun visa possible ensuite.
    assert _client(monde["r"]).post(f"/api/conges/demandes/{_ref(d)}/viser/").status_code == 400


def test_traiteur_rh_ne_peut_pas_valider_avant_la_fin_des_visas(monde, employee):
    d = _creer(monde["demandeur"], employee)
    rh = User.objects.create_user(
        username="rh", password="x", nom="R", prenom="H", role="SUPERADMIN",
        consent_loi1807_accepted_at=timezone.now(),
    )
    resp = _client(rh).post(f"/api/conges/demandes/{_ref(d)}/valider/", {}, format="json")
    assert resp.status_code == 400


def test_chef_voit_la_demande_dans_a_viser_et_pas_les_autres(monde, employee):
    d = _creer(monde["demandeur"], employee)
    autre = _compte(_emp(employee, "X9", "Autre"), peut_demander_conge=True, role="GESTIONNAIRE")
    rows = _rows(_client(monde["s"]).get("/api/conges/demandes/?a_viser=1").data)
    assert [r["reference"] for r in rows] == [d.reference]
    assert rows[0]["peut_viser"] is True
    assert _rows(_client(autre).get("/api/conges/demandes/").data) == []


def test_chef_accede_au_detail_et_voit_les_visas(monde, employee):
    d = _creer(monde["demandeur"], employee)
    resp = _client(monde["r"]).get(f"/api/conges/demandes/{_ref(d)}/")
    assert resp.status_code == 200
    assert [v["niveau"] for v in resp.data["visas"]] == [1, 2, 3]


def test_demandeur_peut_annuler_pendant_les_visas(monde, employee):
    d = _creer(monde["demandeur"], employee)
    assert _client(monde["demandeur"]).delete(f"/api/conges/demandes/{_ref(d)}/").status_code == 204


def test_responsable_sans_compte_le_niveau_superieur_peut_viser(monde, employee):
    monde["s"].delete()  # le chef de service n'a plus de compte
    d = _creer(monde["demandeur"], employee)
    assert d.visas.get(niveau=1).compte_id is None
    resp = _client(monde["d"]).post(f"/api/conges/demandes/{_ref(d)}/viser/")
    assert resp.status_code == 200
    assert d.visas.get(niveau=1).decision == "vise_par_superieur"
