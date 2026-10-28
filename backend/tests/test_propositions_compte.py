import io

import pytest
from openpyxl import Workbook
from rest_framework.test import APIClient

from accounts.models import PropositionCompte, User
from accounts.propositions import (
    PropositionError, generer_username, refuser_proposition, valider_proposition,
)
from audit.models import AuditLog
from employees.models import Employee, Service


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _xlsx(headers, rows):
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    buf.name = "import.xlsx"
    return buf


def _autre_employe(employee, matricule, nom, prenom):
    return Employee.objects.create(
        matricule=matricule, nom=nom, prenom=prenom, direction=employee.direction,
        departement=employee.departement, service=employee.service, poste=employee.poste,
        type_contrat=employee.type_contrat, categorie=employee.categorie,
        created_by=employee.created_by,
    )


class FakeRequest:
    """Suffisant pour AuditLog.log et les services."""
    def __init__(self, user):
        self.user = user
        self.META = {}


@pytest.mark.django_db
class TestDesignation:
    def test_designer_un_responsable_cree_une_proposition_sans_compte(self, admin_user, employee, service):
        resp = auth_client(admin_user).patch(
            f"/api/ref/services/{service.id}/", {"responsable": str(employee.id)}, format="json"
        )
        assert resp.status_code == 200, resp.data
        prop = PropositionCompte.objects.get()
        assert prop.employee == employee
        assert prop.statut == PropositionCompte.Statut.EN_ATTENTE
        assert (prop.unite_type, prop.unite_nom) == ("service", service.nom)
        # Aucun compte n'est créé avant validation.
        assert not User.objects.filter(employee=employee).exists()
        assert AuditLog.objects.filter(action="PROPOSE_COMPTE").count() == 1

    def test_pas_de_doublon_si_meme_employe_deux_unites(self, admin_user, employee, service, departement):
        client = auth_client(admin_user)
        client.patch(f"/api/ref/services/{service.id}/", {"responsable": str(employee.id)}, format="json")
        client.patch(f"/api/ref/departements/{departement.id}/", {"responsable": str(employee.id)}, format="json")
        assert PropositionCompte.objects.count() == 1

    def test_employe_deja_titulaire_d_un_compte_pas_de_proposition(self, admin_user, employee, service):
        User.objects.create_user(username="jean", password="x", nom="D", prenom="J", employee=employee)
        auth_client(admin_user).patch(
            f"/api/ref/services/{service.id}/", {"responsable": str(employee.id)}, format="json"
        )
        assert not PropositionCompte.objects.exists()


@pytest.mark.django_db
class TestValidation:
    def _proposition(self, admin_user, employee, service):
        auth_client(admin_user).patch(
            f"/api/ref/services/{service.id}/", {"responsable": str(employee.id)}, format="json"
        )
        return PropositionCompte.objects.get()

    def test_validation_cree_le_compte_lie_avec_mot_de_passe_temporaire(self, admin_user, employee, service):
        prop = self._proposition(admin_user, employee, service)
        user, mdp = valider_proposition(FakeRequest(admin_user), prop, role="GESTIONNAIRE")
        assert user.employee == employee
        assert user.role == "GESTIONNAIRE"
        assert user.username == "jean.dupont"
        assert user.must_change_password is True
        assert user.peut_demander_conge is True
        assert user.check_password(mdp)
        prop.refresh_from_db()
        assert prop.statut == PropositionCompte.Statut.VALIDEE and prop.compte_cree == user
        assert AuditLog.objects.filter(action="VALIDER_COMPTE").exists()

    def test_role_non_autorise_refuse(self, admin_user, employee, service):
        prop = self._proposition(admin_user, employee, service)
        with pytest.raises(PropositionError):
            valider_proposition(FakeRequest(admin_user), prop, role="ADMIN")
        assert not User.objects.filter(employee=employee).exists()

    def test_double_validation_refusee(self, admin_user, employee, service):
        prop = self._proposition(admin_user, employee, service)
        valider_proposition(FakeRequest(admin_user), prop, role="CONSULTANT")
        with pytest.raises(PropositionError):
            valider_proposition(FakeRequest(admin_user), prop, role="CONSULTANT")

    def test_refus_ne_cree_aucun_compte(self, admin_user, employee, service):
        prop = self._proposition(admin_user, employee, service)
        refuser_proposition(FakeRequest(admin_user), prop, motif="Pas concerné")
        prop.refresh_from_db()
        assert prop.statut == PropositionCompte.Statut.REFUSEE
        assert not User.objects.filter(employee=employee).exists()
        assert AuditLog.objects.filter(action="REFUSER_COMPTE").exists()

    def test_username_homonyme_suffixe(self, employee):
        User.objects.create_user(username="jean.dupont", password="x", nom="D", prenom="J")
        assert generer_username(employee) == "jean.dupont2"

    def test_username_sans_accents(self, employee):
        e = _autre_employe(employee, "EMP-9", "Benâli", "Élodie Marie")
        assert generer_username(e) == "elodiemarie.benali"


