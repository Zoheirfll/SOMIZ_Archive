import pytest
from rest_framework.test import APIClient
from employees.models import ChampPersonnalise, ChampPersonnaliseOption, EmployeeChampValeur


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestPatchChampsValeurListe:
    def test_valeur_invalide_rejetee(self, admin_user, employee):
        champ = ChampPersonnalise.objects.create(
            nom="Situation familiale", code="SIT_FAM_T",
            type_champ=ChampPersonnalise.TypeChamp.LISTE,
        )
        ChampPersonnaliseOption.objects.create(champ=champ, valeur="Marié", ordre=1)

        resp = auth_client(admin_user).patch(
            f"/api/employees/{employee.id}/champs/",
            {str(champ.id): "ValeurInexistante"},
            format="json",
        )
        assert resp.status_code == 400

    def test_valeur_valide_acceptee(self, admin_user, employee):
        champ = ChampPersonnalise.objects.create(
            nom="Situation familiale", code="SIT_FAM_V",
            type_champ=ChampPersonnalise.TypeChamp.LISTE,
        )
        ChampPersonnaliseOption.objects.create(champ=champ, valeur="Marié", ordre=1)

        resp = auth_client(admin_user).patch(
            f"/api/employees/{employee.id}/champs/",
            {str(champ.id): "Marié"},
            format="json",
        )
        assert resp.status_code == 204
        assert EmployeeChampValeur.objects.get(employee=employee, champ=champ).valeur == "Marié"

    def test_valeur_option_desactivee_rejetee(self, admin_user, employee):
        champ = ChampPersonnalise.objects.create(
            nom="Situation familiale", code="SIT_FAM_D",
            type_champ=ChampPersonnalise.TypeChamp.LISTE,
        )
        option = ChampPersonnaliseOption.objects.create(champ=champ, valeur="Divorcé", ordre=1, is_active=False)

        resp = auth_client(admin_user).patch(
            f"/api/employees/{employee.id}/champs/",
            {str(champ.id): option.valeur},
            format="json",
        )
        assert resp.status_code == 400


@pytest.mark.django_db
class TestCrudOptionsChampPersonnalise:
    def test_crud_complet(self, admin_user):
        champ = ChampPersonnalise.objects.create(
            nom="Situation familiale", code="SIT_FAM_CRUD",
            type_champ=ChampPersonnalise.TypeChamp.LISTE,
        )
        client = auth_client(admin_user)

        resp_create = client.post(
            f"/api/ref/champs-personnalises/{champ.id}/options/",
            {"valeur": "Divorcé", "ordre": 1},
            format="json",
        )
        assert resp_create.status_code == 201
        option_id = resp_create.data["id"]

        resp_list = client.get(f"/api/ref/champs-personnalises/{champ.id}/options/")
        assert resp_list.status_code == 200
        data = resp_list.data["results"] if isinstance(resp_list.data, dict) else resp_list.data
        assert len(data) == 1

        resp_patch = client.patch(
            f"/api/ref/champs-personnalises/options/{option_id}/",
            {"is_active": False},
            format="json",
        )
        assert resp_patch.status_code == 200
        assert resp_patch.data["is_active"] is False

    def test_consultant_ne_peut_pas_creer_option(self, consultant_user):
        champ = ChampPersonnalise.objects.create(
            nom="Situation familiale", code="SIT_FAM_CONS",
            type_champ=ChampPersonnalise.TypeChamp.LISTE,
        )
        resp = auth_client(consultant_user).post(
            f"/api/ref/champs-personnalises/{champ.id}/options/",
            {"valeur": "Divorcé"},
            format="json",
        )
        assert resp.status_code == 403


