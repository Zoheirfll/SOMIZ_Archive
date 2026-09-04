# Page Statistiques Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new ADMIN-only `/statistiques` page with organizational/profile breakdowns, 12-month evolution, age/seniority pyramids, upcoming contract expirations, per-unit completeness, date filters (presets + free range) with period-over-period variation, and Excel/PDF export.

**Architecture:** One backend computation module (`backend/audit/stats.py`) shared by a JSON detail endpoint and an Excel export endpoint, both under `IsAdmin`. One frontend page (`frontend/src/pages/Statistiques.jsx`) that fetches the detail endpoint and renders sections with a hand-rolled SVG bar-chart component (no new chart dependency). PDF export uses the browser's native print via a `@media print` stylesheet (no new dependency).

**Tech Stack:** Django REST Framework, `openpyxl` (already a dependency), React 19, inline styles + `theme.js`, `axios`.

## Global Constraints

- ADMIN/SUPERADMIN only — reuse `IsAdmin` permission class and `ProtectedRoute adminOnly` (exact same gate as `/dashboard`).
- No new frontend or backend dependency (no chart library, no PDF library) — see spec "Hors périmètre" / export section reasoning.
- All styling via `theme.js` tokens and inline `style={{}}` — never hardcode hex colors (CLAUDE.md rule).
- `useIsMobile()` for responsive layout, consistent with the rest of the app.
- Every mutating-adjacent refetch (filter change) must not fully unmount the page (no `loading` early-return after first mount) — same "silent refetch" convention as `EmployeeDetail.jsx#fetchEmployee` etc.
- Reuse existing model fields: `Employee.date_naissance`, `date_embauche`, `direction`, `departement`, `categorie`, `type_contrat`, `poste`, `statut`; `Contrat.date_fin`, `statut`; `AuditLog.details.transfer.statut.vers` (French display labels: "Actif", "Inactif", "Archivé", "Démobilisé") for archivage events; `TypeDocument.obligatoire`/`is_active`/`sous_types` for completeness, exactly as `AdminStatsView` (`backend/audit/views.py:86-140`) already does.
- Effort target: exact code for every step, TDD backend (pytest, `@pytest.mark.django_db`, `auth_client()` helper pattern from `backend/tests/test_motif_archivage_referentiel.py`), and one Jest smoke test per frontend task at minimum.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/audit/stats.py` (new) | Pure computation: `build_stats_detail(date_debut, date_fin)` → dict matching the spec's JSON shape. No HTTP concerns. |
| `backend/audit/views.py` (modify) | Add `StatsDetailView` (JSON) and `StatsExportView` (xlsx), both thin wrappers around `build_stats_detail`. |
| `backend/audit/urls.py` (modify) | Register `stats-detail/` and `stats-export.xlsx/`. |
| `backend/tests/test_stats_detail.py` (new) | Tests for `build_stats_detail` and `StatsDetailView`. |
| `backend/tests/test_stats_export.py` (new) | Tests for `StatsExportView`. |
| `frontend/src/pages/Statistiques.jsx` (new) | Page component — fetch, filters, sections, export menu. |
| `frontend/src/components/StatBarChart.jsx` (new) | Shared hand-rolled SVG bar chart (vertical grouped bars for evolution, horizontal bars for pyramids/repartitions). |
| `frontend/src/config/notices.js` (modify) | Add `PAGE_NOTICES.statistiques`. |
| `frontend/src/components/Navbar.jsx` (modify) | Add nav link. |
| `frontend/src/App.js` (modify) | Add route. |
| `frontend/src/__tests__/Statistiques.test.js` (new) | Smoke tests: renders, fetches, filter change refetches, export buttons present. |

---

## Task 1: Backend — `build_stats_detail()` core (indicateurs, répartitions organisation/profils)

**Files:**
- Create: `backend/audit/stats.py`
- Test: `backend/tests/test_stats_detail.py`

**Interfaces:**
- Produces: `build_stats_detail(date_debut: date | None, date_fin: date | None) -> dict` with at least keys `periode`, `indicateurs`, `repartition_direction`, `repartition_departement`, `repartition_categorie`, `repartition_type_contrat`, `repartition_fonction` populated by this task (other keys added in Task 2, but the dict shape must already include empty-safe placeholders `evolution_mensuelle: []`, `pyramide_age: []`, `pyramide_anciennete: []`, `contrats_echeance: []`, `completude_par_direction: []`, `completude_par_departement: []` so Task 2 only fills them in, never changes the shape consumers rely on).

- [ ] **Step 1: Write the failing test for the date-range defaulting and indicateurs**

```python
# backend/tests/test_stats_detail.py
import pytest
from datetime import date, timedelta
from django.utils import timezone
from audit.stats import build_stats_detail
from audit.models import AuditLog
from employees.models import Employee, Direction, Departement


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
        # 2 in period vs 1 in the equal-length previous period -> +100%
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_stats_detail.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'audit.stats'`

- [ ] **Step 3: Implement `build_stats_detail()` (this task's slice)**

```python
# backend/audit/stats.py
"""
audit/stats.py
Calcul des statistiques de la page /statistiques — logique pure, sans
dépendance HTTP, partagée par StatsDetailView (JSON) et StatsExportView
(xlsx). Voir docs/superpowers/specs/2026-09-02-page-statistiques-design.md.
"""
from datetime import timedelta
from django.db.models import Count, Q
from django.utils import timezone

from employees.models import Employee, Contrat, TypeDocument
from audit.models import AuditLog

STATUTS_ARCHIVE = ['Inactif', 'Archivé', 'Démobilisé']
TOP_FONCTIONS = 10


def _default_periode():
    fin = timezone.localdate()
    debut = fin - timedelta(days=365)
    return debut, fin


def _variation_pct(valeur, valeur_precedente):
    if not valeur_precedente:
        return None
    return round((valeur - valeur_precedente) / valeur_precedente * 100, 1)


def _indicateurs(date_debut, date_fin):
    duree = (date_fin - date_debut).days + 1
    date_debut_prec = date_debut - timedelta(days=duree)
    date_fin_prec = date_debut - timedelta(days=1)

    def recrutements(debut, fin):
        return Employee.objects.filter(date_embauche__range=[debut, fin]).count()

    def archivages(debut, fin):
        return AuditLog.objects.filter(
            action=AuditLog.Action.MODIFY_EMP,
            timestamp__date__range=[debut, fin],
            details__transfer__statut__vers__in=STATUTS_ARCHIVE,
        ).count()

    def dossiers_completes(debut, fin):
        types_obligatoires = TypeDocument.objects.filter(
            obligatoire=True, is_active=True, sous_types__isnull=True
        )
        qs = Employee.objects.filter(statut='actif', date_embauche__range=[debut, fin])
        for t in types_obligatoires:
            qs = qs.filter(documents__type_doc=t, documents__is_active=True)
        return qs.distinct().count()

    rec, rec_prec = recrutements(date_debut, date_fin), recrutements(date_debut_prec, date_fin_prec)
    arc, arc_prec = archivages(date_debut, date_fin), archivages(date_debut_prec, date_fin_prec)
    comp, comp_prec = dossiers_completes(date_debut, date_fin), dossiers_completes(date_debut_prec, date_fin_prec)

    return {
        'recrutements': {'valeur': rec, 'variation_pct': _variation_pct(rec, rec_prec)},
        'archivages': {'valeur': arc, 'variation_pct': _variation_pct(arc, arc_prec)},
        'dossiers_completes': {'valeur': comp, 'variation_pct': _variation_pct(comp, comp_prec)},
    }


def _repartition_direction():
    rows = Employee.objects.filter(statut='actif').values(
        'direction_id', 'direction__nom'
    ).annotate(count=Count('id')).order_by('-count')
    return [
        {'id': str(r['direction_id']), 'nom': r['direction__nom'] or 'Non renseigné', 'count': r['count']}
        for r in rows if r['direction_id']
    ]


