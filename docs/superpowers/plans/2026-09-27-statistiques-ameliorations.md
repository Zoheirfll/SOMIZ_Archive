# Statistiques — Améliorations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Améliorer la page `/statistiques` de SOMIZ sur 4 axes : recherche dans les donuts (+ suppression du plafond Top 10 "Par Fonction"), seuil réglable pour "Contrats arrivant à échéance", drill-down cliquable sur la complétude par Direction/Département, et liens de preuve précis (par catégorie d'action) sur "Mon activité" / "Activité par administrateur".

**Architecture:** Aucun changement de modèle de données. Backend : `audit/stats.py` (logique pure) perd son plafond `TOP_FONCTIONS` et gagne un paramètre `echeance_jours` ; `audit/views.py` expose ce paramètre sur `StatsDetailView`/`StatsExportView` et ajoute un filtre `?categorie=` à `AuditLogListView`, réutilisant `_categorize_emp_log` déjà écrit pour "Mon activité" (une seule source de vérité de classification). Frontend : `StatDonutChart.jsx` gagne une recherche interne ; `Statistiques.jsx` gagne un contrôle de seuil, des liens de navigation sur les barres/tuiles existantes, et transmet `categorie` dans ses liens vers `/audit` ; `AuditLogs.jsx` lit ce paramètre au même titre que `user`/`date_debut`/`date_fin` déjà supportés.

**Tech Stack:** Django REST Framework (backend), React 19 + Recharts (frontend), pytest (backend), Jest + React Testing Library (frontend).

## Global Constraints

- Styles 100% inline avec les tokens `theme` (`frontend/src/styles/theme.js`) — jamais de hex codé en dur.
- Pas de `window.confirm`/`window.prompt` — non concerné par ce chantier (aucune action destructive ajoutée).
- Les statistiques principales restent organisation-wide pour ADMIN et SUPERADMIN — ce chantier ne touche pas au scoping CONSULTANT.
- Toute nouvelle route/paramètre API respecte les permissions existantes (`IsAdmin` sur `AuditLogListView`/`StatsDetailView`/`StatsExportView` — inchangé).
- Backend : lancer `cd backend && pytest` après les tâches touchant `audit`/`employees`. Frontend : `cd frontend && npm test -- --watchAll=false <fichier>`.

---

## Task 1 : Backend — suppression du plafond Top 10 sur "Par Fonction"

**Files:**
- Modify: `backend/audit/stats.py:35` (suppression `TOP_FONCTIONS`), `backend/audit/stats.py:126-132` (suppression `_repartition_fonction`), `backend/audit/stats.py:439` (appel direct à `_repartition_simple`)
- Test: `backend/tests/test_stats_detail.py:98-107` (remplacement du test existant)

**Interfaces:**
- Consumes: `_repartition_simple(field_nom)` (déjà existant, `backend/audit/stats.py:113-123`) — inchangé.
- Produces: `build_stats_detail(...)['repartition_fonction']` renvoie désormais TOUTES les fonctions (plus de clé `'Autres'` possible) — les tâches frontend consomment cette même clé sans changement de forme (liste de `{nom, count}`).

- [ ] **Step 1: Écrire le test qui remplace l'ancien plafond**

Dans `backend/tests/test_stats_detail.py`, remplacer la méthode
`test_repartition_fonction_caps_at_top_10_plus_autres` (lignes 98-107) par :

```python
    def test_repartition_fonction_lists_all_without_cap(self, direction, departement):
        from employees.models import Poste
        for i in range(12):
            poste = Poste.objects.create(nom=f"Poste {i}")
            _make_employee(
                direction=direction, departement=departement, statut='actif', poste=poste,
                matricule=f"EMP-F{i:03d}",
            )
        result = build_stats_detail(None, None)
        assert len(result['repartition_fonction']) == 12
        assert not any(r['nom'] == 'Autres' for r in result['repartition_fonction'])
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd backend && pytest tests/test_stats_detail.py::TestBuildStatsDetailRepartitions::test_repartition_fonction_lists_all_without_cap -v`
Expected: FAIL (assert 11 == 12, à cause du plafond actuel + "Autres")

- [ ] **Step 3: Supprimer le plafond dans `audit/stats.py`**

Supprimer la ligne 35 :
```python
TOP_FONCTIONS = 10
```

Supprimer entièrement les lignes 126-132 :
```python
def _repartition_fonction():
    full = _repartition_simple('poste__nom')
    if len(full) <= TOP_FONCTIONS:
        return full
    top = full[:TOP_FONCTIONS]
    autres_count = sum(r['count'] for r in full[TOP_FONCTIONS:])
    return top + [{'nom': 'Autres', 'count': autres_count}]
```

Dans `build_stats_detail()` (ligne 439), remplacer :
```python
        'repartition_fonction': _repartition_fonction(),
```
par :
```python
        'repartition_fonction': _repartition_simple('poste__nom'),
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd backend && pytest tests/test_stats_detail.py -v`
Expected: PASS (tous les tests du fichier, y compris le nouveau)

- [ ] **Step 5: Commit**

```bash
git add backend/audit/stats.py backend/tests/test_stats_detail.py
git commit -m "feat(statistiques): supprime le plafond Top 10 sur la répartition par Fonction"
```

---

## Task 2 : Backend — seuil réglable pour "Contrats arrivant à échéance"

