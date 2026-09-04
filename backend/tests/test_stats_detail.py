import pytest
from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.utils import timezone
from audit.stats import build_stats_detail
from audit.models import AuditLog
from employees.models import Employee, Contrat, EmployeeDocument

User = get_user_model()


def _make_employee(**kwargs):
    defaults = dict(matricule=f"EMP-{Employee.objects.count()+1:03d}", nom="Test", prenom="X")
    defaults.update(kwargs)
    return Employee.objects.create(**defaults)


@pytest.mark.django_db
class TestBuildStatsDetailPeriode:
    def test_default_periode_is_last_12_months(self):
        result = build_stats_detail(None, None)
        debut = date.fromisoformat(result['periode']['debut'])
        fin = date.fromisoformat(result['periode']['fin'])
        assert fin == timezone.localdate()
        assert (fin - debut).days in range(360, 367)

    def test_explicit_periode_is_respected(self):
        result = build_stats_detail(date(2026, 1, 1), date(2026, 1, 31))
        assert result['periode']['debut'] == '2026-01-01'
        assert result['periode']['fin'] == '2026-01-31'

    def test_all_section_keys_present_even_when_empty(self):
        result = build_stats_detail(None, None)
        for key in [
            'indicateurs', 'repartition_direction', 'repartition_departement',
            'repartition_categorie', 'repartition_type_contrat', 'repartition_fonction',
            'evolution_mensuelle', 'pyramide_age', 'pyramide_anciennete',
            'contrats_echeance', 'completude_par_direction', 'completude_par_departement',
        ]:
            assert key in result


@pytest.mark.django_db
class TestBuildStatsDetailIndicateurs:
    def test_recrutements_counts_employees_hired_in_period(self, direction, departement):
        _make_employee(direction=direction, departement=departement, date_embauche=date(2026, 6, 15), statut='actif')
        _make_employee(direction=direction, departement=departement, date_embauche=date(2025, 1, 1), statut='actif')
        result = build_stats_detail(date(2026, 6, 1), date(2026, 6, 30))
        assert result['indicateurs']['recrutements']['valeur'] == 1

    def test_recrutements_variation_pct_vs_previous_period(self, direction, departement):
        _make_employee(direction=direction, departement=departement, date_embauche=date(2026, 6, 15), statut='actif')
        _make_employee(direction=direction, departement=departement, date_embauche=date(2026, 6, 16), statut='actif')
        _make_employee(direction=direction, departement=departement, date_embauche=date(2026, 5, 15), statut='actif')
        result = build_stats_detail(date(2026, 6, 1), date(2026, 6, 30))
        assert result['indicateurs']['recrutements']['variation_pct'] == 100.0

    def test_recrutements_variation_pct_none_when_previous_is_zero(self, direction, departement):
        _make_employee(direction=direction, departement=departement, date_embauche=date(2026, 6, 15), statut='actif')
        result = build_stats_detail(date(2026, 6, 1), date(2026, 6, 30))
        assert result['indicateurs']['recrutements']['variation_pct'] is None

    def test_archivages_counts_statut_transfer_audit_entries_in_period(self, admin_user, direction, departement):
        emp = _make_employee(direction=direction, departement=departement, statut='archive')
        AuditLog.objects.create(
            user=admin_user, action=AuditLog.Action.MODIFY_EMP,
            target_model='Employee', target_id=str(emp.pk), target_label=str(emp),
            details={'transfer': {'statut': {'de': 'Actif', 'vers': 'Archivé'}}},
        )
        AuditLog.objects.filter(target_id=str(emp.pk)).update(timestamp=timezone.make_aware(
            timezone.datetime(2026, 6, 10)
        ))
        result = build_stats_detail(date(2026, 6, 1), date(2026, 6, 30))
        assert result['indicateurs']['archivages']['valeur'] == 1