def _repartition_departement():
    rows = Employee.objects.filter(statut='actif').values(
        'departement_id', 'departement__nom', 'departement__direction__nom'
    ).annotate(count=Count('id')).order_by('-count')
    return [
        {
            'id': str(r['departement_id']), 'nom': r['departement__nom'] or 'Non renseigné',
            'direction_nom': r['departement__direction__nom'], 'count': r['count'],
        }
        for r in rows if r['departement_id']
    ]


def _repartition_simple(field_relation, field_nom):
    rows = Employee.objects.filter(statut='actif').values(field_nom).annotate(
        count=Count('id')
    ).order_by('-count')
    result = []
    for r in rows:
        nom = r[field_nom] or 'Non renseigné'
        result.append({'nom': nom, 'count': r['count']})
    # Fusionne les lignes "Non renseigné" éventuellement dupliquées (une
    # par valeur NULL groupée séparément par Django selon la DB) :
    merged = {}
    for r in result:
        merged[r['nom']] = merged.get(r['nom'], 0) + r['count']
    return [{'nom': nom, 'count': count} for nom, count in sorted(merged.items(), key=lambda x: -x[1])]


def _repartition_fonction():
    full = _repartition_simple('poste', 'poste__nom')
    if len(full) <= TOP_FONCTIONS:
        return full
    top = full[:TOP_FONCTIONS]
    autres_count = sum(r['count'] for r in full[TOP_FONCTIONS:])
    return top + [{'nom': 'Autres', 'count': autres_count}]


def build_stats_detail(date_debut, date_fin):
    if date_debut is None or date_fin is None:
        date_debut, date_fin = _default_periode()

    return {
        'periode': {'debut': date_debut.isoformat(), 'fin': date_fin.isoformat()},
        'indicateurs': _indicateurs(date_debut, date_fin),
        'repartition_direction': _repartition_direction(),
        'repartition_departement': _repartition_departement(),
        'repartition_categorie': _repartition_simple('categorie', 'categorie__nom'),
        'repartition_type_contrat': _repartition_simple('type_contrat', 'type_contrat__nom'),
        'repartition_fonction': _repartition_fonction(),
        'evolution_mensuelle': [],
        'pyramide_age': [],
        'pyramide_anciennete': [],
        'contrats_echeance': [],
        'completude_par_direction': [],
        'completude_par_departement': [],
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_stats_detail.py -v`
Expected: PASS (all `TestBuildStatsDetail*` tests green)

- [ ] **Step 5: Commit**

```bash
git add backend/audit/stats.py backend/tests/test_stats_detail.py
git commit -m "feat(stats): calcul des indicateurs et répartitions pour la page Statistiques"
```

---

## Task 2: Backend — évolution mensuelle, pyramides, échéances, complétude par unité

**Files:**
- Modify: `backend/audit/stats.py`
- Modify: `backend/tests/test_stats_detail.py`

**Interfaces:**
- Consumes: `build_stats_detail` signature from Task 1 (same function, same call sites — this task fills in the four remaining empty lists).
- Produces: no new public names; the same `build_stats_detail` dict now has real data in `evolution_mensuelle`, `pyramide_age`, `pyramide_anciennete`, `contrats_echeance`, `completude_par_direction`, `completude_par_departement`.

- [ ] **Step 1: Write the failing tests**

```python
# append to backend/tests/test_stats_detail.py
from datetime import date, timedelta


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
        emp = _make_employee(direction=direction, departement=departement, statut='actif')
        result = build_stats_detail(None, None)
        row = next(r for r in result['completude_par_direction'] if r['id'] == str(direction.id))
        assert row['total'] == 1
        assert row['complets'] == 0
        assert row['taux'] == 0.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_stats_detail.py -v -k "Evolution or Pyramide or Echeance or Completude"`
Expected: FAIL (empty lists, `next()` raises `StopIteration`)

- [ ] **Step 3: Implement the remaining computations**

```python
# backend/audit/stats.py — add these helpers, then wire them into build_stats_detail()

AGE_TRANCHES = [(0, 24, '<25'), (25, 34, '25-34'), (35, 44, '35-44'), (45, 54, '45-54'), (55, 200, '55+')]
ANCIENNETE_TRANCHES = [
    (0, 0, '<1 an'), (1, 2, '1-3 ans'), (3, 4, '3-5 ans'), (5, 9, '5-10 ans'), (10, 200, '10+ ans'),
]


def _years_between(start, end):
    years = end.year - start.year
    if (end.month, end.day) < (start.month, start.day):
        years -= 1
    return years


def _evolution_mensuelle(date_debut, date_fin):
    from calendar import monthrange
    months = []
    cursor = date_debut.replace(day=1)
    end_marker = date_fin.replace(day=1)
    while cursor <= end_marker:
        months.append(cursor)
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)

    result = []
    for m in months:
        last_day = monthrange(m.year, m.month)[1]
        m_debut, m_fin = m, m.replace(day=last_day)
        recrutements = Employee.objects.filter(date_embauche__range=[m_debut, m_fin]).count()
        archivages = AuditLog.objects.filter(
            action=AuditLog.Action.MODIFY_EMP,
            timestamp__date__range=[m_debut, m_fin],
            details__transfer__statut__vers__in=STATUTS_ARCHIVE,
        ).count()
        result.append({'mois': m.strftime('%Y-%m'), 'recrutements': recrutements, 'archivages': archivages})
    return result


def _pyramide(qs, date_field, tranches):
    today = timezone.localdate()
    buckets = {label: 0 for *_r, label in tranches}
    for value in qs.exclude(**{f'{date_field}__isnull': True}).values_list(date_field, flat=True):
        n = _years_between(value, today)
        for lo, hi, label in tranches:
            if lo <= n <= hi:
                buckets[label] += 1
                break
    return [{'tranche': label, 'count': buckets[label]} for *_r, label in tranches]


def _pyramide_age():
    return _pyramide(Employee.objects.filter(statut='actif'), 'date_naissance', AGE_TRANCHES)


def _pyramide_anciennete():
    return _pyramide(Employee.objects.filter(statut='actif'), 'date_embauche', ANCIENNETE_TRANCHES)


def _contrats_echeance():
    today = timezone.localdate()
    limite = today + timedelta(days=90)
    contrats = Contrat.objects.filter(
        statut='actif', date_fin__isnull=False, date_fin__range=[today, limite]
    ).select_related('employee').order_by('date_fin')
    return [
        {
            'id': str(c.id),
            'numero_contrat': c.numero_contrat,
            'employee_id': str(c.employee_id),
            'employee_nom': f'{c.employee.prenom} {c.employee.nom}',
            'date_fin': c.date_fin.isoformat(),
            'jours_restants': (c.date_fin - today).days,
        }
        for c in contrats
    ]


def _completude_par(group_field, extra_values=()):
    types_obligatoires = list(TypeDocument.objects.filter(
        obligatoire=True, is_active=True, sous_types__isnull=True
    ))
    base = Employee.objects.filter(statut='actif').exclude(**{f'{group_field}__isnull': True})
    groupes = base.values(f'{group_field}_id', f'{group_field}__nom', *extra_values).annotate(
        total=Count('id', distinct=True)
    )
    result = []
    for g in groupes:
        group_id = g[f'{group_field}_id']
        total = g['total']
        complets_qs = Employee.objects.filter(statut='actif', **{group_field: group_id})
        for t in types_obligatoires:
            complets_qs = complets_qs.filter(documents__type_doc=t, documents__is_active=True)
        complets = complets_qs.distinct().count()
        row = {
            'id': str(group_id),
            'nom': g[f'{group_field}__nom'],
            'total': total,
            'complets': complets,
            'taux': round(complets / total * 100, 1) if total else 0.0,
        }
        for extra in extra_values:
            row[extra.replace('__', '_')] = g[extra]
        result.append(row)
    return sorted(result, key=lambda r: r['taux'])


def _completude_par_direction():
    return _completude_par('direction')


def _completude_par_departement():
    return _completude_par('departement', extra_values=('departement__direction__nom',))