@pytest.mark.django_db
class TestChampConditionnel:
    def test_champ_masque_si_condition_non_remplie(self, admin_user, employee):
        situation = ChampPersonnalise.objects.create(
            nom="Situation familiale", code="SIT_FAM_COND",
            type_champ=ChampPersonnalise.TypeChamp.LISTE,
        )
        ChampPersonnaliseOption.objects.create(champ=situation, valeur="Marié", ordre=1)
        salaire = ChampPersonnalise.objects.create(
            nom="Salaire unique", code="SALAIRE_UNIQUE_COND",
            type_champ=ChampPersonnalise.TypeChamp.NOMBRE,
            condition_champ=situation, condition_valeur="Marié",
        )
        EmployeeChampValeur.objects.create(employee=employee, champ=situation, valeur="Célibataire")

        resp = auth_client(admin_user).get(f"/api/employees/{employee.id}/")
        codes = [c["code"] for c in resp.data["champs_personnalises"]]
        assert "SALAIRE_UNIQUE_COND" not in codes
        assert "SIT_FAM_COND" in codes

    def test_champ_visible_si_condition_remplie(self, admin_user, employee):
        situation = ChampPersonnalise.objects.create(
            nom="Situation familiale", code="SIT_FAM_COND2",
            type_champ=ChampPersonnalise.TypeChamp.LISTE,
        )
        ChampPersonnaliseOption.objects.create(champ=situation, valeur="Marié", ordre=1)
        salaire = ChampPersonnalise.objects.create(
            nom="Salaire unique", code="SALAIRE_UNIQUE_COND2",
            type_champ=ChampPersonnalise.TypeChamp.NOMBRE,
            condition_champ=situation, condition_valeur="Marié",
        )
        EmployeeChampValeur.objects.create(employee=employee, champ=situation, valeur="Marié")

        resp = auth_client(admin_user).get(f"/api/employees/{employee.id}/")
        codes = [c["code"] for c in resp.data["champs_personnalises"]]
        assert "SALAIRE_UNIQUE_COND2" in codes

    def test_champ_ne_peut_pas_dependre_de_lui_meme(self, admin_user):
        champ = ChampPersonnalise.objects.create(
            nom="Champ Test Self", code="CHAMP_SELF",
            type_champ=ChampPersonnalise.TypeChamp.TEXTE,
        )
        resp = auth_client(admin_user).patch(
            f"/api/ref/champs-personnalises/{champ.id}/",
            {"condition_champ": str(champ.id), "condition_valeur": "x"},
            format="json",
        )
        assert resp.status_code == 400


@pytest.mark.django_db
class TestChampsPersonnalisesDetailSerializerOptions:
    def test_inclut_options_actives(self, admin_user, employee):
        champ = ChampPersonnalise.objects.create(
            nom="Situation familiale", code="SIT_FAM_DET",
            type_champ=ChampPersonnalise.TypeChamp.LISTE,
        )
        option = ChampPersonnaliseOption.objects.create(champ=champ, valeur="Marié", ordre=1)

        resp = auth_client(admin_user).get(f"/api/employees/{employee.id}/")
        champ_data = next(
            c for c in resp.data["champs_personnalises"] if c["code"] == "SIT_FAM_DET"
        )
        assert champ_data["options"] == [{"id": str(option.id), "valeur": "Marié"}]

    def test_option_desactivee_reste_visible_si_valeur_courante(self, admin_user, employee):
        champ = ChampPersonnalise.objects.create(
            nom="Situation familiale", code="SIT_FAM_INACTIVE",
            type_champ=ChampPersonnalise.TypeChamp.LISTE,
        )
        option = ChampPersonnaliseOption.objects.create(champ=champ, valeur="Divorcé", ordre=1)
        EmployeeChampValeur.objects.create(employee=employee, champ=champ, valeur="Divorcé")
        option.is_active = False
        option.save()

        resp = auth_client(admin_user).get(f"/api/employees/{employee.id}/")
        champ_data = next(
            c for c in resp.data["champs_personnalises"] if c["code"] == "SIT_FAM_INACTIVE"
        )
        assert {"id": str(option.id), "valeur": "Divorcé"} in champ_data["options"]
