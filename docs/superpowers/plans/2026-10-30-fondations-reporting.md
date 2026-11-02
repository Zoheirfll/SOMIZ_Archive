# Fondations de données du reporting — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** dater les sorties d'employés par leur vraie date de départ (`Employee.date_sortie`) et figer chaque mois une
photo agrégée des effectifs (`EffectifInstantane`), pour que turnover et comparaisons dans le temps soient exacts.

**Architecture :** `date_sortie` est une colonne fixe d'`Employee`, exigée sur toute transition vers un statut de sortie
déclenchée par un humain (formulaire, archivage en masse), dérivée de la date de fin du contrat quand la transition est
automatique (synchro contrat), et vidée à la restauration. Les règles vivent dans un seul module
(`employees/sortie.py`). La photo mensuelle vit dans une nouvelle app `reporting` (données de reporting, sans
dépendance aux migrations en cours de `audit`/`conges`) : un service pur `calculer_instantane(date_photo, reconstitue)`
et une commande `manage.py photo_effectifs` idempotente.

**Tech Stack :** Django 5.2, DRF 3.17, PostgreSQL, pytest ; React 19, Jest + RTL.

**Spec :** `docs/superpowers/specs/2026-10-30-reporting-statistiques-design.md`, section « Fondations de données ».

## Global Constraints