@pytest.mark.django_db
class TestImportResponsable:
    def _import(self, admin_user, rows, headers=("nom", "direction", "responsable_matricule", "responsable_nom")):
        return auth_client(admin_user).post(
            "/api/ref/import/departements/", {"file": _xlsx(list(headers), rows)}, format="multipart"
        )

    def test_responsable_par_matricule_cree_proposition(self, admin_user, employee):
        resp = self._import(admin_user, [["Achats", employee.direction.nom, "emp-001", ""]])
        assert resp.status_code == 200 and resp.data["nb_crees"] == 1, resp.data
        assert PropositionCompte.objects.get().source == "import"

    def test_responsable_par_nom_unique(self, admin_user, employee):
        resp = self._import(admin_user, [["Achats", employee.direction.nom, "", "dupont JEAN"]])
        assert resp.data["nb_crees"] == 1, resp.data
        assert PropositionCompte.objects.get().employee == employee

    def test_homonymes_ligne_refusee(self, admin_user, employee):
        _autre_employe(employee, "EMP-002", "Dupont", "Jean")
        resp = self._import(admin_user, [["Achats", employee.direction.nom, "", "Jean Dupont"]])
        assert resp.data["nb_crees"] == 0 and resp.data["nb_erreurs"] == 1
        assert "responsable_matricule" in resp.data["erreurs"][0]["erreurs"][0]
        assert not PropositionCompte.objects.exists()

    def test_responsable_introuvable_ligne_refusee(self, admin_user, employee):
        resp = self._import(admin_user, [["Achats", employee.direction.nom, "ZZZ", ""]])
        assert resp.data["nb_crees"] == 0 and resp.data["nb_erreurs"] == 1

    def test_import_sans_colonne_responsable_inchange(self, admin_user, employee):
        resp = self._import(admin_user, [["Achats", employee.direction.nom]], headers=("nom", "direction"))
        assert resp.data["nb_crees"] == 1
        assert not PropositionCompte.objects.exists()


@pytest.mark.django_db
def test_service_modele_reference(service):
    # Garde-fou : le service de test fournit bien un responsable modifiable.
    assert Service.objects.filter(pk=service.pk).exists()


@pytest.mark.django_db
class TestEndpointsEtMotDePasseTemporaire:
    def _designer(self, admin_user, employee, service):
        auth_client(admin_user).patch(
            f"/api/ref/services/{service.id}/", {"responsable": str(employee.id)}, format="json"
        )
        return PropositionCompte.objects.get()

    def test_liste_valider_via_api_et_mot_de_passe_une_seule_fois(self, admin_user, employee, service):
        prop = self._designer(admin_user, employee, service)
        client = auth_client(admin_user)
        liste = client.get("/api/admin-users/propositions/")
        assert liste.status_code == 200 and liste.data[0]["matricule"] == "EMP-001"
        resp = client.post(f"/api/admin-users/propositions/{prop.id}/valider/", {"role": "CONSULTANT"}, format="json")
        assert resp.status_code == 201, resp.data
        assert resp["Cache-Control"] == "no-store"
        assert resp.data["mot_de_passe_temporaire"]
        assert client.get("/api/admin-users/propositions/").data == []
        again = client.post(f"/api/admin-users/propositions/{prop.id}/valider/", {"role": "CONSULTANT"}, format="json")
        assert again.status_code == 400

    def test_non_admin_ne_peut_ni_lister_ni_valider(self, consultant_user, admin_user, employee, service):
        prop = self._designer(admin_user, employee, service)
        client = auth_client(consultant_user)
        assert client.get("/api/admin-users/propositions/").status_code == 403
        assert client.post(f"/api/admin-users/propositions/{prop.id}/valider/", {"role": "CONSULTANT"}, format="json").status_code == 403
        assert not User.objects.filter(employee=employee).exists()

    def test_refuser_via_api(self, admin_user, employee, service):
        prop = self._designer(admin_user, employee, service)
        resp = auth_client(admin_user).post(f"/api/admin-users/propositions/{prop.id}/refuser/", {"motif": "non"}, format="json")
        assert resp.status_code == 200
        prop.refresh_from_db()
        assert prop.statut == "refusee"

    def test_mot_de_passe_temporaire_bloque_les_routes_metier_puis_se_debloque(self, admin_user, employee, service):
        from rest_framework_simplejwt.tokens import RefreshToken
        from django.utils import timezone
        prop = self._designer(admin_user, employee, service)
        user, mdp = valider_proposition(FakeRequest(admin_user), prop, role="GESTIONNAIRE")
        user.consent_loi1807_accepted_at = timezone.now()
        user.save()
        # Vraie authentification (Bearer) : force_authenticate contournerait authenticate().
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        bloque = client.get("/api/employees/")
        assert bloque.status_code == 403
        assert client.get("/api/auth/me/").data["must_change_password"] is True
        # Un nouveau mot de passe identique à l'ancien est refusé.
        assert client.post("/api/auth/change-password/", {
            "ancien_mot_de_passe": mdp, "nouveau_mot_de_passe": mdp, "confirmation": mdp}, format="json").status_code == 400
        ok = client.post("/api/auth/change-password/", {
            "ancien_mot_de_passe": mdp, "nouveau_mot_de_passe": "Nouveau-Mdp-2026!x", "confirmation": "Nouveau-Mdp-2026!x"}, format="json")
        assert ok.status_code == 200, ok.data
        assert client.get("/api/employees/").status_code != 403