**Files:**
- Modify: `backend/audit/stats.py:229-245` (`_contrats_echeance`), `backend/audit/stats.py:421-453` (`build_stats_detail`)
- Modify: `backend/audit/views.py:184-211` (`_parse_date_param`, `StatsDetailView.get`), `backend/audit/views.py:234-247` (`StatsExportView.get`)
- Test: `backend/tests/test_stats_detail.py` (ajout dans `TestBuildStatsDetailEcheances`), `backend/tests/test_stats_detail_view.py` (ajout, nouveaux imports)

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `build_stats_detail(date_debut, date_fin, requesting_user=None, echeance_jours=90)` — nouveau paramètre nommé, avec défaut `90` (comportement inchangé si omis). `GET /api/reporting/stats-detail/?echeance_jours=<int>` et `GET /api/reporting/stats-export.xlsx/?echeance_jours=<int>` — entier 1-365, sinon 400 `{'error': 'Paramètre invalide.'}`.

- [ ] **Step 1: Écrire le test backend du seuil personnalisé**

Ajouter dans `backend/tests/test_stats_detail.py`, dans la classe `TestBuildStatsDetailEcheances` :

```python
    def test_contrats_echeance_respects_custom_jours(self, direction, departement, type_contrat, admin_user):
        today = timezone.localdate()
        emp = _make_employee(direction=direction, departement=departement, statut='actif')
        Contrat.objects.create(
            numero_contrat='CTR-ECH-4', employee=emp, type_contrat=type_contrat,
            date_debut=today - timedelta(days=300), date_fin=today + timedelta(days=95),
            statut='actif', created_by=admin_user,
        )
        result_default = build_stats_detail(None, None)
        assert 'CTR-ECH-4' not in [c['numero_contrat'] for c in result_default['contrats_echeance']]
        result_120 = build_stats_detail(None, None, echeance_jours=120)
        assert 'CTR-ECH-4' in [c['numero_contrat'] for c in result_120['contrats_echeance']]
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd backend && pytest tests/test_stats_detail.py::TestBuildStatsDetailEcheances::test_contrats_echeance_respects_custom_jours -v`
Expected: FAIL avec `TypeError: build_stats_detail() got an unexpected keyword argument 'echeance_jours'`

- [ ] **Step 3: Ajouter le paramètre dans `audit/stats.py`**

Remplacer la fonction `_contrats_echeance()` (lignes 229-245) :

```python
def _contrats_echeance(jours=90):
    today = timezone.localdate()
    limite = today + timedelta(days=jours)
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
```

Dans `build_stats_detail()`, changer la signature (ligne 421) :
```python
def build_stats_detail(date_debut, date_fin, requesting_user=None, echeance_jours=90):
```

Et la ligne 443 :
```python
        'contrats_echeance': _contrats_echeance(echeance_jours),
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd backend && pytest tests/test_stats_detail.py -v`
Expected: PASS

- [ ] **Step 5: Écrire les tests de la vue HTTP**

Ajouter en tête de `backend/tests/test_stats_detail_view.py` (après les imports existants) :
```python
from datetime import timedelta
from employees.models import Contrat
```