@pytest.mark.django_db
class TestBuildStatsDetailRepartitions:
    def test_repartition_direction_counts_actifs_only(self, direction, departement):
        _make_employee(direction=direction, departement=departement, statut='actif')
        _make_employee(direction=direction, departement=departement, statut='archive')
        result = build_stats_detail(None, None)
        row = next(r for r in result['repartition_direction'] if r['id'] == str(direction.id))
        assert row['count'] == 1

    def test_repartition_departement_includes_direction_nom(self, direction, departement):
        _make_employee(direction=direction, departement=departement, statut='actif')
        result = build_stats_detail(None, None)
        row = next(r for r in result['repartition_departement'] if r['id'] == str(departement.id))
        assert row['direction_nom'] == direction.nom

    def test_repartition_categorie_groups_null_as_non_renseigne(self, direction, departement):
        _make_employee(direction=direction, departement=departement, statut='actif', categorie=None)
        result = build_stats_detail(None, None)
        row = next(r for r in result['repartition_categorie'] if r['nom'] == 'Non renseigné')
        assert row['count'] == 1

    def test_repartition_fonction_caps_at_top_10_plus_autres(self, direction, departement, admin_user):
        from employees.models import Poste
        for i in range(12):
            poste = Poste.objects.create(nom=f"Poste {i}")
            _make_employee(
                direction=direction, departement=departement, statut='actif', poste=poste,
                matricule=f"EMP-F{i:03d}",
            )
        result = build_stats_detail(None, None)
        assert len(result['repartition_fonction']) <= 11  # 10 + "Autres"


@pytest.mark.django_db
class TestBuildStatsDetailEvolution:
    def test_evolution_mensuelle_has_one_entry_per_month_in_range(self, direction, departement):
        _make_employee(direction=direction, departement=departement, date_embauche=date(2026, 6, 5), statut='actif')
        result = build_stats_detail(date(2026, 5, 1), date(2026, 6, 30))
        mois = [e['mois'] for e in result['evolution_mensuelle']]
        assert mois == ['2026-05', '2026-06']

    def test_evolution_mensuelle_counts_recrutements_per_month(self, direction, departement):
        _make_employee(direction=direction, departement=departement, date_embauche=date(2026, 6, 5), statut='actif')
        _make_employee(direction=direction, departement=departement, date_embauche=date(2026, 6, 20), statut='actif')
        result = build_stats_detail(date(2026, 6, 1), date(2026, 6, 30))
        assert result['evolution_mensuelle'][0]['recrutements'] == 2


@pytest.mark.django_db
class TestBuildStatsDetailPyramides:
    def test_pyramide_age_buckets_by_tranche(self, direction, departement):
        today = timezone.localdate()
        _make_employee(
            direction=direction, departement=departement, statut='actif',
            date_naissance=date(today.year - 30, 1, 1),
        )
        result = build_stats_detail(None, None)
        row = next(r for r in result['pyramide_age'] if r['tranche'] == '25-34')
        assert row['count'] == 1

    def test_pyramide_anciennete_buckets_by_tranche(self, direction, departement):
        today = timezone.localdate()
        _make_employee(
            direction=direction, departement=departement, statut='actif',
            date_embauche=date(today.year - 2, today.month, 1),
        )
        result = build_stats_detail(None, None)
        row = next(r for r in result['pyramide_anciennete'] if r['tranche'] == '1-3 ans')
        assert row['count'] == 1


@pytest.mark.django_db
class TestBuildStatsDetailEcheances:
    def test_contrats_echeance_within_90_days(self, direction, departement, type_contrat, admin_user):
        today = timezone.localdate()
        emp = _make_employee(direction=direction, departement=departement, statut='actif')
        Contrat.objects.create(
            numero_contrat='CTR-ECH-1', employee=emp, type_contrat=type_contrat,
            date_debut=today - timedelta(days=300), date_fin=today + timedelta(days=30),
            statut='actif', created_by=admin_user,
        )
        Contrat.objects.create(
            numero_contrat='CTR-ECH-2', employee=emp, type_contrat=type_contrat,
            date_debut=today - timedelta(days=300), date_fin=today + timedelta(days=200),
            statut='actif', created_by=admin_user,
        )
        result = build_stats_detail(None, None)
        numeros = [c['numero_contrat'] for c in result['contrats_echeance']]
        assert 'CTR-ECH-1' in numeros
        assert 'CTR-ECH-2' not in numeros

    def test_contrats_echeance_excludes_non_actif(self, direction, departement, type_contrat, admin_user):
        today = timezone.localdate()
        emp = _make_employee(direction=direction, departement=departement, statut='actif')
        Contrat.objects.create(
            numero_contrat='CTR-ECH-3', employee=emp, type_contrat=type_contrat,
            date_debut=today - timedelta(days=300), date_fin=today + timedelta(days=10),
            statut='archive', created_by=admin_user,
        )
        result = build_stats_detail(None, None)
        assert result['contrats_echeance'] == []


@pytest.mark.django_db
class TestBuildStatsDetailCompletude:
    def test_completude_par_direction(self, direction, departement, type_doc_obligatoire):
        _make_employee(direction=direction, departement=departement, statut='actif')
        result = build_stats_detail(None, None)
        row = next(r for r in result['completude_par_direction'] if r['id'] == str(direction.id))
        assert row['total'] == 1
        assert row['complets'] == 0
        assert row['taux'] == 0.0