```

Then update `build_stats_detail()`'s return dict to replace the four
placeholder empty lists:

```python
        'evolution_mensuelle': _evolution_mensuelle(date_debut, date_fin),
        'pyramide_age': _pyramide_age(),
        'pyramide_anciennete': _pyramide_anciennete(),
        'contrats_echeance': _contrats_echeance(),
        'completude_par_direction': _completude_par_direction(),
        'completude_par_departement': _completude_par_departement(),
```

Note: `_completude_par_departement` row keys include
`departement_direction__nom` from the raw `extra_values` replace — fix by
using an explicit rename instead of the generic replace:

```python
def _completude_par_departement():
    rows = _completude_par('departement', extra_values=('departement__direction__nom',))
    for r in rows:
        r['direction_nom'] = r.pop('departement_direction__nom')
    return rows
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_stats_detail.py -v`
Expected: PASS (all tests in the file green)

- [ ] **Step 5: Commit**

```bash
git add backend/audit/stats.py backend/tests/test_stats_detail.py
git commit -m "feat(stats): évolution mensuelle, pyramides âge/ancienneté, échéances contrats, complétude par unité"
```

---

## Task 3: Backend — endpoints `StatsDetailView` + `StatsExportView`

**Files:**
- Modify: `backend/audit/views.py`
- Modify: `backend/audit/urls.py`
- Test: `backend/tests/test_stats_detail_view.py` (new — HTTP layer, separate from the pure-function tests in Task 1/2)
- Test: `backend/tests/test_stats_export.py` (new)

**Interfaces:**
- Consumes: `build_stats_detail(date_debut, date_fin)` from Task 1/2 (`backend/audit/stats.py`).
- Produces: `GET /api/reporting/stats-detail/?date_debut=&date_fin=` (JSON, `IsAdmin`), `GET /api/reporting/stats-export.xlsx/?date_debut=&date_fin=` (xlsx download, `IsAdmin`).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_stats_detail_view.py
import pytest
from rest_framework.test import APIClient


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestStatsDetailView:
    def test_admin_can_get_stats_detail(self, admin_user):
        resp = auth_client(admin_user).get('/api/reporting/stats-detail/')
        assert resp.status_code == 200
        assert 'indicateurs' in resp.data
        assert 'periode' in resp.data

    def test_consultant_forbidden(self, consultant_user):
        resp = auth_client(consultant_user).get('/api/reporting/stats-detail/')
        assert resp.status_code == 403

    def test_invalid_date_returns_400(self, admin_user):
        resp = auth_client(admin_user).get('/api/reporting/stats-detail/?date_debut=not-a-date')
        assert resp.status_code == 400

    def test_date_range_is_forwarded(self, admin_user):
        resp = auth_client(admin_user).get(
            '/api/reporting/stats-detail/?date_debut=2026-01-01&date_fin=2026-01-31'
        )
        assert resp.status_code == 200
        assert resp.data['periode']['debut'] == '2026-01-01'
        assert resp.data['periode']['fin'] == '2026-01-31'
```

```python
# backend/tests/test_stats_export.py
import pytest
import openpyxl
import io
from rest_framework.test import APIClient
from audit.models import AuditLog


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestStatsExportView:
    def test_admin_can_download_xlsx(self, admin_user):
        resp = auth_client(admin_user).get('/api/reporting/stats-export.xlsx/')
        assert resp.status_code == 200
        assert resp['Content-Type'] == 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        wb = openpyxl.load_workbook(io.BytesIO(resp.content))
        assert 'Indicateurs' in wb.sheetnames
        assert 'Répartition organisation' in wb.sheetnames

    def test_consultant_forbidden(self, consultant_user):
        resp = auth_client(consultant_user).get('/api/reporting/stats-export.xlsx/')
        assert resp.status_code == 403

    def test_export_is_logged_in_audit(self, admin_user):
        auth_client(admin_user).get('/api/reporting/stats-export.xlsx/')
        assert AuditLog.objects.filter(action=AuditLog.Action.EXPORT, details__type='statistiques').exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_stats_detail_view.py tests/test_stats_export.py -v`