Ajouter dans `TestStatsDetailView` :
```python
    def test_echeance_jours_param_is_forwarded(self, admin_user, direction, departement, type_contrat):
        today = timezone.localdate()
        emp = Employee.objects.create(
            matricule="EMP-ECH1", nom="Test", prenom="X",
            direction=direction, departement=departement, statut='actif', created_by=admin_user,
        )
        Contrat.objects.create(
            numero_contrat='CTR-ECH-V1', employee=emp, type_contrat=type_contrat,
            date_debut=today - timedelta(days=300), date_fin=today + timedelta(days=100),
            statut='actif', created_by=admin_user,
        )
        resp_default = auth_client(admin_user).get('/api/reporting/stats-detail/')
        assert 'CTR-ECH-V1' not in [c['numero_contrat'] for c in resp_default.data['contrats_echeance']]
        resp_120 = auth_client(admin_user).get('/api/reporting/stats-detail/?echeance_jours=120')
        assert 'CTR-ECH-V1' in [c['numero_contrat'] for c in resp_120.data['contrats_echeance']]

    def test_invalid_echeance_jours_returns_400(self, admin_user):
        resp = auth_client(admin_user).get('/api/reporting/stats-detail/?echeance_jours=abc')
        assert resp.status_code == 400
        resp2 = auth_client(admin_user).get('/api/reporting/stats-detail/?echeance_jours=9999')
        assert resp2.status_code == 400
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd backend && pytest tests/test_stats_detail_view.py -v`
Expected: FAIL sur les deux nouveaux tests (le paramètre n'est pas encore lu par la vue)

- [ ] **Step 7: Brancher le paramètre dans `audit/views.py`**

Remplacer `_parse_date_param` et l'ajout d'une nouvelle fonction juste après (lignes 184-192) :

```python
def _parse_date_param(request, name):
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return 'invalid'


def _parse_echeance_jours(request):
    raw = request.query_params.get('echeance_jours')
    if not raw:
        return 90
    try:
        jours = int(raw)
    except ValueError:
        return 'invalid'
    if not (1 <= jours <= 365):
        return 'invalid'
    return jours
```

Remplacer `StatsDetailView.get()` (lignes 205-211) :

```python
    def get(self, request):
        date_debut = _parse_date_param(request, 'date_debut')
        date_fin = _parse_date_param(request, 'date_fin')
        echeance_jours = _parse_echeance_jours(request)
        if date_debut == 'invalid' or date_fin == 'invalid' or echeance_jours == 'invalid':
            return Response({'error': 'Paramètre invalide.'}, status=400)
        data = build_stats_detail(date_debut, date_fin, requesting_user=request.user, echeance_jours=echeance_jours)
        return Response(data)
```

Remplacer `StatsExportView.get()` (lignes 242-247) :

```python
    def get(self, request):
        date_debut = _parse_date_param(request, 'date_debut')
        date_fin = _parse_date_param(request, 'date_fin')
        echeance_jours = _parse_echeance_jours(request)
        if date_debut == 'invalid' or date_fin == 'invalid' or echeance_jours == 'invalid':
            return Response({'error': 'Paramètre invalide.'}, status=400)
        data = build_stats_detail(date_debut, date_fin, requesting_user=request.user, echeance_jours=echeance_jours)
```

- [ ] **Step 8: Lancer les tests pour vérifier qu'ils passent**

Run: `cd backend && pytest tests/test_stats_detail_view.py tests/test_stats_export.py -v`
Expected: PASS (tous, y compris les tests existants de `test_stats_export.py`, non affectés puisque `echeance_jours` a un défaut)

- [ ] **Step 9: Commit**

```bash
git add backend/audit/stats.py backend/audit/views.py backend/tests/test_stats_detail.py backend/tests/test_stats_detail_view.py
git commit -m "feat(statistiques): seuil de jours réglable pour les contrats arrivant à échéance"
```

---

## Task 3 : Backend — filtre `?categorie=` sur le journal d'audit

**Files:**
- Modify: `backend/audit/views.py:1-124` (imports + `AuditLogListView.get`)
- Test: `backend/tests/test_audit_categorie_filter.py` (nouveau)

**Interfaces:**
- Consumes: `_categorize_emp_log(action, details)` et `_ACTIVITY_KEYS` (déjà définis dans `backend/audit/stats.py:292-365`, importés tels quels — aucune modification de leur signature).
- Produces: `GET /api/reporting/audit-logs/?categorie=<clé>` — `<clé>` est soit une entrée de `_ACTIVITY_KEYS` (ex. `employes_archives`), soit une des 3 clés spéciales `documents_supprimes`/`documents_modifies`/`documents_uploades` (mappées respectivement sur les actions `DELETE_DOC`/`MODIFY_DOC`/`UPLOAD`). Une valeur inconnue est ignorée silencieusement (aucun filtrage supplémentaire, même comportement que les dates invalides déjà gérées par cette vue).

- [ ] **Step 1: Écrire les tests du filtre catégorie**

Créer `backend/tests/test_audit_categorie_filter.py` :

```python
import pytest
from rest_framework.test import APIClient
from audit.models import AuditLog

pytestmark = pytest.mark.django_db


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_categorie_employes_archives_filters_out_other_modify_emp_entries(admin_user):
    AuditLog.objects.create(
        user=admin_user, action=AuditLog.Action.MODIFY_EMP,
        target_model='Employee', target_id='x', target_label='Archivé',
        details={'transfer': {'statut': {'de': 'Actif', 'vers': 'Archivé'}}},
    )
    AuditLog.objects.create(
        user=admin_user, action=AuditLog.Action.MODIFY_EMP,
        target_model='Employee', target_id='y', target_label='Transfert',
        details={'transfer': {'poste': {'de': 'A', 'vers': 'B'}}},
    )
    resp = auth_client(admin_user).get('/api/reporting/audit-logs/?categorie=employes_archives')
    assert resp.status_code == 200
    labels = [r['target_label'] for r in resp.data['results']]
    assert labels == ['Archivé']


def test_categorie_documents_supprimes_uses_delete_doc_action(admin_user):
    AuditLog.objects.create(
        user=admin_user, action=AuditLog.Action.DELETE_DOC,
        target_model='EmployeeDocument', target_id='d1', target_label='doc1',
    )
    AuditLog.objects.create(
        user=admin_user, action=AuditLog.Action.MODIFY_DOC,
        target_model='EmployeeDocument', target_id='d2', target_label='doc2',
    )
    resp = auth_client(admin_user).get('/api/reporting/audit-logs/?categorie=documents_supprimes')
    labels = [r['target_label'] for r in resp.data['results']]
    assert labels == ['doc1']


def test_categorie_documents_uploades_uses_upload_action(admin_user):
    AuditLog.objects.create(
        user=admin_user, action=AuditLog.Action.UPLOAD,
        target_model='EmployeeDocument', target_id='d3', target_label='doc3',
    )
    resp = auth_client(admin_user).get('/api/reporting/audit-logs/?categorie=documents_uploades')
    labels = [r['target_label'] for r in resp.data['results']]
    assert labels == ['doc3']


def test_unknown_categorie_is_ignored(admin_user):
    AuditLog.objects.create(
        user=admin_user, action=AuditLog.Action.CREATE_EMP,
        target_model='Employee', target_id='z', target_label='z',
    )
    resp = auth_client(admin_user).get('/api/reporting/audit-logs/?categorie=n_importe_quoi')
    assert resp.status_code == 200
    assert len(resp.data['results']) == 1
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd backend && pytest tests/test_audit_categorie_filter.py -v`
Expected: FAIL sur les 3 premiers tests (le paramètre `categorie` n'existe pas encore, toutes les entrées remontent)

- [ ] **Step 3: Ajouter le filtre dans `AuditLogListView`**

Dans `backend/audit/views.py`, modifier la ligne d'import existante :
```python
from audit.stats import build_stats_detail
```
en :
```python
from audit.stats import build_stats_detail, _categorize_emp_log, _ACTIVITY_KEYS
```

Ajouter juste avant la classe `AuditLogListView` (après `AuditLogActionsView`, avant la ligne `class AuditLogListView`) :

```python
_CATEGORIE_TO_DOC_ACTION = {
    'documents_supprimes': AuditLog.Action.DELETE_DOC,
    'documents_modifies': AuditLog.Action.MODIFY_DOC,
    'documents_uploades': AuditLog.Action.UPLOAD,
}
_EMP_LOG_ACTIONS = [AuditLog.Action.CREATE_EMP, AuditLog.Action.MODIFY_EMP, AuditLog.Action.DELETE_EMP]
```

Dans `AuditLogListView.get()`, remplacer :
```python
        if action:
            qs = qs.filter(action=action)
        if target:
            qs = qs.filter(target_label__icontains=target)
```
par :
```python
        if action:
            qs = qs.filter(action=action)

        # Filtre par catégorie d'activité (lien de preuve depuis
        # /statistiques "Mon activité" — voir audit/stats.py
        # _categorize_emp_log, seule source de vérité de cette
        # classification). Une valeur inconnue est ignorée silencieusement,
        # comme les dates invalides plus bas.
        categorie = request.query_params.get('categorie')
        if categorie in _CATEGORIE_TO_DOC_ACTION:
            qs = qs.filter(action=_CATEGORIE_TO_DOC_ACTION[categorie])
        elif categorie in _ACTIVITY_KEYS:
            matching_ids = [
                log.id for log in qs.filter(action__in=_EMP_LOG_ACTIONS).only('id', 'action', 'details')
                if _categorize_emp_log(log.action, log.details)[0] == categorie
            ]
            qs = qs.filter(id__in=matching_ids)

        if target:
            qs = qs.filter(target_label__icontains=target)
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd backend && pytest tests/test_audit_categorie_filter.py tests/test_audit_visibility.py -v`
Expected: PASS (les deux fichiers, le filtre catégorie n'interfère pas avec la visibilité par rôle déjà testée)

- [ ] **Step 5: Commit**

```bash
git add backend/audit/views.py backend/tests/test_audit_categorie_filter.py
git commit -m "feat(audit): filtre ?categorie= sur le journal d'audit, réutilisé par les liens de preuve de /statistiques"
```

---

## Task 4 : Frontend — recherche dans `StatDonutChart`

**Files:**
- Modify: `frontend/src/components/charts/StatDonutChart.jsx` (réécriture complète)
- Test: `frontend/src/__tests__/StatDonutChart.test.jsx` (nouveau)

**Interfaces:**
- Consumes: `colorAt(theme, index)` (`frontend/src/components/charts/chartColors.js`, inchangé), `useTheme()` (inchangé).
- Produces: `StatDonutChart({ data, onSliceClick, height })` — même props qu'avant, aucun changement d'appel côté `Statistiques.jsx`. Comportement ajouté : un champ de recherche apparaît si `data.length > 8`, filtre la légende, et grise (opacité 0.15) les tranches non correspondantes du camembert sans changer le total affiché.

- [ ] **Step 1: Écrire les tests de recherche**

Créer `frontend/src/__tests__/StatDonutChart.test.jsx` :

```jsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import StatDonutChart from "../components/charts/StatDonutChart";

const renderChart = (props) =>
  render(<StatDonutChart {...props} />, { wrapper: ThemeProvider });

const manyEntries = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, nom: `Poste ${i}`, count: i + 1 }));

describe("StatDonutChart — recherche", () => {
  test("n'affiche pas de champ de recherche pour peu d'entrées", () => {
    renderChart({ data: [{ id: "d1", nom: "Direction A", count: 5 }] });
    expect(screen.queryByPlaceholderText("Rechercher...")).not.toBeInTheDocument();
  });

  test("affiche un champ de recherche au-delà de 8 entrées", () => {
    renderChart({ data: manyEntries });
    expect(screen.getByPlaceholderText("Rechercher...")).toBeInTheDocument();
  });

  test("filtre la légende selon le texte recherché", () => {
    renderChart({ data: manyEntries });
    fireEvent.change(screen.getByPlaceholderText("Rechercher..."), { target: { value: "Poste 3" } });
    expect(screen.getByText("Poste 3")).toBeInTheDocument();
    expect(screen.queryByText("Poste 1")).not.toBeInTheDocument();
  });

  test("affiche 'Aucun résultat.' si rien ne correspond", () => {
    renderChart({ data: manyEntries });
    fireEvent.change(screen.getByPlaceholderText("Rechercher..."), { target: { value: "zzz" } });
    expect(screen.getByText("Aucun résultat.")).toBeInTheDocument();
  });

  test("le total au centre ne change pas pendant une recherche", () => {
    renderChart({ data: manyEntries });
    const total = manyEntries.reduce((sum, d) => sum + d.count, 0);
    expect(screen.getByText(String(total))).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Rechercher..."), { target: { value: "Poste 3" } });
    expect(screen.getByText(String(total))).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd frontend && npm test -- --watchAll=false StatDonutChart.test.jsx`
Expected: FAIL (le champ "Rechercher..." n'existe pas encore)

- [ ] **Step 3: Réécrire `StatDonutChart.jsx`**

Remplacer tout le contenu de `frontend/src/components/charts/StatDonutChart.jsx` par :

```jsx
import { useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { useTheme } from "../../context/ThemeContext";
import ChartTooltip from "./ChartTooltip";
import { colorAt } from "./chartColors";

// Au-delà de ce nombre d'entrées, un champ de recherche apparaît au-dessus
// de la légende — inutile pour un donut à peu de catégories (ex. "Par
// Direction" avec 1 seule direction).
const SEARCH_THRESHOLD = 8;

// Légende maison, scrollable et à hauteur fixe (= hauteur du donut) — une
// vraie légende Recharts grandit avec le nombre d'entrées et de longs
// libellés (ex. "Par Fonction", 10+ catégories), ce qui déforme la carte par
// rapport à ses voisines dans la grille. Ici la carte garde toujours la même
// hauteur, quel que soit le nombre de catégories.
const DonutLegend = ({ data, theme, height, onSliceClick, matches }) => (
  <div
    style={{
      maxHeight: height, overflowY: "auto", fontSize: 12, color: theme.textSecondary,
      paddingRight: 4, flex: "0 0 45%",
    }}
  >
    {data.map((entry, index) => (
      matches(entry) && (
        <div
          key={entry.id || entry.nom}
          onClick={onSliceClick ? () => onSliceClick(entry) : undefined}
          title={`${entry.nom} (${entry.count})`}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "3px 0",
            cursor: onSliceClick ? "pointer" : "default",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 2, background: colorAt(theme, index), flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.nom}
          </span>
        </div>
      )
    ))}
  </div>
);

// Camembert (donut) pour une répartition {nom, count}[], avec total au centre.
const StatDonutChart = ({ data, onSliceClick, height = 240 }) => {
  const theme = useTheme();
  const [search, setSearch] = useState("");

  if (!data || data.length === 0) {
    return (
      <div style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>
        Aucune donnée.
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const showSearch = data.length > SEARCH_THRESHOLD;
  const term = search.trim().toLowerCase();
  const matches = (entry) => !term || entry.nom.toLowerCase().includes(term);
  const nbMatches = data.filter(matches).length;

  return (
    <div>
      {showSearch && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher..."
          style={{
            width: "100%", boxSizing: "border-box", marginBottom: 10,
            border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 10px",
            fontSize: 12, fontFamily: theme.fontFamily, color: theme.text, background: theme.bg,
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ position: "relative", flex: "1 1 55%", minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="nom"
                innerRadius="58%"
                outerRadius="85%"
                paddingAngle={2}
                onClick={onSliceClick ? (entry) => onSliceClick(entry) : undefined}
                style={{ cursor: onSliceClick ? "pointer" : "default" }}
                isAnimationActive={true}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={entry.id || entry.nom}
                    fill={colorAt(theme, index)}
                    fillOpacity={matches(entry) ? 1 : 0.15}
                    stroke={theme.surface}
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div
            style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              textAlign: "center", pointerEvents: "none",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, color: theme.text }}>{total}</div>
            <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Total</div>
          </div>
        </div>
        {nbMatches === 0 ? (
          <div style={{ flex: "0 0 45%", color: theme.textMuted, fontSize: 12, textAlign: "center" }}>
            Aucun résultat.
          </div>
        ) : (
          <DonutLegend data={data} theme={theme} height={height} onSliceClick={onSliceClick} matches={matches} />
        )}
      </div>
    </div>
  );
};

export default StatDonutChart;
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd frontend && npm test -- --watchAll=false StatDonutChart.test.jsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Vérifier la non-régression sur `Statistiques.jsx`**

Run: `cd frontend && npm test -- --watchAll=false Statistiques.test.jsx`
Expected: PASS (les tests existants qui cliquent sur une entrée de légende, ex. "clic sur une barre Direction navigue vers /employees filtré", continuent de passer — `onSliceClick` est inchangé)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/charts/StatDonutChart.jsx frontend/src/__tests__/StatDonutChart.test.jsx
git commit -m "feat(statistiques): recherche dans la légende des donuts au-delà de 8 entrées"
```

---

## Task 5 : Frontend — seuil réglable pour "Contrats arrivant à échéance"

**Files:**
- Modify: `frontend/src/pages/Statistiques.jsx`
- Modify: `frontend/src/__tests__/Statistiques.test.jsx` (mise à jour d'un test existant + ajouts)

**Interfaces:**
- Consumes: `fetchStats(params, silent)` (déjà défini dans le composant, inchangé de signature).
- Produces: state `echeanceJours` (nombre, défaut `90`) — chaque appel à `fetchStats` déclenché par cette page inclut désormais `echeance_jours` dans ses `params`.

- [ ] **Step 1: Mettre à jour le test existant de plage libre**

Dans `frontend/src/__tests__/Statistiques.test.jsx`, remplacer le test `"changer la plage libre refetch avec les dates saisies"` (lignes 116-127) par :

```jsx
  test("changer la plage libre refetch avec les dates saisies", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage();
    await screen.findByText("Recrutements");
    api.get.mockClear();
    fireEvent.change(screen.getByLabelText("Date début"), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByLabelText("Date fin"), { target: { value: "2026-02-28" } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/reporting/stats-detail/",
      expect.objectContaining({ params: { date_debut: "2026-02-01", date_fin: "2026-02-28", echeance_jours: 90 } })
    ));
  });
```

Ajouter une nouvelle description de tests après la section "Statistiques — contrats à échéance et complétude" existante (après la ligne 199) :

```jsx
describe("Statistiques — seuil d'échéance réglable", () => {
  test("le titre de la section reflète le seuil par défaut (90 jours)", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage();
    expect(await screen.findByText("Contrats arrivant à échéance (90 jours)")).toBeInTheDocument();
  });

  test("changer le seuil refetch avec le nouveau nombre de jours et met à jour le titre", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage();
    await screen.findByText("Recrutements");
    api.get.mockClear();
    fireEvent.change(screen.getByLabelText("Seuil"), { target: { value: "180" } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/reporting/stats-detail/",
      expect.objectContaining({ params: expect.objectContaining({ echeance_jours: 180 }) })
    ));
    expect(await screen.findByText("Contrats arrivant à échéance (180 jours)")).toBeInTheDocument();
  });

  test("un seuil personnalisé refetch avec la valeur saisie", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage();
    await screen.findByText("Recrutements");
    fireEvent.change(screen.getByLabelText("Seuil"), { target: { value: "custom" } });
    api.get.mockClear();
    fireEvent.blur(screen.getByLabelText("Seuil personnalisé (jours)"), { target: { value: "45" } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      "/reporting/stats-detail/",
      expect.objectContaining({ params: expect.objectContaining({ echeance_jours: 45 }) })
    ));
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd frontend && npm test -- --watchAll=false Statistiques.test.jsx`
Expected: FAIL sur le test de plage libre (params ne contient pas `echeance_jours`) et sur les 3 nouveaux tests (label "Seuil" introuvable)

- [ ] **Step 3: Ajouter l'état et le contrôle dans `Statistiques.jsx`**

Ajouter la constante après `presetToRange` (juste avant `buildAuditLink`) :

```jsx
const ECHEANCE_PRESETS = [30, 60, 90, 120, 180, 365];
```

Ajouter les deux states après `const [filters, setFilters] = useState(...)` :

```jsx
  const [echeanceJours, setEcheanceJours] = useState(90);
  const [echeanceCustomMode, setEcheanceCustomMode] = useState(false);
```

Remplacer `handlePresetClick` :

```jsx
  const handlePresetClick = (preset) => {
    setFilters({ preset, dateDebut: "", dateFin: "" });
    const range = presetToRange(preset);
    fetchStats({ ...(range || {}), echeance_jours: echeanceJours }, true);
  };
```

Remplacer `handleDateChange` :

```jsx
  const handleDateChange = (field, value) => {
    const next = { ...filters, preset: null, [field]: value };
    setFilters(next);
    if (next.dateDebut && next.dateFin) {
      fetchStats({ date_debut: next.dateDebut, date_fin: next.dateFin, echeance_jours: echeanceJours }, true);
    }
  };
```

Ajouter juste après `currentDateParams` :

```jsx
  const handleEcheanceChange = (jours) => {
    setEcheanceJours(jours);
    fetchStats({ ...currentDateParams(), echeance_jours: jours }, true);
  };
```

Modifier `handleExportExcel` pour inclure le seuil dans l'export (remplacer la ligne `params: currentDateParams(),`) :

```jsx
        params: { ...currentDateParams(), echeance_jours: echeanceJours },
```

Modifier l'appel initial dans le `useEffect` de montage :

```jsx
    fetchStats({ ...(presetToRange("12m") || {}), echeance_jours: echeanceJours });
```

Remplacer le bloc de la section "Contrats arrivant à échéance" (le `<div>` englobant, avec son `<h2>`) :

```jsx
        <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <h2 style={{ color: theme.text, margin: 0, fontSize: 15, fontWeight: 700 }}>
              Contrats arrivant à échéance ({echeanceJours} jours)
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label htmlFor="echeance-select" style={{ fontSize: 12, color: theme.textSecondary }}>Seuil</label>
              <select
                id="echeance-select"
                value={echeanceCustomMode ? "custom" : echeanceJours}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setEcheanceCustomMode(true);
                  } else {
                    setEcheanceCustomMode(false);
                    handleEcheanceChange(Number(e.target.value));
                  }
                }}
                style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily }}
              >
                {ECHEANCE_PRESETS.map((j) => (
                  <option key={j} value={j}>{j} jours</option>
                ))}
                <option value="custom">Personnalisé…</option>
              </select>
              {echeanceCustomMode && (
                <input
                  type="number"
                  min={1}
                  max={365}
                  aria-label="Seuil personnalisé (jours)"
                  defaultValue={echeanceJours}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 1 && v <= 365) handleEcheanceChange(v);
                  }}
                  style={{ width: 70, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily }}
                />
              )}
            </div>
          </div>
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
```

(Seul l'en-tête change ; le corps du tableau est repris à l'identique.)

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd frontend && npm test -- --watchAll=false Statistiques.test.jsx`
Expected: PASS (tous les tests du fichier)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Statistiques.jsx frontend/src/__tests__/Statistiques.test.jsx
git commit -m "feat(statistiques): seuil réglable (jours) pour les contrats arrivant à échéance"
```

---

## Task 6 : Frontend — drill-down cliquable sur la complétude Direction/Département

**Files:**
- Modify: `frontend/src/pages/Statistiques.jsx`
- Modify: `frontend/src/__tests__/Statistiques.test.jsx`

**Interfaces:**
- Consumes: `RepartitionBar` (déjà défini dans le fichier, prop `onClick` déjà supportée), `navigate` (déjà disponible via `useNavigate()`).
- Produces: clic sur une barre de département ou une ligne de la nouvelle liste "Direction" → `navigate('/employees?departement=<id>&dossier_complet=0')` ou `navigate('/employees?direction=<id>&dossier_complet=0')`.

- [ ] **Step 1: Écrire les tests de drill-down**

Ajouter dans `frontend/src/__tests__/Statistiques.test.jsx`, dans la description `"Statistiques — contrats à échéance et complétude"` (après le test existant "badge jours restants...") :

```jsx
  test("clic sur une barre de complétude Département navigue vers /employees filtré incomplets", async () => {
    api.get.mockResolvedValue({
      data: {
        ...baseStats,
        completude_par_departement: [{ id: "dpt1", nom: "Paie", direction_nom: "Direction Générale", total: 10, complets: 6, taux: 60 }],
      },
    });
    renderPage();
    const bar = await screen.findByText("Paie");
    fireEvent.click(bar);
    expect(mockNavigate).toHaveBeenCalledWith("/employees?departement=dpt1&dossier_complet=0");
  });

  test("clic sur une ligne de complétude Direction navigue vers /employees filtré incomplets", async () => {
    api.get.mockResolvedValue({
      data: {
        ...baseStats,
        completude_par_direction: [{ id: "dir1", nom: "Direction Générale", total: 20, complets: 15, taux: 75 }],
      },
    });
    renderPage();
    const rows = await screen.findAllByText("Direction Générale");
    fireEvent.click(rows[rows.length - 1]);
    expect(mockNavigate).toHaveBeenCalledWith("/employees?direction=dir1&dossier_complet=0");
  });
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd frontend && npm test -- --watchAll=false Statistiques.test.jsx`
Expected: FAIL sur les deux nouveaux tests (aucun `onClick` branché sur ces deux sections)

- [ ] **Step 3: Brancher les clics dans `Statistiques.jsx`**

Remplacer le bloc "Complétude par Direction (radar)" / "Complétude par Département" (la grille à deux colonnes qui les contient) :

```jsx
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Complétude par Direction (radar)</h2>
            <StatRadarChart data={stats.completude_par_direction} />
            <div style={{ marginTop: 16 }}>
              {stats.completude_par_direction.length === 0 ? (
                <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
              ) : (
                stats.completude_par_direction.map((r) => (
                  <RepartitionBar
                    key={r.id}
                    label={r.nom}
                    count={r.taux}
                    displayValue={`${r.taux}%`}
                    max={100}
                    color={r.taux >= 80 ? theme.primary : r.taux >= 50 ? theme.accent : theme.danger}
                    onClick={() => navigate(`/employees?direction=${r.id}&dossier_complet=0`)}
                  />
                ))
              )}
            </div>
          </div>
          <div className="anim-fade-in delay-1" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Complétude par Département</h2>
            {stats.completude_par_departement.length === 0 ? (
              <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
            ) : (
              stats.completude_par_departement.map((r) => (
                <RepartitionBar
                  key={r.id}
                  label={r.nom}
                  sub={r.direction_nom}
                  count={r.taux}
                  displayValue={`${r.taux}%`}
                  max={100}
                  color={r.taux >= 80 ? theme.primary : r.taux >= 50 ? theme.accent : theme.danger}
                  onClick={() => navigate(`/employees?departement=${r.id}&dossier_complet=0`)}
                />
              ))
            )}
          </div>
        </div>
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd frontend && npm test -- --watchAll=false Statistiques.test.jsx`
Expected: PASS (tous les tests du fichier)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Statistiques.jsx frontend/src/__tests__/Statistiques.test.jsx
git commit -m "feat(statistiques): drill-down cliquable vers les employés incomplets depuis la complétude Direction/Département"
```

---

## Task 7 : Frontend — liens de preuve catégorisés sur "Mon activité"

**Files:**
- Modify: `frontend/src/pages/Statistiques.jsx` (`buildAuditLink`, `ActivityGroups`, tableau "Activité par administrateur")
- Modify: `frontend/src/pages/AuditLogs.jsx` (lecture de `?categorie=`)
- Modify: `frontend/src/__tests__/Statistiques.test.jsx`, `frontend/src/__tests__/AuditLogs.test.jsx`

**Interfaces:**
- Consumes: aucune nouvelle dépendance externe.
- Produces: chaque tuile de "Mon activité" et chaque cellule de "Activité par administrateur" devient un lien vers `/audit?user=<username>&categorie=<clé>&date_debut=<debut>&date_fin=<fin>`. `AuditLogs.jsx` transmet ce paramètre à `GET /reporting/audit-logs/` au même titre que `user`/`action`/`date_debut`/`date_fin`.

- [ ] **Step 1: Écrire les tests frontend des liens de preuve**

Dans `frontend/src/__tests__/Statistiques.test.jsx`, ajouter dans la description `"Statistiques — mon activité"` (après le test "affiche un lien vers le journal d'audit du compte connecté") :

```jsx
  test("chaque tuile d'activité est un lien vers /audit filtré par catégorie", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage("ADMIN");
    await screen.findByText("Recrutements");
    const tile = screen.getByText("4").closest("a");
    expect(tile).not.toBeNull();
    expect(tile.getAttribute("href")).toBe(
      "/audit?user=admin&date_debut=2026-01-01&date_fin=2026-12-31&categorie=employes_crees"
    );
  });

  test("la tuile Documents uploadés porte une info-bulle d'avertissement", async () => {
    api.get.mockResolvedValue({ data: baseStats });
    renderPage("ADMIN");
    await screen.findByText("Recrutements");
    const tile = screen.getByText("20").closest("a");
    expect(tile.getAttribute("title")).toMatch(/reste dans cette liste/);
  });
```

Ajouter dans la description existante `"un SUPERADMIN voit la section Activité par administrateur..."`, après la vérification des liens "Audit →" (fin du test) :

```jsx
    // Chaque cellule de compteur est elle-même un lien filtré par catégorie
    const createdCell = screen.getByText("4").closest("a");
    expect(createdCell.getAttribute("href")).toBe(
      "/audit?user=jadmin&date_debut=2026-01-01&date_fin=2026-12-31&categorie=employes_crees"
    );
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd frontend && npm test -- --watchAll=false Statistiques.test.jsx`
Expected: FAIL sur les 3 nouveaux tests/assertions (les tuiles et cellules ne sont pas encore des liens)

- [ ] **Step 3: Modifier `buildAuditLink` et `ActivityGroups`**

Remplacer `buildAuditLink` :

```jsx
const buildAuditLink = (username, periode, categorie) => {
  if (!username || !periode) return null;
  const params = new URLSearchParams({ user: username, date_debut: periode.debut, date_fin: periode.fin });
  if (categorie) params.set("categorie", categorie);
  return `/audit?${params.toString()}`;
};
```

Ajouter un composant `ActivityTile` juste avant `ActivityGroups` :

```jsx
const ActivityTile = ({ theme, label, value, href, navigate, title }) => (
  <div>
    <div style={{ color: theme.textMuted, fontSize: 11, marginBottom: 4 }}>{label}</div>
    {href ? (
      <a
        href={href}
        title={title}
        onClick={(e) => { e.preventDefault(); navigate(href); }}
        style={{ color: theme.primary, fontSize: 22, fontWeight: 800, textDecoration: "none", cursor: "pointer" }}
      >
        {value}
      </a>
    ) : (
      <div style={{ color: theme.primary, fontSize: 22, fontWeight: 800 }}>{value}</div>
    )}
  </div>
);
```

Remplacer `ActivityGroups` :

```jsx
const ActivityGroups = ({ activity, theme, isMobile, username, periode, navigate }) => {
  const groups = ACTIVITY_ENTITY_GROUPS
    .map((g) => ({ ...g, tiles: g.tiles.filter((t) => activity[t.key] > 0) }))
    .filter((g) => g.tiles.length > 0);

  if (groups.length === 0) {
    return <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune activité sur cette période.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {groups.map((g) => (
        <div key={g.label}>
          <div style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>
            {g.label}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${Math.min(g.tiles.length, 4)}, 1fr)`, gap: 16 }}>
            {g.tiles.map(({ key, label }) => (
              <ActivityTile
                key={key}
                theme={theme}
                label={label}
                value={activity[key]}
                href={buildAuditLink(username, periode, key)}
                navigate={navigate}
                title={
                  key === "documents_uploades"
                    ? "Ce lien liste les uploads du journal — un document supprimé depuis reste dans cette liste mais plus dans le compteur ci-dessus."
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
```

Modifier l'appel du composant (dans le JSX principal) :

```jsx
              <ActivityGroups
                activity={stats.mon_activite} theme={theme} isMobile={isMobile}
                username={user?.username} periode={stats.periode} navigate={navigate}
              />
```

- [ ] **Step 4: Modifier le tableau "Activité par administrateur"**

Remplacer :

```jsx
                            {columns.map((c) => (
                              <td key={c.key} style={{ padding: "8px 6px" }}>{a[c.key]}</td>
                            ))}
```

par :

```jsx
                            {columns.map((c) => {
                              const cellHref = buildAuditLink(a.username, stats.periode, c.key);
                              return (
                                <td key={c.key} style={{ padding: "8px 6px" }}>
                                  {cellHref ? (
                                    <a
                                      href={cellHref}
                                      onClick={(e) => { e.preventDefault(); navigate(cellHref); }}
                                      style={{ color: theme.text, textDecoration: "none" }}
                                    >
                                      {a[c.key]}
                                    </a>
                                  ) : (
                                    a[c.key]
                                  )}
                                </td>
                              );
                            })}
```

- [ ] **Step 5: Lancer les tests frontend pour vérifier qu'ils passent**

Run: `cd frontend && npm test -- --watchAll=false Statistiques.test.jsx`
Expected: PASS (tous les tests du fichier)

- [ ] **Step 6: Écrire le test de transmission `categorie` dans `AuditLogs.jsx`**

Ajouter dans `frontend/src/__tests__/AuditLogs.test.jsx`, dans la description `"AuditLogs — pré-filtrage depuis l'URL..."` :

```jsx
  test("pré-remplit et transmet le filtre catégorie depuis la query string", async () => {
    api.get.mockResolvedValue(mockResponse([]));
    renderPage(["/audit?user=jadmin&categorie=employes_archives&date_debut=2026-01-01&date_fin=2026-12-31"]);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/reporting/audit-logs/",
        { params: expect.objectContaining({ categorie: "employes_archives" }) },
      );
    });
  });
```

- [ ] **Step 7: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend && npm test -- --watchAll=false AuditLogs.test.jsx`
Expected: FAIL (le paramètre `categorie` n'est pas transmis)

- [ ] **Step 8: Brancher la lecture de `categorie` dans `AuditLogs.jsx`**

Remplacer l'initialisation de `filters` :

```jsx
  const [filters, setFilters] = useState(() => ({
    user: searchParams.get("user") || "",
    action: searchParams.get("action") || "",
    date_debut: searchParams.get("date_debut") || "",
    date_fin: searchParams.get("date_fin") || "",
    categorie: searchParams.get("categorie") || "",
  }));
```

Dans `fetchLogs`, ajouter après `if (filters.action) params.action = filters.action;` :

```jsx
      if (filters.categorie) params.categorie = filters.categorie;
```

- [ ] **Step 9: Lancer les tests pour vérifier qu'ils passent**

Run: `cd frontend && npm test -- --watchAll=false AuditLogs.test.jsx`
Expected: PASS (tous les tests du fichier)

- [ ] **Step 10: Lancer toute la suite frontend pour vérifier l'absence de régression**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: PASS (aucune régression sur le reste de la suite)

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/Statistiques.jsx frontend/src/pages/AuditLogs.jsx frontend/src/__tests__/Statistiques.test.jsx frontend/src/__tests__/AuditLogs.test.jsx
git commit -m "feat(statistiques): liens de preuve catégorisés sur Mon activité / Activité par administrateur vers /audit"
```

---

## Task 8 : Vérification finale — suite complète

**Files:** aucun (tâche de vérification uniquement)

- [ ] **Step 1: Lancer toute la suite backend**

Run: `cd backend && pytest`
Expected: PASS (tous les tests, y compris ceux non touchés par ce chantier)

- [ ] **Step 2: Lancer toute la suite frontend**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: PASS (tous les tests)

- [ ] **Step 3: Mettre à jour CLAUDE.md**

Ajouter dans `CLAUDE.md`, section "Page Statistiques", un paragraphe daté 2026-09-27 décrivant les 4 ajouts (recherche donuts sans plafond Fonction, seuil d'échéance réglable, drill-down complétude, liens de preuve catégorisés `?categorie=` sur `/audit`) — cohérent avec la convention de documentation vivante du projet (voir en-tête de CLAUDE.md).

- [ ] **Step 4: Commit final**

```bash
git add CLAUDE.md
git commit -m "docs: documente les améliorations de /statistiques (recherche donuts, seuil échéance, drill-down complétude, liens de preuve)"
```