def _other_admin():
    return User.objects.create_user(
        username="other_admin", password="Pass123!", nom="Other", prenom="Admin", role="ADMIN",
    )


@pytest.mark.django_db
class TestBuildStatsDetailMonActivite:
    def test_no_requesting_user_omits_mon_activite(self):
        result = build_stats_detail(None, None)
        assert 'mon_activite' not in result
        assert 'activite_par_admin' not in result

    def test_mon_activite_present_for_requesting_user(self, admin_user):
        result = build_stats_detail(None, None, requesting_user=admin_user)
        assert 'mon_activite' in result
        assert result['mon_activite']['employes_crees'] == 0

    def test_mon_activite_counts_employes_crees(self, admin_user):
        AuditLog.objects.create(
            user=admin_user, action=AuditLog.Action.CREATE_EMP,
            target_model='Employee', target_id='x', target_label='x',
        )
        result = build_stats_detail(None, None, requesting_user=admin_user)
        assert result['mon_activite']['employes_crees'] == 1

    def test_mon_activite_counts_employes_archives(self, admin_user):
        AuditLog.objects.create(
            user=admin_user, action=AuditLog.Action.MODIFY_EMP,
            target_model='Employee', target_id='x', target_label='x',
            details={'transfer': {'statut': {'de': 'Actif', 'vers': 'Archivé'}}},
        )
        AuditLog.objects.create(
            user=admin_user, action=AuditLog.Action.MODIFY_EMP,
            target_model='Employee', target_id='y', target_label='y',
            details={'transfer': {'poste': {'de': 'A', 'vers': 'B'}}},
        )
        result = build_stats_detail(None, None, requesting_user=admin_user)
        assert result['mon_activite']['employes_modifies'] == 2
        assert result['mon_activite']['employes_archives'] == 1

    def test_mon_activite_counts_present_documents_only(self, admin_user, direction, departement, type_doc_obligatoire):
        emp = _make_employee(direction=direction, departement=departement, created_by=admin_user)
        present = EmployeeDocument.objects.create(
            employee=emp, type_doc=type_doc_obligatoire, uploaded_by=admin_user, is_active=True,
        )
        deleted = EmployeeDocument.objects.create(
            employee=emp, type_doc=type_doc_obligatoire, uploaded_by=admin_user, is_active=False,
        )
        result = build_stats_detail(None, None, requesting_user=admin_user)
        # Un document supprimé (hard delete simulé ici par is_active=False)
        # ne doit plus compter dans "Documents uploadés" — voir CLAUDE.md,
        # ce compteur reflète l'état actuel, pas le journal d'audit.
        assert result['mon_activite']['documents_uploades'] == 1

    def test_mon_activite_uploads_respect_date_range(self, admin_user, direction, departement, type_doc_obligatoire):
        emp = _make_employee(direction=direction, departement=departement, created_by=admin_user)
        doc = EmployeeDocument.objects.create(
            employee=emp, type_doc=type_doc_obligatoire, uploaded_by=admin_user, is_active=True,
        )
        EmployeeDocument.objects.filter(pk=doc.pk).update(
            uploaded_at=timezone.make_aware(timezone.datetime(2020, 1, 1))
        )
        result = build_stats_detail(date(2026, 1, 1), date(2026, 12, 31), requesting_user=admin_user)
        assert result['mon_activite']['documents_uploades'] == 0

    def test_mon_activite_does_not_count_other_admins_actions(self, admin_user):
        other = _other_admin()
        AuditLog.objects.create(
            user=other, action=AuditLog.Action.CREATE_EMP,
            target_model='Employee', target_id='x', target_label='x',
        )
        result = build_stats_detail(None, None, requesting_user=admin_user)
        assert result['mon_activite']['employes_crees'] == 0

    def test_activite_par_admin_absent_for_non_superadmin(self, admin_user):
        result = build_stats_detail(None, None, requesting_user=admin_user)
        assert 'activite_par_admin' not in result

    def test_activite_par_admin_present_for_superadmin(self):
        superadmin = User.objects.create_user(
            username="super_test", password="Pass123!", nom="Super", prenom="X", role="SUPERADMIN",
        )
        _other_admin()
        result = build_stats_detail(None, None, requesting_user=superadmin)
        noms = [a['nom_complet'] for a in result['activite_par_admin']]
        assert superadmin.full_name in noms
        assert 'Admin Other' in noms or any('Other' in n for n in noms)