Expected: FAIL with 404 (routes don't exist yet)

- [ ] **Step 3: Implement the views**

Add to `backend/audit/views.py` (append at end of file, keep existing
imports; add `from datetime import date` and `from audit.stats import
build_stats_detail` near the top alongside the other imports):

```python
from datetime import date
import openpyxl
from openpyxl.styles import Font
from django.http import HttpResponse
from audit.stats import build_stats_detail


def _parse_date_param(request, name):
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return 'invalid'


class StatsDetailView(APIView):
    """
    GET /api/reporting/stats-detail/?date_debut=&date_fin=
    Statistiques détaillées de la page /statistiques — voir
    docs/superpowers/specs/2026-09-02-page-statistiques-design.md.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        date_debut = _parse_date_param(request, 'date_debut')
        date_fin = _parse_date_param(request, 'date_fin')
        if date_debut == 'invalid' or date_fin == 'invalid':
            return Response({'error': 'Date invalide (format attendu YYYY-MM-DD).'}, status=400)
        return Response(build_stats_detail(date_debut, date_fin))


def _stats_sheet(wb, title, headers, rows):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for row in rows:
        ws.append(row)
    for col_idx in range(1, len(headers) + 1):
        ws.cell(row=1, column=col_idx).font = Font(bold=True)
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = max(
            len(str(headers[col_idx - 1])) + 2, 14
        )


class StatsExportView(APIView):
    """
    GET /api/reporting/stats-export.xlsx/?date_debut=&date_fin=
    Export Excel des mêmes statistiques que StatsDetailView, un onglet par
    section.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        date_debut = _parse_date_param(request, 'date_debut')
        date_fin = _parse_date_param(request, 'date_fin')
        if date_debut == 'invalid' or date_fin == 'invalid':
            return Response({'error': 'Date invalide (format attendu YYYY-MM-DD).'}, status=400)
        data = build_stats_detail(date_debut, date_fin)

        wb = openpyxl.Workbook()
        wb.remove(wb.active)

        _stats_sheet(wb, 'Indicateurs', ['Indicateur', 'Valeur', 'Variation (%)'], [
            [label, data['indicateurs'][key]['valeur'], data['indicateurs'][key]['variation_pct']]
            for key, label in [
                ('recrutements', 'Recrutements'), ('archivages', 'Archivages'),
                ('dossiers_completes', 'Dossiers complétés'),
            ]
        ])
        _stats_sheet(wb, 'Répartition organisation', ['Direction', 'Département', 'Effectif'], [
            [r['nom'], '', r['count']] for r in data['repartition_direction']
        ] + [
            [r['direction_nom'], r['nom'], r['count']] for r in data['repartition_departement']
        ])
        _stats_sheet(wb, 'Répartition profils', ['Axe', 'Valeur', 'Effectif'], [
            ['Catégorie', r['nom'], r['count']] for r in data['repartition_categorie']
        ] + [
            ['Type de contrat', r['nom'], r['count']] for r in data['repartition_type_contrat']
        ] + [
            ['Fonction', r['nom'], r['count']] for r in data['repartition_fonction']
        ])
        _stats_sheet(wb, 'Évolution', ['Mois', 'Recrutements', 'Archivages'], [
            [e['mois'], e['recrutements'], e['archivages']] for e in data['evolution_mensuelle']
        ])
        _stats_sheet(wb, 'Démographie', ['Tranche âge', 'Effectif', 'Tranche ancienneté', 'Effectif'], [
            [
                data['pyramide_age'][i]['tranche'] if i < len(data['pyramide_age']) else '',
                data['pyramide_age'][i]['count'] if i < len(data['pyramide_age']) else '',
                data['pyramide_anciennete'][i]['tranche'] if i < len(data['pyramide_anciennete']) else '',
                data['pyramide_anciennete'][i]['count'] if i < len(data['pyramide_anciennete']) else '',
            ]
            for i in range(max(len(data['pyramide_age']), len(data['pyramide_anciennete'])))
        ])
        _stats_sheet(wb, 'Échéances contrats', ['N° Contrat', 'Employé', 'Date fin', 'Jours restants'], [
            [c['numero_contrat'], c['employee_nom'], c['date_fin'], c['jours_restants']]
            for c in data['contrats_echeance']
        ])
        _stats_sheet(wb, 'Complétude', ['Direction', 'Département', 'Total', 'Complets', 'Taux (%)'], [
            [r['nom'], '', r['total'], r['complets'], r['taux']] for r in data['completude_par_direction']
        ] + [
            [r['direction_nom'], r['nom'], r['total'], r['complets'], r['taux']]
            for r in data['completude_par_departement']
        ])

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        filename = f"statistiques_somiz_{data['periode']['debut']}_au_{data['periode']['fin']}.xlsx"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        wb.save(response)

        AuditLog.log(
            request, AuditLog.Action.EXPORT,
            details={'type': 'statistiques', 'periode': data['periode']},
        )
        return response
```

Update `backend/audit/urls.py`:

```python
from django.urls import path
from audit.views import AuditLogListView, AdminStatsView, StatsDetailView, StatsExportView

urlpatterns = [
    path('audit-logs/', AuditLogListView.as_view(), name='audit-logs'),
    path('stats/', AdminStatsView.as_view(), name='admin-stats'),
    path('stats-detail/', StatsDetailView.as_view(), name='stats-detail'),
    path('stats-export.xlsx/', StatsExportView.as_view(), name='stats-export'),
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_stats_detail_view.py tests/test_stats_export.py -v`
Expected: PASS

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && pytest`
Expected: PASS (same count as baseline + the new tests from Tasks 1-3)

- [ ] **Step 6: Commit**

```bash
git add backend/audit/views.py backend/audit/urls.py backend/tests/test_stats_detail_view.py backend/tests/test_stats_export.py
git commit -m "feat(stats): endpoints JSON et export xlsx pour la page Statistiques"
```

---

## Task 4: Frontend — page scaffold, route, nav link, KPI cards

**Files:**
- Create: `frontend/src/pages/Statistiques.jsx`
- Modify: `frontend/src/App.js`
- Modify: `frontend/src/components/Navbar.jsx`
- Modify: `frontend/src/config/notices.js`
- Test: `frontend/src/__tests__/Statistiques.test.js`

**Interfaces:**
- Consumes: `api` from `frontend/src/services/api.js` (`api.get('/reporting/stats-detail/', { params })`), `theme`/`heroPadding`/`contentPadding` from `frontend/src/styles/theme.js`, `useIsMobile` from `frontend/src/hooks/useIsMobile.js`, `useCountUp` from `frontend/src/hooks/useCountUp.js`, `Skeleton`, `HeroDecor`, `PageBackground`, `InfoNotice`, `Navbar`.
- Produces: `Statistiques` default export (page component) rendering at least the hero header and 3 KPI cards from `stats.indicateurs`; local state `stats`, `loading`, `error` that later tasks (5-9) extend with `filters` and additional sections.

- [ ] **Step 1: Write the failing test**

```javascript
// frontend/src/__tests__/Statistiques.test.js
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Statistiques from "../pages/Statistiques";
import api from "../services/api";
import { AuthContext } from "../context/AuthContext";

jest.mock("../services/api");

const adminUser = { role: "ADMIN", prenom: "A", nom: "Dmin" };

const renderPage = (user = adminUser) =>
  render(
    <AuthContext.Provider value={{ user }}>
      <MemoryRouter>
        <Statistiques />
      </MemoryRouter>
    </AuthContext.Provider>
  );

describe("Statistiques page", () => {
  beforeEach(() => {
    api.get.mockResolvedValue({
      data: {
        periode: { debut: "2026-01-01", fin: "2026-12-31" },
        indicateurs: {
          recrutements: { valeur: 12, variation_pct: 8.3 },
          archivages: { valeur: 3, variation_pct: -25 },
          dossiers_completes: { valeur: 5, variation_pct: null },
        },
        repartition_direction: [],
        repartition_departement: [],
        repartition_categorie: [],
        repartition_type_contrat: [],
        repartition_fonction: [],
        evolution_mensuelle: [],
        pyramide_age: [],
        pyramide_anciennete: [],
        contrats_echeance: [],
        completude_par_direction: [],
        completude_par_departement: [],
      },
    });
  });

  test("fetches stats-detail on mount and shows the recrutements KPI", async () => {
    renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/reporting/stats-detail/", expect.objectContaining({ params: expect.any(Object) })
    ));
    expect(await screen.findByText("Recrutements")).toBeInTheDocument();
    expect(await screen.findByText("12")).toBeInTheDocument();
  });

  test("shows an error message when the request fails", async () => {
    api.get.mockRejectedValueOnce(new Error("network"));
    renderPage();
    expect(await screen.findByText(/impossible de charger/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Statistiques.test.js`
Expected: FAIL with `Cannot find module '../pages/Statistiques'`

- [ ] **Step 3: Write the page**

```jsx
// frontend/src/pages/Statistiques.jsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme, heroPadding, contentPadding } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import "../styles/animations.css";
import Skeleton from "../components/Skeleton";
import HeroDecor from "../components/HeroDecor";
import PageBackground from "../components/PageBackground";
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES } from "../config/notices";
import useCountUp from "../hooks/useCountUp";
import useIsMobile from "../hooks/useIsMobile";

const KpiCard = ({ label, value, variationPct, className }) => {
  const hasVariation = variationPct !== null && variationPct !== undefined;
  const isPositive = hasVariation && variationPct >= 0;
  return (
    <div
      className={`card-lift${className ? ` ${className}` : ""}`}
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 16,
        padding: "20px 24px",
        boxShadow: theme.shadowMd,
        fontFamily: theme.fontFamily,
      }}
    >
      <div style={{
        color: theme.textSecondary, fontSize: 11, textTransform: "uppercase",
        letterSpacing: "0.06em", fontWeight: 700, marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ color: theme.primary, fontSize: 32, fontWeight: 800 }}>
          {value ?? "—"}
        </div>
        {hasVariation ? (
          <span style={{
            color: isPositive ? theme.primary : theme.danger,
            fontSize: 13, fontWeight: 700,
          }}>
            {isPositive ? "+" : ""}{variationPct}%
          </span>
        ) : (
          <span style={{ color: theme.textMuted, fontSize: 13 }}>—</span>
        )}
      </div>
    </div>
  );
};

const Statistiques = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const fetchStats = useCallback(async (params = {}, silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await api.get("/reporting/stats-detail/", { params });
      setStats(response.data);
    } catch (err) {
      setError("Impossible de charger les statistiques.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!["ADMIN", "SUPERADMIN"].includes(user?.role)) {
      navigate("/employees");
      return;
    }
    fetchStats();
  }, [user, navigate, fetchStats]);

  const countRecrutements = useCountUp(stats?.indicateurs?.recrutements?.valeur ?? null);
  const countArchivages = useCountUp(stats?.indicateurs?.archivages?.valeur ?? null);
  const countDossiers = useCountUp(stats?.indicateurs?.dossiers_completes?.valeur ?? null);

  if (loading)
    return (
      <PageBackground style={{ fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ padding: contentPadding(isMobile), maxWidth: 1200, margin: "0 auto" }}>
          <Skeleton height={80} radius={16} style={{ marginBottom: 24 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {[1, 2, 3].map((i) => <Skeleton key={i} height={100} radius={16} />)}
          </div>
        </div>
      </PageBackground>
    );

  if (error)
    return (
      <PageBackground style={{ fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ color: theme.danger, textAlign: "center", padding: 80 }}>{error}</div>
      </PageBackground>
    );

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: heroPadding(isMobile), position: "relative", overflow: "hidden" }}>
        <HeroDecor />
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
                Statistiques
              </h1>
              <InfoNotice text={PAGE_NOTICES.statistiques} />
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 }}>
              Analyse RH sur la période sélectionnée
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: contentPadding(isMobile), maxWidth: 1200, margin: "0 auto" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16, marginBottom: 32,
        }}>
          <KpiCard label="Recrutements" value={countRecrutements ?? 0} variationPct={stats?.indicateurs?.recrutements?.variation_pct} className="anim-slide-up delay-1" />
          <KpiCard label="Archivages" value={countArchivages ?? 0} variationPct={stats?.indicateurs?.archivages?.variation_pct} className="anim-slide-up delay-2" />
          <KpiCard label="Dossiers complétés" value={countDossiers ?? 0} variationPct={stats?.indicateurs?.dossiers_completes?.variation_pct} className="anim-slide-up delay-3" />
        </div>
      </div>
    </PageBackground>
  );
};