- Statuts de sortie : `inactif`, `archive`, `demobilise` (= `STATUTS_ARCHIVE` de `audit/stats.py`) ; `actif` = présent.
- `date_sortie` : saisie **manuelle** à l'archivage (décision du 2026-10-30) ; jamais dans le futur ; jamais avant `date_embauche`.
- Archivés existants : **aucune reprise automatique** ; `date_sortie` reste vide (ils seront listés par la page Qualité, étape ultérieure).
- La photo mensuelle ne contient **aucune donnée nominative** (ni matricule, ni nom, ni id d'employé).
- Libellés d'unité **figés** dans la photo (une réorganisation ne réécrit pas le passé).
- Projet en développement, pas de production : la commande se lance à la main ; sa planification est notée pour la mise en production.
- Jamais de couleur codée en dur côté React (tokens `theme.js`) ; pas de `window.confirm`.
- `AuditLog.action` ≤ 20 caractères (aucune nouvelle action ici).
- Lancer la suite backend complète après les tâches 1 à 3 (elles touchent `employees`).
- **Avant de commencer** : le travail en cours sur les congés (branche `hierarchie-conges`, non commité) doit être commité ou mis de côté par l'utilisateur ; créer ensuite une branche `reporting-fondations`. Ne rien committer sans l'accord de l'utilisateur.

## Fichiers

| Fichier | Rôle |
|---|---|
| `backend/employees/sortie.py` (créé) | Lecture et validation d'une date de sortie — seule source des règles |
| `backend/employees/models.py` | `Employee.STATUTS_SORTIE`, champ `date_sortie`, synchro contrat |
| `backend/employees/migrations/0041_employee_date_sortie.py` (créé) | Champ + champ système `date_sortie` (ADMINISTRATIF) |
| `backend/employees/serializers.py` | Exposition + validation formulaire |
| `backend/employees/views.py` | Archivage/restauration en masse |
| `backend/employees/import_views.py`, `export_views.py`, `referentiel_views.py` | Import, export, code réservé |
| `backend/reporting/` (app créée) | `EffectifInstantane`, `instantanes.py`, commande `photo_effectifs` |
| `frontend/src/pages/EmployeeForm.jsx`, `Employees.jsx`, `EmployeeDetail.jsx`, `config/parametresTabs.js` | Saisie et affichage |
| Tests : `backend/tests/test_employee_date_sortie.py`, `test_effectif_instantane.py` ; `frontend/src/__tests__/EmployeeForm.test.jsx`, `Employees.test.jsx` | |
| Docs : `docs/fonctionnel/employes.md`, `docs/fonctionnel/statistiques-audit.md` | |

---

### Task 1 : `date_sortie` — modèle, règles, formulaire (API)

**Files :**
- Create : `backend/employees/sortie.py`, `backend/employees/migrations/0041_employee_date_sortie.py`
- Modify : `backend/employees/models.py` (classe `Employee`), `backend/employees/serializers.py` (`EmployeeDetailSerializer`, `EmployeeCreateUpdateSerializer`), `backend/employees/referentiel_views.py` (`RESERVED_CHAMP_CODES`)
- Test : `backend/tests/test_employee_date_sortie.py`

**Interfaces :**
- Produces : `Employee.STATUTS_SORTIE` (tuple de valeurs de statut) ; `employees.sortie.lire_date(valeur) -> date | None` (lève `ValueError` si illisible) ; `employees.sortie.erreur_date_sortie(date_sortie: date, date_embauche: date | None = None) -> str | None` ; `employees.sortie.MSG_OBLIGATOIRE: str`.

- [ ] **Step 1 : écrire les tests qui échouent**

```python
# backend/tests/test_employee_date_sortie.py
"""Employee.date_sortie — vraie date de départ, base du turnover (voir
docs/superpowers/specs/2026-10-30-reporting-statistiques-design.md)."""
from datetime import date, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from employees.models import ChampPersonnalise, Employee

pytestmark = pytest.mark.django_db


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _patch(user, employee, data):
    return _client(user).patch(f'/api/employees/{employee.id}/', data, format='json')


class TestFormulaire:
    def test_archiver_sans_date_de_sortie_est_refuse(self, admin_user, employee):
        resp = _patch(admin_user, employee, {'statut': 'archive'})
        assert resp.status_code == 400
        assert 'date_sortie' in resp.data
        employee.refresh_from_db()
        assert employee.statut == 'actif'

    def test_archiver_avec_date_de_sortie(self, admin_user, employee):
        resp = _patch(admin_user, employee, {'statut': 'archive', 'date_sortie': '2026-03-31'})
        assert resp.status_code == 200, resp.data
        employee.refresh_from_db()
        assert employee.date_sortie == date(2026, 3, 31)

    def test_date_future_refusee(self, admin_user, employee):
        demain = (timezone.localdate() + timedelta(days=1)).isoformat()
        resp = _patch(admin_user, employee, {'statut': 'archive', 'date_sortie': demain})
        assert resp.status_code == 400
        assert 'date_sortie' in resp.data

    def test_date_avant_recrutement_refusee(self, admin_user, employee):
        employee.date_embauche = date(2020, 1, 1)
        employee.save()
        resp = _patch(admin_user, employee, {'statut': 'archive', 'date_sortie': '2019-12-31'})
        assert resp.status_code == 400
        assert 'date_sortie' in resp.data

    def test_archive_historique_sans_date_reste_modifiable(self, admin_user, employee):
        """Un archivé d'avant ce chantier (date_sortie vide) n'est pas bloqué
        pour une autre modification : la date n'est exigée qu'à la transition."""
        Employee.objects.filter(pk=employee.pk).update(statut='archive')
        resp = _patch(admin_user, employee, {'nom': 'Martin'})
        assert resp.status_code == 200, resp.data

    def test_restauration_vide_la_date(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(statut='archive', date_sortie=date(2026, 1, 15))
        resp = _patch(admin_user, employee, {'statut': 'actif'})
        assert resp.status_code == 200, resp.data
        employee.refresh_from_db()
        assert employee.date_sortie is None

    def test_null_du_formulaire_accepte_pour_un_actif(self, admin_user, employee):
        resp = _patch(admin_user, employee, {'statut': 'actif', 'date_sortie': None})
        assert resp.status_code == 200, resp.data


class TestExposition:
    def test_fiche_expose_la_date(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(statut='archive', date_sortie=date(2026, 2, 1))
        resp = _client(admin_user).get(f'/api/employees/{employee.id}/')
        assert resp.data['date_sortie'] == '2026-02-01'

    def test_champ_systeme_administratif_seede(self):
        champ = ChampPersonnalise.objects.get(code='date_sortie')
        assert champ.is_systeme is True
        assert champ.categorie == ChampPersonnalise.Categorie.ADMINISTRATIF
```

- [ ] **Step 2 : vérifier l'échec**

Run : `cd backend && python -m pytest tests/test_employee_date_sortie.py -q --no-cov`
Expected : FAIL (`date_sortie` absent du modèle / `ChampPersonnalise.DoesNotExist`).

- [ ] **Step 3 : module de règles**

```python
# backend/employees/sortie.py
"""Règles de la date de sortie d'un employé — seule source de vérité,
utilisée par le formulaire (serializer), l'archivage en masse et l'import."""
from datetime import date, datetime

from django.utils import timezone

MSG_OBLIGATOIRE = "La date de sortie est obligatoire pour archiver un employé."


def lire_date(valeur):
    """date | None depuis une date, un datetime (cellule Excel) ou une chaîne
    'AAAA-MM-JJ'. Vide → None ; illisible → ValueError."""
    if valeur in (None, ''):
        return None
    if isinstance(valeur, datetime):
        return valeur.date()
    if isinstance(valeur, date):
        return valeur
    return date.fromisoformat(str(valeur).strip()[:10])


def erreur_date_sortie(date_sortie, date_embauche=None):
    """Message d'erreur, ou None si la date est acceptable."""
    if date_sortie > timezone.localdate():
        return "La date de sortie ne peut pas être dans le futur."
    if date_embauche and date_sortie < date_embauche:
        return "La date de sortie précède la date de recrutement."
    return None
```

- [ ] **Step 4 : modèle**

Dans `backend/employees/models.py`, classe `Employee`, juste après la classe interne `Sexe` :

```python
    # Statuts qui signifient « a quitté l'organisation » (mêmes que
    # STATUTS_ARCHIVE de audit/stats.py, en valeurs et non en libellés).
    STATUTS_SORTIE = (Statut.INACTIF, Statut.ARCHIVE, Statut.DEMOBILISE)
```

Et juste après le champ `date_fin_contrat` :

```python
    # Vraie date de départ (≠ date du clic d'archivage, conservée par l'audit).
    # Exigée à toute transition vers un statut de sortie faite par un humain,
    # vidée à la restauration — règles : employees/sortie.py.
    date_sortie = models.DateField(null=True, blank=True, verbose_name="Date de sortie")
```

- [ ] **Step 5 : migration**

Run : `cd backend && python manage.py makemigrations employees -n employee_date_sortie`
Puis compléter le fichier généré `0041_employee_date_sortie.py` pour y ajouter le champ système :

```python
def seed_champ_systeme(apps, schema_editor):
    # Même mécanisme que 0027/0040 : libellé, ordre et catégorie du champ
    # système. ADMINISTRATIF (pas une donnée personnelle). Ordre 200 = après
    # « sexe » (190), réordonnable depuis /parametres.
    apps.get_model('employees', 'ChampPersonnalise').objects.update_or_create(
        code='date_sortie',
        defaults={'nom': 'Date de sortie', 'type_champ': 'texte', 'ordre': 200,
                  'is_active': True, 'is_systeme': True, 'categorie': 'ADMINISTRATIF'},
    )


def unseed_champ_systeme(apps, schema_editor):
    apps.get_model('employees', 'ChampPersonnalise').objects.filter(
        code='date_sortie', is_systeme=True).delete()
```

et ajouter `migrations.RunPython(seed_champ_systeme, unseed_champ_systeme)` à la fin de `operations`.

Dans `referentiel_views.py`, ajouter `'date_sortie'` à `RESERVED_CHAMP_CODES` (après `'sexe'`).

- [ ] **Step 6 : serializers**

`EmployeeDetailSerializer.Meta.fields` : ajouter `'date_sortie'` après `'date_fin_contrat'`.
`EmployeeCreateUpdateSerializer.Meta.fields` : ajouter `'date_sortie'` après `'date_fin_contrat'`.
En tête du fichier : `from employees.sortie import MSG_OBLIGATOIRE, erreur_date_sortie`.
Dans `EmployeeCreateUpdateSerializer`, ajouter la méthode et l'appeler en **première ligne** de `validate()` :

```python
    def _valider_date_sortie(self, attrs):
        statut = attrs.get('statut', getattr(self.instance, 'statut', Employee.Statut.ACTIF))
        if statut == Employee.Statut.ACTIF:
            # Restauration (ou employé présent) : pas de date de sortie.
            attrs['date_sortie'] = None
            return
        date_sortie = attrs.get('date_sortie', getattr(self.instance, 'date_sortie', None))
        # Exigée seulement à la transition (création directe en statut de
        # sortie, ou actif → sortie) : un archivé historique sans date reste
        # modifiable pour ses autres champs.
        statut_avant = getattr(self.instance, 'statut', None)
        if statut_avant not in Employee.STATUTS_SORTIE and not date_sortie:
            raise serializers.ValidationError({'date_sortie': MSG_OBLIGATOIRE})
        if date_sortie:
            date_embauche = attrs.get('date_embauche', getattr(self.instance, 'date_embauche', None))
            erreur = erreur_date_sortie(date_sortie, date_embauche)
            if erreur:
                raise serializers.ValidationError({'date_sortie': erreur})
```

```python
    def validate(self, attrs):
        self._valider_date_sortie(attrs)
        # … corps existant inchangé …
```

- [ ] **Step 7 : vérifier**

Run : `cd backend && python manage.py migrate && python -m pytest tests/test_employee_date_sortie.py tests/test_employee_sexe.py -q --no-cov`
Expected : PASS.

- [ ] **Step 8 : commit** (avec l'accord de l'utilisateur)

```bash
git add backend/employees/sortie.py backend/employees/models.py backend/employees/migrations/0041_employee_date_sortie.py backend/employees/serializers.py backend/employees/referentiel_views.py backend/tests/test_employee_date_sortie.py
git commit -m "feat(employees): date de sortie exigée à l'archivage par le formulaire"
```

---

### Task 2 : archivage et restauration en masse

**Files :**
- Modify : `backend/employees/views.py` (`EmployeeBulkDeleteView.post`)
- Test : `backend/tests/test_employee_date_sortie.py` (ajout de `TestMasse`)

**Interfaces :**
- Consumes : `employees.sortie.lire_date`, `erreur_date_sortie`, `MSG_OBLIGATOIRE` (Task 1).
- Produces : `POST /api/employees/bulk-delete/` avec `action=archive` exige `date_sortie` (`'AAAA-MM-JJ'`) ; réponse 400 `{'error': <message>}` sinon ; `details.date_sortie` dans l'audit.

- [ ] **Step 1 : tests qui échouent** (à ajouter au fichier de la Task 1)

```python
from audit.models import AuditLog

URL_MASSE = '/api/employees/bulk-delete/'


class TestMasse:
    def _post(self, user, data):
        return _client(user).post(URL_MASSE, data, format='json')

    def test_archivage_sans_date_refuse(self, admin_user, employee):
        resp = self._post(admin_user, {'ids': [str(employee.id)], 'action': 'archive'})
        assert resp.status_code == 400
        employee.refresh_from_db()
        assert employee.statut == 'actif'

    def test_archivage_avec_date(self, admin_user, employee):
        resp = self._post(admin_user, {'ids': [str(employee.id)], 'action': 'archive', 'date_sortie': '2026-04-30'})
        assert resp.status_code == 200, resp.data
        employee.refresh_from_db()
        assert (employee.statut, employee.date_sortie) == ('archive', date(2026, 4, 30))
        log = AuditLog.objects.filter(target_label__startswith='Archivage en masse').latest('timestamp')
        assert log.details['date_sortie'] == '2026-04-30'

    def test_date_illisible_ou_future_refusee(self, admin_user, employee):
        demain = (timezone.localdate() + timedelta(days=1)).isoformat()
        for valeur in ('31/04/2026', demain):
            resp = self._post(admin_user, {'ids': [str(employee.id)], 'action': 'archive', 'date_sortie': valeur})
            assert resp.status_code == 400, valeur

    def test_date_avant_recrutement_cite_le_matricule(self, admin_user, employee):
        employee.date_embauche = date(2025, 6, 1)
        employee.save()
        resp = self._post(admin_user, {'ids': [str(employee.id)], 'action': 'archive', 'date_sortie': '2025-01-01'})
        assert resp.status_code == 400
        assert employee.matricule in resp.data['error']

    def test_restauration_vide_la_date(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(statut='archive', date_sortie=date(2026, 1, 15))
        resp = self._post(admin_user, {'ids': [str(employee.id)], 'action': 'restaurer'})
        assert resp.status_code == 200
        employee.refresh_from_db()
        assert (employee.statut, employee.date_sortie) == ('actif', None)
```

- [ ] **Step 2 : vérifier l'échec** — Run : `python -m pytest tests/test_employee_date_sortie.py::TestMasse -q --no-cov` — Expected : FAIL (archivage sans date accepté).

- [ ] **Step 3 : implémentation** — dans `views.py`, importer `from employees.sortie import MSG_OBLIGATOIRE, erreur_date_sortie, lire_date`, puis :

Branche `restaurer` :

```python
            employees.update(statut=Employee.Statut.ACTIF, motif_archivage=None, date_sortie=None)
```

Branche d'archivage (remplace le bloc `else:` existant) :

```python
        else:
            # Soft delete — archivage, motif optionnel, date de sortie obligatoire
            # (vraie date de départ, base du turnover — voir employees/sortie.py).
            try:
                date_sortie = lire_date(request.data.get('date_sortie'))
            except ValueError:
                return Response({'error': "Date de sortie invalide (format AAAA-MM-JJ)."},
                                status=status.HTTP_400_BAD_REQUEST)
            if date_sortie is None:
                return Response({'error': MSG_OBLIGATOIRE}, status=status.HTTP_400_BAD_REQUEST)
            erreur = erreur_date_sortie(date_sortie)
            if erreur:
                return Response({'error': erreur}, status=status.HTTP_400_BAD_REQUEST)
            trop_tot = list(
                employees.filter(date_embauche__gt=date_sortie).values_list('matricule', flat=True)[:10]
            )
            if trop_tot:
                return Response(
                    {'error': "La date de sortie précède la date de recrutement de : " + ', '.join(trop_tot)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            motif_id = request.data.get('motif_archivage') or None
            employees.update(
                statut=Employee.Statut.ARCHIVE, motif_archivage_id=motif_id, date_sortie=date_sortie,
            )
            AuditLog.objects.create(
                user=request.user,
                username_snapshot=request.user.username,
                action=AuditLog.Action.DELETE_EMP,
                target_model='Employee',
                target_label=f'Archivage en masse — {nb} employé(s)',
                ip_address=AuditLog._get_ip(request),
                details={'ids': ids, 'nb': nb, 'action': 'archive', 'motif_archivage': motif_id,
                         'date_sortie': date_sortie.isoformat()},
            )
            return Response({'nb_archives': nb})
```

- [ ] **Step 4 : vérifier** — Run : `python -m pytest tests/test_employee_date_sortie.py -q --no-cov` puis `python -m pytest tests/ -q --no-cov -k "bulk or archiv"` — Expected : PASS (si un ancien test d'archivage en masse n'envoie pas de date, lui ajouter `'date_sortie': '2026-01-31'` : c'est le nouveau contrat de l'API).

- [ ] **Step 5 : commit** — `git commit -m "feat(employees): date de sortie obligatoire à l'archivage en masse, vidée à la restauration"`

---

### Task 3 : synchro contrat, import, export

**Files :**
- Modify : `backend/employees/models.py` (`Employee.sync_statut_from_dernier_contrat`), `backend/employees/import_views.py`, `backend/employees/export_views.py`
- Test : `backend/tests/test_employee_date_sortie.py` (ajout de `TestContrat`, `TestImportExport`)

**Interfaces :**
- Consumes : `lire_date`, `erreur_date_sortie` (Task 1) ; `Employee.STATUTS_SORTIE`.
- Produces : colonne d'import optionnelle `date_sortie` ; colonne d'export « Date de sortie » (après « Sexe »).

- [ ] **Step 1 : tests qui échouent**

```python
import io

import openpyxl
from openpyxl import Workbook

from employees.models import Contrat


def _xlsx(headers, rows):
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    buf.name = 'import.xlsx'
    return buf


class TestContrat:
    """Transition automatique (le statut suit le dernier contrat) : pas de
    clic, donc la date de sortie vient de la date de fin du contrat."""

    def test_contrat_archive_date_la_sortie_par_sa_fin(self, admin_user, employee, type_contrat):
        contrat = Contrat.objects.create(
            numero_contrat='C-1', employee=employee, type_contrat=type_contrat,
            date_debut=date(2024, 1, 1), date_fin=date(2025, 12, 31), created_by=admin_user,
        )
        contrat.statut = 'archive'
        contrat.save()
        employee.refresh_from_db()
        assert (employee.statut, employee.date_sortie) == ('archive', date(2025, 12, 31))

    def test_contrat_sans_fin_laisse_la_date_vide(self, admin_user, employee, type_contrat):
        contrat = Contrat.objects.create(
            numero_contrat='C-2', employee=employee, type_contrat=type_contrat,
            date_debut=date(2024, 1, 1), created_by=admin_user,
        )
        contrat.statut = 'archive'
        contrat.save()
        employee.refresh_from_db()
        assert employee.statut == 'archive'
        assert employee.date_sortie is None

    def test_contrat_reactive_vide_la_date(self, admin_user, employee, type_contrat):
        contrat = Contrat.objects.create(
            numero_contrat='C-3', employee=employee, type_contrat=type_contrat,
            date_debut=date(2024, 1, 1), date_fin=date(2025, 12, 31), statut='archive', created_by=admin_user,
        )
        contrat.statut = 'actif'
        contrat.save()
        employee.refresh_from_db()
        assert (employee.statut, employee.date_sortie) == ('actif', None)


class TestImportExport:
    URL_IMPORT = '/api/employees/import/'

    def test_import_avec_date_de_sortie(self, admin_user):
        buf = _xlsx(['matricule', 'numero_contrat', 'nom', 'prenom', 'statut', 'date_sortie'],
                    [['D001', '11', 'ALI', 'Sara', 'archive', '2024-09-30']])
        resp = _client(admin_user).post(self.URL_IMPORT, {'file': buf}, format='multipart')
        assert resp.data['nb_crees'] == 1, resp.data
        assert Employee.objects.get(matricule='D001').date_sortie == date(2024, 9, 30)

    def test_import_actif_ignore_la_date(self, admin_user):
        buf = _xlsx(['matricule', 'numero_contrat', 'nom', 'prenom', 'statut', 'date_sortie'],
                    [['D002', '12', 'ALI', 'Omar', 'actif', '2024-09-30']])
        _client(admin_user).post(self.URL_IMPORT, {'file': buf}, format='multipart')
        assert Employee.objects.get(matricule='D002').date_sortie is None

    def test_import_date_future_bloque_la_ligne(self, admin_user):
        demain = (timezone.localdate() + timedelta(days=1)).isoformat()
        buf = _xlsx(['matricule', 'numero_contrat', 'nom', 'prenom', 'statut', 'date_sortie'],
                    [['D003', '13', 'ALI', 'Nour', 'archive', demain]])
        resp = _client(admin_user).post(self.URL_IMPORT, {'file': buf}, format='multipart')
        assert resp.data['nb_crees'] == 0

    def test_export_colonne_date_de_sortie(self, admin_user, employee):
        Employee.objects.filter(pk=employee.pk).update(statut='archive', date_sortie=date(2026, 2, 1))
        resp = _client(admin_user).get('/api/employees/export/?vue=archives')
        lignes = list(openpyxl.load_workbook(io.BytesIO(resp.content))['Employés'].iter_rows(values_only=True))
        entetes = list(lignes[0])
        assert entetes.index('Date de sortie') == entetes.index('Sexe') + 1
        assert dict(zip(entetes, lignes[1]))['Date de sortie'] == '2026-02-01'
```

- [ ] **Step 2 : vérifier l'échec** — Run : `python -m pytest tests/test_employee_date_sortie.py -q --no-cov -k "Contrat or ImportExport"` — Expected : FAIL.

- [ ] **Step 3 : synchro contrat** — dans `models.py`, ajouter `from django.utils import timezone` aux imports, et remplacer le bloc `if dernier.statut != self.statut:` de `sync_statut_from_dernier_contrat` par :

```python
        if dernier.statut != self.statut:
            statut_avant = self.statut
            self.statut = dernier.statut
            update_fields.append('statut')
            if self.statut == self.Statut.ACTIF:
                if self.date_sortie:
                    self.date_sortie = None
                    update_fields.append('date_sortie')
            elif (statut_avant not in self.STATUTS_SORTIE and not self.date_sortie
                  and dernier.date_fin and dernier.date_fin <= timezone.localdate()):
                # Transition automatique (aucun clic, donc aucune saisie) : la
                # fin du contrat est la meilleure date de départ connue. Sans
                # fin de contrat, la date reste vide (page Qualité des données).
                self.date_sortie = dernier.date_fin
                update_fields.append('date_sortie')
```

- [ ] **Step 4 : import** — dans `import_views.py` :
  - importer `from employees.sortie import erreur_date_sortie, lire_date` ;
  - `OPTIONAL_COLS` : ajouter `'date_sortie'` ;
  - juste après le bloc `# Dates` (où `date_embauche` est lu), ajouter :

```python
            # Date de sortie — retenue seulement pour un statut de sortie ;
            # un archivé importé sans date reste à compléter (page Qualité).
            date_sortie = None
            if statut != 'actif':
                try:
                    date_sortie = lire_date(row.get('date_sortie'))
                except ValueError:
                    ligne_erreurs.append("Date de sortie illisible (format AAAA-MM-JJ)")
                if date_sortie:
                    try:
                        embauche = lire_date(date_embauche)
                    except ValueError:
                        embauche = None
                    erreur = erreur_date_sortie(date_sortie, embauche)
                    if erreur:
                        ligne_erreurs.append(erreur)
```

  - dans la construction `Employee(...)`, ajouter `date_sortie=date_sortie,` après `date_embauche=…` ;
  - template (`EmployeeImportTemplateView`) : dans `fixes`, insérer `'date_sortie'` après `'statut'`, et `''` à la même position dans `exemple`.

- [ ] **Step 5 : export** — dans `export_views.py`, `_employee_row_headers` : `'Date de naissance', 'Date de recrutement', 'Sexe', 'Date de sortie',` ; `_employee_row_values` : après la valeur du sexe, ajouter `_iso(employee.date_sortie),`.

- [ ] **Step 6 : vérifier** — Run : `python -m pytest tests/ -q --no-cov` (suite complète, `employees` touché) — Expected : tout PASS.

- [ ] **Step 7 : documentation** — ajouter à `docs/fonctionnel/employes.md` une section « Date de sortie (2026-10-30) » : définition (vraie date de départ ≠ date du clic, conservée par l'audit) ; les trois chemins (formulaire et masse : saisie obligatoire, jamais future ni avant recrutement ; synchro contrat : fin du contrat si passée, sinon vide ; restauration : vidée) ; import (colonne optionnelle, ignorée pour un actif) ; export (colonne après « Sexe » — attention aux lectures par position) ; archivés historiques laissés vides, **sans reprise automatique** (décision utilisateur) ; approche écartée : dater les sorties par le journal d'audit (date du clic, faux pour les archivages tardifs et les imports).

- [ ] **Step 8 : commit** — `git commit -m "feat(employees): date de sortie — synchro contrat, import, export"`

---

### Task 4 : interface — formulaire, modale d'archivage, fiche

**Files :**
- Modify : `frontend/src/pages/EmployeeForm.jsx`, `frontend/src/pages/Employees.jsx`, `frontend/src/pages/EmployeeDetail.jsx`, `frontend/src/config/parametresTabs.js`
- Test : `frontend/src/__tests__/EmployeeForm.test.jsx`, `frontend/src/__tests__/Employees.test.jsx`

**Interfaces :**
- Consumes : `date_sortie` (fiche, PATCH) ; `POST /employees/bulk-delete/` avec `date_sortie` (Task 2).

- [ ] **Step 1 : tests qui échouent**

Dans `EmployeeForm.test.jsx`, nouveau `describe` (réutilise `renderEdit`, `mockEmployee`, le `beforeEach` existant) :

```jsx
describe("EmployeeForm — date de sortie", () => {
  test("le champ apparaît quand on passe un actif en Archivé, et part dans le PATCH", async () => {
    api.patch.mockResolvedValue({ data: {} });
    renderEdit();
    const statut = await screen.findByDisplayValue("Actif");
    expect(screen.queryByLabelText(/Date de sortie/)).not.toBeInTheDocument();
    fireEvent.change(statut, { target: { value: "archive" } });
    const champ = await screen.findByLabelText(/Date de sortie/);
    fireEvent.change(champ, { target: { value: "2026-03-31" } });
    fireEvent.click(screen.getByText(/Enregistrer/));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/employees/emp-uuid/",
        expect.objectContaining({ statut: "archive", date_sortie: "2026-03-31" }),
      ),
    );
  });

  test("revenir à Actif vide la date de sortie", async () => {
    renderEdit();
    const statut = await screen.findByDisplayValue("Actif");
    fireEvent.change(statut, { target: { value: "archive" } });
    fireEvent.change(await screen.findByLabelText(/Date de sortie/), { target: { value: "2026-03-31" } });
    fireEvent.change(statut, { target: { value: "actif" } });
    expect(screen.queryByLabelText(/Date de sortie/)).not.toBeInTheDocument();
  });
});
```

(Si le bouton d'enregistrement de l'édition porte un autre libellé, reprendre celui utilisé par les tests de soumission existants du fichier.)

Dans `Employees.test.jsx`, `describe("Employees — bulk actions")`, ajouter :

```jsx
  test("la modale d'archivage envoie la date de sortie (aujourd'hui par défaut)", async () => {
    api.post.mockResolvedValue({ data: { nb_archives: 1 } });
    await selectFirstEmployee();
    fireEvent.click(screen.getByText(/Archiver \(\d+\)/));
    const champ = await screen.findByLabelText(/Date de sortie/);
    expect(champ.value).toBe(new Date().toLocaleDateString("en-CA"));
    fireEvent.change(champ, { target: { value: "2026-02-28" } });
    fireEvent.click(screen.getByRole("button", { name: "Archiver" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/employees/bulk-delete/",
        expect.objectContaining({ action: "archive", date_sortie: "2026-02-28" }),
      ),
    );
  });

  test("sans date de sortie, le bouton Archiver est désactivé", async () => {
    await selectFirstEmployee();
    fireEvent.click(screen.getByText(/Archiver \(\d+\)/));
    fireEvent.change(await screen.findByLabelText(/Date de sortie/), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Archiver" })).toBeDisabled();
  });
```

- [ ] **Step 2 : vérifier l'échec** — Run : `cd frontend && CI=true npm test -- --watchAll=false EmployeeForm Employees` — Expected : FAIL (champ introuvable).

- [ ] **Step 3 : formulaire** (`EmployeeForm.jsx`)
  - état initial : `date_sortie: "",` après `date_fin_contrat` ; `fetchEmployee` : `date_sortie: emp.date_sortie || "",` ;
  - mémoriser le statut chargé : `const [statutInitial, setStatutInitial] = useState("actif");` et, dans `fetchEmployee` après `setForm`, `setStatutInitial(emp.statut || "actif");` ;
  - dans le `onChange` du select Statut, ajouter `date_sortie: statut === "actif" ? "" : form.date_sortie,` ;
  - après le bloc `{form.statut !== "actif" && (<Field label="Motif (optionnel)">…)}`, ajouter :

```jsx
              {form.statut !== "actif" && (
                <Field
                  label="Date de sortie"
                  // Exigée à la transition actif → sortie (et à la création),
                  // pas pour compléter un archivé historique — même règle que
                  // le serveur (employees/sortie.py).
                  required={!id || statutInitial === "actif"}
                >
                  <Input
                    type="date"
                    name="date_sortie"
                    aria-label="Date de sortie"
                    value={form.date_sortie}
                    max={new Date().toLocaleDateString("en-CA")}
                    onChange={handleChange}
                  />
                  {errors.date_sortie && (
                    <div style={{ color: theme.danger, fontSize: 12, marginTop: 4 }}>
                      {errors.date_sortie}
                    </div>
                  )}
                </Field>
              )}
```

(Si `Input` ne transmet pas `aria-label` à l'élément, utiliser `id="date_sortie"` + `htmlFor` sur le libellé, comme les autres champs du fichier.)

- [ ] **Step 4 : modale d'archivage** (`Employees.jsx`)
  - état : `const [archiveDateSortie, setArchiveDateSortie] = useState(() => new Date().toLocaleDateString("en-CA"));` ;
  - `handleBulkAction(action, motifArchivage = null, dateSortie = null)` et dans le corps envoyé : `...(action === "archive" ? { date_sortie: dateSortie } : {}),` ;
  - texte d'aide de la modale : remplacer par « Indiquez la date réelle de départ : elle sert au calcul des sorties et du turnover. Action réversible (bouton "Restaurer"). » ;
  - avant le libellé « Motif (optionnel) », ajouter un libellé « Date de sortie » (même style que celui du motif) et :

```jsx
            <input
              type="date"
              aria-label="Date de sortie"
              value={archiveDateSortie}
              max={new Date().toLocaleDateString("en-CA")}
              onChange={(e) => setArchiveDateSortie(e.target.value)}
              className="input-focus"
              style={{
                width: "100%", border: `1.5px solid ${theme.border}`, borderRadius: 10,
                padding: "10px 14px", color: theme.text, fontSize: 14, outline: "none",
                background: theme.bg, fontFamily: theme.fontFamily, marginBottom: 14,
              }}
            />
```

  - bouton « Archiver » : `disabled={deleting || !archiveDateSortie}`, curseur/opacité alignés sur cette condition, et `handleBulkAction("archive", archiveMotif || null, archiveDateSortie);`.

- [ ] **Step 5 : fiche et paramètres**
  - `EmployeeDetail.jsx` : ajouter `"date_sortie"` en fin de `SYSTEM_FIELD_CODES_ORDER` (après `"sexe"`), et dans `infoFields` après l'entrée « Sexe » :

```jsx
    ...(employee.date_sortie
      ? [{ label: "Date de sortie", value: formatDateFR(employee.date_sortie), code: "date_sortie", sortKey: systemOrdre("date_sortie") }]
      : []),
```

  - `parametresTabs.js`, fin de `SYSTEM_FIELDS` : `{ id: "sys-date_sortie", nom: "Date de sortie", code: "date_sortie", type_champ: "date", system: true },`
  - `Import.jsx` : ajouter `"date_sortie"` après `"statut"` dans la liste des colonnes optionnelles.

- [ ] **Step 6 : vérifier** — Run : `cd frontend && CI=true npm test -- --watchAll=false` (suite complète) — Expected : PASS.

- [ ] **Step 7 : commit** — `git commit -m "feat(employees): saisie de la date de sortie (formulaire, modale d'archivage, fiche)"`

---

### Task 5 : app `reporting` — photo mensuelle (modèle + calcul)

> L'app `reporting` est créée par le plan `2026-10-30-reporting-rh-pages.md` (exécuté avant celui-ci) : si elle
> existe déjà, ne pas recréer `apps.py` ni toucher à `LOCAL_APPS` ; ajouter seulement `models.py`, `migrations/` et
> `instantanes.py`.

**Files :**
- Create : `backend/reporting/__init__.py`, `apps.py`, `models.py`, `instantanes.py`, `migrations/__init__.py`, `migrations/0001_initial.py` (généré)
- Modify : `backend/config/settings.py` (`LOCAL_APPS` : ajouter `'reporting'`)
- Test : `backend/tests/test_effectif_instantane.py`

**Interfaces :**
- Consumes : `Employee.STATUTS_SORTIE`, `Employee.date_sortie` (Task 1) ; `audit.stats.AGE_TRANCHES`, `ANCIENNETE_TRANCHES`.
- Produces : modèle `reporting.models.EffectifInstantane` ; `reporting.instantanes.calculer_instantane(date_photo: date, reconstitue: bool = False) -> int` (remplace atomiquement les lignes de cette date, renvoie l'effectif total) ; `reporting.instantanes.premier_du_mois(d: date) -> date`.

- [ ] **Step 1 : tests qui échouent**

```python
# backend/tests/test_effectif_instantane.py
"""Photo mensuelle des effectifs : agrégats figés, sans donnée nominative."""
from datetime import date

import pytest

from employees.models import Employee
from reporting.instantanes import calculer_instantane, premier_du_mois
from reporting.models import EffectifInstantane

pytestmark = pytest.mark.django_db

PHOTO = date(2026, 10, 1)


def _emp(base, matricule, **kw):
    return Employee.objects.create(
        matricule=matricule, nom='X', prenom='Y', direction=base.direction,
        departement=base.departement, service=base.service, categorie=base.categorie,
        type_contrat=base.type_contrat, created_by=base.created_by, **kw,
    )


def test_premier_du_mois():
    assert premier_du_mois(date(2026, 10, 17)) == PHOTO


def test_compte_les_presents_a_la_date(employee):
    Employee.objects.filter(pk=employee.pk).update(date_embauche=date(2020, 1, 1), sexe='F',
                                                   date_naissance=date(1990, 5, 1))
    _emp(employee, 'E2', date_embauche=date(2026, 11, 1))                     # pas encore arrivé
    _emp(employee, 'E3', date_embauche=date(2019, 1, 1), statut='archive',
         date_sortie=date(2026, 9, 15))                                       # parti avant
    _emp(employee, 'E4', date_embauche=date(2019, 1, 1), statut='archive',
         date_sortie=date(2026, 10, 20))                                      # parti après : présent
    total = calculer_instantane(PHOTO)
    assert total == 2
    lignes = EffectifInstantane.objects.filter(date_photo=PHOTO)
    assert sum(l.nb for l in lignes) == 2
    f = lignes.get(sexe='F')
    assert (f.tranche_age, f.tranche_anciennete) == ('35-44', '5-10 ans')
    assert f.direction_nom == employee.direction.nom
    assert f.reconstitue is False


def test_archive_sans_date_de_sortie_est_exclu(employee):
    Employee.objects.filter(pk=employee.pk).update(statut='archive', date_embauche=date(2020, 1, 1))
    assert calculer_instantane(PHOTO) == 0


def test_actif_sans_date_embauche_compte_seulement_hors_reconstitution(employee):
    assert calculer_instantane(PHOTO) == 1
    assert calculer_instantane(date(2025, 1, 1), reconstitue=True) == 0


def test_idempotent(employee):
    calculer_instantane(PHOTO)
    calculer_instantane(PHOTO)
    assert sum(l.nb for l in EffectifInstantane.objects.filter(date_photo=PHOTO)) == 1


def test_libelles_figes_apres_renommage(employee):
    calculer_instantane(PHOTO)
    ancien = employee.direction.nom
    employee.direction.nom = 'Direction renommée'
    employee.direction.save()
    assert EffectifInstantane.objects.get(date_photo=PHOTO).direction_nom == ancien


def test_aucune_donnee_nominative():
    noms = {f.name for f in EffectifInstantane._meta.get_fields()}
    assert not noms & {'employee', 'matricule', 'nom', 'prenom'}
```

- [ ] **Step 2 : vérifier l'échec** — Run : `python -m pytest tests/test_effectif_instantane.py -q --no-cov` — Expected : FAIL (`No module named 'reporting'`).

- [ ] **Step 3 : app, modèle**

```python
# backend/reporting/apps.py
from django.apps import AppConfig


class ReportingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'reporting'
    verbose_name = 'Reporting'
```

```python
# backend/reporting/models.py
from django.db import models


class EffectifInstantane(models.Model):
    """Photo mensuelle des effectifs : un NOMBRE d'agents par combinaison
    unité × sexe × catégorie × type de contrat × tranches. Jamais de donnée
    nominative. Libellés figés à la date de la photo (une réorganisation ne
    réécrit pas le passé) ; `reconstitue` = calculé après coup (amorçage),
    moins fiable car basé sur l'affectation actuelle des agents."""
    date_photo = models.DateField(db_index=True)
    reconstitue = models.BooleanField(default=False)
    direction_id = models.UUIDField(null=True, blank=True)
    direction_nom = models.CharField(max_length=150, blank=True)
    departement_id = models.UUIDField(null=True, blank=True)
    departement_nom = models.CharField(max_length=150, blank=True)
    service_nom = models.CharField(max_length=150, blank=True)
    sexe = models.CharField(max_length=1, blank=True)
    categorie_nom = models.CharField(max_length=100, blank=True)
    type_contrat_nom = models.CharField(max_length=100, blank=True)
    tranche_age = models.CharField(max_length=20, blank=True)
    tranche_anciennete = models.CharField(max_length=20, blank=True)
    nb = models.PositiveIntegerField()
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date_photo']
        verbose_name = "Instantané d'effectif"
```

`settings.py` : ajouter `'reporting',` à la fin de `LOCAL_APPS`. Puis `touch backend/reporting/__init__.py backend/reporting/migrations/__init__.py` et `python manage.py makemigrations reporting`.

- [ ] **Step 4 : calcul**

```python
# backend/reporting/instantanes.py
"""Calcul de la photo mensuelle des effectifs (voir models.EffectifInstantane)."""
from collections import Counter

from django.db import transaction
from django.db.models import Q

from audit.stats import AGE_TRANCHES, ANCIENNETE_TRANCHES
from employees.models import Employee
from reporting.models import EffectifInstantane


def premier_du_mois(d):
    return d.replace(day=1)


def _annees_revolues(depuis, jusqua):
    return jusqua.year - depuis.year - ((jusqua.month, jusqua.day) < (depuis.month, depuis.day))


def _tranche(depuis, ref, tranches):
    if not depuis:
        return ''
    annees = _annees_revolues(depuis, ref)
    for mini, maxi, libelle in tranches:
        if mini <= annees <= maxi:
            return libelle
    return ''


def _presents(date_photo, reconstitue):
    """Agents présents à `date_photo` : recrutés au plus tard ce jour-là et
    non encore sortis. Un agent sorti sans date de sortie est exclu (on ne
    sait pas s'il était là) ; un actif sans date de recrutement n'est compté
    que pour une photo du jour (jamais pour une reconstitution du passé)."""
    present = Q(statut=Employee.Statut.ACTIF) | Q(date_sortie__gt=date_photo)
    recrute = Q(date_embauche__lte=date_photo)
    if not reconstitue:
        recrute |= Q(date_embauche__isnull=True, statut=Employee.Statut.ACTIF)
    return Employee.objects.filter(present & recrute)


def calculer_instantane(date_photo, reconstitue=False):
    """Remplace les lignes de `date_photo` par l'agrégat courant. Idempotent.
    Renvoie l'effectif total photographié."""
    lignes = _presents(date_photo, reconstitue).values_list(
        'direction_id', 'direction__nom', 'departement_id', 'departement__nom', 'service__nom',
        'sexe', 'categorie__nom', 'type_contrat__nom', 'date_naissance', 'date_embauche',
    )
    compte = Counter()
    for dir_id, dir_nom, dep_id, dep_nom, svc_nom, sexe, cat, tc, naissance, embauche in lignes:
        compte[(
            dir_id, dir_nom or '', dep_id, dep_nom or '', svc_nom or '', sexe or '', cat or '', tc or '',
            _tranche(naissance, date_photo, AGE_TRANCHES),
            _tranche(embauche, date_photo, ANCIENNETE_TRANCHES),
        )] += 1
    with transaction.atomic():
        EffectifInstantane.objects.filter(date_photo=date_photo).delete()
        EffectifInstantane.objects.bulk_create([
            EffectifInstantane(
                date_photo=date_photo, reconstitue=reconstitue,
                direction_id=k[0], direction_nom=k[1], departement_id=k[2], departement_nom=k[3],
                service_nom=k[4], sexe=k[5], categorie_nom=k[6], type_contrat_nom=k[7],
                tranche_age=k[8], tranche_anciennete=k[9], nb=nb,
            )
            for k, nb in compte.items()
        ])
    return sum(compte.values())
```

- [ ] **Step 5 : vérifier** — Run : `python manage.py migrate && python -m pytest tests/test_effectif_instantane.py -q --no-cov` — Expected : PASS. Vérifier aussi qu'une seule requête lit les employés (un test de comptage n'est pas exigé ici : un seul `values_list`).

- [ ] **Step 6 : commit** — `git commit -m "feat(reporting): photo mensuelle des effectifs (agrégats figés, non nominatifs)"`

---

### Task 6 : commande `photo_effectifs` (+ amorçage) et documentation

**Files :**
- Create : `backend/reporting/management/__init__.py`, `backend/reporting/management/commands/__init__.py`, `backend/reporting/management/commands/photo_effectifs.py`
- Modify : `docs/fonctionnel/statistiques-audit.md`, `CLAUDE.md` (index : rien à ajouter si la doc reste dans `statistiques-audit.md`)
- Test : `backend/tests/test_effectif_instantane.py` (ajout)

**Interfaces :**
- Consumes : `calculer_instantane`, `premier_du_mois` (Task 5).
- Produces : `python manage.py photo_effectifs [--date AAAA-MM-JJ] [--amorcer N]`.

- [ ] **Step 1 : tests qui échouent** (ajout à `test_effectif_instantane.py`)

```python
from django.core.management import call_command
from django.utils import timezone


def test_commande_photographie_le_mois_courant(employee):
    call_command('photo_effectifs')
    assert EffectifInstantane.objects.filter(
        date_photo=premier_du_mois(timezone.localdate()), reconstitue=False).exists()


def test_commande_date_explicite_ramenee_au_premier_du_mois(employee):
    call_command('photo_effectifs', '--date', '2026-10-17')
    assert EffectifInstantane.objects.filter(date_photo=PHOTO).exists()


def test_amorcage_reconstitue_sans_ecraser_une_vraie_photo(employee):
    Employee.objects.filter(pk=employee.pk).update(date_embauche=date(2020, 1, 1))
    mois_courant = premier_du_mois(timezone.localdate())
    call_command('photo_effectifs')                              # vraie photo du mois
    call_command('photo_effectifs', '--amorcer', '3')
    assert not EffectifInstantane.objects.filter(date_photo=mois_courant, reconstitue=True).exists()
    reconstitues = EffectifInstantane.objects.filter(reconstitue=True).values_list('date_photo', flat=True)
    assert len(set(reconstitues)) == 3
```

- [ ] **Step 2 : vérifier l'échec** — Run : `python -m pytest tests/test_effectif_instantane.py -q --no-cov -k commande or amorcage` — Expected : FAIL (`Unknown command`).

- [ ] **Step 3 : commande**

```python
# backend/reporting/management/commands/photo_effectifs.py
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from reporting.instantanes import calculer_instantane, premier_du_mois
from reporting.models import EffectifInstantane


def _mois_precedent(d):
    return date(d.year - 1, 12, 1) if d.month == 1 else date(d.year, d.month - 1, 1)


class Command(BaseCommand):
    help = ("Photographie les effectifs au 1er du mois (agrégats, sans donnée nominative). "
            "Idempotent. À planifier le 1er de chaque mois en production. "
            "--amorcer N reconstitue les N mois précédents (marqués « reconstitués »), "
            "sans jamais écraser une vraie photo.")

    def add_arguments(self, parser):
        parser.add_argument('--date', help="AAAA-MM-JJ (ramenée au 1er du mois). Défaut : mois courant.")
        parser.add_argument('--amorcer', type=int, default=0, help="Nombre de mois passés à reconstituer.")

    def handle(self, *args, **opts):
        try:
            ref = date.fromisoformat(opts['date']) if opts['date'] else timezone.localdate()
        except ValueError as exc:
            raise CommandError("--date attend le format AAAA-MM-JJ.") from exc
        cible = premier_du_mois(ref)

        if opts['amorcer']:
            mois = cible
            for _ in range(opts['amorcer']):
                mois = _mois_precedent(mois)
                if EffectifInstantane.objects.filter(date_photo=mois, reconstitue=False).exists():
                    self.stdout.write(f"{mois} : vraie photo existante, conservée.")
                    continue
                total = calculer_instantane(mois, reconstitue=True)
                self.stdout.write(f"{mois} : {total} agent(s) (reconstitué).")
            return

        total = calculer_instantane(cible)
        self.stdout.write(f"{cible} : {total} agent(s).")
```

- [ ] **Step 4 : vérifier** — Run : `python -m pytest tests/test_effectif_instantane.py -q --no-cov` puis la suite complète `python -m pytest tests/ -q --no-cov` — Expected : PASS. Essai manuel : `python manage.py photo_effectifs --amorcer 24` puis `python manage.py photo_effectifs`.

- [ ] **Step 5 : documentation** — ajouter à `docs/fonctionnel/statistiques-audit.md` une section « Photo mensuelle des effectifs (2026-10-30) » : but (comparaisons exactes dans le temps) ; contenu (agrégats, **aucune donnée nominative**, libellés figés) ; règle de présence à une date (recruté au plus tard ce jour, non sorti ; sorti sans date exclu ; actif sans date de recrutement compté seulement dans la photo du jour) ; commande et options ; amorçage `reconstitue=True` = affectation actuelle, donc approximatif après une réorganisation, et jamais écrit par-dessus une vraie photo ; **à planifier le 1er de chaque mois lors de la mise en production** (avec `notifier_echeances_contrat`), sinon l'historique reste vide sans erreur visible ; app `reporting` choisie plutôt que `audit` pour ne pas dépendre des migrations en cours de `audit`.

- [ ] **Step 6 : commit** — `git commit -m "feat(reporting): commande photo_effectifs avec amorçage reconstitué"`

---

## Hors de ce plan (étapes suivantes du spec)

Pages de reporting, page Qualité (liste des archivés sans date de sortie), filtres `?sortie_debut=`/`?sortie_fin=`,
intégration GRH du champ (`grh_integration.py`, `webhook_client.py`), bascule des indicateurs existants
(`audit/stats.py#_indicateurs`) de la date d'audit vers `date_sortie`.
