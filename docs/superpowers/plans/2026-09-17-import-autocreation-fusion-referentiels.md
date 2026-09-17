# Auto-création référentiels à l'import + fusion manuelle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (Exécuté en session directe, sans sous-agents, à la demande de l'utilisateur.)

**Goal:** Quand une valeur texte importée (employés ou référentiels) ne correspond à aucune entrée existante, créer automatiquement le référentiel manquant (avec cascade sur ses parents si non ambigus) au lieu de laisser le champ vide/bloquer ; et permettre de fusionner a posteriori deux entrées de référentiel en doublon depuis `/parametres`.

**Architecture:** Deux fonctions de résolution génériques (`resoudre_ou_creer`) ajoutées dans `backend/employees/import_views.py`, réutilisées par `EmployeeImportView` et `ReferentielImportView`. Un endpoint générique `ReferentielMergeView` dans `referentiel_views.py` qui réassigne toutes les FK/M2M entrantes via l'API de réflexion Django (`model._meta.get_fields()`), sans énumération manuelle par modèle. Frontend : extension de la sélection multiple déjà existante dans `Parametres.jsx` avec un bouton "Fusionner".

**Tech Stack:** Django REST Framework, pytest, React, Jest.

## Global Constraints

- ADMIN only pour toute action d'écriture (import, fusion) — `IsAdmin`.
- Transactions atomiques : aucune fusion/import partiel en cas d'erreur bloquante.
- Correspondance par nom : insensible à la casse (`.upper()`), comportement existant conservé pour les cas déjà résolus.
- Aucune correspondance floue (Levenshtein) — uniquement exact ou création.
- Modèles concernés par la fusion : Direction, Pole, Departement, Service, Cellule, Section, Poste, TypeContrat, Categorie, Echelle, MotifArchivage (PAS TypeDocument, PAS ChampPersonnalise).
- Audit : toute création auto tracée dans le détail de l'entrée d'audit d'import existante ; toute fusion tracée via un nouveau type d'action `MERGE_REFERENTIEL`.

---

### Task 1: Fonction générique de résolution-ou-création + auto-création dans `EmployeeImportView`

**Files:**
- Modify: `backend/employees/import_views.py`
- Test: `backend/tests/test_employee_import_autocreation.py` (nouveau)

**Interfaces:**
- Produces: `resoudre_ou_creer_simple(cache: dict, ModelClass, nom: str, extra_kwargs: dict = None) -> (obj|None, bool)` — cherche `nom.upper()` dans `cache` (dict `{NOM_UPPER: instance}`), sinon crée `ModelClass(nom=nom.strip(), **extra_kwargs)`, l'ajoute au cache, retourne `(instance, True)` si créé, `(instance, False)` si déjà existant. Retourne `(None, False)` si `nom` est vide.
- Consumes: rien d'externe.

- [ ] **Step 1: Écrire le test qui échoue — auto-création simple (Poste)**