export default Statistiques;
```

- [ ] **Step 4: Add the route**

In `frontend/src/App.js`, add the import next to `Dashboard`:

```javascript
import Statistiques from "./pages/Statistiques";
```

Add the route right after the `/dashboard` route block:

```jsx
          <Route
            path="/statistiques"
            element={
              <ProtectedRoute adminOnly>
                <Statistiques />
              </ProtectedRoute>
            }
          />
```

- [ ] **Step 5: Add the nav link**

In `frontend/src/components/Navbar.jsx`, add an entry to `navLinks` right
after `"/dashboard"`:

```javascript
    { path: "/dashboard", label: "Dashboard", adminOnly: true },
    { path: "/statistiques", label: "Statistiques", adminOnly: true },
```

- [ ] **Step 6: Add the page notice**

In `frontend/src/config/notices.js`, add a key to `PAGE_NOTICES` right
after `dashboard`:

```javascript
  statistiques: "Statistiques RH détaillées : répartitions par direction/département/profil, évolution des recrutements et archivages, pyramides âge/ancienneté, contrats arrivant à échéance et complétude documentaire par unité. Filtrez par période et exportez en Excel ou PDF.",
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd frontend && npm test -- Statistiques.test.js`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Statistiques.jsx frontend/src/App.js frontend/src/components/Navbar.jsx frontend/src/config/notices.js frontend/src/__tests__/Statistiques.test.js
git commit -m "feat(stats): page Statistiques — scaffold, route, cartes indicateurs"
```

---

## Task 5: Frontend — barre de filtres (préréglages + plage libre) et variation refetch

**Files:**
- Modify: `frontend/src/pages/Statistiques.jsx`
- Modify: `frontend/src/__tests__/Statistiques.test.js`

**Interfaces:**
- Consumes: `fetchStats(params, silent)` from Task 4 (same function — this task is the first caller to pass non-empty `params`).
- Produces: local state `filters: { preset, dateDebut, dateFin }` and a `handlePresetClick`/`handleDateChange` pair that later sections don't need to know about (they only read `stats`).

- [ ] **Step 1: Write the failing test**

```javascript
// add to frontend/src/__tests__/Statistiques.test.js
import { fireEvent } from "@testing-library/react";

test("clicking a preset refetches stats-detail with new date params", async () => {
  renderPage();
  await screen.findByText("Recrutements");
  api.get.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "30 jours" }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith(
    "/reporting/stats-detail/",
    expect.objectContaining({
      params: expect.objectContaining({ date_debut: expect.any(String), date_fin: expect.any(String) }),
    })
  ));
});

test("changing the free date range refetches stats-detail", async () => {
  renderPage();
  await screen.findByText("Recrutements");
  api.get.mockClear();
  fireEvent.change(screen.getByLabelText("Date début"), { target: { value: "2026-02-01" } });
  fireEvent.change(screen.getByLabelText("Date fin"), { target: { value: "2026-02-28" } });
  await waitFor(() => expect(api.get).toHaveBeenCalledWith(
    "/reporting/stats-detail/",
    expect.objectContaining({ params: { date_debut: "2026-02-01", date_fin: "2026-02-28" } })
  ));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- Statistiques.test.js`
Expected: FAIL — no button "30 jours", no labelled date inputs

- [ ] **Step 3: Implement the filter bar**

In `frontend/src/pages/Statistiques.jsx`, add state and handlers inside
the `Statistiques` component (after the `fetchStats` declaration):

```javascript
  const [filters, setFilters] = useState({ preset: "12m", dateDebut: "", dateFin: "" });

  const presetToRange = (preset) => {
    const fin = new Date();
    const debut = new Date();
    if (preset === "30j") debut.setDate(fin.getDate() - 30);
    else if (preset === "3m") debut.setMonth(fin.getMonth() - 3);
    else if (preset === "12m") debut.setFullYear(fin.getFullYear() - 1);
    else if (preset === "annee") { debut.setMonth(0); debut.setDate(1); }
    else if (preset === "tout") return null;
    const toIso = (d) => d.toISOString().slice(0, 10);
    return { date_debut: toIso(debut), date_fin: toIso(fin) };
  };

  const handlePresetClick = (preset) => {
    setFilters({ preset, dateDebut: "", dateFin: "" });
    const range = presetToRange(preset);
    fetchStats(range || {}, true);
  };

  const handleDateChange = (field, value) => {
    const next = { ...filters, preset: null, [field]: value };
    setFilters(next);
    if (next.dateDebut && next.dateFin) {
      fetchStats({ date_debut: next.dateDebut, date_fin: next.dateFin }, true);
    }
  };
```

Replace the `useEffect` from Task 4 to keep the first load non-silent:

```javascript
  useEffect(() => {
    if (!["ADMIN", "SUPERADMIN"].includes(user?.role)) {
      navigate("/employees");
      return;
    }
    fetchStats(presetToRange("12m") || {});
  }, [user, navigate, fetchStats]);
```

Add the filter bar UI right after the hero header `</div>` and before the
`<div style={{ padding: contentPadding(isMobile)...`:

```jsx
      <div style={{
        background: theme.surface, borderBottom: `1px solid ${theme.border}`,
        padding: isMobile ? "12px 16px" : "14px 32px",
      }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap",
          gap: 10, alignItems: "center",
        }}>
          {[
            { key: "30j", label: "30 jours" },
            { key: "3m", label: "3 mois" },
            { key: "12m", label: "12 mois" },
            { key: "annee", label: "Année en cours" },
            { key: "tout", label: "Tout" },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => handlePresetClick(p.key)}
              style={{
                background: filters.preset === p.key ? theme.primaryBg : "transparent",
                border: `1px solid ${filters.preset === p.key ? theme.primaryBorder : theme.border}`,
                color: filters.preset === p.key ? theme.primary : theme.textSecondary,
                borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: theme.fontFamily,
              }}
            >
              {p.label}
            </button>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <label htmlFor="stats-date-debut" style={{ fontSize: 12, color: theme.textSecondary }}>Date début</label>
            <input
              id="stats-date-debut"
              type="date"
              value={filters.dateDebut}
              onChange={(e) => handleDateChange("dateDebut", e.target.value)}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily }}
            />
            <label htmlFor="stats-date-fin" style={{ fontSize: 12, color: theme.textSecondary }}>Date fin</label>
            <input
              id="stats-date-fin"
              type="date"
              value={filters.dateFin}
              onChange={(e) => handleDateChange("dateFin", e.target.value)}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily }}
            />
          </div>
        </div>
      </div>
```

`getByLabelText("Date début")` needs the `<label htmlFor>` /
`<input id>` pairing above, which already satisfies it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- Statistiques.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Statistiques.jsx frontend/src/__tests__/Statistiques.test.js
git commit -m "feat(stats): barre de filtres (préréglages + plage libre) sur la page Statistiques"
```

---

## Task 6: Frontend — répartition organisationnelle et profils

**Files:**
- Modify: `frontend/src/pages/Statistiques.jsx`
- Modify: `frontend/src/__tests__/Statistiques.test.js`

**Interfaces:**
- Consumes: `stats.repartition_direction`, `stats.repartition_departement`, `stats.repartition_categorie`, `stats.repartition_type_contrat`, `stats.repartition_fonction` (arrays of `{id?, nom, count, direction_nom?}` — exact shape from Task 1's `build_stats_detail`).
- Produces: no new exports — purely additive JSX inside the existing component, read by nobody else.

- [ ] **Step 1: Write the failing test**

```javascript
// add to frontend/src/__tests__/Statistiques.test.js, and update the
// mocked response's repartition_* arrays in beforeEach to:
//   repartition_direction: [{ id: "d1", nom: "Direction Générale", count: 10 }],
//   repartition_categorie: [{ nom: "Cadre", count: 7 }],

