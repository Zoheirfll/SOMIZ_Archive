# backend/tests/test_reporting_rh.py
"""Reporting RH (menu Statistiques) — voir
docs/superpowers/specs/2026-10-30-reporting-statistiques-design.md."""
import io
from datetime import date, timedelta

import openpyxl
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from employees.models import Employee

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_user(admin_user):
    """ADMIN de ces tests : porteur de l'accès aux statistiques RH
    (acces_statistiques, 2026-10-31) — sans lui, tout le reporting répond 403."""
    admin_user.acces_statistiques = True
    admin_user.save(update_fields=['acces_statistiques'])
    return admin_user

PAGES = ['synthese', 'effectifs', 'parite', 'demographie', 'mouvements', 'carriere', 'contrats',
         'unites', 'qualite', 'documents', 'activite', 'bilan']


def _client(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


def _url(page):
    return f'/api/reporting/rh/{page}/'


def _emp(base, matricule, **kw):
    valeurs = dict(
        matricule=matricule, nom='TEST', prenom='Agent', direction=base.direction,
        departement=base.departement, service=base.service, poste=base.poste,
        categorie=base.categorie, type_contrat=base.type_contrat, created_by=base.created_by,
    )
    valeurs.update(kw)
    return Employee.objects.create(**valeurs)


def _il_y_a(annees, jours=0):
    ref = timezone.localdate()
    try:
        d = ref.replace(year=ref.year - annees)
    except ValueError:                      # 29 février
        d = ref.replace(year=ref.year - annees, day=28)
    return d - timedelta(days=jours)


class TestAcces:
    @pytest.mark.parametrize('page', PAGES)
    def test_admin(self, admin_user, employee, page):
        resp = _client(admin_user).get(_url(page))
        assert resp.status_code == 200, resp.data
        assert 'kpis' in resp.data
        assert 'exports' not in resp.data
        assert resp.data['periode']['fin'] == timezone.localdate().isoformat()

    @pytest.mark.parametrize('page', PAGES)
    def test_consultant_refuse(self, consultant_user, page):
        assert _client(consultant_user).get(_url(page)).status_code == 403

    @pytest.mark.parametrize('page', PAGES)
    def test_gestionnaire_refuse(self, gestionnaire_user, page):
        assert _client(gestionnaire_user).get(_url(page)).status_code == 403

    def test_anonyme_refuse(self):
        assert _client().get(_url('synthese')).status_code in (401, 403)

    def test_page_inconnue(self, admin_user):
        assert _client(admin_user).get(_url('salaires')).status_code == 404


class TestParametres:
    @pytest.mark.parametrize('query', [
        'date_debut=abc', 'date_debut=2026-05-01&date_fin=2026-01-01', 'horizon=0', 'horizon=11',
        'echeance_jours=0', 'echeance_jours=366',
    ])
    def test_invalides(self, admin_user, query):
        assert _client(admin_user).get(f"{_url('effectifs')}?{query}").status_code == 400

    def test_periode_explicite(self, admin_user):
        resp = _client(admin_user).get(f"{_url('effectifs')}?date_debut=2026-01-01&date_fin=2026-06-30")
        assert resp.data['periode'] == {'debut': '2026-01-01', 'fin': '2026-06-30'}


class TestExport:
    @pytest.mark.parametrize('page', PAGES)
    def test_xlsx_et_trace(self, admin_user, employee, page):
        resp = _client(admin_user).get(f'{_url(page)}?fmt=xlsx')
        assert resp.status_code == 200
        assert resp['Content-Type'].startswith('application/vnd.openxmlformats')
        classeur = openpyxl.load_workbook(io.BytesIO(resp.content))
        assert classeur.sheetnames
        log = AuditLog.objects.filter(action=AuditLog.Action.EXPORT).latest('timestamp')
        assert log.details['type'] == 'reporting_rh'
        assert log.details['page'] == page


from employees.models import Departement, Direction, Poste, TypeContrat


class TestEffectifs:
    def test_unites_sans_responsable_et_postes_vides(self, admin_user, employee):
        Poste.objects.create(nom='Poste vacant')
        employee.direction.responsable = employee
        employee.direction.save()
        data = _client(admin_user).get(_url('effectifs')).data
        noms = {(u['type'], u['nom']) for u in data['unites_sans_responsable']}
        assert ('Direction', employee.direction.nom) not in noms
        assert ('Département', employee.departement.nom) in noms
        assert 'Poste vacant' in data['postes_sans_titulaire']
        assert employee.poste.nom not in data['postes_sans_titulaire']

    def test_part_cdi_et_encadrement(self, admin_user, employee):
        cdi = TypeContrat.objects.create(nom='CDI test', duree_indeterminee=True)
        cdd = TypeContrat.objects.create(nom='CDD test', duree_indeterminee=False)
        Employee.objects.filter(pk=employee.pk).update(type_contrat=cdi)
        _emp(employee, 'E2', type_contrat=cdd)
        employee.direction.responsable = employee
        employee.direction.save()
        kpis = {k['code']: k for k in _client(admin_user).get(_url('effectifs')).data['kpis']}
        assert kpis['effectif_actif']['valeur'] == 2
        assert kpis['part_cdi']['valeur'] == 50.0
        assert kpis['taux_encadrement']['valeur'] == 50.0
        assert kpis['part_cdi']['definition']


class TestParite:
    def test_taux_et_non_renseigne(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(sexe='M')
        _emp(employee, 'F1', sexe='F')
        _emp(employee, 'F2', sexe='F')
        _emp(employee, 'NR1')
        kpis = {k['code']: k for k in _client(admin_user).get(_url('parite')).data['kpis']}
        assert kpis['taux_feminisation']['valeur'] == 66.7
        assert kpis['sexe_non_renseigne']['valeur'] == 1

    def test_cellule_d_un_agent_masquee(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(sexe='F')
        autre = Direction.objects.create(nom='Direction isolée', code='DI')
        _emp(employee, 'S1', sexe='M', direction=autre, departement=None, service=None)
        _emp(employee, 'S2', sexe='M')
        data = _client(admin_user).get(_url('parite')).data
        lignes = {l['nom']: l for l in data['par_direction']}
        assert lignes['Direction isolée']['masque'] is True
        assert lignes['Direction isolée']['hommes'] is None
        assert lignes['Direction isolée']['total'] == 1
        assert lignes[employee.direction.nom]['masque'] is False
        assert lignes[employee.direction.nom]['femmes'] == 1

    def test_pyramide_par_sexe(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(sexe='F', date_naissance=_il_y_a(30))
        data = _client(admin_user).get(_url('parite')).data
        ligne = next(l for l in data['pyramide_age_sexe'] if l['tranche'] == '25-34')
        assert (ligne['femmes'], ligne['hommes']) == (1, 0)

    def test_encadrement_par_sexe(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(sexe='F')
        employee.direction.responsable = employee
        employee.direction.save()
        data = _client(admin_user).get(_url('parite')).data
        assert {'nom': 'Femmes', 'count': 1} in data['encadrement']


from employees.models import Contrat


class TestDemographie:
    def test_retraite_55_ans_pour_une_femme(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(sexe='F', date_naissance=_il_y_a(54, jours=100))
        data = _client(admin_user).get(_url('demographie')).data
        kpis = {k['code']: k for k in data['kpis']}
        assert kpis['departs_retraite_12m']['valeur'] == 1
        assert data['previsions'][0]['departs'] == 1
        assert data['previsions'][0]['effectif_projete'] == 0

    def test_homme_du_meme_age_ne_part_pas(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(sexe='M', date_naissance=_il_y_a(54, jours=100))
        kpis = {k['code']: k for k in _client(admin_user).get(_url('demographie')).data['kpis']}
        assert kpis['departs_retraite_12m']['valeur'] == 0

    def test_sexe_non_renseigne_compte_comme_incertain(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(date_naissance=_il_y_a(59, jours=100))
        kpis = {k['code']: k for k in _client(admin_user).get(_url('demographie')).data['kpis']}
        assert kpis['departs_retraite_12m']['valeur'] == 1
        assert kpis['retraite_incertaine']['valeur'] == 1

    def test_poste_a_risque(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(sexe='M', date_naissance=_il_y_a(58))
        jeune = Poste.objects.create(nom='Poste jeune')
        _emp(employee, 'J1', sexe='F', date_naissance=_il_y_a(30), poste=jeune)
        data = _client(admin_user).get(f"{_url('demographie')}?horizon=3").data
        postes = {p['poste']: p for p in data['postes_a_risque']}
        assert employee.poste.nom in postes
        assert postes[employee.poste.nom]['titulaires'][0]['matricule'] == employee.matricule
        assert 'Poste jeune' not in postes

    def test_fin_de_cdd_dans_l_effectif_projete(self, admin_user, employee):
        cdd = TypeContrat.objects.create(nom='CDD proj', duree_indeterminee=False)
        Employee.objects.filter(pk=employee.pk).update(date_naissance=_il_y_a(30))
        Contrat.objects.create(
            numero_contrat='P-1', employee=employee, type_contrat=cdd, date_debut=_il_y_a(1),
            date_fin=timezone.localdate() + timedelta(days=60), created_by=admin_user,
        )
        data = _client(admin_user).get(_url('demographie')).data
        assert data['previsions'][0]['fins_cdd'] == 1
        assert data['previsions'][0]['effectif_projete'] == 0


class TestContrats:
    def test_echus_et_enchainements(self, admin_user, employee):
        cdd = TypeContrat.objects.create(nom='CDD c', duree_indeterminee=False)
        Contrat.objects.create(numero_contrat='C-01', employee=employee, type_contrat=cdd,
                               date_debut=date(2024, 1, 1), date_fin=date(2024, 12, 31), statut='archive',
                               created_by=admin_user)
        Contrat.objects.create(numero_contrat='C-02', employee=employee, type_contrat=cdd,
                               date_debut=date(2025, 1, 1), date_fin=timezone.localdate() - timedelta(days=5),
                               created_by=admin_user)
        Employee.objects.filter(pk=employee.pk).update(statut='actif')
        data = _client(admin_user).get(_url('contrats')).data
        assert [c['numero_contrat'] for c in data['contrats_echus']] == ['C-02']
        assert data['contrats_echus'][0]['jours_depasses'] == 5
        assert data['cdd_enchaines'][0] == {'matricule': employee.matricule,
                                            'nom': f'{employee.prenom} {employee.nom}', 'nb_cdd': 2}

    def test_seuil_d_echeance(self, admin_user, employee, type_contrat):
        Contrat.objects.create(numero_contrat='C-10', employee=employee, type_contrat=type_contrat,
                               date_debut=date(2025, 1, 1), date_fin=timezone.localdate() + timedelta(days=40),
                               created_by=admin_user)
        assert len(_client(admin_user).get(f"{_url('contrats')}?echeance_jours=30").data['contrats_echeance']) == 0
        assert len(_client(admin_user).get(f"{_url('contrats')}?echeance_jours=60").data['contrats_echeance']) == 1


class TestQualite:
    def test_champs_manquants_doublons_et_motifs(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(date_naissance=date(1990, 1, 1))
        _emp(employee, 'DUP', nom=employee.nom.upper(), prenom=employee.prenom, date_naissance=date(1990, 1, 1))
        _emp(employee, 'ARC', statut='archive')
        data = _client(admin_user).get(_url('qualite')).data
        manquants = {c['champ']: c for c in data['champs_manquants']}
        assert manquants['sexe']['nb'] == 2
        incoherences = {i['code']: i for i in data['incoherences']}
        assert {l['matricule'] for l in incoherences['doublons']['lignes']} >= {employee.matricule, 'DUP'}
        assert [l['matricule'] for l in incoherences['sortis_sans_motif']['lignes']] == ['ARC']


class TestActivite:
    def test_admin_voit_son_activite_seulement(self, admin_user):
        data = _client(admin_user).get(_url('activite')).data
        assert 'mon_activite' in data
        assert 'activite_par_admin' not in data

    def test_superadmin_voit_tous_les_comptes(self, superadmin_user):
        data = _client(superadmin_user).get(_url('activite')).data
        assert isinstance(data['activite_par_admin'], list)


from django.db import connection
from django.test.utils import CaptureQueriesContext


class TestSynthese:
    def test_kpis_et_alertes(self, admin_user, employee, type_contrat):
        Contrat.objects.create(numero_contrat='S-1', employee=employee, type_contrat=type_contrat,
                               date_debut=date(2025, 1, 1), date_fin=timezone.localdate() + timedelta(days=10),
                               created_by=admin_user)
        data = _client(admin_user).get(_url('synthese')).data
        assert [k['code'] for k in data['kpis']] == [
            'effectif_actif', 'entrees', 'sorties_reelles', 'turnover', 'taux_feminisation', 'age_moyen',
            'anciennete_moyenne', 'departs_retraite_12m', 'contrats_echeance', 'completude',
        ]
        assert 'faits_marquants' in data
        textes = ' '.join(a['texte'] for a in data['alertes'])
        assert 'échéance' in textes
        assert 'sans sexe renseigné' in textes
        assert all(a['lien'] for a in data['alertes'])

    def test_nombre_de_requetes_independant_des_effectifs(self, admin_user, employee):
        client = _client(admin_user)
        client.get(_url('synthese'))                        # échauffement (caches, ContentType…)
        with CaptureQueriesContext(connection) as peu:
            client.get(_url('synthese'))
        for i in range(10):
            # Noms distincts : des homonymes nés le même jour seraient des
            # doublons probables, listés par une requête de plus (branche
            # légitime de la page Qualité, pas une requête par employé).
            _emp(employee, f'Q{i}', nom=f'NOM{i}', sexe='F', date_naissance=_il_y_a(40))
        with CaptureQueriesContext(connection) as beaucoup:
            client.get(_url('synthese'))
        assert len(beaucoup) == len(peu)



# ─── Pages ajoutées : mouvements, carrière, unités, documents, congés, demandes ───

from django.core.management import call_command

from notifications.models import Notification
from reporting.models import ObjectifIndicateur, RapportMensuel


class TestMouvements:
    def test_turnover_sur_la_date_de_sortie(self, admin_user, employee):
        ref = timezone.localdate()
        Employee.objects.filter(pk=employee.pk).update(date_embauche=_il_y_a(5))
        _emp(employee, 'IN1', nom='ENTRANT', date_embauche=ref - timedelta(days=30))
        _emp(employee, 'OUT1', nom='SORTANT', date_embauche=_il_y_a(3), statut='archive',
             date_sortie=ref - timedelta(days=20))
        _emp(employee, 'OUT2', nom='ANCIEN', date_embauche=_il_y_a(3), statut='archive')   # sortie non datée
        kpis = {k['code']: k for k in _client(admin_user).get(_url('mouvements')).data['kpis']}
        assert kpis['entrees']['valeur'] == 1
        assert kpis['sorties_reelles']['valeur'] == 1
        assert kpis['sorties_non_datees']['valeur'] == 1
        assert kpis['turnover']['valeur'] is not None
        assert kpis['anciennete_au_depart']['valeur'] == 2

    def test_retention_par_promotion(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(date_embauche=_il_y_a(4))
        _emp(employee, 'R2', nom='PARTI', date_embauche=_il_y_a(4), statut='archive',
             date_sortie=_il_y_a(4, jours=-100))
        data = _client(admin_user).get(_url('mouvements')).data
        promo = next(r for r in data['retention'] if r['annee'] == _il_y_a(4).year)
        assert promo['recrutes'] == 2
        assert promo['a_1_an'] == 50.0


class TestCarriere:
    def test_changement_hors_affectation_initiale(self, admin_user, employee):
        from employees.models import HistoriqueFonction
        nouveau = Poste.objects.create(nom='Chef de projet')
        HistoriqueFonction.objects.create(employee=employee, poste=employee.poste, date_debut=_il_y_a(6),
                                          date_fin=timezone.localdate() - timedelta(days=10), created_by=admin_user)
        HistoriqueFonction.objects.create(employee=employee, poste=nouveau,
                                          date_debut=timezone.localdate() - timedelta(days=10), created_by=admin_user)
        kpis = {k['code']: k for k in _client(admin_user).get(_url('carriere')).data['kpis']}
        assert kpis['changements_fonction']['valeur'] == 1

    def test_agent_sans_evolution(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(date_embauche=_il_y_a(8))
        data = _client(admin_user).get(_url('carriere')).data
        assert [s['matricule'] for s in data['sans_evolution']] == [employee.matricule]


class TestUnites:
    def test_ligne_par_direction_et_organisation(self, admin_user, employee):
        _emp(employee, 'U2', nom='DEUX', sexe='F')
        data = _client(admin_user).get(_url('unites')).data
        assert data['organisation']['effectif_actif'] == 2
        assert data['lignes'][0]['nom'] == employee.direction.nom
        assert {c['code'] for c in data['colonnes']} >= {'taux_feminisation', 'completude'}


class TestDroitsSpecifiques:
    def test_conges_reserve_au_traiteur(self, admin_user, traiteur_conge, superadmin_user):
        assert _client(admin_user).get(_url('conges')).status_code == 403
        assert _client(traiteur_conge).get(_url('conges')).status_code == 200
        assert _client(superadmin_user).get(_url('conges')).status_code == 200

    def test_demandes_sections_selon_le_droit(self, admin_user, traiteur, superadmin_user):
        assert _client(admin_user).get(_url('demandes')).status_code == 403
        data = _client(traiteur).get(_url('demandes')).data
        assert 'consultations' in data and 'attestations' not in data
        data = _client(superadmin_user).get(_url('demandes')).data
        assert 'consultations' in data and 'attestations' in data


class TestObjectifs:
    def test_cible_et_fait_marquant(self, admin_user, employee):
        from employees.models import TypeDocument
        client = _client(admin_user)
        resp = client.put('/api/reporting/objectifs/', {'code': 'completude', 'cible': 100, 'sens': 'au_moins'},
                          format='json')
        assert resp.status_code == 200, resp.data
        TypeDocument.objects.create(nom='Obligatoire test', code='OBL_T', obligatoire=True)
        data = client.get(_url('synthese')).data
        k = next(k for k in data['kpis'] if k['code'] == 'completude')
        assert (k['cible'], k['atteint']) == (100.0, False)
        assert any('Objectif non atteint' in f['texte'] for f in data['faits_marquants'])
        assert ObjectifIndicateur.objects.get(code='completude').modifie_par == admin_user

    def test_modification_et_suppression_tracees(self, admin_user):
        from audit.models import AuditLog
        client = _client(admin_user)
        client.put('/api/reporting/objectifs/', {'code': 'completude', 'cible': 90, 'sens': 'au_moins'}, format='json')
        client.put('/api/reporting/objectifs/', {'code': 'completude', 'cible': 95, 'sens': 'au_moins'}, format='json')
        assert client.delete('/api/reporting/objectifs/completude/').status_code == 204
        logs = list(AuditLog.objects.filter(action=AuditLog.Action.MODIFY_OBJECTIF).order_by('id'))
        assert [l.details['operation'] for l in logs] == ['creation', 'modification', 'suppression']
        assert logs[1].details['avant'] == {'cible': 90.0, 'sens': 'au_moins'}
        assert logs[2].details['avant']['cible'] == 95.0 and logs[2].details['apres'] is None

    def test_indicateur_inconnu_refuse(self, admin_user):
        resp = _client(admin_user).put('/api/reporting/objectifs/', {'code': 'salaire', 'cible': 1}, format='json')
        assert resp.status_code == 400

    def test_consultant_refuse(self, consultant_user):
        assert _client(consultant_user).get('/api/reporting/objectifs/').status_code == 403


class TestRapportMensuel:
    def test_generation_notification_et_telechargement_trace(self, admin_user, employee, settings, tmp_path,
                                                             django_capture_on_commit_callbacks):
        settings.MEDIA_ROOT = tmp_path
        # Les notifications sont créées après commit (notifications/service.py).
        with django_capture_on_commit_callbacks(execute=True):
            call_command('rapport_mensuel', '--mois', '2026-09')
        rapport = RapportMensuel.objects.get(mois=date(2026, 9, 1))
        assert rapport.fichier.read()[:4] == b'%PDF'
        assert Notification.objects.filter(type=Notification.Type.GENERIQUE).exists()
        resp = _client(admin_user).get(f'/api/reporting/rapports-mensuels/{rapport.id}/fichier/')
        assert resp.status_code == 200
        assert AuditLog.objects.filter(action=AuditLog.Action.EXPORT, details__type='rapport_mensuel').exists()

    def test_idempotent(self, admin_user, settings, tmp_path):
        settings.MEDIA_ROOT = tmp_path
        call_command('rapport_mensuel', '--mois', '2026-09')
        call_command('rapport_mensuel', '--mois', '2026-09')
        assert RapportMensuel.objects.count() == 1


class TestBilan:
    def test_classeur_consolide(self, admin_user, employee):
        resp = _client(admin_user).get(f"{_url('bilan')}?fmt=xlsx")
        noms = openpyxl.load_workbook(io.BytesIO(resp.content)).sheetnames
        assert any(n.startswith('Eff') for n in noms) and any(n.startswith('Mvt') for n in noms)
        assert len(noms) == len(set(noms))


# ─── Droit acces_statistiques (2026-10-31) — sur les vraies routes ──────────

User = get_user_model()


def _admin_sans_acces(username='ad_sans_stats'):
    return User.objects.create_user(username=username, password='Passw0rd!Long1', nom='Sans', prenom='Stats',
                                     role='ADMIN', consent_loi1807_accepted_at=timezone.now())


class TestAccesStatistiques:
    @pytest.mark.parametrize('url', [
        *[_url(p) for p in PAGES], '/api/reporting/objectifs/', '/api/reporting/rapports-mensuels/',
        '/api/reporting/stats-detail/', '/api/reporting/stats-export.xlsx/',
    ])
    def test_admin_sans_acces_refuse_partout(self, url):
        assert _client(_admin_sans_acces()).get(url).status_code == 403

    def test_admin_sans_acces_ne_peut_pas_modifier_un_objectif(self):
        resp = _client(_admin_sans_acces()).put('/api/reporting/objectifs/',
                                                 {'code': 'completude', 'cible': 90, 'sens': 'au_moins'}, format='json')
        assert resp.status_code == 403 and not ObjectifIndicateur.objects.exists()

    def test_superadmin_toujours_autorise(self, superadmin_user):
        assert _client(superadmin_user).get(_url('synthese')).status_code == 200

    def test_traiteur_conges_garde_sa_page_sans_acces_statistiques(self):
        traiteur = _admin_sans_acces('ad_conge')
        traiteur.charge_conge = True
        traiteur.save()
        assert _client(traiteur).get(_url('conges')).status_code == 200
        assert _client(traiteur).get(_url('synthese')).status_code == 403

    def test_me_expose_le_droit(self, admin_user):
        assert _client(_admin_sans_acces()).get('/api/auth/me/').data['can_view_statistiques'] is False
        assert _client(admin_user).get('/api/auth/me/').data['can_view_statistiques'] is True

    def test_seul_un_superadmin_attribue_le_droit_et_c_est_trace(self, superadmin_user, admin_user):
        cible = _admin_sans_acces('ad_cible')
        # Un ADMIN ne peut pas se l'attribuer lui-même (il ne voit pas les autres ADMIN : 404).
        resp = _client(cible).patch(f'/api/admin-users/{cible.id}/', {'acces_statistiques': True}, format='json')
        assert resp.status_code == 400 and 'acces_statistiques' in resp.data
        cible.refresh_from_db()
        assert cible.acces_statistiques is False
        assert _client(superadmin_user).patch(f'/api/admin-users/{cible.id}/', {'acces_statistiques': True},
                                              format='json').status_code == 200
        cible.refresh_from_db()
        assert cible.acces_statistiques is True
        log = AuditLog.objects.filter(action=AuditLog.Action.MODIFY_USER).latest('id')
        assert log.details['before']['acces_statistiques'] is False
        assert log.details['after']['acces_statistiques'] is True

    def test_droit_retire_si_le_compte_n_est_plus_admin(self, superadmin_user, admin_user):
        # admin_user : un autre ADMIN actif, sinon la rétrogradation du dernier ADMIN est refusée.
        cible = _admin_sans_acces('ad_retro')
        cible.acces_statistiques = True
        cible.save()
        # GESTIONNAIRE : seul ADMIN et CONSULTANT peuvent porter le droit (2026-11-01).
        cible.employee = Employee.objects.create(matricule='EMP-RETRO', nom='Retro', prenom='G')
        cible.save()
        _client(superadmin_user).patch(f'/api/admin-users/{cible.id}/', {'role': 'GESTIONNAIRE'}, format='json')
        cible.refresh_from_db()
        assert cible.acces_statistiques is False and cible.can_view_statistiques is False

    def test_rapport_mensuel_notifie_seulement_les_comptes_autorises(self, admin_user, superadmin_user,
                                                                     django_capture_on_commit_callbacks):
        sans = _admin_sans_acces('ad_notif')
        with django_capture_on_commit_callbacks(execute=True):
            call_command('rapport_mensuel', '--mois', '2026-01')
        notifies = set(Notification.objects.filter(type=Notification.Type.GENERIQUE)
                       .values_list('recipient_id', flat=True))
        assert admin_user.id in notifies and superadmin_user.id in notifies and sans.id not in notifies


class TestStatistiquesConsultant:
    """CONSULTANT portant acces_statistiques (2026-11-01) : chiffres de toute
    l'organisation, aucune liste nominative (reporting/nominatif.py)."""

    def _consultant(self, acces=True):
        return User.objects.create_user(username='cons_stats', password='Passw0rd!Long1', nom='C', prenom='S',
                                        role='CONSULTANT', acces_statistiques=acces,
                                        consent_loi1807_accepted_at=timezone.now())

    def test_sans_le_droit_refuse(self):
        assert _client(self._consultant(acces=False)).get(_url('effectifs')).status_code == 403

    def test_avec_le_droit_voit_les_chiffres_sans_noms(self, employee):
        from employees.models import Contrat
        data = _client(self._consultant()).get(_url('contrats')).data
        assert data['nominatif_masque'] is True
        for valeur in data.values():
            if isinstance(valeur, list):
                assert not any(isinstance(x, dict) and 'matricule' in x for x in valeur)

    def test_export_sans_tables_nominatives(self):
        resp = _client(self._consultant()).get(_url('contrats'), {'fmt': 'xlsx'})
        assert resp.status_code == 200
        classeur = openpyxl.load_workbook(io.BytesIO(resp.content))
        for feuille in classeur.worksheets:
            for ligne in feuille.iter_rows(values_only=True):
                assert 'Matricule' not in ligne

    def test_admin_garde_les_listes_nominatives(self, admin_user):
        assert 'nominatif_masque' not in _client(admin_user).get(_url('contrats')).data

    def test_lit_les_objectifs_mais_ne_les_modifie_pas(self):
        client = _client(self._consultant())
        assert client.get('/api/reporting/objectifs/').status_code == 200
        assert client.put('/api/reporting/objectifs/', {'code': 'completude', 'cible': 90, 'sens': 'au_moins'},
                          format='json').status_code == 403
        assert client.get('/api/reporting/rapports-mensuels/').status_code == 200

    def test_pages_des_traiteurs_et_anciens_endpoints_refuses(self):
        client = _client(self._consultant())
        assert client.get(_url('conges')).status_code == 403
        assert client.get('/api/reporting/stats-detail/').status_code == 403

    def test_retrait_du_nominatif_generique(self):
        from reporting.nominatif import retirer_nominatif
        data = retirer_nominatif({
            'kpis': [{'code': 'x', 'valeur': 1}],
            'postes': [{'poste': 'Chef', 'titulaires': [{'matricule': 'E1', 'nom': 'A B'}]}],
            'exports': [{'titre': 'T', 'colonnes': ['Matricule', 'Employé'], 'lignes': [['E1', 'A B']]},
                        {'titre': 'P', 'colonnes': ['Fonction', 'Détail'], 'lignes': [['Chef', 'A B (2030)']]}],
        })
        assert data['postes'] == [{'poste': 'Chef', 'titulaires': []}]
        assert [t['titre'] for t in data['exports']] == ['P'] and data['exports'][0]['lignes'] == [['Chef', '']]