```python
# backend/tests/test_employee_import_autocreation.py
import io
import pytest
from openpyxl import Workbook
from rest_framework.test import APIClient
from employees.models import Employee, Poste, Direction, Departement, Service, TypeContrat, Categorie
from audit.models import AuditLog


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _build_xlsx(headers, rows):
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


@pytest.mark.django_db
class TestEmployeeImportAutocreation:
    def test_poste_inconnu_est_cree_automatiquement(self, admin_user):
        assert not Poste.objects.filter(nom="Ingénieur R&D").exists()
        buf = _build_xlsx(
            ["matricule", "numero_contrat", "nom", "prenom", "poste"],
            [["M001", "1", "DUPONT", "Jean", "Ingénieur R&D"]],
        )
        resp = auth_client(admin_user).post(
            "/api/employees/import/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 1
        poste = Poste.objects.get(nom="Ingénieur R&D")
        emp = Employee.objects.get(matricule="M001")
        assert emp.poste_id == poste.id
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd backend && pytest tests/test_employee_import_autocreation.py -v`
Expected: FAIL — `emp.poste_id` est `None` (le poste n'est pas créé, comportement actuel).

- [ ] **Step 3: Implémenter `resoudre_ou_creer_simple` et l'utiliser pour Poste/TypeContrat/Categorie/Direction dans `EmployeeImportView.post`**

Dans `backend/employees/import_views.py`, ajouter avant `class EmployeeImportView` :

```python
def resoudre_ou_creer_simple(cache, ModelClass, nom, extra_kwargs=None):
    """Résout `nom` dans `cache` (dict {NOM_UPPER: instance}) ; si absent,
    crée l'entrée (référentiel sans parent obligatoire) et l'ajoute au
    cache pour les lignes suivantes du même import. Retourne
    (instance|None, cree: bool)."""
    nom = (nom or '').strip()
    if not nom:
        return None, False
    cle = nom.upper()
    existant = cache.get(cle)
    if existant:
        return existant, False
    instance = ModelClass.objects.create(nom=nom, **(extra_kwargs or {}))
    cache[cle] = instance
    return instance, True
```

Dans `EmployeeImportView.post`, remplacer les lignes de résolution (autour de la ligne 216-231) :

```python
            # Référentiels — résolution par nom, auto-création si absent
            # (voir resoudre_ou_creer_simple / resoudre_ou_creer_hierarchique
            # ci-dessus) : seule une ambiguïté de parent bloque encore la
            # ligne, une simple absence ne bloque plus rien.
            referentiels_crees_ligne = []

            direction, direction_creee = resoudre_ou_creer_hierarchique(
                directions, row.get('direction', ''), Direction,
            )
            if direction_creee:
                referentiels_crees_ligne.append({'type': 'direction', 'nom': direction.nom})

            departement, departement_creee = resoudre_ou_creer_hierarchique(
                departements, row.get('departement', ''), Departement,
                parent=direction, parent_field='direction',
                parent_cache=directions, ParentModel=Direction,
                parent_col_nom=row.get('direction', ''),
                ligne_erreurs=ligne_erreurs, label='Département',
            )
            if departement_creee:
                referentiels_crees_ligne.append({'type': 'departement', 'nom': departement.nom, 'parent': departement.direction.nom})

            service, service_creee = resoudre_ou_creer_hierarchique(
                services, row.get('service', ''), Service,
                parent=departement, parent_field='departement',
                parent_cache=departements, ParentModel=Departement,
                parent_col_nom=row.get('departement', ''),
                ligne_erreurs=ligne_erreurs, label='Service',
            )
            if service_creee:
                referentiels_crees_ligne.append({'type': 'service', 'nom': service.nom, 'parent': service.departement.nom})

            # Un Service appartient toujours à un Département — si la colonne
            # "departement" du CSV est vide/absente mais qu'un Service a été
            # résolu, on aligne quand même departement/direction dessus.
            if service and not departement:
                departement = service.departement
            if departement and not direction:
                direction = departement.direction

            poste, poste_creee = resoudre_ou_creer_simple(postes, row.get('poste', ''), Poste)
            if poste_creee:
                referentiels_crees_ligne.append({'type': 'poste', 'nom': poste.nom})

            type_contrat, type_contrat_creee = resoudre_ou_creer_simple(types_contrat, row.get('type_contrat', ''), TypeContrat)
            if type_contrat_creee:
                referentiels_crees_ligne.append({'type': 'type_contrat', 'nom': type_contrat.nom})

            categorie, categorie_creee = resoudre_ou_creer_simple(categories, row.get('categorie', ''), Categorie)
            if categorie_creee:
                referentiels_crees_ligne.append({'type': 'categorie', 'nom': categorie.nom})

            if referentiels_crees_ligne:
                referentiels_crees_total.extend(referentiels_crees_ligne)
```

Note : `resoudre_ou_creer_hierarchique` est implémenté à l'étape 5 (Task 2) — pour ce Task 1, restreindre le test et l'implémentation à Poste/TypeContrat/Categorie uniquement (référentiels sans parent), et garder la résolution existante (par cache, sans création) pour direction/departement/service. Retirer donc du code ci-dessus les blocs `direction`/`departement`/`service` : ils seront ajoutés au Task 2. Version Task 1 uniquement :

```python
            direction = directions.get(row.get('direction', '').upper())
            departement = departements.get(row.get('departement', '').upper())
            service = services.get(row.get('service', '').upper())
            if service and not departement:
                departement = service.departement
            if departement and not direction:
                direction = departement.direction

            referentiels_crees_ligne = []
            poste, poste_creee = resoudre_ou_creer_simple(postes, row.get('poste', ''), Poste)
            if poste_creee:
                referentiels_crees_ligne.append({'type': 'poste', 'nom': poste.nom})
            type_contrat, type_contrat_creee = resoudre_ou_creer_simple(types_contrat, row.get('type_contrat', ''), TypeContrat)
            if type_contrat_creee:
                referentiels_crees_ligne.append({'type': 'type_contrat', 'nom': type_contrat.nom})
            categorie, categorie_creee = resoudre_ou_creer_simple(categories, row.get('categorie', ''), Categorie)
            if categorie_creee:
                referentiels_crees_ligne.append({'type': 'categorie', 'nom': categorie.nom})
```

Ajouter `referentiels_crees_total = []` juste avant la boucle `for num_ligne, row in enumerate(rows, start=2):`, et à l'intérieur de la boucle après le calcul de `referentiels_crees_ligne`, faire `referentiels_crees_total.extend(referentiels_crees_ligne)`.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd backend && pytest tests/test_employee_import_autocreation.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/employees/import_views.py backend/tests/test_employee_import_autocreation.py
git commit -m "feat(import): auto-création Poste/TypeContrat/Categorie manquants à l'import employés"
```

---

### Task 2: Cascade hiérarchique Direction/Département/Service dans `EmployeeImportView`

**Files:**
- Modify: `backend/employees/import_views.py`
- Test: `backend/tests/test_employee_import_autocreation.py`

**Interfaces:**
- Consumes: `resoudre_ou_creer_simple` (Task 1).
- Produces: `resoudre_departement_ligne(departements_par_nom, departements_par_cle, directions, dept_nom, dir_nom) -> (Departement|None, cree: bool, erreur: str|None)` — résout un Département par nom (+ direction optionnelle pour lever l'ambiguïté), crée l'entrée si absente et la direction est non ambiguë (soit précisée et existante, soit créée à la volée si elle aussi absente), retourne une erreur si ambiguïté (plusieurs départements homonymes sans direction pour trancher) ou si la direction manque alors qu'il faut créer le département.

- [ ] **Step 1: Écrire le test qui échoue — cascade Département+Direction absents**

Ajouter à `TestEmployeeImportAutocreation` :

```python
    def test_departement_et_direction_absents_sont_crees_en_cascade(self, admin_user):
        buf = _build_xlsx(
            ["matricule", "numero_contrat", "nom", "prenom", "direction", "departement"],
            [["M002", "2", "MARTIN", "Paul", "Direction Technique", "Comptabilité"]],
        )
        resp = auth_client(admin_user).post(
            "/api/employees/import/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 1
        emp = Employee.objects.get(matricule="M002")
        assert emp.departement.nom == "Comptabilité"
        assert emp.departement.direction.nom == "Direction Technique"
        assert emp.direction.nom == "Direction Technique"

    def test_departement_homonyme_ambigu_bloque_toujours(self, admin_user, direction):
        from employees.models import Direction as DirectionModel, Departement
        autre_direction = DirectionModel.objects.create(nom="Autre Direction")
        Departement.objects.create(nom="RH", direction=direction)
        Departement.objects.create(nom="RH", direction=autre_direction)
        buf = _build_xlsx(
            ["matricule", "numero_contrat", "nom", "prenom", "departement"],
            [["M003", "3", "DURAND", "Alice", "RH"]],
        )
        resp = auth_client(admin_user).post(
            "/api/employees/import/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 0
        assert resp.data["nb_erreurs"] == 1
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd backend && pytest tests/test_employee_import_autocreation.py -v`
Expected: FAIL sur `test_departement_et_direction_absents_sont_crees_en_cascade` (departement reste `None`) ; `test_departement_homonyme_ambigu_bloque_toujours` doit déjà passer (comportement actuel identique — vérifier qu'il passe déjà, sinon l'ajuster).

- [ ] **Step 3: Implémenter la cascade Direction → Département → Service**

Dans `backend/employees/import_views.py`, ajouter après `resoudre_ou_creer_simple` :

```python
def resoudre_departement_ligne(departements_par_nom, departements_par_cle, directions, dept_nom, dir_nom):
    """Résout un Département par nom (+ direction optionnelle pour lever
    l'ambiguïté), avec auto-création en cascade si le département ET/ou sa
    direction sont absents mais non ambigus. Retourne
    (Departement|None, cree: bool, erreur: str|None)."""
    dept_nom = (dept_nom or '').strip()
    if not dept_nom:
        return None, False, None
    dir_nom = (dir_nom or '').strip()
    cle_dept = dept_nom.upper()

    if dir_nom:
        direction = directions.get(dir_nom.upper())
        direction_creee = False
        if not direction:
            direction = Direction.objects.create(nom=dir_nom)
            directions[dir_nom.upper()] = direction
            direction_creee = True
        existant = departements_par_cle.get((dir_nom.upper(), cle_dept))
        if existant:
            return existant, False, None
        nouveau = Departement.objects.create(nom=dept_nom, direction=direction)
        departements_par_cle[(dir_nom.upper(), cle_dept)] = nouveau
        departements_par_nom.setdefault(cle_dept, []).append(nouveau)
        return nouveau, True, None

    matches = departements_par_nom.get(cle_dept, [])
    if len(matches) == 1:
        return matches[0], False, None
    if len(matches) > 1:
        return None, False, f'Plusieurs départements nommés "{dept_nom}" existent, précisez la colonne "direction"'
    # Aucune correspondance et pas de colonne direction pour trancher/créer
    return None, False, f'Département "{dept_nom}" introuvable — renseignez la colonne "direction" pour le créer automatiquement'
```

Remplacer dans `EmployeeImportView.post` (autour des lignes 215-231) :

```python
            # Référentiels — résolution par nom, auto-création si absent et
            # non ambigu (voir resoudre_ou_creer_simple /
            # resoudre_departement_ligne ci-dessus).
            referentiels_crees_ligne = []

            direction, direction_creee = resoudre_ou_creer_simple(directions, row.get('direction', ''), Direction)
            if direction_creee:
                referentiels_crees_ligne.append({'type': 'direction', 'nom': direction.nom})

            departement, departement_creee, departement_erreur = resoudre_departement_ligne(
                departements_par_nom, departements_par_cle, directions,
                row.get('departement', ''), row.get('direction', ''),
            )
            if departement_erreur:
                ligne_erreurs.append(departement_erreur)
            if departement_creee:
                referentiels_crees_ligne.append({'type': 'departement', 'nom': departement.nom, 'parent': departement.direction.nom})
                if departement.direction.nom.upper() not in {r.get('nom', '').upper() for r in referentiels_crees_ligne if r['type'] == 'direction'}:
                    pass  # la direction, si nouvellement créée, a déjà été ajoutée ci-dessus par resoudre_ou_creer_simple

            service, service_creee = resoudre_ou_creer_simple(
                services, row.get('service', ''), Service,
                extra_kwargs={'departement': departement} if departement else None,
            ) if departement else (services.get(row.get('service', '').upper()), False)
            if service_creee:
                referentiels_crees_ligne.append({'type': 'service', 'nom': service.nom, 'parent': service.departement.nom})

            if service and not departement:
                departement = service.departement
            if departement and not direction:
                direction = departement.direction

            poste, poste_creee = resoudre_ou_creer_simple(postes, row.get('poste', ''), Poste)
            if poste_creee:
                referentiels_crees_ligne.append({'type': 'poste', 'nom': poste.nom})
            type_contrat, type_contrat_creee = resoudre_ou_creer_simple(types_contrat, row.get('type_contrat', ''), TypeContrat)
            if type_contrat_creee:
                referentiels_crees_ligne.append({'type': 'type_contrat', 'nom': type_contrat.nom})
            categorie, categorie_creee = resoudre_ou_creer_simple(categories, row.get('categorie', ''), Categorie)
            if categorie_creee:
                referentiels_crees_ligne.append({'type': 'categorie', 'nom': categorie.nom})

            referentiels_crees_total.extend(referentiels_crees_ligne)
```

Important : `resoudre_ou_creer_simple` ne doit **pas** être utilisé pour Service sans adapter `extra_kwargs` (Service a un parent obligatoire) — le ternaire ci-dessus gère ça en n'appelant la fonction que si `departement` est résolu ; sinon `service` reste `None` si son nom ne correspond à rien (pas de création d'un Service orphelin, conforme à la spec).

Simplifier en pratique : remplacer le bloc `service, service_creee = ... if departement else (...)` par une version plus lisible :

```python
            service = None
            service_creee = False
            service_nom = row.get('service', '').strip()
            if service_nom:
                cle_service = service_nom.upper()
                service = services.get(cle_service)
                if not service and departement:
                    service = Service.objects.create(nom=service_nom, departement=departement)
                    services[cle_service] = service
                    service_creee = True
            if service_creee:
                referentiels_crees_ligne.append({'type': 'service', 'nom': service.nom, 'parent': service.departement.nom})
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd backend && pytest tests/test_employee_import_autocreation.py -v`
Expected: PASS (les deux nouveaux tests, plus le test Task 1 toujours au vert)

- [ ] **Step 5: Lancer toute la suite backend pour vérifier l'absence de régression**

Run: `cd backend && pytest`
Expected: PASS (tous les tests existants sur `EmployeeImportView`/imports/scoping restent verts)

- [ ] **Step 6: Ajouter la traçabilité dans l'audit log d'import**

Chercher dans `EmployeeImportView.post` où la réponse finale est construite (fin de la méthode) et vérifier s'il existe déjà une entrée `AuditLog` pour l'import (rechercher `AuditLog.objects.create` dans le fichier — si absent, l'import n'était pas audité avant ce chantier : ajouter une entrée `EXPORT`-like n'est pas dans le scope de ce plan si aucune n'existait déjà. Vérifier d'abord :

Run: `cd backend && grep -n "AuditLog" employees/import_views.py`

Si aucune occurrence : ajouter une entrée d'audit minimale pour l'import (nouveau comportement, mais nécessaire pour respecter la spec "traçabilité") :

```python
        from audit.models import AuditLog
        AuditLog.objects.create(
            user=request.user,
            username_snapshot=request.user.username,
            action=AuditLog.Action.CREATE_EMP,
            target_model='Employee',
            target_label=f"Import CSV — {nb_crees} employé(s) créé(s)",
            ip_address=AuditLog._get_ip(request),
            details={
                'nb_crees': nb_crees,
                'nb_erreurs': len(erreurs),
                'referentiels_crees': referentiels_crees_total[:200],
            },
        )
```

Insérer juste avant le `return Response({...})` final de `EmployeeImportView.post`, uniquement si `nb_crees > 0`.

- [ ] **Step 7: Écrire le test de traçabilité**

```python
    def test_creation_auto_tracee_dans_audit_log(self, admin_user):
        buf = _build_xlsx(
            ["matricule", "numero_contrat", "nom", "prenom", "poste"],
            [["M004", "4", "BERNARD", "Eve", "Technicien Réseau"]],
        )
        resp = auth_client(admin_user).post(
            "/api/employees/import/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        entry = AuditLog.objects.filter(action=AuditLog.Action.CREATE_EMP).latest('created_at')
        noms_crees = [r['nom'] for r in entry.details.get('referentiels_crees', [])]
        assert "Technicien Réseau" in noms_crees
```

- [ ] **Step 8: Lancer le test, vérifier qu'il passe**

Run: `cd backend && pytest tests/test_employee_import_autocreation.py -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/employees/import_views.py backend/tests/test_employee_import_autocreation.py
git commit -m "feat(import): cascade auto-création Direction/Département/Service + audit"
```

---

### Task 3: Auto-création dans `ReferentielImportView` (Pôle/Département/Service/Cellule/Section)

**Files:**
- Modify: `backend/employees/import_views.py`
- Test: `backend/tests/test_referentiel_import_autocreation.py` (nouveau)

**Interfaces:**
- Consumes: `resoudre_ou_creer_simple`, pattern de `resoudre_departement_ligne` (Task 2) adapté en interne à `ReferentielImportView.post` (la fonction locale `resoudre_departement` existante y est étendue directement, pas réutilisée telle quelle car son usage diffère — colonnes `direction`/`departement` à double sens pour Cellule/Section).
- Produces: rien de nouveau exposé — comportement de `ReferentielImportView.post` étendu en interne.

- [ ] **Step 1: Écrire le test qui échoue — Direction absente lors de l'import de Départements**

```python
# backend/tests/test_referentiel_import_autocreation.py
import io
import pytest
from openpyxl import Workbook
from rest_framework.test import APIClient
from employees.models import Direction, Departement, Service, Cellule, Pole


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


@pytest.mark.django_db
class TestReferentielImportAutocreation:
    def test_direction_absente_creee_automatiquement_pour_departement(self, admin_user):
        assert not Direction.objects.filter(nom="Direction Achats").exists()
        buf = _xlsx(["nom", "direction"], [["Approvisionnement", "Direction Achats"]])
        resp = auth_client(admin_user).post(
            "/api/ref/import/departements/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 1
        dept = Departement.objects.get(nom="Approvisionnement")
        assert dept.direction.nom == "Direction Achats"

    def test_departement_absent_cree_automatiquement_pour_service(self, admin_user, direction):
        buf = _xlsx(
            ["nom", "departement", "direction"],
            [["Recouvrement", "Comptabilité", direction.nom]],
        )
        resp = auth_client(admin_user).post(
            "/api/ref/import/services/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 1
        service = Service.objects.get(nom="Recouvrement")
        assert service.departement.nom == "Comptabilité"
        assert service.departement.direction_id == direction.id

    def test_departement_ambigu_toujours_bloque(self, admin_user, direction):
        autre = Direction.objects.create(nom="Autre Direction")
        Departement.objects.create(nom="RH", direction=direction)
        Departement.objects.create(nom="RH", direction=autre)
        buf = _xlsx(["nom", "departement"], [["Paie Cadres", "RH"]])
        resp = auth_client(admin_user).post(
            "/api/ref/import/services/", {"file": buf}, format="multipart"
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 0
        assert resp.data["nb_erreurs"] == 1
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `cd backend && pytest tests/test_referentiel_import_autocreation.py -v`
Expected: FAIL sur les deux premiers tests (actuellement "Direction ... introuvable" / "Departement ... introuvable" bloquent la ligne) ; le 3ᵉ doit déjà passer.

- [ ] **Step 3: Implémenter l'auto-création dans `ReferentielImportView.post`**

Dans `backend/employees/import_views.py`, méthode `ReferentielImportView.post`, remplacer le bloc de résolution par modèle (lignes ~606-644) :

```python
            if model in ('poles', 'departements'):
                dir_nom = row.get('direction', '').strip()
                direction = directions_cache.get(dir_nom.upper())
                if not dir_nom:
                    ligne_erreurs.append("Direction manquante")
                elif not direction:
                    direction = Direction.objects.create(nom=dir_nom)
                    directions_cache[dir_nom.upper()] = direction
                cle_doublon = (direction.id if direction else None, nom.upper())

            elif model == 'services':
                if not row.get('departement', '').strip():
                    ligne_erreurs.append("Departement manquant")
                departement = resoudre_departement(row, ligne_erreurs)
                cle_doublon = (departement.id if departement else None, nom.upper())

            elif model in ('cellules', 'sections'):
                a_departement = bool(row.get('departement', '').strip())
                a_direction = bool(row.get('direction', '').strip())
                if a_departement:
                    departement = resoudre_departement(row, ligne_erreurs, label='Departement')
                elif a_direction:
                    dir_nom = row.get('direction', '').strip()
                    direction = directions_cache.get(dir_nom.upper())
                    if not direction:
                        direction = Direction.objects.create(nom=dir_nom)
                        directions_cache[dir_nom.upper()] = direction
                else:
                    ligne_erreurs.append('Direction ou Departement requis (exactement un des deux)')
                cle_doublon = (
                    direction.id if direction else None,
                    departement.id if departement else None,
                    nom.upper(),
                )

            else:
                cle_doublon = (None, nom.upper())
```

Et modifier `resoudre_departement` (définie plus haut dans la méthode, ~ligne 540) pour créer le Département manquant quand la Direction est non ambiguë (renseignée et résolue, ou créée à la volée) :

```python
        def resoudre_departement(row, ligne_erreurs, label='Departement'):
            """Resout un Departement par 'departement' (+ 'direction'
            optionnelle). Cree automatiquement le Departement (et sa
            Direction si elle aussi absente) quand la Direction est non
            ambigue. Retourne None et ajoute une erreur a ligne_erreurs
            uniquement en cas d'absence de Direction pour trancher/creer,
            ou d'homonymie sans Direction pour departager."""
            dept_nom = row.get('departement', '').strip()
            if not dept_nom:
                return None
            dept_cle = dept_nom.upper()
            dir_nom = row.get('direction', '').strip()
            if dir_nom:
                dir_cle = dir_nom.upper()
                dept = departements_par_cle.get((dir_cle, dept_cle))
                if dept:
                    return dept
                direction = directions_cache.get(dir_cle)
                if not direction:
                    direction = Direction.objects.create(nom=dir_nom)
                    directions_cache[dir_cle] = direction
                nouveau = Departement.objects.create(nom=dept_nom, direction=direction)
                departements_par_cle[(dir_cle, dept_cle)] = nouveau
                departements_par_nom.setdefault(dept_cle, []).append(nouveau)
                return nouveau
            matches = departements_par_nom.get(dept_cle, [])
            if len(matches) == 1:
                return matches[0]
            if len(matches) > 1:
                ligne_erreurs.append(
                    f'Plusieurs departements nommes "{row.get("departement")}" existent, precisez la colonne "direction"'
                )
                return None
            ligne_erreurs.append(
                f'{label} "{row.get("departement")}" introuvable — renseignez la colonne "direction" pour le creer automatiquement'
            )
            return None
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `cd backend && pytest tests/test_referentiel_import_autocreation.py -v`
Expected: PASS

- [ ] **Step 5: Lancer toute la suite backend**

Run: `cd backend && pytest`
Expected: PASS, aucune régression sur les tests existants de `ReferentielImportView` (`test_echelle_referentiel.py`, `test_section_referentiel.py`, `test_motif_archivage_referentiel.py`, et tout autre test d'import référentiel).

- [ ] **Step 6: Commit**

```bash
git add backend/employees/import_views.py backend/tests/test_referentiel_import_autocreation.py
git commit -m "feat(import): auto-création Direction/Département manquants dans l'import référentiels"
```

---

### Task 4: Backend — `ReferentielMergeView` (fusion générique)

**Files:**
- Modify: `backend/audit/models.py` (nouveau type d'action)
- Modify: `backend/audit/migrations/` (nouvelle migration si `Action` est un `TextChoices` sans contrainte DB stricte — vérifier d'abord si une migration est nécessaire)
- Modify: `backend/employees/referentiel_views.py`
- Modify: `backend/employees/referentiel_urls.py`
- Test: `backend/tests/test_referentiel_merge.py` (nouveau)

**Interfaces:**
- Produces: `POST /api/ref/merge/{model}/` body `{"target_id": "<uuid>", "source_ids": ["<uuid>", ...]}` → `{"nb_reassignes": int, "sources_supprimees": [{"id", "nom"}]}` ou 400 avec `{"error": "..."}`.
- Consumes: `AuditLog.Action.MERGE_REFERENTIEL` (nouveau).

- [ ] **Step 1: Vérifier si `AuditLog.Action` nécessite une migration**

Run: `cd backend && grep -n "choices=" audit/models.py | head -5`

`action` est un `CharField(choices=Action.choices)` sans `max_length` insuffisant à vérifier — lire la définition complète du champ `action` dans `audit/models.py` pour confirmer que l'ajout d'une valeur à `TextChoices` ne casse pas `max_length` (le code le plus long actuel est `VIEW_AUDIT_LOG` = 14 caractères ; `MERGE_REFERENTIEL` = 18 caractères — vérifier `max_length` du champ et l'augmenter si besoin dans une migration).

```python
# Lire le champ dans audit/models.py, ex. :
# action = models.CharField(max_length=20, choices=Action.Choices)
```

Si `max_length` < 18, l'augmenter (ex. à 30) et générer la migration :

Run: `cd backend && python manage.py makemigrations audit`
Expected: crée `audit/migrations/000X_alter_auditlog_action.py`

Ajouter dans `audit/models.py`, dans `class Action(models.TextChoices)` :

```python
        MERGE_REFERENTIEL = 'MERGE_REFERENTIEL', 'Fusion de référentiel'
```

- [ ] **Step 2: Écrire le test qui échoue — fusion simple avec réassignation FK**

```python
# backend/tests/test_referentiel_merge.py
import pytest
from rest_framework.test import APIClient
from employees.models import Direction, Departement, Employee
from audit.models import AuditLog


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestReferentielMerge:
    def test_fusion_departement_reassigne_employes_et_supprime_source(self, admin_user, direction):
        source = Departement.objects.create(nom="Personnal", direction=direction)
        target = Departement.objects.create(nom="Personnel", direction=direction)
        emp = Employee.objects.create(
            matricule="M100", nom="X", prenom="Y", direction=direction, departement=source,
        )
        resp = auth_client(admin_user).post(
            "/api/ref/merge/departements/",
            {"target_id": str(target.id), "source_ids": [str(source.id)]},
            format="json",
        )
        assert resp.status_code == 200, resp.data
        emp.refresh_from_db()
        assert emp.departement_id == target.id
        assert not Departement.objects.filter(pk=source.pk).exists()

    def test_fusion_tracee_dans_audit_log(self, admin_user, direction):
        source = Departement.objects.create(nom="Personnal", direction=direction)
        target = Departement.objects.create(nom="Personnel", direction=direction)
        auth_client(admin_user).post(
            "/api/ref/merge/departements/",
            {"target_id": str(target.id), "source_ids": [str(source.id)]},
            format="json",
        )
        entry = AuditLog.objects.filter(action=AuditLog.Action.MERGE_REFERENTIEL).latest('created_at')
        assert entry.details["model"] == "departements"
        assert entry.details["target"]["nom"] == "Personnel"
        assert entry.details["sources"][0]["nom"] == "Personnal"

    def test_consultant_ne_peut_pas_fusionner(self, consultant_user, direction):
        source = Departement.objects.create(nom="A", direction=direction)
        target = Departement.objects.create(nom="B", direction=direction)
        resp = auth_client(consultant_user).post(
            "/api/ref/merge/departements/",
            {"target_id": str(target.id), "source_ids": [str(source.id)]},
            format="json",
        )
        assert resp.status_code == 403

    def test_modele_inconnu_rejete(self, admin_user):
        resp = auth_client(admin_user).post(
            "/api/ref/merge/types-documents/",
            {"target_id": "00000000-0000-0000-0000-000000000000", "source_ids": []},
            format="json",
        )
        assert resp.status_code == 400
```

- [ ] **Step 3: Lancer les tests, vérifier qu'ils échouent**

Run: `cd backend && pytest tests/test_referentiel_merge.py -v`
Expected: FAIL (404 — l'URL n'existe pas encore)

- [ ] **Step 4: Implémenter `ReferentielMergeView`**

Dans `backend/employees/referentiel_views.py`, ajouter à la fin du fichier :

```python
class ReferentielMergeView(APIView):
    """
    POST /api/ref/merge/{model}/
    Body : {"target_id": "<uuid>", "source_ids": ["<uuid>", ...]}
    Fusionne plusieurs entrées de référentiel en doublon (ex. "Personnal"
    et "Personnel") en réassignant génériquement, via l'API de réflexion
    Django, toutes les relations FK/M2M qui pointaient vers chaque
    `source_id` pour qu'elles pointent vers `target_id`, puis supprime les
    sources. Ne couvre PAS TypeDocument/ChampPersonnalise (hiérarchie et
    règles propres, hors scope — voir ReferentielBulkDeleteView pour ces
    modèles).
    """
    permission_classes = [IsAdmin]

    MODELS = {
        'directions': Direction,
        'poles': Pole,
        'departements': Departement,
        'services': Service,
        'cellules': Cellule,
        'sections': Section,
        'postes': Poste,
        'types-contrat': TypeContrat,
        'categories': Categorie,
        'echelles': Echelle,
        'motifs-archivage': MotifArchivage,
    }

    MAX_SOURCES = 500

    def _reassigner(self, ModelClass, source, target):
        """Réassigne vers `target` toutes les relations FK/M2M entrantes
        qui pointaient vers `source`, via model._meta.get_fields() —
        générique, ne nécessite pas d'énumérer chaque modèle appelant.
        Retourne le nombre de réassignations effectuées."""
        nb = 0
        for field in ModelClass._meta.get_fields():
            if getattr(field, 'one_to_many', False):
                # Reverse FK : field.field est la ForeignKey réelle définie
                # sur field.related_model, pointant vers ModelClass.
                related_model = field.related_model
                fk_name = field.field.name
                nb += related_model.objects.filter(**{fk_name: source}).update(**{fk_name: target})
            elif getattr(field, 'many_to_many', False) and getattr(field, 'auto_created', False):
                # Reverse M2M : field.field est le ManyToManyField réel
                # défini sur field.related_model.
                related_model = field.related_model
                m2m_name = field.field.name
                for obj in related_model.objects.filter(**{m2m_name: source}):
                    manager = getattr(obj, m2m_name)
                    manager.add(target)
                    manager.remove(source)
                    nb += 1
        return nb

    def post(self, request, model):
        if model not in self.MODELS:
            return Response({'error': f'Modèle inconnu : {model}'}, status=400)

        ModelClass = self.MODELS[model]
        target_id = request.data.get('target_id')
        source_ids = request.data.get('source_ids')

        if not target_id:
            return Response({'error': 'target_id requis.'}, status=400)
        if not isinstance(source_ids, list) or not source_ids:
            return Response({'error': 'source_ids requis (liste non vide).'}, status=400)
        if len(source_ids) > self.MAX_SOURCES:
            return Response({'error': f'Trop de sources (maximum {self.MAX_SOURCES}).'}, status=400)
        if str(target_id) in {str(s) for s in source_ids}:
            return Response({'error': 'La cible ne peut pas être aussi une source.'}, status=400)

        target = ModelClass.objects.filter(pk=target_id).first()
        if not target:
            return Response({'error': 'Cible introuvable.'}, status=404)
        sources = list(ModelClass.objects.filter(pk__in=source_ids))
        if len(sources) != len(set(source_ids)):
            return Response({'error': 'Une ou plusieurs sources sont introuvables.'}, status=404)

        try:
            with transaction.atomic():
                nb_total = 0
                sources_info = []
                for source in sources:
                    sources_info.append({'id': str(source.pk), 'nom': source.nom})
                    nb_total += self._reassigner(ModelClass, source, target)
                    source.delete()
        except Exception:
            return Response(
                {'error': "Fusion impossible : une contrainte empêche cette réassignation (ex. doublon créé sous la même cible)."},
                status=400,
            )

        AuditLog.objects.create(
            user=request.user,
            username_snapshot=request.user.username,
            action=AuditLog.Action.MERGE_REFERENTIEL,
            target_model=ModelClass.__name__,
            target_label=f"Fusion — {len(sources_info)} élément(s) vers \"{target.nom}\"",
            ip_address=AuditLog._get_ip(request),
            details={
                'model': model,
                'target': {'id': str(target.pk), 'nom': target.nom},
                'sources': sources_info,
                'nb_reassignes': nb_total,
            },
        )

        return Response({'nb_reassignes': nb_total, 'sources_supprimees': sources_info})
```

Vérifier l'import de `AuditLog` en haut du fichier (déjà présent, ligne 14).

- [ ] **Step 5: Câbler l'URL**

Lire `backend/employees/referentiel_urls.py` pour repérer le pattern d'URL de `ReferentielBulkDeleteView`, puis ajouter juste après :

```python
    path('merge/<str:model>/', ReferentielMergeView.as_view()),
```

Et importer `ReferentielMergeView` dans l'en-tête du fichier (ajouter à l'import existant depuis `employees.referentiel_views`).

- [ ] **Step 6: Lancer les tests, vérifier qu'ils passent**

Run: `cd backend && pytest tests/test_referentiel_merge.py -v`
Expected: PASS

- [ ] **Step 7: Ajouter un test de réassignation M2M (scoping CONSULTANT)**

```python
    def test_fusion_reassigne_le_perimetre_consultant(self, admin_user, consultant_user, direction):
        source = Departement.objects.create(nom="Personnal", direction=direction)
        target = Departement.objects.create(nom="Personnel", direction=direction)
        consultant_user.scope_departements.add(source)
        auth_client(admin_user).post(
            "/api/ref/merge/departements/",
            {"target_id": str(target.id), "source_ids": [str(source.id)]},
            format="json",
        )
        assert list(consultant_user.scope_departements.values_list('id', flat=True)) == [target.id]
```

- [ ] **Step 8: Lancer le test, vérifier qu'il passe**

Run: `cd backend && pytest tests/test_referentiel_merge.py -v`
Expected: PASS

- [ ] **Step 9: Lancer toute la suite backend**

Run: `cd backend && pytest`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/audit/models.py backend/audit/migrations/ backend/employees/referentiel_views.py backend/employees/referentiel_urls.py backend/tests/test_referentiel_merge.py
git commit -m "feat(referentiels): endpoint générique de fusion + audit MERGE_REFERENTIEL"
```

---

### Task 5: Frontend — UI de fusion dans `/parametres`

**Files:**
- Modify: `frontend/src/pages/Parametres.jsx`
- Test: `frontend/src/__tests__/Parametres.merge.test.js` (nouveau, ou ajout au fichier de test `Parametres` existant si un seul fichier centralise déjà ces tests — vérifier avec `Glob frontend/src/__tests__/Parametres*`)

**Interfaces:**
- Consumes : état de sélection multiple déjà existant dans `Parametres.jsx` pour la suppression en masse (chercher la variable d'état, ex. `selectedIds`/`selection` — à identifier en lisant le fichier avant modification).
- Produces : bouton "Fusionner la sélection (N)", modale de choix de cible, appel `POST /api/ref/merge/{model}/`.

- [ ] **Step 1: Lire l'état existant de sélection multiple et le pattern de suppression en masse**

Run (dans l'environnement de dev, pas un test) : ouvrir `frontend/src/pages/Parametres.jsx` et repérer :
1. Le nom de l'état de sélection (checkboxes) et son setter.
2. Le bouton "Supprimer la sélection (N)" et le composant `useConfirm()` associé.
3. La fonction `fetchTab(tab, silent)` utilisée pour rafraîchir après une action mutante.
4. Le mapping `tab → slug d'URL` déjà utilisé pour `/api/ref/bulk-delete/{model}/`, à réutiliser tel quel pour `/api/ref/merge/{model}/` (même slug).

(Cette étape ne modifie aucun fichier — c'est une étape de lecture avant d'écrire le code, à faire manuellement dans l'éditeur en s'appuyant sur les noms exacts trouvés, qui remplacent les placeholders `<SELECTION_STATE>`, `<SELECTION_SETTER>`, `<SLUG_ACTIF>`, `<fetchTab>` utilisés ci-dessous.)

- [ ] **Step 2: Écrire le test qui échoue — bouton "Fusionner" visible dès 2 sélections**

Adapter au pattern de test déjà utilisé pour la suppression en masse dans les tests `Parametres` existants (chercher `Supprimer la sélection` dans `frontend/src/__tests__/` pour copier la structure de montage/mock axios) :

```javascript
// Ajouté dans le fichier de test Parametres existant qui couvre la
// suppression en masse (même setup — mock axios, rendu avec un
// utilisateur ADMIN, onglet Départements actif, deux lignes cochées).
test('le bouton Fusionner apparaît dès 2 éléments sélectionnés', async () => {
  // ... reprendre le setup existant du test de suppression en masse ...
  // cocher 2 lignes
  const checkboxes = screen.getAllByRole('checkbox');
  fireEvent.click(checkboxes[1]);
  fireEvent.click(checkboxes[2]);
  expect(await screen.findByText(/Fusionner la sélection \(2\)/)).toBeInTheDocument();
});
```

- [ ] **Step 3: Lancer le test, vérifier qu'il échoue**

Run: `cd frontend && npm test -- Parametres -t "Fusionner"`
Expected: FAIL — le bouton n'existe pas.

- [ ] **Step 4: Implémenter le bouton et la modale de fusion**

Dans `Parametres.jsx`, à côté du bouton de suppression en masse existant, ajouter :

```jsx
{selectedIds.length >= 2 && (
  <button
    onClick={() => setShowMergeModal(true)}
    style={{
      background: theme.primary, color: '#fff', border: 'none',
      borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600,
    }}
    className="btn-lift"
  >
    Fusionner la sélection ({selectedIds.length})
  </button>
)}
```

Ajouter l'état associé près des autres `useState` de la page :

```jsx
const [showMergeModal, setShowMergeModal] = useState(false);
const [mergeTargetId, setMergeTargetId] = useState(null);
```

Ajouter la modale (rendue en fin de JSX, sur le modèle des autres modales de la page — même overlay/style) :

```jsx
{showMergeModal && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
    <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 480, width: '90%' }} className="anim-scale-in">
      <h3 style={{ margin: '0 0 16px' }}>Fusionner {selectedIds.length} éléments</h3>
      <p style={{ color: theme.textSecondary, fontSize: 14 }}>
        Choisissez l'élément qui doit être conservé — les autres seront supprimés et tout ce qui leur était rattaché sera réaffecté à celui-ci.
      </p>
      {currentItems.filter(item => selectedIds.includes(item.id)).map(item => (
        <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', cursor: 'pointer' }}>
          <input
            type="radio"
            name="merge-target"
            checked={mergeTargetId === item.id}
            onChange={() => setMergeTargetId(item.id)}
          />
          {item.nom}
        </label>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={() => { setShowMergeModal(false); setMergeTargetId(null); }}>Annuler</button>
        <button
          disabled={!mergeTargetId}
          onClick={handleConfirmMerge}
          style={{ background: theme.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px' }}
        >
          Continuer
        </button>
      </div>
    </div>
  </div>
)}
```

Remplacer `currentItems` par le nom exact de la liste affichée dans l'onglet actif (identifié à l'étape 1). Ajouter la fonction de confirmation + appel API :

```jsx
const { confirm, ConfirmDialog } = useConfirm();

const handleConfirmMerge = async () => {
  const sourceIds = selectedIds.filter(id => id !== mergeTargetId);
  const targetNom = currentItems.find(item => item.id === mergeTargetId)?.nom;
  const sourceNoms = currentItems.filter(item => sourceIds.includes(item.id)).map(item => item.nom).join(', ');
  const ok = await confirm(
    `${sourceIds.length} élément(s) ("${sourceNoms}") seront réaffectés vers "${targetNom}" et supprimés. Cette action est irréversible. Continuer ?`
  );
  if (!ok) return;
  try {
    await api.post(`/ref/merge/${activeTabSlug}/`, { target_id: mergeTargetId, source_ids: sourceIds });
    setShowMergeModal(false);
    setMergeTargetId(null);
    setSelectedIds([]);
    fetchTab(activeTab, true);
    setMessage(`Fusion effectuée avec succès.`);
  } catch (err) {
    setMessage(err.response?.data?.error || "Erreur lors de la fusion.");
  }
};
```

Remplacer `activeTabSlug`, `selectedIds`, `setSelectedIds`, `activeTab`, `setMessage`, `api` par les noms exacts déjà utilisés dans le fichier (identifiés à l'étape 1 — le fichier utilise déjà un client API centralisé, voir `frontend/src/services/api.js`). Rendre `{ConfirmDialog}` dans le JSX si ce n'est pas déjà fait pour un autre usage de `useConfirm()` sur la page.

- [ ] **Step 5: Lancer le test, vérifier qu'il passe**

Run: `cd frontend && npm test -- Parametres -t "Fusionner"`
Expected: PASS

- [ ] **Step 6: Écrire et lancer un test d'appel API + confirmation**

```javascript
test('la fusion appelle POST /ref/merge/{model}/ avec target_id et source_ids après confirmation', async () => {
  // ... setup identique, 2 lignes cochées ...
  fireEvent.click(screen.getByText(/Fusionner la sélection/));
  const radios = await screen.findAllByRole('radio');
  fireEvent.click(radios[0]);
  fireEvent.click(screen.getByText('Continuer'));
  // confirmer la modale useConfirm()
  fireEvent.click(await screen.findByText('Confirmer'));
  await waitFor(() => {
    expect(mockedApi.post).toHaveBeenCalledWith(
      expect.stringContaining('/ref/merge/'),
      expect.objectContaining({ target_id: expect.any(String), source_ids: expect.any(Array) })
    );
  });
});
```

Run: `cd frontend && npm test -- Parametres -t "fusion appelle"`
Expected: PASS (adapter les noms de mock/texte du bouton de confirmation au pattern exact déjà utilisé par `ConfirmDialog` dans les autres tests de la page — chercher `'Confirmer'` dans les tests existants pour valider le libellé exact).

- [ ] **Step 7: Lancer toute la suite frontend**

Run: `cd frontend && npm test`
Expected: PASS, aucune régression.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Parametres.jsx frontend/src/__tests__/
git commit -m "feat(parametres): UI de fusion manuelle des référentiels en doublon"
```

---

## Self-Review Notes

- **Couverture spec** : Partie 1 (auto-création EmployeeImportView + ReferentielImportView, cascade, traçabilité) → Tasks 1-3. Partie 2 (fusion générique, UI, audit) → Tasks 4-5. Tests prévus dans la spec → couverts par les tests de chaque tâche.
- **Point d'attention pour l'exécutant** : Task 5 contient des noms de variables placeholders (`<SELECTION_STATE>` etc. mentionnés en Step 1) car le fichier `Parametres.jsx` n'a pas été lu intégralement pendant la rédaction de ce plan (fichier volumineux, en cours de modification concurrente par un autre terminal au moment de la rédaction) — l'étape 1 de Task 4 exige explicitement de lire le fichier avant d'écrire le code réel, avec les noms exacts. C'est la seule tâche de ce plan avec cette contrainte ; toutes les tâches backend sont complètes et autonomes.
- **Risque concurrence** : un autre terminal modifie `backend/employees/models.py`, `serializers.py`, `frontend/src/pages/Parametres.jsx`, `frontend/src/pages/EmployeeDetail.jsx` en parallèle (voir `git status` au moment de la rédaction). Avant chaque tâche touchant un de ces fichiers, relire son état actuel (`git diff <file>` ou `Read`) pour fusionner proprement plutôt que d'écraser.