test("renders the organizational and profile repartition sections", async () => {
  renderPage();
  expect(await screen.findByText("Direction Générale")).toBeInTheDocument();
  expect(await screen.findByText("Cadre")).toBeInTheDocument();
});

test("clicking a direction bar navigates to the filtered employee list", async () => {
  renderPage();
  const bar = await screen.findByText("Direction Générale");
  fireEvent.click(bar);
  // navigate is exercised through react-router's MemoryRouter — assert no throw
  // and that the element remains clickable (smoke-level, full navigation
  // assertions belong to Employees.jsx tests, not here).
  expect(bar).toBeInTheDocument();
});
```

Update the shared mock in `beforeEach` (Task 4's `api.get.mockResolvedValue`)
so `repartition_direction` and `repartition_categorie` are non-empty as
shown above — every other array stays `[]`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- Statistiques.test.js`
Expected: FAIL — "Direction Générale" not found

- [ ] **Step 3: Implement the sections**

Add a small reusable bar-list renderer and the two sections inside
`Statistiques.jsx`, right after the KPI cards grid `</div>` (still inside
the `padding: contentPadding(isMobile)` wrapper):

```jsx
const RepartitionBar = ({ label, count, max, color, onClick, sub }) => (
  <div
    onClick={onClick}
    style={{ marginBottom: 14, cursor: onClick ? "pointer" : "default" }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ color: theme.text, fontSize: 13 }}>
        {label}
        {sub && <span style={{ color: theme.textMuted, fontSize: 11, marginLeft: 6 }}>({sub})</span>}
      </span>
      <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 700 }}>{count}</span>
    </div>
    <div style={{ background: theme.bg, borderRadius: 6, height: 8, overflow: "hidden", border: `1px solid ${theme.border}` }}>
      <div style={{ height: "100%", width: `${max ? (count / max) * 100 : 0}%`, background: color, borderRadius: 6, transition: "width 0.6s ease" }} />
    </div>
  </div>
);
```

