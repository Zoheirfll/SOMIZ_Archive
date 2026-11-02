# Reporting RH — menu Statistiques et pages DRH — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer la page unique `/statistiques` par un menu « Statistiques » de 7 pages (Synthèse DRH, Effectifs,
Parité, Démographie & retraites, Contrats, Qualité des données, Activité des comptes), alimentées par un endpoint
`GET /api/reporting/rh/<page>/` (JSON ou Excel), avec des indicateurs définis à un seul endroit.

**Architecture :** nouvelle app Django `reporting` ; un module « constructeur » par page dans `reporting/rh/`
(fonction pure `construire(params, user) -> dict`), qui réutilise les calculs existants de `audit/stats.py` sans les
déplacer. Chaque constructeur renvoie ses KPI (avec libellé et définition issus de `reporting/rh/definitions.py`), ses
sections, et des tables d'export ; une vue unique sert le JSON ou l'Excel (`?fmt=xlsx`, tracé dans l'audit). Côté
React, une route `/statistiques/:page`, un socle `components/reporting/` et un composant par page dans
`pages/reporting/`.

**Tech Stack :** Django 5.2, DRF 3.17, openpyxl, pytest ; React 19, React Router 7, Recharts, Jest + RTL.

**Spec :** `docs/superpowers/specs/2026-10-30-reporting-statistiques-design.md` (étape 1 révisée : pages visibles d'abord).

## Global Constraints

- Accès : ADMIN et SUPERADMIN uniquement (`accounts.permissions.IsAdmin`) ; vérifié côté serveur et par un test d'intégration sur chaque page réelle.
- Âge de retraite : **60 ans hommes, 55 ans femmes** ; sexe non renseigné → 60 ans et compté comme « prévision incertaine ». Paramétrable : `settings.REPORTING_AGE_RETRAITE`.
- Seuil de petits effectifs : **2** (`settings.REPORTING_SEUIL_PETITS_EFFECTIFS`) ; s'applique aux ventilations croisées avec le sexe ou l'âge (une cellule d'1 agent est masquée).
- Sorties : tant que `date_sortie` n'existe pas, datées par l'audit et libellées **« Sorties (date d'archivage) »** — jamais présentées comme des départs réels.
- Aucune colonne NIN / sécu / RIB. Listes nominatives limitées à : contrats (échéances, échus, CDD enchaînés), postes à risque, qualité des données.
- Paramètre d'export : `fmt` (jamais `format`, réservé par DRF). Export tracé : `AuditLog.log(request, AuditLog.Action.EXPORT, details={...})`.
- React : styles inline, **aucun hex codé en dur** (tokens `theme.js`), rafraîchissement silencieux après changement de filtre (pas de `setLoading(true)` qui démonte la page).
- Pas de requête par employé : le nombre de requêtes de la Synthèse ne dépend pas du nombre d'employés (test).
- Ne rien committer sans l'accord de l'utilisateur ; le travail congés non commité de la branche courante doit être commité ou mis de côté par lui avant de créer la branche `reporting-rh`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `backend/reporting/{__init__,apps,urls,views,export}.py` | App, route, vue unique, export xlsx |
| `backend/reporting/rh/commun.py` | Paramètres, seuils, âges, tranches, masquage, fabrique de KPI et de tables |
| `backend/reporting/rh/definitions.py` | Libellé + définition de chaque indicateur (seule source) |
| `backend/reporting/rh/{effectifs,parite,demographie,contrats,qualite,activite,synthese}.py` | Un constructeur par page |
| `backend/config/{settings,urls}.py` | App installée, réglages, route |
| `backend/tests/test_reporting_rh.py` | Droits, paramètres, export, calculs, nombre de requêtes |
| `frontend/src/config/reportingPages.js` | Liste des pages (menu + routage) |
| `frontend/src/hooks/useRapportRH.js` | Chargement + rafraîchissement silencieux |
| `frontend/src/components/reporting/*` | Socle : mise en page, KPI, cartes, tableaux, pyramide par sexe, alertes, barres de taux, activité |
| `frontend/src/pages/reporting/*` | `RapportRH` (routeur) + 7 pages |
| `frontend/src/{App.js,components/Navbar.jsx,pages/Dashboard.jsx,components/dashboard/ContratsEcheanceCard.jsx,styles/theme.js}` | Route, menu, liens, tokens H/F |
| Supprimés : `frontend/src/pages/Statistiques.jsx`, `frontend/src/__tests__/Statistiques.test.jsx` | Remplacés |
| `frontend/src/__tests__/Reporting.test.jsx` | Tests des pages |
| Docs : `docs/fonctionnel/statistiques-audit.md`, `securite.md`, `CLAUDE.md` (table des routes) | |

---

### Task 1 : app `reporting`, socle backend, vue unique et export

**Files :**
- Create : `backend/reporting/__init__.py`, `apps.py`, `urls.py`, `views.py`, `export.py`, `rh/__init__.py`, `rh/commun.py`, `rh/definitions.py`, et des constructeurs minimaux `rh/<page>.py` (complétés aux tâches 2 à 5)
- Modify : `backend/config/settings.py`, `backend/config/urls.py`
- Test : `backend/tests/test_reporting_rh.py`

**Interfaces :**
- Produces :
  - `reporting.rh.commun.Parametres(date_debut: date, date_fin: date, echeance_jours: int = 90, horizon: int = 5)`, propriété `periode_precedente -> (date, date)`, méthode `as_dict()` ;
  - `lire_parametres(query) -> Parametres` (lève `ParametreInvalide`) ;
  - `STATUTS_SORTIE`, `CLE_SEXE = {'M': 'hommes', 'F': 'femmes'}`, `actifs()`, `annees_revolues(depuis, ref)`, `ajouter_annees(d, n)`, `tranche(annees, tranches)`, `taux(n, total)`, `variation_pct(v, prec)`, `seuil_petits_effectifs()`, `age_retraite(sexe)`, `masquer(lignes, cles)`, `kpi(code, valeur, unite='', precedente=None, variation=None)`, `table(titre, colonnes, lignes)`, `table_kpis(kpis)` ;
  - `reporting.rh.definitions.definition(code) -> {'code', 'libelle', 'definition'}` ;
  - chaque constructeur : `construire(params: Parametres, user) -> dict` avec au moins `kpis` (liste) et `exports` (liste de tables) ;
  - `GET /api/reporting/rh/<page>/` → JSON (`kpis`, sections, `periode`, sans `exports`) ou `?fmt=xlsx` → classeur.

- [ ] **Step 1 : tests qui échouent**

```python
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

PAGES = ['synthese', 'effectifs', 'parite', 'demographie', 'contrats', 'qualite', 'activite']


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
```

- [ ] **Step 2 : vérifier l'échec** — Run : `cd backend && python -m pytest tests/test_reporting_rh.py -q --no-cov` — Expected : FAIL (404 sur toutes les routes).

- [ ] **Step 3 : app et réglages**

```python
# backend/reporting/apps.py
from django.apps import AppConfig


class ReportingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'reporting'
    verbose_name = 'Reporting'
```

`backend/reporting/__init__.py` et `backend/reporting/rh/__init__.py` : fichiers vides.

`config/settings.py` : ajouter `'reporting',` à la fin de `LOCAL_APPS`, et à la fin du fichier :

```python
# ─── REPORTING RH ─────────────────────────────────────────────────────────────
# Âge de départ à la retraite par sexe (sexe non renseigné → valeur 'M').
REPORTING_AGE_RETRAITE = {'M': 60, 'F': 55}
# Une cellule de ventilation croisée (sexe, âge) sous ce seuil est masquée,
# pour éviter l'identification d'un agent par recoupement.
REPORTING_SEUIL_PETITS_EFFECTIFS = 2
```

`config/urls.py` : sous la ligne `path('reporting/', include('audit.urls')),` ajouter `path('reporting/', include('reporting.urls')),`.

- [ ] **Step 4 : `rh/commun.py`**

```python
# backend/reporting/rh/commun.py
"""Outils partagés par les constructeurs de pages du reporting RH."""
from dataclasses import dataclass
from datetime import date, timedelta

from django.conf import settings
from django.utils import timezone

from employees.models import Employee
from reporting.rh.definitions import definition

STATUTS_SORTIE = ('inactif', 'archive', 'demobilise')
CLE_SEXE = {'M': 'hommes', 'F': 'femmes'}


class ParametreInvalide(ValueError):
    pass


@dataclass(frozen=True)
class Parametres:
    date_debut: date
    date_fin: date
    echeance_jours: int = 90
    horizon: int = 5

    @property
    def periode_precedente(self):
        duree = (self.date_fin - self.date_debut).days + 1
        return self.date_debut - timedelta(days=duree), self.date_debut - timedelta(days=1)

    def as_dict(self):
        return {'debut': self.date_debut.isoformat(), 'fin': self.date_fin.isoformat()}


def lire_parametres(query):
    def _date(nom):
        valeur = query.get(nom)
        if not valeur:
            return None
        try:
            return date.fromisoformat(valeur)
        except ValueError as exc:
            raise ParametreInvalide(nom) from exc

    def _entier(nom, defaut, mini, maxi):
        valeur = query.get(nom)
        if valeur in (None, ''):
            return defaut
        try:
            n = int(valeur)
        except ValueError as exc:
            raise ParametreInvalide(nom) from exc
        if not mini <= n <= maxi:
            raise ParametreInvalide(nom)
        return n

    fin = _date('date_fin') or timezone.localdate()
    debut = _date('date_debut') or fin - timedelta(days=365)
    if debut > fin:
        raise ParametreInvalide('date_debut')
    return Parametres(debut, fin, _entier('echeance_jours', 90, 1, 365), _entier('horizon', 5, 1, 10))


def actifs():
    return Employee.objects.filter(statut=Employee.Statut.ACTIF)


def annees_revolues(depuis, ref):
    return ref.year - depuis.year - ((ref.month, ref.day) < (depuis.month, depuis.day))


def ajouter_annees(d, n):
    try:
        return d.replace(year=d.year + n)
    except ValueError:                      # 29 février → 28 février
        return d.replace(year=d.year + n, day=28)


def tranche(annees, tranches):
    for mini, maxi, libelle in tranches:
        if mini <= annees <= maxi:
            return libelle
    return ''


def taux(n, total):
    return round(n / total * 100, 1) if total else None


def variation_pct(valeur, precedente):
    if not precedente or valeur is None:
        return None
    return round((valeur - precedente) / precedente * 100, 1)


def seuil_petits_effectifs():
    return getattr(settings, 'REPORTING_SEUIL_PETITS_EFFECTIFS', 2)


def age_retraite(sexe):
    ages = getattr(settings, 'REPORTING_AGE_RETRAITE', {'M': 60, 'F': 55})
    return ages.get(sexe, ages['M'])


def masquer(lignes, cles):
    """Ligne dont le `total` est sous le seuil (et non nul) : valeurs `cles`
    remplacées par None et `masque=True`. Le total reste affiché."""
    seuil = seuil_petits_effectifs()
    for ligne in lignes:
        ligne['masque'] = 0 < ligne['total'] < seuil
        if ligne['masque']:
            for cle in cles:
                ligne[cle] = None
    return lignes


def kpi(code, valeur, unite='', precedente=None, variation=None):
    if variation is None and precedente is not None:
        variation = variation_pct(valeur, precedente)
    return {**definition(code), 'valeur': valeur, 'unite': unite, 'variation_pct': variation}


def table(titre, colonnes, lignes):
    return {'titre': titre, 'colonnes': colonnes, 'lignes': lignes}


def table_kpis(kpis):
    return table('Indicateurs', ['Indicateur', 'Valeur', 'Unité', 'Variation (%)', 'Définition'], [
        [k['libelle'], k['valeur'], k['unite'], k['variation_pct'], k['definition']] for k in kpis
    ])
```

- [ ] **Step 5 : `rh/definitions.py`**

```python
# backend/reporting/rh/definitions.py
"""Libellé et mode de calcul de chaque indicateur du reporting — seule
source : l'API renvoie la définition avec la valeur, l'UI l'affiche en
info-bulle. Ne jamais réécrire une formule dans une page."""

DEFINITIONS = {
    'effectif_actif': ("Effectif actif", "Employés au statut Actif à ce jour."),
    'effectif_sorti': ("Effectif sorti", "Employés au statut Inactif, Archivé ou Démobilisé."),
    'recrutements': ("Recrutements", "Employés dont la date de recrutement tombe dans la période."),
    'sorties': ("Sorties (date d'archivage)",
                "Passages à un statut de sortie enregistrés dans la période, datés par le journal d'audit "
                "(jour de l'archivage, pas du départ réel) en attendant la date de sortie."),
    'part_cdi': ("Part des contrats à durée indéterminée",
                 "Actifs dont le type de contrat est à durée indéterminée, sur les actifs ayant un type de contrat."),
    'taux_encadrement': ("Taux d'encadrement",
                         "Responsables d'unité actifs (comptés une fois) rapportés à l'effectif actif."),
    'unites_sans_responsable': ("Unités sans responsable",
                                "Unités actives (direction à section) sans responsable au statut Actif."),
    'taux_feminisation': ("Taux de féminisation",
                          "Femmes / (hommes + femmes) parmi les actifs dont le sexe est renseigné."),
    'sexe_non_renseigne': ("Sexe non renseigné", "Actifs dont le sexe n'est pas saisi : exclus des taux de parité."),
    'feminisation_encadrement': ("Féminisation de l'encadrement",
                                 "Femmes parmi les responsables d'unité actifs dont le sexe est renseigné."),
    'feminisation_recrutements': ("Féminisation des recrutements",
                                  "Femmes parmi les recrutés de la période dont le sexe est renseigné."),
    'age_moyen': ("Âge moyen", "Moyenne des âges (années révolues) des actifs dont la date de naissance est connue."),
    'age_median': ("Âge médian", "Âge qui partage en deux moitiés les actifs dont la date de naissance est connue."),
    'anciennete_moyenne': ("Ancienneté moyenne",
                           "Moyenne des années révolues depuis le recrutement, actifs dont la date est connue."),
    'part_55_plus': ("Part des 55 ans et plus", "Actifs de 55 ans et plus, sur les actifs d'âge connu."),
    'naissance_inconnue': ("Date de naissance inconnue",
                           "Actifs sans date de naissance : absents des pyramides et des prévisions."),
    'departs_retraite_12m': ("Départs à la retraite (12 mois)",
                             "Actifs atteignant l'âge de retraite (60 ans hommes, 55 ans femmes, 60 ans si sexe non "
                             "renseigné) dans les 12 prochains mois, y compris ceux qui l'ont déjà dépassé."),
    'retraite_incertaine': ("Prévisions incertaines",
                            "Actifs comptés dans les prévisions de retraite sans sexe renseigné (âge de 60 ans appliqué)."),
    'postes_a_risque': ("Postes à risque",
                        "Fonctions dont tous les titulaires actifs atteignent l'âge de retraite dans l'horizon choisi."),
    'contrats_echeance': ("Contrats à échéance", "Contrats actifs dont la date de fin tombe dans le seuil choisi."),
    'contrats_echus': ("Contrats échus non traités", "Contrats encore au statut Actif dont la date de fin est passée."),
    'cdd_actifs': ("Contrats à durée déterminée actifs", "Contrats actifs d'un type à durée déterminée."),
    'duree_moyenne_cdd': ("Durée moyenne d'un contrat à durée déterminée",
                          "Moyenne, en mois, de la date de début à la date de fin des contrats à durée déterminée datés."),
    'cdd_enchaines': ("Agents en contrats successifs",
                      "Actifs ayant eu au moins deux contrats à durée déterminée."),
    'completude': ("Complétude des dossiers",
                   "Actifs possédant tous les types de documents obligatoires, sur l'effectif actif."),
    'fiches_incompletes': ("Fiches incomplètes",
                           "Actifs auxquels manque au moins une donnée suivie (naissance, recrutement, sexe, "
                           "direction, fonction, type de contrat, catégorie)."),
    'incoherences': ("Incohérences", "Total des anomalies détectées (dates, motifs, doublons probables)."),
    'mes_actions': ("Mes actions", "Actions enregistrées par votre compte sur la période."),
}


def definition(code):
    libelle, texte = DEFINITIONS[code]
    return {'code': code, 'libelle': libelle, 'definition': texte}
```

- [ ] **Step 5 bis : constructeurs minimaux** (remplacés aux tâches 2 à 5) — créer `rh/effectifs.py`, `parite.py`, `demographie.py`, `contrats.py`, `qualite.py`, `activite.py`, `synthese.py` contenant chacun :

```python
from reporting.rh.commun import table_kpis


def construire(params, user):
    kpis = []
    return {'kpis': kpis, 'exports': [table_kpis(kpis)]}
```

- [ ] **Step 6 : vue, export, route**

```python
# backend/reporting/export.py
import openpyxl
from django.http import HttpResponse
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

from audit.models import AuditLog

XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def reponse_xlsx(request, page, data):
    """Un onglet par table d'export du constructeur ; valeurs masquées
    (None) laissées vides. Export tracé dans l'audit."""
    classeur = openpyxl.Workbook()
    classeur.remove(classeur.active)
    for t in data.get('exports', []):
        feuille = classeur.create_sheet(t['titre'][:31])
        feuille.append(t['colonnes'])
        for cellule in feuille[1]:
            cellule.font = Font(bold=True)
        for ligne in t['lignes']:
            feuille.append(['' if v is None else v for v in ligne])
        for i, colonne in enumerate(t['colonnes'], start=1):
            feuille.column_dimensions[get_column_letter(i)].width = max(len(str(colonne)) + 2, 14)
    if not classeur.sheetnames:
        classeur.create_sheet('Rapport')
    reponse = HttpResponse(content_type=XLSX)
    periode = data['periode']
    reponse['Content-Disposition'] = (
        f'attachment; filename="rapport_{page}_{periode["debut"]}_au_{periode["fin"]}.xlsx"'
    )
    classeur.save(reponse)
    AuditLog.log(request, AuditLog.Action.EXPORT,
                 details={'type': 'reporting_rh', 'page': page, 'periode': periode})
    return reponse
```

```python
# backend/reporting/views.py
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from reporting.export import reponse_xlsx
from reporting.rh import activite, contrats, demographie, effectifs, parite, qualite, synthese
from reporting.rh.commun import ParametreInvalide, lire_parametres

PAGES = {
    'synthese': synthese.construire,
    'effectifs': effectifs.construire,
    'parite': parite.construire,
    'demographie': demographie.construire,
    'contrats': contrats.construire,
    'qualite': qualite.construire,
    'activite': activite.construire,
}


class RapportRHView(APIView):
    """GET /api/reporting/rh/<page>/?date_debut=&date_fin=&echeance_jours=&horizon=[&fmt=xlsx]
    Une page du menu Statistiques. ADMIN/SUPERADMIN, organisation-wide."""
    permission_classes = [IsAdmin]

    def get(self, request, page):
        construire = PAGES.get(page)
        if construire is None:
            return Response({'error': 'Page de reporting inconnue.'}, status=404)
        try:
            params = lire_parametres(request.query_params)
        except ParametreInvalide as exc:
            return Response({'error': f'Paramètre invalide : {exc}.'}, status=400)
        data = construire(params, request.user)
        data['periode'] = params.as_dict()
        if request.query_params.get('fmt') == 'xlsx':
            return reponse_xlsx(request, page, data)
        data.pop('exports', None)
        return Response(data)
```

```python
# backend/reporting/urls.py
from django.urls import path

from reporting.views import RapportRHView

urlpatterns = [
    path('rh/<slug:page>/', RapportRHView.as_view(), name='reporting-rh'),
]
```

- [ ] **Step 7 : vérifier** — Run : `python -m pytest tests/test_reporting_rh.py -q --no-cov` — Expected : PASS (TestAcces, TestParametres, TestExport).

- [ ] **Step 8 : commit** — `git commit -m "feat(reporting): socle du reporting RH (route par page, définitions, export tracé)"`

---

### Task 2 : Effectifs et Parité

**Files :** Modify `backend/reporting/rh/effectifs.py`, `backend/reporting/rh/parite.py` ; Test `backend/tests/test_reporting_rh.py`

**Interfaces :**
- Consumes : `commun.*`, `audit.stats._repartition_direction`, `_repartition_departement`, `_repartition_simple`.
- Produces : `effectifs.MODELES_UNITE`, `effectifs.responsables_actifs_ids() -> set`, `effectifs.unites_sans_responsable() -> list[{'type','id','nom'}]` ; réponse Effectifs : `kpis`, `repartition_direction|departement|categorie|type_contrat|fonction`, `unites_sans_responsable`, `postes_sans_titulaire` (liste de noms) ; réponse Parité : `kpis`, `pyramide_age_sexe` [`{tranche, hommes, femmes, non_renseigne}`], `par_direction|par_departement|par_categorie|par_type_contrat|par_fonction` [`{nom, hommes, femmes, non_renseigne, total, taux_feminisation, masque}`], `encadrement` et `recrutements` [`{nom, count}`], `anciennete_par_sexe` [`{sexe, anciennete_moyenne}`].

- [ ] **Step 1 : tests qui échouent** (ajout)

```python
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
```

- [ ] **Step 2 : vérifier l'échec** — `python -m pytest tests/test_reporting_rh.py -q --no-cov -k "Effectifs or Parite"` — FAIL (`KeyError`).

- [ ] **Step 3 : `effectifs.py`**

```python
# backend/reporting/rh/effectifs.py
from django.db.models import Q

from audit.stats import _repartition_departement, _repartition_direction, _repartition_simple
from employees.models import Cellule, Departement, Direction, Employee, Pole, Poste, Section, Service
from reporting.rh.commun import STATUTS_SORTIE, actifs, kpi, table, table_kpis, taux

MODELES_UNITE = [
    ('Direction', Direction), ('Pôle', Pole), ('Département', Departement),
    ('Service', Service), ('Cellule', Cellule), ('Section', Section),
]


def responsables_actifs_ids():
    """Employés actifs responsables d'au moins une unité active (comptés une fois)."""
    ids = set()
    for _type, modele in MODELES_UNITE:
        ids.update(modele.objects.filter(
            is_active=True, responsable__statut=Employee.Statut.ACTIF,
        ).values_list('responsable_id', flat=True))
    return ids


def unites_sans_responsable():
    lignes = []
    for type_unite, modele in MODELES_UNITE:
        sans = modele.objects.filter(is_active=True).filter(
            Q(responsable__isnull=True) | ~Q(responsable__statut=Employee.Statut.ACTIF)
        ).order_by('nom').values('id', 'nom')
        lignes.extend({'type': type_unite, 'id': str(u['id']), 'nom': u['nom']} for u in sans)
    return lignes


def construire(params, user):
    qs = actifs()
    effectif = qs.count()
    avec_type = qs.exclude(type_contrat__isnull=True)
    nb_cdi = avec_type.filter(type_contrat__duree_indeterminee=True).count()
    sans_responsable = unites_sans_responsable()
    postes_vides = list(
        Poste.objects.filter(is_active=True)
        # exclude(poste__isnull=True) : un NULL dans un NOT IN viderait le résultat.
        .exclude(id__in=qs.exclude(poste__isnull=True).values('poste_id'))
        .order_by('nom').values_list('nom', flat=True)
    )
    kpis = [
        kpi('effectif_actif', effectif),
        kpi('effectif_sorti', Employee.objects.filter(statut__in=STATUTS_SORTIE).count()),
        kpi('part_cdi', taux(nb_cdi, avec_type.count()), '%'),
        kpi('taux_encadrement', taux(len(responsables_actifs_ids()), effectif), '%'),
        kpi('unites_sans_responsable', len(sans_responsable)),
    ]
    data = {
        'kpis': kpis,
        'repartition_direction': _repartition_direction(),
        'repartition_departement': _repartition_departement(),
        'repartition_categorie': _repartition_simple('categorie__nom'),
        'repartition_type_contrat': _repartition_simple('type_contrat__nom'),
        'repartition_fonction': _repartition_simple('poste__nom'),
        'unites_sans_responsable': sans_responsable,
        'postes_sans_titulaire': postes_vides,
    }
    data['exports'] = [
        table_kpis(kpis),
        table('Par direction', ['Direction', 'Effectif'],
              [[r['nom'], r['count']] for r in data['repartition_direction']]),
        table('Par département', ['Direction', 'Département', 'Effectif'],
              [[r['direction_nom'], r['nom'], r['count']] for r in data['repartition_departement']]),
        table('Profils', ['Axe', 'Valeur', 'Effectif'],
              [['Catégorie', r['nom'], r['count']] for r in data['repartition_categorie']]
              + [['Type de contrat', r['nom'], r['count']] for r in data['repartition_type_contrat']]
              + [['Fonction', r['nom'], r['count']] for r in data['repartition_fonction']]),
        table('Unités sans responsable', ['Type', 'Unité'], [[u['type'], u['nom']] for u in sans_responsable]),
        table('Postes sans titulaire', ['Fonction'], [[p] for p in postes_vides]),
    ]
    return data
```

- [ ] **Step 4 : `parite.py`**

```python
# backend/reporting/rh/parite.py
from collections import defaultdict
from statistics import mean

from django.db.models import Count
from django.utils import timezone

from audit.stats import AGE_TRANCHES
from employees.models import Employee
from reporting.rh.commun import (
    CLE_SEXE, actifs, annees_revolues, kpi, masquer, table, table_kpis, taux, tranche,
)
from reporting.rh.effectifs import responsables_actifs_ids

LIBELLES = {'hommes': 'Hommes', 'femmes': 'Femmes', 'non_renseigne': 'Non renseigné'}
AXES = [
    ('par_direction', 'direction__nom', 'Direction'),
    ('par_departement', 'departement__nom', 'Département'),
    ('par_categorie', 'categorie__nom', 'Catégorie'),
    ('par_type_contrat', 'type_contrat__nom', 'Type de contrat'),
    ('par_fonction', 'poste__nom', 'Fonction'),
]


def _compter(qs):
    compte = {'hommes': 0, 'femmes': 0, 'non_renseigne': 0}
    for r in qs.values('sexe').annotate(n=Count('id')):
        compte[CLE_SEXE.get(r['sexe'], 'non_renseigne')] += r['n']
    return compte


def _taux_f(compte):
    return taux(compte['femmes'], compte['hommes'] + compte['femmes'])


def _en_donut(compte):
    return [{'nom': LIBELLES[cle], 'count': n} for cle, n in compte.items() if n]


def _ventiler(qs, champ):
    par_nom = {}
    for r in qs.values(champ, 'sexe').annotate(n=Count('id')):
        nom = r[champ] or 'Non renseigné'
        ligne = par_nom.setdefault(nom, {'nom': nom, 'hommes': 0, 'femmes': 0, 'non_renseigne': 0})
        ligne[CLE_SEXE.get(r['sexe'], 'non_renseigne')] += r['n']
    lignes = []
    for ligne in par_nom.values():
        ligne['total'] = ligne['hommes'] + ligne['femmes'] + ligne['non_renseigne']
        ligne['taux_feminisation'] = _taux_f(ligne)
        lignes.append(ligne)
    lignes.sort(key=lambda l: -l['total'])
    return masquer(lignes, ('hommes', 'femmes', 'non_renseigne', 'taux_feminisation'))


def _pyramide_sexe(qs, ref):
    lignes = {lib: {'tranche': lib, 'hommes': 0, 'femmes': 0, 'non_renseigne': 0} for *_b, lib in AGE_TRANCHES}
    for naissance, sexe in qs.exclude(date_naissance__isnull=True).values_list('date_naissance', 'sexe'):
        lib = tranche(annees_revolues(naissance, ref), AGE_TRANCHES)
        if lib:
            lignes[lib][CLE_SEXE.get(sexe, 'non_renseigne')] += 1
    return list(lignes.values())


def _anciennete_par_sexe(qs, ref):
    par_sexe = defaultdict(list)
    for embauche, sexe in qs.exclude(date_embauche__isnull=True).values_list('date_embauche', 'sexe'):
        par_sexe[CLE_SEXE.get(sexe, 'non_renseigne')].append(annees_revolues(embauche, ref))
    return [
        {'sexe': LIBELLES[cle], 'anciennete_moyenne': round(mean(v), 1) if v else None}
        for cle in ('hommes', 'femmes', 'non_renseigne') for v in [par_sexe.get(cle, [])]
    ]


def construire(params, user):
    ref = timezone.localdate()
    qs = actifs()
    global_ = _compter(qs)
    encadrement = _compter(Employee.objects.filter(id__in=responsables_actifs_ids()))
    recrutes = _compter(Employee.objects.filter(date_embauche__range=[params.date_debut, params.date_fin]))
    debut_prec, fin_prec = params.periode_precedente
    recrutes_prec = _compter(Employee.objects.filter(date_embauche__range=[debut_prec, fin_prec]))
    kpis = [
        kpi('taux_feminisation', _taux_f(global_), '%'),
        kpi('sexe_non_renseigne', global_['non_renseigne']),
        kpi('feminisation_encadrement', _taux_f(encadrement), '%'),
        kpi('feminisation_recrutements', _taux_f(recrutes), '%', precedente=_taux_f(recrutes_prec)),
    ]
    data = {
        'kpis': kpis,
        'repartition': _en_donut(global_),
        'pyramide_age_sexe': _pyramide_sexe(qs, ref),
        'encadrement': _en_donut(encadrement),
        'recrutements': _en_donut(recrutes),
        'anciennete_par_sexe': _anciennete_par_sexe(qs, ref),
    }
    for cle, champ, _libelle in AXES:
        data[cle] = _ventiler(qs, champ)

    colonnes = ['Hommes', 'Femmes', 'Non renseigné', 'Total', 'Taux de féminisation (%)']
    data['exports'] = [
        table_kpis(kpis),
        table('Pyramide des âges par sexe', ['Tranche', 'Hommes', 'Femmes', 'Non renseigné'],
              [[l['tranche'], l['hommes'], l['femmes'], l['non_renseigne']] for l in data['pyramide_age_sexe']]),
        *[
            table(f'Par {libelle.lower()}', [libelle, *colonnes], [
                [l['nom'], l['hommes'], l['femmes'], l['non_renseigne'], l['total'], l['taux_feminisation']]
                for l in data[cle]
            ])
            for cle, _champ, libelle in AXES
        ],
    ]
    return data
```

- [ ] **Step 5 : vérifier** — `python -m pytest tests/test_reporting_rh.py -q --no-cov` — PASS.
- [ ] **Step 6 : commit** — `git commit -m "feat(reporting): pages Effectifs et Parité"`

---

### Task 3 : Démographie & retraites (prévisions, postes à risque)

**Files :** Modify `backend/reporting/rh/demographie.py` ; Test `backend/tests/test_reporting_rh.py`

**Interfaces :**
- Consumes : `commun.age_retraite`, `ajouter_annees`, `masquer` ; `audit.stats._pyramide_age`, `_pyramide_anciennete`.
- Produces : `kpis` (`age_moyen`, `age_median`, `anciennete_moyenne`, `part_55_plus`, `departs_retraite_12m`, `retraite_incertaine`, `naissance_inconnue`, `postes_a_risque`), `pyramide_age`, `pyramide_anciennete`, `previsions` [`{annee: 1..horizon, fin: 'AAAA-MM-JJ', departs, fins_cdd, effectif_projete}`], `deja_atteint` (int), `par_direction` [`{nom, total, age_moyen, anciennete_moyenne, nb_55_plus, departs_horizon, masque}`], `postes_a_risque` [`{poste, nb_titulaires, premiere_retraite, titulaires: [{matricule, nom, date_retraite}]}`], `horizon`.

- [ ] **Step 1 : tests qui échouent** (ajout)

```python
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
```

- [ ] **Step 2 : vérifier l'échec** — `-k Demographie` — FAIL.

- [ ] **Step 3 : `demographie.py`**

```python
# backend/reporting/rh/demographie.py
from collections import defaultdict
from statistics import mean, median

from django.utils import timezone

from audit.stats import _pyramide_age, _pyramide_anciennete
from employees.models import Contrat
from reporting.rh.commun import (
    actifs, age_retraite, ajouter_annees, annees_revolues, kpi, masquer, table, table_kpis, taux,
)


def _date_retraite(naissance, sexe):
    return ajouter_annees(naissance, age_retraite(sexe))


def construire(params, user):
    ref = timezone.localdate()
    horizon = params.horizon
    agents = list(actifs().values(
        'id', 'matricule', 'nom', 'prenom', 'sexe', 'date_naissance', 'date_embauche',
        'direction__nom', 'poste__nom',
    ))
    for a in agents:
        a['date_retraite'] = _date_retraite(a['date_naissance'], a['sexe']) if a['date_naissance'] else None
        a['age'] = annees_revolues(a['date_naissance'], ref) if a['date_naissance'] else None
        a['anciennete'] = annees_revolues(a['date_embauche'], ref) if a['date_embauche'] else None

    ages = [a['age'] for a in agents if a['age'] is not None]
    anciennetes = [a['anciennete'] for a in agents if a['anciennete'] is not None]
    limite_12m = ajouter_annees(ref, 1)
    partants_12m = [a for a in agents if a['date_retraite'] and a['date_retraite'] <= limite_12m]
    deja_atteint = sum(1 for a in agents if a['date_retraite'] and a['date_retraite'] <= ref)

    # Fins de contrats à durée déterminée connues (contrats actifs datés).
    fins_cdd = list(Contrat.objects.filter(
        statut='actif', employee__statut='actif', type_contrat__duree_indeterminee=False,
        date_fin__gt=ref, date_fin__lte=ajouter_annees(ref, horizon),
    ).values_list('employee_id', 'date_fin'))

    previsions = []
    for annee in range(1, horizon + 1):
        debut, fin = ajouter_annees(ref, annee - 1), ajouter_annees(ref, annee)
        departs = sum(1 for a in agents if a['date_retraite'] and (
            debut < a['date_retraite'] <= fin or (annee == 1 and a['date_retraite'] <= ref)))
        sortants = {a['id'] for a in agents if a['date_retraite'] and a['date_retraite'] <= fin}
        sortants |= {emp for emp, date_fin in fins_cdd if date_fin <= fin}
        previsions.append({
            'annee': annee, 'fin': fin.isoformat(), 'departs': departs,
            'fins_cdd': sum(1 for _e, date_fin in fins_cdd if debut < date_fin <= fin),
            'effectif_projete': len(agents) - len(sortants),
        })

    limite_horizon = ajouter_annees(ref, horizon)
    par_direction = defaultdict(list)
    for a in agents:
        par_direction[a['direction__nom'] or 'Non renseigné'].append(a)
    lignes_direction = []
    for nom, groupe in par_direction.items():
        ages_g = [a['age'] for a in groupe if a['age'] is not None]
        anc_g = [a['anciennete'] for a in groupe if a['anciennete'] is not None]
        lignes_direction.append({
            'nom': nom, 'total': len(groupe),
            'age_moyen': round(mean(ages_g), 1) if ages_g else None,
            'anciennete_moyenne': round(mean(anc_g), 1) if anc_g else None,
            'nb_55_plus': sum(1 for x in ages_g if x >= 55),
            'departs_horizon': sum(1 for a in groupe if a['date_retraite'] and a['date_retraite'] <= limite_horizon),
        })
    lignes_direction.sort(key=lambda l: -l['total'])
    masquer(lignes_direction, ('age_moyen', 'anciennete_moyenne', 'nb_55_plus', 'departs_horizon'))

    # Postes à risque : tous les titulaires, d'âge connu, partent dans l'horizon.
    par_poste = defaultdict(list)
    for a in agents:
        if a['poste__nom']:
            par_poste[a['poste__nom']].append(a)
    postes_a_risque = []
    for poste, titulaires in sorted(par_poste.items()):
        if all(t['date_retraite'] and t['date_retraite'] <= limite_horizon for t in titulaires):
            postes_a_risque.append({
                'poste': poste, 'nb_titulaires': len(titulaires),
                'premiere_retraite': min(t['date_retraite'] for t in titulaires).isoformat(),
                'titulaires': [
                    {'matricule': t['matricule'], 'nom': f"{t['prenom']} {t['nom']}",
                     'date_retraite': t['date_retraite'].isoformat()}
                    for t in sorted(titulaires, key=lambda t: t['date_retraite'])
                ],
            })
    postes_a_risque.sort(key=lambda p: p['premiere_retraite'])

    kpis = [
        kpi('age_moyen', round(mean(ages), 1) if ages else None, 'ans'),
        kpi('age_median', median(ages) if ages else None, 'ans'),
        kpi('anciennete_moyenne', round(mean(anciennetes), 1) if anciennetes else None, 'ans'),
        kpi('part_55_plus', taux(sum(1 for x in ages if x >= 55), len(ages)), '%'),
        kpi('departs_retraite_12m', len(partants_12m)),
        kpi('retraite_incertaine', sum(1 for a in partants_12m if not a['sexe'])),
        kpi('naissance_inconnue', sum(1 for a in agents if a['date_naissance'] is None)),
        kpi('postes_a_risque', len(postes_a_risque)),
    ]
    data = {
        'kpis': kpis, 'horizon': horizon, 'deja_atteint': deja_atteint,
        'pyramide_age': _pyramide_age(), 'pyramide_anciennete': _pyramide_anciennete(),
        'previsions': previsions, 'par_direction': lignes_direction, 'postes_a_risque': postes_a_risque,
    }
    data['exports'] = [
        table_kpis(kpis),
        table('Prévisions', ['Année', "Jusqu'au", 'Départs à la retraite', 'Fins de CDD', 'Effectif projeté'],
              [[p['annee'], p['fin'], p['departs'], p['fins_cdd'], p['effectif_projete']] for p in previsions]),
        table('Par direction', ['Direction', 'Effectif', 'Âge moyen', 'Ancienneté moyenne', '55 ans et plus',
                                f'Départs sous {horizon} ans'],
              [[l['nom'], l['total'], l['age_moyen'], l['anciennete_moyenne'], l['nb_55_plus'], l['departs_horizon']]
               for l in lignes_direction]),
        table('Postes à risque', ['Fonction', 'Titulaires', 'Première retraite', 'Détail'],
              [[p['poste'], p['nb_titulaires'], p['premiere_retraite'],
                ', '.join(f"{t['nom']} ({t['date_retraite']})" for t in p['titulaires'])]
               for p in postes_a_risque]),
    ]
    return data
```

- [ ] **Step 4 : vérifier** — `python -m pytest tests/test_reporting_rh.py -q --no-cov` — PASS.
- [ ] **Step 5 : commit** — `git commit -m "feat(reporting): démographie, prévisions de retraite (60/55 ans) et postes à risque"`

---

### Task 4 : Contrats, Qualité des données, Activité des comptes

**Files :** Modify `backend/reporting/rh/contrats.py`, `qualite.py`, `activite.py` ; Test `backend/tests/test_reporting_rh.py`

**Interfaces :**
- Consumes : `audit.stats._contrats_echeance`, `_repartition_simple`, `_completude_par_direction`, `_completude_par_departement`, `_employes_complets`, `_mon_activite`, `_activite_par_admin`.
- Produces : Contrats → `contrats_echeance`, `contrats_echus` [`{id, numero_contrat, employee_matricule, employee_nom, date_fin, jours_depasses}`], `cdd_enchaines` [`{matricule, nom, nb_cdd}`], `repartition_type_contrat`, `echeance_jours` ; Qualité → `champs_manquants` [`{champ, libelle, nb, taux}`], `completude_par_direction`, `completude_par_departement`, `incoherences` [`{code, libelle, lignes: [{matricule, nom, detail}]}`] ; Activité → `mon_activite` (dict), `activite_par_admin` (liste, SUPERADMIN seulement).

- [ ] **Step 1 : tests qui échouent** (ajout)

```python
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
```

(Note : dans `test_champs_manquants…`, l'employé de la fixture a `nom='Dupont'` en base ; le serializer met les noms en majuscules mais pas `objects.create`. La détection des doublons compare en majuscules, d'où le `nom=employee.nom.upper()` volontaire : le test vérifie aussi l'insensibilité à la casse.)

- [ ] **Step 2 : vérifier l'échec** — `-k "Contrats or Qualite or Activite"` — FAIL.

- [ ] **Step 3 : `contrats.py`**

```python
# backend/reporting/rh/contrats.py
from statistics import mean

from django.db.models import Count, Q
from django.utils import timezone

from audit.stats import _contrats_echeance, _repartition_simple
from employees.models import Contrat
from reporting.rh.commun import actifs, kpi, table, table_kpis


def construire(params, user):
    ref = timezone.localdate()
    echeance = _contrats_echeance(params.echeance_jours)
    echus = [
        {
            'id': str(c.id), 'numero_contrat': c.numero_contrat,
            'employee_matricule': c.employee.matricule, 'employee_nom': f'{c.employee.prenom} {c.employee.nom}',
            'date_fin': c.date_fin.isoformat(), 'jours_depasses': (ref - c.date_fin).days,
        }
        for c in Contrat.objects.filter(statut='actif', date_fin__lt=ref).select_related('employee').order_by('date_fin')
    ]
    cdd = Q(contrats__type_contrat__duree_indeterminee=False)
    enchaines = [
        {'matricule': e['matricule'], 'nom': f"{e['prenom']} {e['nom']}", 'nb_cdd': e['nb_cdd']}
        for e in actifs().annotate(nb_cdd=Count('contrats', filter=cdd)).filter(nb_cdd__gte=2)
        .order_by('-nb_cdd', 'nom').values('matricule', 'nom', 'prenom', 'nb_cdd')
    ]
    cdd_actifs = Contrat.objects.filter(statut='actif', type_contrat__duree_indeterminee=False)
    durees = [
        (fin - debut).days for debut, fin in Contrat.objects.filter(
            type_contrat__duree_indeterminee=False, date_debut__isnull=False, date_fin__isnull=False,
        ).values_list('date_debut', 'date_fin') if fin >= debut
    ]
    kpis = [
        kpi('contrats_echeance', len(echeance)),
        kpi('contrats_echus', len(echus)),
        kpi('cdd_actifs', cdd_actifs.count()),
        kpi('duree_moyenne_cdd', round(mean(durees) / 30.44, 1) if durees else None, 'mois'),
        kpi('cdd_enchaines', len(enchaines)),
    ]
    data = {
        'kpis': kpis, 'echeance_jours': params.echeance_jours,
        'contrats_echeance': echeance, 'contrats_echus': echus, 'cdd_enchaines': enchaines,
        'repartition_type_contrat': _repartition_simple('type_contrat__nom'),
    }
    data['exports'] = [
        table_kpis(kpis),
        table(f'Échéances {params.echeance_jours} j', ['N° contrat', 'Matricule', 'Employé', 'Date de fin', 'Jours restants'],
              [[c['numero_contrat'], c['employee_matricule'], c['employee_nom'], c['date_fin'], c['jours_restants']]
               for c in echeance]),
        table('Contrats échus', ['N° contrat', 'Matricule', 'Employé', 'Date de fin', 'Jours de dépassement'],
              [[c['numero_contrat'], c['employee_matricule'], c['employee_nom'], c['date_fin'], c['jours_depasses']]
               for c in echus]),
        table('Contrats successifs', ['Matricule', 'Employé', 'Nombre de CDD'],
              [[e['matricule'], e['nom'], e['nb_cdd']] for e in enchaines]),
    ]
    return data
```

- [ ] **Step 4 : `qualite.py`**

```python
# backend/reporting/rh/qualite.py
from functools import reduce
from operator import or_

from django.db.models import Count, F, Q
from django.db.models.functions import Upper

from audit.stats import _completude_par_departement, _completude_par_direction, _employes_complets
from employees.models import Contrat, Employee, TypeDocument
from reporting.rh.commun import STATUTS_SORTIE, actifs, kpi, table, table_kpis, taux

CHAMPS = [
    ('date_naissance', 'Date de naissance'), ('date_embauche', 'Date de recrutement'), ('sexe', 'Sexe'),
    ('direction', 'Direction'), ('poste', 'Fonction'), ('type_contrat', 'Type de contrat'),
    ('categorie', 'Catégorie'),
]
LIMITE_LISTE = 100


def _manque(champ):
    return Q(sexe='') if champ == 'sexe' else Q(**{f'{champ}__isnull': True})


def _ligne(e, detail=''):
    return {'matricule': e['matricule'], 'nom': f"{e['prenom']} {e['nom']}", 'detail': detail}


def _incoherences():
    valeurs = ('matricule', 'nom', 'prenom')
    sortis_sans_motif = Employee.objects.filter(statut__in=STATUTS_SORTIE, motif_archivage__isnull=True)
    naissance_apres_embauche = Employee.objects.filter(date_naissance__gte=F('date_embauche'))
    contrats_inverses = Contrat.objects.filter(date_fin__lt=F('date_debut')).select_related('employee')
    groupes = (Employee.objects.exclude(date_naissance__isnull=True)
               .annotate(nom_maj=Upper('nom'), prenom_maj=Upper('prenom'))
               .values('nom_maj', 'prenom_maj', 'date_naissance').annotate(n=Count('id')).filter(n__gt=1))
    doublons = []
    if groupes:
        cle = reduce(or_, (Q(nom__iexact=g['nom_maj'], prenom__iexact=g['prenom_maj'],
                             date_naissance=g['date_naissance']) for g in groupes))
        doublons = [_ligne(e, f"né(e) le {e['date_naissance'].isoformat()}")
                    for e in Employee.objects.filter(cle).order_by('nom', 'prenom')
                    .values(*valeurs, 'date_naissance')[:LIMITE_LISTE]]
    return [
        {'code': 'sortis_sans_motif', 'libelle': "Sortis sans motif d'archivage",
         'lignes': [_ligne(e) for e in sortis_sans_motif.order_by('nom').values(*valeurs)[:LIMITE_LISTE]]},
        {'code': 'naissance_apres_embauche', 'libelle': 'Date de naissance postérieure au recrutement',
         'lignes': [_ligne(e) for e in naissance_apres_embauche.order_by('nom').values(*valeurs)[:LIMITE_LISTE]]},
        {'code': 'contrats_inverses', 'libelle': 'Contrat dont la fin précède le début',
         'lignes': [{'matricule': c.employee.matricule, 'nom': f'{c.employee.prenom} {c.employee.nom}',
                     'detail': c.numero_contrat} for c in contrats_inverses[:LIMITE_LISTE]]},
        {'code': 'doublons', 'libelle': 'Doublons probables (même nom, prénom et date de naissance)',
         'lignes': doublons},
    ]


def construire(params, user):
    qs = actifs()
    total = qs.count()
    manquants = []
    for champ, libelle in CHAMPS:
        nb = qs.filter(_manque(champ)).count()
        manquants.append({'champ': champ, 'libelle': libelle, 'nb': nb, 'taux': taux(nb, total)})
    incompletes = qs.filter(reduce(or_, (_manque(c) for c, _l in CHAMPS))).count()
    ids = list(TypeDocument.objects.filter(obligatoire=True, is_active=True, sous_types__isnull=True)
               .values_list('id', flat=True))
    complets = _employes_complets(ids).count() if ids else total
    incoherences = _incoherences()
    kpis = [
        kpi('completude', taux(complets, total), '%'),
        kpi('fiches_incompletes', incompletes),
        kpi('incoherences', sum(len(i['lignes']) for i in incoherences)),
    ]
    data = {
        'kpis': kpis, 'champs_manquants': manquants, 'incoherences': incoherences,
        'completude_par_direction': _completude_par_direction(),
        'completude_par_departement': _completude_par_departement(),
    }
    data['exports'] = [
        table_kpis(kpis),
        table('Champs manquants', ['Donnée', 'Actifs concernés', 'Part (%)'],
              [[m['libelle'], m['nb'], m['taux']] for m in manquants]),
        table('Complétude', ['Direction', 'Département', 'Total', 'Complets', 'Taux (%)'],
              [[r['nom'], '', r['total'], r['complets'], r['taux']] for r in data['completude_par_direction']]
              + [[r['direction_nom'], r['nom'], r['total'], r['complets'], r['taux']]
                 for r in data['completude_par_departement']]),
        table('Incohérences', ['Anomalie', 'Matricule', 'Employé', 'Détail'],
              [[i['libelle'], l['matricule'], l['nom'], l['detail']] for i in incoherences for l in i['lignes']]),
    ]
    return data
```

- [ ] **Step 5 : `activite.py`**

```python
# backend/reporting/rh/activite.py
"""« Mon activité » et « Activité par administrateur » de l'ancienne page
/statistiques, reprises telles quelles (audit/stats.py)."""
from audit.stats import _activite_par_admin, _mon_activite
from reporting.rh.commun import kpi, table, table_kpis

COLONNES = [
    ('employes_crees', 'Employés créés'), ('employes_transferts', 'Transferts'),
    ('employes_carriere', 'Carrière'), ('employes_champs', 'Champs'), ('employes_photo', 'Photos'),
    ('employes_archives', 'Archivages'), ('employes_restaures', 'Restaurations'),
    ('employes_supprimes', 'Suppressions définitives'), ('employes_autres', 'Autres'),
    ('contrats_crees_modifies', 'Contrats créés/modifiés'), ('contrats_supprimes', 'Contrats supprimés'),
    ('documents_uploades', 'Documents uploadés'), ('documents_supprimes', 'Documents supprimés'),
    ('documents_modifies', 'Documents modifiés'), ('comptes_mdp', 'Mots de passe'),
]


def construire(params, user):
    mon_activite = _mon_activite(user, params.date_debut, params.date_fin)
    kpis = [kpi('mes_actions', sum(v for v in mon_activite.values() if isinstance(v, int)))]
    data = {'kpis': kpis, 'mon_activite': mon_activite}
    exports = [table_kpis(kpis), table('Mon activité', ['Action', 'Nombre'],
                                       [[libelle, mon_activite.get(cle, 0)] for cle, libelle in COLONNES])]
    if getattr(user, 'is_superadmin', False):
        data['activite_par_admin'] = _activite_par_admin(params.date_debut, params.date_fin)
        exports.append(table('Par administrateur', ['Compte', *[l for _c, l in COLONNES]],
                             [[a['nom_complet'], *[a.get(c, 0) for c, _l in COLONNES]]
                              for a in data['activite_par_admin']]))
    data['exports'] = exports
    return data
```

- [ ] **Step 6 : vérifier** — `python -m pytest tests/test_reporting_rh.py -q --no-cov` — PASS.
- [ ] **Step 7 : commit** — `git commit -m "feat(reporting): contrats, qualité des données, activité des comptes"`

---

### Task 5 : Synthèse DRH (KPI clés + alertes) et garde-fou de performance

**Files :** Modify `backend/reporting/rh/synthese.py` ; Test `backend/tests/test_reporting_rh.py`

**Interfaces :**
- Consumes : les constructeurs des tâches 2 à 4 ; `audit.stats._indicateurs(date_debut, date_fin)` (clés `recrutements`, `archivages` → `{'valeur', 'variation_pct'}`).
- Produces : `kpis` (9 codes, dans l'ordre : `effectif_actif`, `recrutements`, `sorties`, `taux_feminisation`, `age_moyen`, `anciennete_moyenne`, `departs_retraite_12m`, `contrats_echeance`, `completude`) ; `alertes` [`{niveau: 'danger'|'attention'|'info', texte, lien}`].

- [ ] **Step 1 : tests qui échouent** (ajout)

```python
from django.db import connection
from django.test.utils import CaptureQueriesContext


class TestSynthese:
    def test_kpis_et_alertes(self, admin_user, employee, type_contrat):
        Contrat.objects.create(numero_contrat='S-1', employee=employee, type_contrat=type_contrat,
                               date_debut=date(2025, 1, 1), date_fin=timezone.localdate() + timedelta(days=10),
                               created_by=admin_user)
        data = _client(admin_user).get(_url('synthese')).data
        assert [k['code'] for k in data['kpis']] == [
            'effectif_actif', 'recrutements', 'sorties', 'taux_feminisation', 'age_moyen',
            'anciennete_moyenne', 'departs_retraite_12m', 'contrats_echeance', 'completude',
        ]
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
            _emp(employee, f'Q{i}', sexe='F', date_naissance=_il_y_a(40))
        with CaptureQueriesContext(connection) as beaucoup:
            client.get(_url('synthese'))
        assert len(beaucoup) == len(peu)
```

- [ ] **Step 2 : vérifier l'échec** — `-k Synthese` — FAIL.

- [ ] **Step 3 : `synthese.py`**

```python
# backend/reporting/rh/synthese.py
from dataclasses import replace

from audit.stats import _indicateurs
from reporting.rh import contrats, demographie, effectifs, parite, qualite
from reporting.rh.commun import kpi, table, table_kpis


def _par_code(resultat):
    return {k['code']: k for k in resultat['kpis']}


def construire(params, user):
    eff = effectifs.construire(params, user)
    par = parite.construire(params, user)
    dem = demographie.construire(params, user)
    con = contrats.construire(replace(params, echeance_jours=30), user)
    qua = qualite.construire(params, user)
    ind = _indicateurs(params.date_debut, params.date_fin)
    k_eff, k_par, k_dem, k_con, k_qua = map(_par_code, (eff, par, dem, con, qua))

    kpis = [
        k_eff['effectif_actif'],
        kpi('recrutements', ind['recrutements']['valeur'], variation=ind['recrutements']['variation_pct']),
        kpi('sorties', ind['archivages']['valeur'], variation=ind['archivages']['variation_pct']),
        k_par['taux_feminisation'], k_dem['age_moyen'], k_dem['anciennete_moyenne'],
        k_dem['departs_retraite_12m'], k_con['contrats_echeance'], k_qua['completude'],
    ]

    alertes = []

    def alerte(nombre, niveau, texte, lien):
        if nombre:
            alertes.append({'niveau': niveau, 'texte': texte, 'lien': lien})

    n = len(con['contrats_echus'])
    alerte(n, 'danger', f"{n} contrat(s) échu(s) encore au statut Actif", '/statistiques/contrats')
    n = len(con['contrats_echeance'])
    alerte(n, 'danger', f"{n} contrat(s) arrivent à échéance dans les 30 jours", '/statistiques/contrats')
    n = len(dem['postes_a_risque'])
    alerte(n, 'attention', f"{n} poste(s) à risque : tous les titulaires partent à la retraite d'ici "
                           f"{params.horizon} ans", '/statistiques/demographie')
    n = len(eff['unites_sans_responsable'])
    alerte(n, 'attention', f"{n} unité(s) sans responsable actif", '/statistiques/effectifs')
    n = k_par['sexe_non_renseigne']['valeur']
    alerte(n, 'info', f"{n} actif(s) sans sexe renseigné : les taux de parité sont partiels",
           '/employees?sexe=non_renseigne')
    n = k_qua['fiches_incompletes']['valeur']
    alerte(n, 'info', f"{n} fiche(s) d'actifs incomplète(s)", '/statistiques/qualite')
    n = k_qua['incoherences']['valeur']
    alerte(n, 'info', f"{n} incohérence(s) de données à vérifier", '/statistiques/qualite')

    return {
        'kpis': kpis, 'alertes': alertes,
        'exports': [table_kpis(kpis), table('Alertes', ['Niveau', 'Alerte'],
                                            [[a['niveau'], a['texte']] for a in alertes])],
    }
```

- [ ] **Step 4 : vérifier** — `python -m pytest tests/test_reporting_rh.py -q --no-cov` puis suite complète `python -m pytest tests/ -q --no-cov` — PASS.
- [ ] **Step 5 : commit** — `git commit -m "feat(reporting): synthèse DRH (indicateurs clés, alertes)"`

---

### Task 6 : socle React — tokens, menu, route, hook, composants

**Files :**
- Create : `frontend/src/config/reportingPages.js`, `frontend/src/hooks/useRapportRH.js`, `frontend/src/components/reporting/{periodes.js,RapportLayout.jsx,KpiGrid.jsx,Carte.jsx,TableauSimple.jsx,PyramideSexe.jsx,AlertesListe.jsx,BarreTaux.jsx}`, `frontend/src/pages/reporting/RapportRH.jsx`
- Modify : `frontend/src/styles/theme.js`, `frontend/src/App.js`, `frontend/src/components/Navbar.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/components/dashboard/ContratsEcheanceCard.jsx`, `frontend/src/__tests__/Dashboard.test.jsx`
- Test : `frontend/src/__tests__/Reporting.test.jsx`

**Interfaces :**
- Produces : `STATISTIQUES_PAGES` [`{page, path, label, description}`] ; `useRapportRH(page, initialParams) -> {data, loading, error, params, refresh(partialParams)}` ; `presetToRange(preset) -> {date_debut, date_fin} | null` ; composants : `RapportLayout({def, params, onParams, children, filtres})`, `KpiGrid({kpis})`, `Carte({titre, action, children, pleine})`, `TableauSimple({colonnes: [{cle, libelle, format?}], lignes, vide, onLigne})`, `PyramideSexe({lignes})`, `AlertesListe({alertes})`, `BarreTaux({libelle, sous, taux, onClick})`. Chaque page : composant `({data, params, onParams})`.

- [ ] **Step 1 : tests qui échouent**

```jsx
// frontend/src/__tests__/Reporting.test.jsx
import React from "react";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
let mockRole = "ADMIN";
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: mockRole, username: "admin" } }),
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

import api from "../services/api";
import RapportRH from "../pages/reporting/RapportRH";

const render = (ui) => rtlRender(ui, { wrapper: ThemeProvider });
const kpi = (code, libelle, valeur, extra = {}) => ({
  code, libelle, valeur, unite: "", variation_pct: null, definition: `Définition de ${libelle}`, ...extra,
});
const periode = { debut: "2025-10-30", fin: "2026-10-30" };

const renderPage = (page) =>
  render(
    <MemoryRouter initialEntries={[`/statistiques/${page}`]}>
      <Routes>
        <Route path="/statistiques/:page" element={<RapportRH />} />
        <Route path="/statistiques/synthese" element={<div>synthese-redirect</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "ADMIN";
});

describe("Reporting RH — Synthèse", () => {
  const synthese = {
    periode,
    kpis: [kpi("effectif_actif", "Effectif actif", 42), kpi("taux_feminisation", "Taux de féminisation", 38.5, { unite: "%", variation_pct: 4.2 })],
    alertes: [{ niveau: "danger", texte: "3 contrat(s) arrivent à échéance dans les 30 jours", lien: "/statistiques/contrats" }],
  };

  test("affiche les KPI, leur définition et les alertes", async () => {
    api.get.mockResolvedValue({ data: synthese });
    renderPage("synthese");
    expect(await screen.findByText("Effectif actif")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("38.5 %")).toBeInTheDocument();
    expect(screen.getByText("+4.2%")).toBeInTheDocument();
    expect(screen.getByTitle("Définition de Effectif actif")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/arrivent à échéance/));
    expect(mockNavigate).toHaveBeenCalledWith("/statistiques/contrats");
    expect(api.get).toHaveBeenCalledWith("/reporting/rh/synthese/", expect.objectContaining({ params: expect.any(Object) }));
  });

  test("changer de période recharge sans démonter la page", async () => {
    api.get.mockResolvedValue({ data: synthese });
    renderPage("synthese");
    await screen.findByText("Effectif actif");
    fireEvent.click(screen.getByText("30 jours"));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Effectif actif")).toBeInTheDocument();
  });

  test("export Excel avec le paramètre fmt", async () => {
    api.get.mockResolvedValueOnce({ data: synthese }).mockResolvedValueOnce({ data: new Blob(["x"]) });
    global.URL.createObjectURL = jest.fn(() => "blob:x");
    global.URL.revokeObjectURL = jest.fn();
    renderPage("synthese");
    await screen.findByText("Effectif actif");
    fireEvent.click(screen.getByText("Exporter"));
    fireEvent.click(screen.getByText("Excel (.xlsx)"));
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith("/reporting/rh/synthese/", expect.objectContaining({
        params: expect.objectContaining({ fmt: "xlsx" }), responseType: "blob",
      })),
    );
  });

  test("message d'erreur si l'API échoue", async () => {
    api.get.mockRejectedValue(new Error("boom"));
    renderPage("synthese");
    expect(await screen.findByText("Impossible de charger ce rapport.")).toBeInTheDocument();
  });

  test("page inconnue : redirection vers la synthèse", async () => {
    renderPage("salaires");
    expect(await screen.findByText("synthese-redirect")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : vérifier l'échec** — `cd frontend && CI=true npm test -- --watchAll=false Reporting` — FAIL (module introuvable).

- [ ] **Step 3 : tokens H/F** — dans `styles/theme.js`, thème clair, après `serviceColor` : `sexeHommeColor: "#1e40af", sexeFemmeColor: "#be185d",` ; thème sombre, après `serviceColor` : `sexeHommeColor: "#60a5fa", sexeFemmeColor: "#f472b6",`.

- [ ] **Step 4 : liste des pages, périodes, hook**

```js
// frontend/src/config/reportingPages.js
// Pages du menu « Statistiques » — seule liste, partagée par la navbar et le
// routeur (pages/reporting/RapportRH.jsx). Backend : GET /reporting/rh/<page>/.
export const STATISTIQUES_PAGES = [
  { page: "synthese", path: "/statistiques/synthese", label: "Synthèse DRH",
    description: "Indicateurs clés et alertes" },
  { page: "effectifs", path: "/statistiques/effectifs", label: "Effectifs",
    description: "Structure, répartitions, encadrement" },
  { page: "parite", path: "/statistiques/parite", label: "Parité",
    description: "Répartition hommes / femmes par unité et profil" },
  { page: "demographie", path: "/statistiques/demographie", label: "Démographie & retraites",
    description: "Âges, ancienneté, départs prévisibles, postes à risque" },
  { page: "contrats", path: "/statistiques/contrats", label: "Contrats",
    description: "Échéances, contrats échus, contrats successifs" },
  { page: "qualite", path: "/statistiques/qualite", label: "Qualité des données",
    description: "Complétude, données manquantes, incohérences" },
  { page: "activite", path: "/statistiques/activite", label: "Activité des comptes",
    description: "Actions des administrateurs sur la période" },
];
```

```js
// frontend/src/components/reporting/periodes.js
const toIso = (d) => d.toLocaleDateString("en-CA");

export const PRESETS = [
  { key: "30j", label: "30 jours" },
  { key: "3m", label: "3 mois" },
  { key: "12m", label: "12 mois" },
  { key: "annee", label: "Année en cours" },
];

export const presetToRange = (preset) => {
  const fin = new Date();
  const debut = new Date();
  if (preset === "30j") debut.setDate(fin.getDate() - 30);
  else if (preset === "3m") debut.setMonth(fin.getMonth() - 3);
  else if (preset === "12m") debut.setFullYear(fin.getFullYear() - 1);
  else if (preset === "annee") { debut.setMonth(0); debut.setDate(1); }
  else return null;
  return { date_debut: toIso(debut), date_fin: toIso(fin) };
};
```

```js
// frontend/src/hooks/useRapportRH.js
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";

// Une page du reporting RH. `refresh(partiel)` recharge SANS démonter la page
// (pas de passage par loading=true) : scroll et sélection conservés.
export default function useRapportRH(page, initialParams) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [params, setParams] = useState(initialParams);
  const initial = useRef(initialParams);

  const charger = useCallback(async (p, silencieux) => {
    if (!silencieux) setLoading(true);
    setError("");
    try {
      const res = await api.get(`/reporting/rh/${page}/`, { params: p });
      setData(res.data);
    } catch {
      setError("Impossible de charger ce rapport.");
    } finally {
      if (!silencieux) setLoading(false);
    }
  }, [page]);

  useEffect(() => { charger(initial.current, false); }, [charger]);

  const refresh = (partiel) => {
    const next = { ...params, ...partiel };
    setParams(next);
    charger(next, true);
  };

  return { data, loading, error, params, refresh };
}
```

- [ ] **Step 5 : composants du socle**

```jsx
// frontend/src/components/reporting/Carte.jsx
import { useTheme } from "../../context/ThemeContext";

export default function Carte({ titre, action, children, style }) {
  const theme = useTheme();
  return (
    <section
      className="anim-fade-in"
      style={{
        background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16,
        padding: 24, boxShadow: theme.shadowMd, marginBottom: 20, minWidth: 0, ...style,
      }}
    >
      {(titre || action) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {titre && <h2 style={{ color: theme.text, margin: 0, fontSize: 15, fontWeight: 700 }}>{titre}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
```

```jsx
// frontend/src/components/reporting/KpiGrid.jsx
import { useTheme } from "../../context/ThemeContext";

const formater = (valeur, unite) => {
  if (valeur === null || valeur === undefined) return "—";
  return unite ? `${valeur} ${unite}` : `${valeur}`;
};

export default function KpiGrid({ kpis }) {
  const theme = useTheme();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
      {kpis.map((k, i) => {
        const hasVar = k.variation_pct !== null && k.variation_pct !== undefined;
        return (
          <div
            key={k.code}
            className={`card-lift anim-slide-up delay-${Math.min(i + 1, 5)}`}
            style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: theme.shadowMd }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: theme.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 8 }}>
              <span>{k.libelle}</span>
              <span
                title={k.definition}
                aria-label={`Définition : ${k.libelle}`}
                style={{ cursor: "help", color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: "50%", width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, textTransform: "none" }}
              >
                i
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ color: theme.primary, fontSize: 28, fontWeight: 800 }}>{formater(k.valeur, k.unite)}</span>
              {hasVar && (
                <span style={{ color: k.variation_pct >= 0 ? theme.primary : theme.danger, fontSize: 13, fontWeight: 700 }}>
                  {k.variation_pct >= 0 ? "+" : ""}{k.variation_pct}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

```jsx
// frontend/src/components/reporting/TableauSimple.jsx
import { useTheme } from "../../context/ThemeContext";

// colonnes : [{ cle, libelle, format? }]. Une ligne `masque` (effectif sous
// le seuil, voir backend reporting/rh/commun.masquer) affiche « — » et une
// info-bulle au lieu des valeurs masquées.
export default function TableauSimple({ colonnes, lignes, vide = "Aucune donnée.", onLigne }) {
  const theme = useTheme();
  if (!lignes || lignes.length === 0) {
    return <div style={{ color: theme.textMuted, fontSize: 13 }}>{vide}</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${theme.border}`, textAlign: "left" }}>
            {colonnes.map((c) => (
              <th key={c.cle} style={{ padding: "8px 6px", color: theme.textSecondary, whiteSpace: "nowrap" }}>{c.libelle}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr
              key={l.id || `${l.nom || l.matricule || ""}-${i}`}
              onClick={onLigne ? () => onLigne(l) : undefined}
              title={l.masque ? "Effectif trop faible : détail masqué pour protéger l'anonymat" : undefined}
              style={{ borderBottom: `1px solid ${theme.borderLight}`, cursor: onLigne ? "pointer" : "default" }}
            >
              {colonnes.map((c) => {
                const v = l[c.cle];
                const texte = v === null || v === undefined ? "—" : c.format ? c.format(v, l) : v;
                return <td key={c.cle} style={{ padding: "8px 6px", color: theme.text }}>{texte}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

```jsx
// frontend/src/components/reporting/PyramideSexe.jsx
import { useTheme } from "../../context/ThemeContext";

// Pyramide des âges : hommes à gauche, femmes à droite (lignes {tranche, hommes, femmes}).
export default function PyramideSexe({ lignes }) {
  const theme = useTheme();
  const max = Math.max(1, ...lignes.flatMap((l) => [l.hommes, l.femmes]));
  const barre = (n, couleur, cote) => (
    <div style={{ flex: 1, display: "flex", justifyContent: cote === "gauche" ? "flex-end" : "flex-start", alignItems: "center", gap: 6 }}>
      {cote === "gauche" && <span style={{ fontSize: 11, color: theme.textSecondary }}>{n}</span>}
      <div style={{ width: `${(n / max) * 100}%`, minWidth: n ? 3 : 0, height: 16, background: couleur, borderRadius: 4 }} />
      {cote === "droite" && <span style={{ fontSize: 11, color: theme.textSecondary }}>{n}</span>}
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
        <span style={{ color: theme.sexeHommeColor }}>Hommes</span>
        <span style={{ color: theme.sexeFemmeColor }}>Femmes</span>
      </div>
      {[...lignes].reverse().map((l) => (
        <div key={l.tranche} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          {barre(l.hommes, theme.sexeHommeColor, "gauche")}
          <span style={{ width: 52, textAlign: "center", fontSize: 12, color: theme.text }}>{l.tranche}</span>
          {barre(l.femmes, theme.sexeFemmeColor, "droite")}
        </div>
      ))}
    </div>
  );
}
```

```jsx
// frontend/src/components/reporting/AlertesListe.jsx
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";

export default function AlertesListe({ alertes }) {
  const theme = useTheme();
  const navigate = useNavigate();
  if (!alertes || alertes.length === 0) {
    return <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune alerte.</div>;
  }
  const couleurs = {
    danger: { fond: theme.dangerBg, bord: theme.dangerBorder, texte: theme.danger },
    attention: { fond: theme.accentBg, bord: theme.accentBorder, texte: theme.warning },
    info: { fond: theme.bg, bord: theme.border, texte: theme.textSecondary },
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {alertes.map((a) => {
        const c = couleurs[a.niveau] || couleurs.info;
        return (
          <button
            key={a.texte}
            type="button"
            onClick={() => navigate(a.lien)}
            style={{ textAlign: "left", background: c.fond, border: `1px solid ${c.bord}`, color: c.texte, borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: theme.fontFamily }}
          >
            {a.texte} →
          </button>
        );
      })}
    </div>
  );
}
```

```jsx
// frontend/src/components/reporting/BarreTaux.jsx
import { useTheme } from "../../context/ThemeContext";

export default function BarreTaux({ libelle, sous, taux, onClick }) {
  const theme = useTheme();
  const couleur = taux >= 80 ? theme.primary : taux >= 50 ? theme.accent : theme.danger;
  return (
    <div onClick={onClick} style={{ marginBottom: 12, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
        <span style={{ color: theme.text }}>
          {libelle}
          {sous && <span style={{ color: theme.textMuted, fontSize: 11, marginLeft: 6 }}>({sous})</span>}
        </span>
        <span style={{ color: theme.textSecondary, fontWeight: 700 }}>{taux}%</span>
      </div>
      <div style={{ background: theme.borderLight, borderRadius: 6, height: 8, overflow: "hidden", border: `1px solid ${theme.border}` }}>
        <div style={{ height: "100%", width: `${Math.max(taux, taux > 0 ? 2 : 0)}%`, background: couleur, borderRadius: 6, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}
```

```jsx
// frontend/src/components/reporting/RapportLayout.jsx
import { useState } from "react";
import api from "../../services/api";
import Navbar from "../Navbar";
import PageBackground from "../PageBackground";
import HeroDecor from "../HeroDecor";
import { heroPadding, contentPadding } from "../../styles/theme";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";
import { PRESETS, presetToRange } from "./periodes";
import "../../styles/animations.css";

export default function RapportLayout({ def, params, onParams, filtres, children }) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const [preset, setPreset] = useState("12m");
  const [menuExport, setMenuExport] = useState(false);
  const [erreurExport, setErreurExport] = useState("");

  const choisirPreset = (key) => {
    setPreset(key);
    onParams(presetToRange(key));
  };
  const changerDate = (champ, valeur) => {
    setPreset(null);
    if (valeur) onParams({ [champ]: valeur });
  };

  const exporterExcel = async () => {
    setMenuExport(false);
    setErreurExport("");
    try {
      const res = await api.get(`/reporting/rh/${def.page}/`, { params: { ...params, fmt: "xlsx" }, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport_${def.page}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErreurExport("Impossible d'exporter ce rapport.");
    }
  };

  const champDate = { border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily, background: theme.surface, color: theme.text };
  const itemMenu = { display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: theme.text, fontFamily: theme.fontFamily };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: theme.directionGrad, padding: heroPadding(isMobile), position: "relative", overflow: "hidden" }}>
        <HeroDecor />
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ color: theme.textOnDarkMuted || "inherit", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.7 }}>
            Statistiques
          </div>
          <h1 style={{ color: theme.textOnDark || theme.surface, margin: "4px 0 0", fontSize: 24, fontWeight: 800 }}>{def.label}</h1>
          <div style={{ color: theme.textOnDark || theme.surface, opacity: 0.65, fontSize: 13, marginTop: 6 }}>{def.description}</div>
        </div>
      </div>

      <div className="no-print" style={{ background: theme.surface, borderBottom: `1px solid ${theme.border}`, padding: isMobile ? "12px 16px" : "14px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => choisirPreset(p.key)}
              style={{
                background: preset === p.key ? theme.primaryBg : "transparent",
                border: `1px solid ${preset === p.key ? theme.primaryBorder : theme.border}`,
                color: preset === p.key ? theme.primary : theme.textSecondary,
                borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: theme.fontFamily,
              }}
            >
              {p.label}
            </button>
          ))}
          <label htmlFor="rapport-debut" style={{ fontSize: 12, color: theme.textSecondary, marginLeft: isMobile ? 0 : "auto" }}>Du</label>
          <input id="rapport-debut" type="date" value={params.date_debut || ""} onChange={(e) => changerDate("date_debut", e.target.value)} style={champDate} />
          <label htmlFor="rapport-fin" style={{ fontSize: 12, color: theme.textSecondary }}>au</label>
          <input id="rapport-fin" type="date" value={params.date_fin || ""} onChange={(e) => changerDate("date_fin", e.target.value)} style={champDate} />
          {filtres}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuExport((v) => !v)}
              style={{ background: theme.primary, color: theme.surface, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: theme.fontFamily }}
            >
              Exporter
            </button>
            {menuExport && (
              <div className="anim-scale-in" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, boxShadow: theme.shadowLg, zIndex: 20, minWidth: 170 }}>
                <button type="button" onClick={exporterExcel} style={itemMenu}>Excel (.xlsx)</button>
                <button type="button" onClick={() => { setMenuExport(false); window.print(); }} style={itemMenu}>PDF (impression)</button>
              </div>
            )}
          </div>
        </div>
        {erreurExport && <div style={{ maxWidth: 1200, margin: "8px auto 0", color: theme.danger, fontSize: 12 }}>{erreurExport}</div>}
      </div>

      <div style={{ padding: contentPadding(isMobile), maxWidth: 1200, margin: "0 auto" }}>{children}</div>
    </PageBackground>
  );
}
```

(Au moment d'implémenter : vérifier dans `theme.js` les noms réels des tokens de texte sur fond sombre — s'il n'en existe pas, en ajouter un, `textOnDark`, aux deux thèmes plutôt que d'écrire `#fff` ; et retirer les replis `||` ci-dessus.)

- [ ] **Step 6 : routeur de pages** (les pages réelles arrivent à la tâche 7 ; ici la Synthèse suffit au test)

```jsx
// frontend/src/pages/reporting/RapportRH.jsx
import { Navigate, useParams } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { STATISTIQUES_PAGES } from "../../config/reportingPages";
import useRapportRH from "../../hooks/useRapportRH";
import usePageTitle from "../../hooks/usePageTitle";
import RapportLayout from "../../components/reporting/RapportLayout";
import { presetToRange } from "../../components/reporting/periodes";
import Skeleton from "../../components/Skeleton";
import Synthese from "./Synthese";
import Effectifs from "./Effectifs";
import Parite from "./Parite";
import Demographie from "./Demographie";
import Contrats from "./Contrats";
import Qualite from "./Qualite";
import Activite from "./Activite";

const COMPOSANTS = { synthese: Synthese, effectifs: Effectifs, parite: Parite, demographie: Demographie, contrats: Contrats, qualite: Qualite, activite: Activite };

function RapportPage({ def }) {
  const theme = useTheme();
  usePageTitle(def.label);
  const { data, loading, error, params, refresh } = useRapportRH(def.page, presetToRange("12m"));
  const Composant = COMPOSANTS[def.page];
  return (
    <RapportLayout def={def} params={params} onParams={refresh}>
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={100} radius={16} />)}
        </div>
      ) : error ? (
        <div style={{ color: theme.danger, textAlign: "center", padding: 60 }}>{error}</div>
      ) : (
        <Composant data={data} params={params} onParams={refresh} />
      )}
    </RapportLayout>
  );
}

export default function RapportRH() {
  const { page } = useParams();
  const def = STATISTIQUES_PAGES.find((p) => p.page === page);
  if (!def) return <Navigate to="/statistiques/synthese" replace />;
  // key : changer de page remonte un état neuf (pas de données de l'ancienne page).
  return <RapportPage key={def.page} def={def} />;
}
```

Pour ce step, créer `Synthese.jsx` (code définitif ci-dessous) et des pages provisoires `Effectifs.jsx`, `Parite.jsx`, `Demographie.jsx`, `Contrats.jsx`, `Qualite.jsx`, `Activite.jsx` contenant `import KpiGrid from "../../components/reporting/KpiGrid"; export default function X({ data }) { return <KpiGrid kpis={data.kpis} />; }` (remplacées à la tâche 7).

```jsx
// frontend/src/pages/reporting/Synthese.jsx
import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import AlertesListe from "../../components/reporting/AlertesListe";

export default function Synthese({ data }) {
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <Carte titre="Points d'attention">
        <AlertesListe alertes={data.alertes} />
      </Carte>
    </>
  );
}
```

- [ ] **Step 7 : route, menu, liens**
  - `App.js` : remplacer l'import `Statistiques` par `const RapportRH = lazy(() => import("./pages/reporting/RapportRH"));` ; remplacer la route `/statistiques` par :

```jsx
          <Route path="/statistiques" element={<Navigate to="/statistiques/synthese" replace />} />
          <Route
            path="/statistiques/:page"
            element={
              <ProtectedRoute adminOnly>
                <RapportRH />
              </ProtectedRoute>
            }
          />
```

  (ajouter `Navigate` à l'import de `react-router-dom` s'il n'y est pas).
  - `Navbar.jsx` : `import { STATISTIQUES_PAGES } from "../config/reportingPages";` et remplacer l'entrée Statistiques par :

```js
    {
      path: "/statistiques/synthese", label: "Statistiques", adminOnly: true,
      children: STATISTIQUES_PAGES,
      match: (p) => p.startsWith("/statistiques"),
    },
```

  - `Dashboard.jsx` ligne du `navigate("/statistiques")` → `navigate("/statistiques/synthese")` ; `ContratsEcheanceCard.jsx` → `navigate("/statistiques/contrats")` ; `Dashboard.test.jsx` : attendre `"/statistiques/contrats"` dans le test « Voir tout ».
  - Supprimer `frontend/src/pages/Statistiques.jsx` et `frontend/src/__tests__/Statistiques.test.jsx`.

- [ ] **Step 8 : vérifier** — `cd frontend && CI=true npm test -- --watchAll=false` — PASS (dont `Reporting`, `Dashboard`, `Navbar`).
- [ ] **Step 9 : commit** — `git commit -m "feat(reporting): menu Statistiques, socle des pages et synthèse DRH"`

---

### Task 7 : les six autres pages React

**Files :** Modify `frontend/src/pages/reporting/{Effectifs,Parite,Demographie,Contrats,Qualite,Activite}.jsx` ; Test `frontend/src/__tests__/Reporting.test.jsx`

**Interfaces :** Consumes les réponses des tâches 2 à 4 et le socle de la tâche 6.

- [ ] **Step 1 : tests qui échouent** (ajout à `Reporting.test.jsx`)

```jsx
describe("Reporting RH — pages", () => {
  test("Parité : pyramide par sexe et cellule masquée", async () => {
    api.get.mockResolvedValue({ data: {
      periode, kpis: [kpi("taux_feminisation", "Taux de féminisation", 40, { unite: "%" })],
      repartition: [{ nom: "Hommes", count: 6 }, { nom: "Femmes", count: 4 }],
      pyramide_age_sexe: [{ tranche: "25-34", hommes: 2, femmes: 3, non_renseigne: 0 }],
      encadrement: [], recrutements: [], anciennete_par_sexe: [],
      par_direction: [
        { nom: "DG", hommes: 4, femmes: 3, non_renseigne: 0, total: 7, taux_feminisation: 42.9, masque: false },
        { nom: "Isolée", hommes: null, femmes: null, non_renseigne: null, total: 1, taux_feminisation: null, masque: true },
      ],
      par_departement: [], par_categorie: [], par_type_contrat: [], par_fonction: [],
    } });
    renderPage("parite");
    expect(await screen.findByText("Hommes")).toBeInTheDocument();
    expect(screen.getByText("25-34")).toBeInTheDocument();
    expect(screen.getByText("42.9 %")).toBeInTheDocument();
    expect(screen.getByTitle(/Effectif trop faible/)).toBeInTheDocument();
  });

  test("Démographie : changer l'horizon recharge avec horizon", async () => {
    api.get.mockResolvedValue({ data: {
      periode, horizon: 5, deja_atteint: 0, kpis: [], pyramide_age: [], pyramide_anciennete: [],
      previsions: [{ annee: 1, fin: "2027-10-30", departs: 2, fins_cdd: 1, effectif_projete: 40 }],
      par_direction: [],
      postes_a_risque: [{ poste: "Comptable", nb_titulaires: 1, premiere_retraite: "2027-03-01",
        titulaires: [{ matricule: "M1", nom: "Ali Ben", date_retraite: "2027-03-01" }] }],
    } });
    renderPage("demographie");
    expect(await screen.findByText("Comptable")).toBeInTheDocument();
    expect(screen.getByText(/Ali Ben/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Horizon"), { target: { value: "3" } });
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith("/reporting/rh/demographie/", { params: expect.objectContaining({ horizon: 3 }) }),
    );
  });

  test("Contrats : un contrat échu ouvre la fiche par matricule", async () => {
    api.get.mockResolvedValue({ data: {
      periode, kpis: [], echeance_jours: 90, contrats_echeance: [], cdd_enchaines: [], repartition_type_contrat: [],
      contrats_echus: [{ id: "c1", numero_contrat: "C-9", employee_matricule: "020782", employee_nom: "Luc Martin", date_fin: "2026-10-01", jours_depasses: 29 }],
    } });
    renderPage("contrats");
    fireEvent.click(await screen.findByText("C-9"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees/020782");
  });

  test("Qualité : la donnée « Sexe » manquante mène à la liste filtrée", async () => {
    api.get.mockResolvedValue({ data: {
      periode, kpis: [], completude_par_direction: [], completude_par_departement: [], incoherences: [],
      champs_manquants: [{ champ: "sexe", libelle: "Sexe", nb: 12, taux: 30 }],
    } });
    renderPage("qualite");
    fireEvent.click(await screen.findByText("Sexe"));
    expect(mockNavigate).toHaveBeenCalledWith("/employees?sexe=non_renseigne");
  });

  test("Activité : tableau par administrateur réservé au SUPERADMIN", async () => {
    mockRole = "SUPERADMIN";
    api.get.mockResolvedValue({ data: {
      periode, kpis: [], mon_activite: { employes_crees: 3 },
      activite_par_admin: [{ id: "u1", username: "a1", nom_complet: "Amine K", role: "ADMIN", employes_crees: 3 }],
    } });
    renderPage("activite");
    expect(await screen.findByText("Amine K")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : vérifier l'échec** — `CI=true npm test -- --watchAll=false Reporting` — FAIL.

- [ ] **Step 3 : `Effectifs.jsx`**

```jsx
import { useNavigate } from "react-router-dom";
import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import StatDonutChart from "../../components/charts/StatDonutChart";
import useIsMobile from "../../hooks/useIsMobile";

export default function Effectifs({ data }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const grille = (n) => ({ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${n}, 1fr)`, gap: 20 });
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <div style={grille(2)}>
        <Carte titre="Par direction">
          <StatDonutChart data={data.repartition_direction} onSliceClick={(e) => navigate(`/employees?direction=${e.slug}`)} />
        </Carte>
        <Carte titre="Par département">
          <StatDonutChart data={data.repartition_departement} onSliceClick={(e) => navigate(`/employees?departement=${e.slug}`)} />
        </Carte>
      </div>
      <div style={grille(3)}>
        <Carte titre="Par catégorie"><StatDonutChart data={data.repartition_categorie} height={220} /></Carte>
        <Carte titre="Par type de contrat"><StatDonutChart data={data.repartition_type_contrat} height={220} /></Carte>
        <Carte titre="Par fonction"><StatDonutChart data={data.repartition_fonction} height={220} /></Carte>
      </div>
      <div style={grille(2)}>
        <Carte titre={`Unités sans responsable actif (${data.unites_sans_responsable.length})`}>
          <TableauSimple
            colonnes={[{ cle: "type", libelle: "Type" }, { cle: "nom", libelle: "Unité" }]}
            lignes={data.unites_sans_responsable}
            vide="Toutes les unités ont un responsable actif."
          />
        </Carte>
        <Carte titre={`Fonctions sans titulaire (${data.postes_sans_titulaire.length})`}>
          <TableauSimple
            colonnes={[{ cle: "nom", libelle: "Fonction" }]}
            lignes={data.postes_sans_titulaire.map((nom) => ({ nom }))}
            vide="Toutes les fonctions actives ont au moins un titulaire."
          />
        </Carte>
      </div>
    </>
  );
}
```

- [ ] **Step 4 : `Parite.jsx`**

```jsx
import { useState } from "react";
import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import PyramideSexe from "../../components/reporting/PyramideSexe";
import StatDonutChart from "../../components/charts/StatDonutChart";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";

const AXES = [
  { cle: "par_direction", libelle: "Direction" },
  { cle: "par_departement", libelle: "Département" },
  { cle: "par_categorie", libelle: "Catégorie" },
  { cle: "par_type_contrat", libelle: "Type de contrat" },
  { cle: "par_fonction", libelle: "Fonction" },
];

export default function Parite({ data }) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const [axe, setAxe] = useState("par_direction");
  const libelleAxe = AXES.find((a) => a.cle === axe).libelle;
  const grille = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 20 };
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <div style={grille}>
        <Carte titre="Répartition des actifs"><StatDonutChart data={data.repartition} height={220} /></Carte>
        <Carte titre="Responsables d'unité"><StatDonutChart data={data.encadrement} height={220} /></Carte>
        <Carte titre="Recrutements de la période"><StatDonutChart data={data.recrutements} height={220} /></Carte>
      </div>
      <Carte titre="Pyramide des âges par sexe">
        <PyramideSexe lignes={data.pyramide_age_sexe} />
      </Carte>
      <Carte
        titre={`Parité par ${libelleAxe.toLowerCase()}`}
        action={
          <select
            aria-label="Axe de ventilation"
            value={axe}
            onChange={(e) => setAxe(e.target.value)}
            style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily, background: theme.surface, color: theme.text }}
          >
            {AXES.map((a) => <option key={a.cle} value={a.cle}>{a.libelle}</option>)}
          </select>
        }
      >
        <TableauSimple
          colonnes={[
            { cle: "nom", libelle: libelleAxe },
            { cle: "hommes", libelle: "Hommes" },
            { cle: "femmes", libelle: "Femmes" },
            { cle: "non_renseigne", libelle: "Non renseigné" },
            { cle: "total", libelle: "Total" },
            { cle: "taux_feminisation", libelle: "Féminisation", format: (v) => `${v} %` },
          ]}
          lignes={data[axe]}
        />
      </Carte>
      <Carte titre="Ancienneté moyenne par sexe">
        <TableauSimple
          colonnes={[{ cle: "sexe", libelle: "Sexe" }, { cle: "anciennete_moyenne", libelle: "Ancienneté moyenne", format: (v) => `${v} ans` }]}
          lignes={data.anciennete_par_sexe}
        />
      </Carte>
    </>
  );
}
```

- [ ] **Step 5 : `Demographie.jsx`**

```jsx
import { useNavigate } from "react-router-dom";
import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import StatHistogram from "../../components/charts/StatHistogram";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";
import { formatDateFR } from "../../utils/dates";

export default function Demographie({ data, params, onParams }) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const horizon = params.horizon || data.horizon;
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <Carte titre="Pyramide des âges">
          <StatHistogram data={data.pyramide_age} xKey="tranche" dataKey="count" color={theme.departementColor}
            onBarClick={(e) => navigate(`/employees?age_min=${e.min}&age_max=${e.max}`)} />
        </Carte>
        <Carte titre="Pyramide d'ancienneté">
          <StatHistogram data={data.pyramide_anciennete} xKey="tranche" dataKey="count" color={theme.serviceColor}
            onBarClick={(e) => navigate(`/employees?anciennete_min=${e.min}&anciennete_max=${e.max}`)} />
        </Carte>
      </div>
      <Carte
        titre="Prévisions : départs à la retraite et effectif projeté (sans recrutement)"
        action={
          <label style={{ fontSize: 12, color: theme.textSecondary, display: "flex", alignItems: "center", gap: 6 }}>
            Horizon
            <select
              aria-label="Horizon"
              value={horizon}
              onChange={(e) => onParams({ horizon: Number(e.target.value) })}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily, background: theme.surface, color: theme.text }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} an{n > 1 ? "s" : ""}</option>)}
            </select>
          </label>
        }
      >
        <TableauSimple
          colonnes={[
            { cle: "annee", libelle: "Année", format: (v) => `Année ${v}` },
            { cle: "fin", libelle: "Jusqu'au", format: (v) => formatDateFR(v) },
            { cle: "departs", libelle: "Départs à la retraite" },
            { cle: "fins_cdd", libelle: "Fins de CDD connues" },
            { cle: "effectif_projete", libelle: "Effectif projeté" },
          ]}
          lignes={data.previsions}
        />
        {data.deja_atteint > 0 && (
          <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 10 }}>
            Dont {data.deja_atteint} agent(s) ayant déjà dépassé l'âge de retraite (comptés en année 1).
          </div>
        )}
      </Carte>
      <Carte titre={`Postes à risque : tous les titulaires partent d'ici ${horizon} an(s)`}>
        <TableauSimple
          colonnes={[
            { cle: "poste", libelle: "Fonction" },
            { cle: "nb_titulaires", libelle: "Titulaires" },
            { cle: "premiere_retraite", libelle: "Premier départ", format: (v) => formatDateFR(v) },
            { cle: "titulaires", libelle: "Détail", format: (v) => v.map((t) => `${t.nom} (${formatDateFR(t.date_retraite)})`).join(", ") },
          ]}
          lignes={data.postes_a_risque}
          vide="Aucun poste à risque sur cet horizon."
        />
      </Carte>
      <Carte titre="Âge et ancienneté par direction">
        <TableauSimple
          colonnes={[
            { cle: "nom", libelle: "Direction" },
            { cle: "total", libelle: "Effectif" },
            { cle: "age_moyen", libelle: "Âge moyen" },
            { cle: "anciennete_moyenne", libelle: "Ancienneté moyenne" },
            { cle: "nb_55_plus", libelle: "55 ans et plus" },
            { cle: "departs_horizon", libelle: `Départs sous ${horizon} an(s)` },
          ]}
          lignes={data.par_direction}
        />
      </Carte>
    </>
  );
}
```

(Vérifier le chemin réel de `formatDateFR` : `grep -rn "export const formatDateFR" frontend/src` ; l'importer depuis ce module.)

- [ ] **Step 6 : `Contrats.jsx`**

```jsx
import { useNavigate } from "react-router-dom";
import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import StatDonutChart from "../../components/charts/StatDonutChart";
import { useTheme } from "../../context/ThemeContext";
import { formatDateFR } from "../../utils/dates";

const SEUILS = [30, 60, 90, 120, 180, 365];

export default function Contrats({ data, onParams }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const versFiche = (c) => navigate(`/employees/${c.employee_matricule || c.matricule}`);
  const colonnesContrat = (cleJours, libelleJours) => [
    { cle: "numero_contrat", libelle: "N° contrat" },
    { cle: "employee_nom", libelle: "Employé" },
    { cle: "date_fin", libelle: "Date de fin", format: (v) => formatDateFR(v) },
    { cle: cleJours, libelle: libelleJours },
  ];
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <Carte
        titre={`Contrats arrivant à échéance (${data.echeance_jours} jours)`}
        action={
          <select
            aria-label="Seuil d'échéance"
            value={data.echeance_jours}
            onChange={(e) => onParams({ echeance_jours: Number(e.target.value) })}
            style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily, background: theme.surface, color: theme.text }}
          >
            {SEUILS.map((j) => <option key={j} value={j}>{j} jours</option>)}
          </select>
        }
      >
        <TableauSimple colonnes={colonnesContrat("jours_restants", "Jours restants")} lignes={data.contrats_echeance}
          onLigne={versFiche} vide="Aucun contrat à échéance." />
      </Carte>
      <Carte titre="Contrats échus encore au statut Actif">
        <TableauSimple colonnes={colonnesContrat("jours_depasses", "Jours de dépassement")} lignes={data.contrats_echus}
          onLigne={versFiche} vide="Aucun contrat échu non traité." />
      </Carte>
      <Carte titre="Agents en contrats à durée déterminée successifs">
        <TableauSimple
          colonnes={[{ cle: "matricule", libelle: "Matricule" }, { cle: "nom", libelle: "Employé" }, { cle: "nb_cdd", libelle: "Nombre de CDD" }]}
          lignes={data.cdd_enchaines}
          onLigne={versFiche}
          vide="Aucun agent avec plusieurs CDD."
        />
      </Carte>
      <Carte titre="Actifs par type de contrat">
        <StatDonutChart data={data.repartition_type_contrat} height={220} />
      </Carte>
    </>
  );
}
```

- [ ] **Step 7 : `Qualite.jsx`**

```jsx
import { useNavigate } from "react-router-dom";
import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import BarreTaux from "../../components/reporting/BarreTaux";
import useIsMobile from "../../hooks/useIsMobile";

// Seules les données avec un filtre de liste existant sont cliquables.
const LIENS_MANQUANTS = { sexe: "/employees?sexe=non_renseigne" };

export default function Qualite({ data }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <Carte titre="Données manquantes (actifs)">
        <TableauSimple
          colonnes={[{ cle: "libelle", libelle: "Donnée" }, { cle: "nb", libelle: "Actifs concernés" }, { cle: "taux", libelle: "Part", format: (v) => `${v} %` }]}
          lignes={data.champs_manquants}
          onLigne={(l) => LIENS_MANQUANTS[l.champ] && navigate(LIENS_MANQUANTS[l.champ])}
        />
      </Carte>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <Carte titre="Complétude des dossiers par direction">
          {data.completude_par_direction.map((r) => (
            <BarreTaux key={r.id} libelle={r.nom} taux={r.taux}
              onClick={() => navigate(`/employees?direction=${r.slug}&dossier_complet=0`)} />
          ))}
        </Carte>
        <Carte titre="Complétude des dossiers par département">
          {data.completude_par_departement.map((r) => (
            <BarreTaux key={r.id} libelle={r.nom} sous={r.direction_nom} taux={r.taux}
              onClick={() => navigate(`/employees?departement=${r.slug}&dossier_complet=0`)} />
          ))}
        </Carte>
      </div>
      {data.incoherences.map((i) => (
        <Carte key={i.code} titre={`${i.libelle} (${i.lignes.length})`}>
          <TableauSimple
            colonnes={[{ cle: "matricule", libelle: "Matricule" }, { cle: "nom", libelle: "Employé" }, { cle: "detail", libelle: "Détail" }]}
            lignes={i.lignes}
            onLigne={(l) => navigate(`/employees/${l.matricule}`)}
            vide="Aucune anomalie."
          />
        </Carte>
      ))}
    </>
  );
}
```

- [ ] **Step 8 : `Activite.jsx`**

```jsx
import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import { useAuth } from "../../context/AuthContext";

const COLONNES = [
  ["employes_crees", "Créés"], ["employes_transferts", "Transférés"], ["employes_carriere", "Carrière"],
  ["employes_champs", "Champs"], ["employes_photo", "Photos"], ["employes_archives", "Archivés"],
  ["employes_restaures", "Restaurés"], ["employes_supprimes", "Suppr. définitives"],
  ["contrats_crees_modifies", "Contrats"], ["contrats_supprimes", "Contrats suppr."],
  ["documents_uploades", "Doc. uploadés"], ["documents_supprimes", "Doc. supprimés"],
  ["documents_modifies", "Doc. modifiés"], ["comptes_mdp", "Mots de passe"],
];

export default function Activite({ data }) {
  const { user } = useAuth();
  const mes = COLONNES.filter(([cle]) => (data.mon_activite[cle] || 0) > 0)
    .map(([cle, libelle]) => ({ id: cle, action: libelle, nombre: data.mon_activite[cle] }));
  const colonnesAdmin = COLONNES.filter(([cle]) => (data.activite_par_admin || []).some((a) => a[cle] > 0));
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <Carte titre="Mon activité">
        <TableauSimple colonnes={[{ cle: "action", libelle: "Action" }, { cle: "nombre", libelle: "Nombre" }]}
          lignes={mes} vide="Aucune activité sur cette période." />
      </Carte>
      {user?.role === "SUPERADMIN" && data.activite_par_admin && (
        <Carte titre="Activité par administrateur">
          <TableauSimple
            colonnes={[{ cle: "nom_complet", libelle: "Compte" }, ...colonnesAdmin.map(([cle, libelle]) => ({ cle, libelle }))]}
            lignes={data.activite_par_admin}
            vide="Aucune activité sur cette période."
          />
        </Carte>
      )}
    </>
  );
}
```

(Les liens de preuve vers `/audit` de l'ancienne page — un clic par compteur — sont repris à l'identique si le temps le permet ; sinon noter leur retrait dans `statistiques-audit.md` et le signaler à l'utilisateur.)

- [ ] **Step 9 : vérifier** — `cd frontend && CI=true npm test -- --watchAll=false` — PASS. Puis vérification visuelle : `npm start` (backend lancé), parcourir les 7 pages en ADMIN et SUPERADMIN, thème clair et sombre, mobile (largeur 390 px).
- [ ] **Step 10 : commit** — `git commit -m "feat(reporting): pages Effectifs, Parité, Démographie, Contrats, Qualité, Activité"`

---

### Task 8 : documentation

**Files :** Modify `docs/fonctionnel/statistiques-audit.md`, `securite.md`, `CLAUDE.md`, `frontend/src/config/notices.js`

- [ ] **Step 1 :** `statistiques-audit.md` — section « Menu Statistiques — reporting RH (2026-10-30) » : les 7 pages et leur route ; endpoint `GET /api/reporting/rh/<page>/` (`fmt=xlsx`) ; constructeurs `reporting/rh/*.py` réutilisant `audit/stats.py` ; définitions centralisées ; âges de retraite 60/55 et règle « sexe non renseigné » ; seuil de masquage 2 (et sa limite) ; sorties encore datées par l'audit ; ancienne page `/statistiques` remplacée (redirection), endpoints `stats-detail`/`stats-export.xlsx` conservés mais plus utilisés par l'UI ; approches écartées (une page à onglets ; pages copiées de `Statistiques.jsx`).
- [ ] **Step 2 :** `securite.md` — point 53 : reporting RH réservé ADMIN/SUPERADMIN (testé sur les 7 routes réelles, CONSULTANT/GESTIONNAIRE 403) ; listes nominatives limitées (contrats, postes à risque, qualité) ; masquage des petits effectifs ; exports tracés (`EXPORT`, `type=reporting_rh`) ; aucune donnée NIN/sécu/RIB.
- [ ] **Step 3 :** `CLAUDE.md` — table des routes : remplacer la ligne `/statistiques` par `/statistiques/:page` (7 pages, ADMIN) ; `notices.js` : mettre à jour le texte `statistiques` si la clé est encore utilisée, sinon la retirer.
- [ ] **Step 4 :** suites complètes backend et frontend une dernière fois.
- [ ] **Step 5 : commit** — `git commit -m "docs(reporting): menu Statistiques, sécurité, routes"`