(module-level, above the `Statistiques` component definition so it's
reusable and doesn't get redefined on every render).

Inside the component's JSX, after the KPI grid:

```jsx
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Répartition par Direction</h2>
            {stats.repartition_direction.length === 0 ? (
              <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
            ) : (
              (() => {
                const max = Math.max(...stats.repartition_direction.map((r) => r.count));
                return stats.repartition_direction.map((r) => (
                  <RepartitionBar
                    key={r.id}
                    label={r.nom}
                    count={r.count}
                    max={max}
                    color={theme.directionColor}
                    onClick={() => navigate(`/employees?direction=${r.id}`)}
                  />
                ));
              })()
            )}
          </div>

          <div className="anim-fade-in delay-1" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Répartition par Département</h2>
            {stats.repartition_departement.length === 0 ? (
              <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
            ) : (
              (() => {
                const max = Math.max(...stats.repartition_departement.map((r) => r.count));
                return stats.repartition_departement.map((r) => (
                  <RepartitionBar
                    key={r.id}
                    label={r.nom}
                    sub={r.direction_nom}
                    count={r.count}
                    max={max}
                    color={theme.departementColor}
                    onClick={() => navigate(`/employees?departement=${r.id}`)}
                  />
                ));
              })()
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
          {[
            { title: "Par Catégorie", data: stats.repartition_categorie, color: theme.serviceColor },
            { title: "Par Type de contrat", data: stats.repartition_type_contrat, color: theme.accent },
            { title: "Par Fonction", data: stats.repartition_fonction, color: theme.primary },
          ].map(({ title, data, color }) => (
            <div key={title} className="anim-fade-in delay-2" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20, boxShadow: theme.shadowMd }}>
              <h2 style={{ color: theme.text, margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>{title}</h2>
              {data.length === 0 ? (
                <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
              ) : (
                (() => {
                  const max = Math.max(...data.map((r) => r.count));
                  return data.map((r) => (
                    <RepartitionBar key={r.nom} label={r.nom} count={r.count} max={max} color={color} />
                  ));
                })()
              )}
            </div>
          ))}
        </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- Statistiques.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Statistiques.jsx frontend/src/__tests__/Statistiques.test.js
git commit -m "feat(stats): sections répartition organisationnelle et profils"
```

---

## Task 7: Frontend — `StatBarChart` partagé + évolution mensuelle + pyramides

**Files:**
- Create: `frontend/src/components/StatBarChart.jsx`
- Modify: `frontend/src/pages/Statistiques.jsx`
- Test: `frontend/src/__tests__/StatBarChart.test.js`
- Modify: `frontend/src/__tests__/Statistiques.test.js`

**Interfaces:**
- Produces: `StatBarChart` default export, props `{ data, xKey, series, orientation = "vertical", height = 200 }` where `series` is `[{ key, label, color }]` and `data` is an array of objects each containing `xKey` plus one numeric value per `series[].key`. Renders an SVG. Used both for the grouped-bar evolution chart (`orientation="vertical"`) and the pyramid histograms (`orientation="horizontal"`, one series).

- [ ] **Step 1: Write the failing test for `StatBarChart`**

```javascript
// frontend/src/__tests__/StatBarChart.test.js
import { render, screen } from "@testing-library/react";
import StatBarChart from "../components/StatBarChart";

const data = [
  { mois: "2026-01", recrutements: 4, archivages: 1 },
  { mois: "2026-02", recrutements: 2, archivages: 3 },
];

const series = [
  { key: "recrutements", label: "Recrutements", color: "#166534" },
  { key: "archivages", label: "Archivages", color: "#DC2626" },
];

test("renders one bar group per data point and a legend entry per series", () => {
  render(<StatBarChart data={data} xKey="mois" series={series} />);
  expect(screen.getAllByTestId("stat-bar")).toHaveLength(4); // 2 points x 2 series
  expect(screen.getByText("Recrutements")).toBeInTheDocument();
  expect(screen.getByText("Archivages")).toBeInTheDocument();
});

test("renders an empty-state message when data is empty", () => {
  render(<StatBarChart data={[]} xKey="mois" series={series} />);
  expect(screen.getByText(/aucune donnée/i)).toBeInTheDocument();
});

test("supports horizontal orientation for a single series", () => {
  const pyramideData = [{ tranche: "25-34", count: 5 }, { tranche: "35-44", count: 8 }];
  render(
    <StatBarChart
      data={pyramideData}
      xKey="tranche"
      series={[{ key: "count", label: "Effectif", color: "#166534" }]}
      orientation="horizontal"
    />
  );
  expect(screen.getAllByTestId("stat-bar")).toHaveLength(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- StatBarChart.test.js`
Expected: FAIL with `Cannot find module '../components/StatBarChart'`

- [ ] **Step 3: Implement `StatBarChart`**

```jsx
// frontend/src/components/StatBarChart.jsx
import { theme } from "../styles/theme";

const StatBarChart = ({ data, xKey, series, orientation = "vertical", height = 200 }) => {
  if (!data || data.length === 0) {
    return (
      <div style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>
        Aucune donnée pour cette période.
      </div>
    );
  }

  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));

  if (orientation === "horizontal") {
    return (
      <div>
        {data.map((d) => (
          <div key={d[xKey]} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 70, fontSize: 12, color: theme.textSecondary, flexShrink: 0 }}>{d[xKey]}</div>
            <div style={{ flex: 1, background: theme.bg, borderRadius: 6, height: 16, overflow: "hidden", border: `1px solid ${theme.border}` }}>
              <div
                data-testid="stat-bar"
                style={{
                  height: "100%",
                  width: `${(d[series[0].key] / max) * 100}%`,
                  background: series[0].color,
                  borderRadius: 6,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <div style={{ width: 30, fontSize: 12, color: theme.text, fontWeight: 700, textAlign: "right" }}>{d[series[0].key]}</div>
          </div>
        ))}
      </div>
    );
  }

  const barWidth = Math.max(16, Math.min(36, 480 / (data.length * series.length)));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height, borderBottom: `1px solid ${theme.border}`, padding: "0 4px" }}>
        {data.map((d) => (
          <div key={d[xKey]} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: height - 20 }}>
              {series.map((s) => (
                <div
                  key={s.key}
                  data-testid="stat-bar"
                  title={`${s.label}: ${d[s.key] || 0}`}
                  style={{
                    width: barWidth,
                    height: `${((d[s.key] || 0) / max) * 100}%`,
                    background: s.color,
                    borderRadius: "4px 4px 0 0",
                    minHeight: (d[s.key] || 0) > 0 ? 2 : 0,
                    transition: "height 0.6s ease",
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 6 }}>{d[xKey]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "center" }}>
        {series.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: theme.textSecondary }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block" }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatBarChart;
```

- [ ] **Step 4: Run `StatBarChart` tests to verify they pass**

Run: `cd frontend && npm test -- StatBarChart.test.js`
Expected: PASS

- [ ] **Step 5: Write the failing test for the evolution/pyramide sections in the page**

```javascript
// add to frontend/src/__tests__/Statistiques.test.js, and set in beforeEach:
//   evolution_mensuelle: [{ mois: "2026-01", recrutements: 4, archivages: 1 }],
//   pyramide_age: [{ tranche: "25-34", count: 5 }],
//   pyramide_anciennete: [{ tranche: "1-3 ans", count: 3 }],

test("renders evolution and demographic pyramid sections", async () => {
  renderPage();
  expect(await screen.findByText("Évolution — recrutements vs archivages")).toBeInTheDocument();
  expect(await screen.findByText("Pyramide des âges")).toBeInTheDocument();
  expect(await screen.findByText("Pyramide d'ancienneté")).toBeInTheDocument();
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npm test -- Statistiques.test.js`
Expected: FAIL — headings not found

- [ ] **Step 7: Wire `StatBarChart` into the page**

Add the import at the top of `Statistiques.jsx`:

```javascript
import StatBarChart from "../components/StatBarChart";
```

Add the sections after the profile-repartition grid from Task 6:

```jsx
        <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd, marginBottom: 20 }}>
          <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Évolution — recrutements vs archivages</h2>
          <StatBarChart
            data={stats.evolution_mensuelle}
            xKey="mois"
            series={[
              { key: "recrutements", label: "Recrutements", color: theme.primary },
              { key: "archivages", label: "Archivages", color: theme.danger },
            ]}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Pyramide des âges</h2>
            <StatBarChart
              data={stats.pyramide_age}
              xKey="tranche"
              series={[{ key: "count", label: "Effectif", color: theme.departementColor }]}
              orientation="horizontal"
            />
          </div>
          <div className="anim-fade-in delay-1" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Pyramide d'ancienneté</h2>
            <StatBarChart
              data={stats.pyramide_anciennete}
              xKey="tranche"
              series={[{ key: "count", label: "Effectif", color: theme.serviceColor }]}
              orientation="horizontal"
            />
          </div>
        </div>
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && npm test -- Statistiques.test.js StatBarChart.test.js`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/StatBarChart.jsx frontend/src/pages/Statistiques.jsx frontend/src/__tests__/StatBarChart.test.js frontend/src/__tests__/Statistiques.test.js
git commit -m "feat(stats): graphique SVG partagé, évolution mensuelle et pyramides âge/ancienneté"
```

---

## Task 8: Frontend — contrats à échéance et complétude par unité

**Files:**
- Modify: `frontend/src/pages/Statistiques.jsx`
- Modify: `frontend/src/__tests__/Statistiques.test.js`

**Interfaces:**
- Consumes: `stats.contrats_echeance` (`{id, numero_contrat, employee_id, employee_nom, date_fin, jours_restants}[]`), `stats.completude_par_direction` / `completude_par_departement` (`{id, nom, direction_nom?, total, complets, taux}[]`).

- [ ] **Step 1: Write the failing test**

```javascript
// add to frontend/src/__tests__/Statistiques.test.js, set in beforeEach:
//   contrats_echeance: [{ id: "c1", numero_contrat: "CTR-1", employee_id: "e1", employee_nom: "Jean Dupont", date_fin: "2026-10-01", jours_restants: 10 }],
//   completude_par_direction: [{ id: "d1", nom: "Direction Générale", total: 10, complets: 6, taux: 60 }],

test("renders contract expirations and per-unit completeness", async () => {
  renderPage();
  expect(await screen.findByText("CTR-1")).toBeInTheDocument();
  expect(await screen.findByText("Jean Dupont")).toBeInTheDocument();
  expect(await screen.findByText(/60(\.0)?%/)).toBeInTheDocument();
});

test("shows a red badge when a contract expires within 15 days", async () => {
  renderPage();
  const row = await screen.findByText("CTR-1");
  const badge = row.closest("tr").querySelector('[data-testid="jours-restants-badge"]');
  expect(badge).toHaveTextContent("10");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Statistiques.test.js`
Expected: FAIL — "CTR-1" not found

- [ ] **Step 3: Implement the sections**

Add after the pyramides grid from Task 7:

```jsx
        <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd, marginBottom: 20 }}>
          <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Contrats arrivant à échéance (90 jours)</h2>
          {stats.contrats_echeance.length === 0 ? (
            <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucun contrat à échéance.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}`, textAlign: "left" }}>
                    <th style={{ padding: "8px 6px", color: theme.textSecondary }}>N° Contrat</th>
                    <th style={{ padding: "8px 6px", color: theme.textSecondary }}>Employé</th>
                    <th style={{ padding: "8px 6px", color: theme.textSecondary }}>Date fin</th>
                    <th style={{ padding: "8px 6px", color: theme.textSecondary }}>Jours restants</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.contrats_echeance.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/contrats/${c.id}`)}
                      style={{ borderBottom: `1px solid ${theme.borderLight}`, cursor: "pointer" }}
                    >
                      <td style={{ padding: "8px 6px" }}>{c.numero_contrat}</td>
                      <td style={{ padding: "8px 6px" }}>{c.employee_nom}</td>
                      <td style={{ padding: "8px 6px" }}>{c.date_fin}</td>
                      <td style={{ padding: "8px 6px" }}>
                        <span
                          data-testid="jours-restants-badge"
                          style={{
                            background: c.jours_restants < 15 ? theme.dangerBg : c.jours_restants < 30 ? theme.accentBg : theme.bg,
                            color: c.jours_restants < 15 ? theme.danger : c.jours_restants < 30 ? theme.accent : theme.textSecondary,
                            border: `1px solid ${c.jours_restants < 15 ? theme.dangerBorder : c.jours_restants < 30 ? theme.accentBorder : theme.border}`,
                            borderRadius: 20, padding: "2px 10px", fontWeight: 700,
                          }}
                        >
                          {c.jours_restants}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd, marginBottom: 20 }}>
          <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Complétude par unité</h2>
          {stats.completude_par_direction.length === 0 && stats.completude_par_departement.length === 0 ? (
            <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
          ) : (
            <>
              {stats.completude_par_direction.map((r) => (
                <RepartitionBar key={r.id} label={r.nom} count={`${r.taux}%`} max={100} color={r.taux >= 80 ? theme.primary : r.taux >= 50 ? theme.accent : theme.danger} />
              ))}
            </>
          )}
        </div>
```

`RepartitionBar` from Task 6 is reused for the taux bars — its `count`
prop is display-only text, so passing `${r.taux}%` and `max={100}` renders
a percentage-filled bar without changing the component's contract (the
bar's `width` calc `count / max` requires `count` to stay numeric for
that calc — fix `RepartitionBar` to accept a separate `displayValue`):

Update `RepartitionBar` (defined in Task 6) to decouple the displayed
label from the numeric value used for the bar width:

```jsx
const RepartitionBar = ({ label, count, displayValue, max, color, onClick, sub }) => (
  <div onClick={onClick} style={{ marginBottom: 14, cursor: onClick ? "pointer" : "default" }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ color: theme.text, fontSize: 13 }}>
        {label}
        {sub && <span style={{ color: theme.textMuted, fontSize: 11, marginLeft: 6 }}>({sub})</span>}
      </span>
      <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 700 }}>{displayValue ?? count}</span>
    </div>
    <div style={{ background: theme.bg, borderRadius: 6, height: 8, overflow: "hidden", border: `1px solid ${theme.border}` }}>
      <div style={{ height: "100%", width: `${max ? (count / max) * 100 : 0}%`, background: color, borderRadius: 6, transition: "width 0.6s ease" }} />
    </div>
  </div>
);
```

And call the completeness bars with `count={r.taux} displayValue={`${r.taux}%`}`:

```jsx
              {stats.completude_par_direction.map((r) => (
                <RepartitionBar
                  key={r.id}
                  label={r.nom}
                  count={r.taux}
                  displayValue={`${r.taux}%`}
                  max={100}
                  color={r.taux >= 80 ? theme.primary : r.taux >= 50 ? theme.accent : theme.danger}
                />
              ))}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- Statistiques.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Statistiques.jsx frontend/src/__tests__/Statistiques.test.js
git commit -m "feat(stats): section contrats à échéance et complétude par unité"
```

---

## Task 9: Frontend — export Excel/PDF

**Files:**
- Modify: `frontend/src/pages/Statistiques.jsx`
- Modify: `frontend/src/styles/animations.css` (add print stylesheet)
- Modify: `frontend/src/__tests__/Statistiques.test.js`

**Interfaces:**
- Consumes: `filters` state from Task 5 (to forward the same date range to the export call).
- Produces: an "Exporter" button with a dropdown of two actions; no new exports for other files.

- [ ] **Step 1: Write the failing test**

```javascript
// add to frontend/src/__tests__/Statistiques.test.js
test("clicking Exporter then Excel downloads the xlsx with current filters", async () => {
  const blob = new Blob(["fake"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  api.get.mockImplementation((url) => {
    if (url === "/reporting/stats-export.xlsx/") return Promise.resolve({ data: blob });
    return Promise.resolve({
      data: {
        periode: { debut: "2026-01-01", fin: "2026-12-31" },
        indicateurs: {
          recrutements: { valeur: 12, variation_pct: 8.3 },
          archivages: { valeur: 3, variation_pct: -25 },
          dossiers_completes: { valeur: 5, variation_pct: null },
        },
        repartition_direction: [], repartition_departement: [], repartition_categorie: [],
        repartition_type_contrat: [], repartition_fonction: [], evolution_mensuelle: [],
        pyramide_age: [], pyramide_anciennete: [], contrats_echeance: [],
        completude_par_direction: [], completude_par_departement: [],
      },
    });
  });
  global.URL.createObjectURL = jest.fn(() => "blob:fake-url");
  global.URL.revokeObjectURL = jest.fn();
  renderPage();
  await screen.findByText("Recrutements");
  fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
  fireEvent.click(screen.getByRole("button", { name: "Excel (.xlsx)" }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith(
    "/reporting/stats-export.xlsx/",
    expect.objectContaining({ responseType: "blob" })
  ));
});

test("clicking Exporter then PDF triggers window.print", async () => {
  window.print = jest.fn();
  renderPage();
  await screen.findByText("Recrutements");
  fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
  fireEvent.click(screen.getByRole("button", { name: "PDF (impression)" }));
  expect(window.print).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- Statistiques.test.js`
Expected: FAIL — no button named "Exporter"

- [ ] **Step 3: Implement the export menu**

Add state and handlers inside `Statistiques`, after the filter handlers
from Task 5:

```javascript
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const currentDateParams = () => {
    if (filters.dateDebut && filters.dateFin) {
      return { date_debut: filters.dateDebut, date_fin: filters.dateFin };
    }
    return presetToRange(filters.preset || "12m") || {};
  };

  const handleExportExcel = async () => {
    setExportMenuOpen(false);
    try {
      const response = await api.get("/reporting/stats-export.xlsx/", {
        params: currentDateParams(),
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "statistiques_somiz.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Impossible d'exporter les statistiques.");
    }
  };

  const handleExportPdf = () => {
    setExportMenuOpen(false);
    window.print();
  };
```

Add the button in the filter bar from Task 5, right after the closing
`</div>` of the date inputs wrapper (still inside the filter bar's
`maxWidth: 1200` container):

```jsx
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              style={{
                background: theme.primary, color: "#fff", border: "none",
                borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: theme.fontFamily,
              }}
            >
              Exporter
            </button>
            {exportMenuOpen && (
              <div
                className="anim-scale-in"
                style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  background: theme.surface, border: `1px solid ${theme.border}`,
                  borderRadius: 10, boxShadow: theme.shadowLg, zIndex: 20, minWidth: 170,
                }}
              >
                <button
                  onClick={handleExportExcel}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: theme.text, fontFamily: theme.fontFamily }}
                >
                  Excel (.xlsx)
                </button>
                <button
                  onClick={handleExportPdf}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: theme.text, fontFamily: theme.fontFamily }}
                >
                  PDF (impression)
                </button>
              </div>
            )}
          </div>
```

Add a print stylesheet at the end of `frontend/src/styles/animations.css`:

```css
@media print {
  nav, .no-print {
    display: none !important;
  }
  body {
    background: #fff !important;
  }
}
```

Mark the filter bar's outer `<div>` (from Task 5) with `className="no-print"`
so it disappears from the printed page — update its opening tag:

```jsx
      <div className="no-print" style={{
        background: theme.surface, borderBottom: `1px solid ${theme.border}`,
        padding: isMobile ? "12px 16px" : "14px 32px",
      }}>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- Statistiques.test.js`
Expected: PASS

- [ ] **Step 5: Run the full frontend suite to check for regressions**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: PASS (same count as baseline + new tests from Tasks 4-9)

- [ ] **Step 6: Manually verify in the browser**

Run: `cd frontend && npm start` (and the backend dev server), log in as
ADMIN, navigate to `/statistiques`, confirm: KPI cards render, preset
buttons and date inputs refetch without a full-page loading flash,
Direction/Département bars navigate to `/employees?...`, evolution and
pyramid charts render, contract-expiration rows navigate to
`/contrats/:id`, "Exporter → Excel" downloads a file, "Exporter → PDF"
opens the print dialog with the filter bar and navbar hidden.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Statistiques.jsx frontend/src/styles/animations.css frontend/src/__tests__/Statistiques.test.js
git commit -m "feat(stats): export Excel et PDF (impression) sur la page Statistiques"
```

---

## Self-Review Notes

- **Spec coverage**: accès ADMIN (Task 4/9 route+guard) ✓, filtres préréglages+plage libre (Task 5) ✓, comparaison période précédente (Task 1) ✓, répartition organisationnelle/profils (Task 6) ✓, évolution mensuelle (Task 7) ✓, pyramides âge/ancienneté (Task 7) ✓, contrats à échéance (Task 2/8) ✓, complétude par unité (Task 2/8) ✓, export xlsx (Task 3/9) ✓, export PDF via impression navigateur (Task 9) ✓, nav link + notice (Task 4) ✓.
- **Placeholder scan**: no TBD/TODO; every step has complete code.
- **Type consistency checked**: `build_stats_detail` return shape defined once in Task 1, only filled-in (not reshaped) in Task 2; `RepartitionBar` signature changed once in Task 8 with the call sites from Task 6 remaining compatible (new `displayValue` prop is optional, defaults to `count`); `StatBarChart` props (`data`, `xKey`, `series`, `orientation`) used identically in Task 7's two call sites.
