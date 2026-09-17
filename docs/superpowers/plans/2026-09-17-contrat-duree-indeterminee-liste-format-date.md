# Contrat durée indéterminée, champ liste, format date DD/MM/YYYY — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter `TypeContrat.duree_indeterminee`, un type de champ personnalisé "liste" avec options gérables, et un affichage de dates uniforme en DD/MM/YYYY (écran + exports xlsx).

**Architecture:** Trois sous-chantiers indépendants dans le même repo Django+React existant (`SOMIZ`). Chacun suit les patterns déjà établis (CRUD référentiel ADMIN-only, `TextChoices`, helper JS centralisé).

**Tech Stack:** Django 4.2 / DRF, PostgreSQL, pytest ; React 19, Jest, styles inline (`theme.js`).

## Global Constraints

- Pas de valeurs codées en dur — utiliser `theme.js` pour toute nouvelle couleur/style.
- Soft-delete pattern (`is_active`) pour toute suppression logique, jamais de hard delete sauf demande explicite.
- Pas de `window.confirm`/`window.prompt` — utiliser `useConfirm()`/`usePrompt()` (`components/ConfirmDialog.jsx`).
- Toute vue listant employés/documents/contrats doit respecter le scoping CONSULTANT existant (non modifié par ce plan).
- Après modification de `employees` (modèles/serializers), lancer `cd backend && pytest` et `cd frontend && npm test` avant de considérer terminé.

---

### Task 1: `TypeContrat.duree_indeterminee` + migration

**Files:**
- Modify: `backend/employees/models.py` (classe `TypeContrat`, ~ligne 253)
- Test: `backend/tests/test_employees_models.py`

**Interfaces:**
- Produces: `TypeContrat.duree_indeterminee` (bool, default `False`)

- [ ] **Step 1: Write the failing test**

Dans `backend/tests/test_employees_models.py`, ajouter :

```python
def test_type_contrat_duree_indeterminee_default_false():
    from employees.models import TypeContrat
    tc = TypeContrat.objects.create(nom="CDD Test")
    assert tc.duree_indeterminee is False


def test_type_contrat_duree_indeterminee_true():
    from employees.models import TypeContrat
    tc = TypeContrat.objects.create(nom="CDI Test", duree_indeterminee=True)
    assert tc.duree_indeterminee is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_employees_models.py -k duree_indeterminee -v`
Expected: FAIL avec `TypeError: 'duree_indeterminee' is an invalid keyword argument`

- [ ] **Step 3: Ajouter le champ au modèle**

Dans `backend/employees/models.py`, classe `TypeContrat` :

```python
class TypeContrat(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=100, unique=True, verbose_name="Type de contrat")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    duree_indeterminee = models.BooleanField(
        default=False,
        verbose_name="Durée indéterminée",
        help_text="Si coché, aucun contrat de ce type ne peut avoir de date de fin.",
    )

    class Meta:
        db_table = 'types_contrat'
        verbose_name = "Type de contrat"
        ordering = ['nom']

    def __str__(self):
        return self.nom
```

- [ ] **Step 4: Générer et appliquer la migration**

Run: `cd backend && python manage.py makemigrations employees -n type_contrat_duree_indeterminee`
Run: `cd backend && python manage.py migrate`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_employees_models.py -k duree_indeterminee -v`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/employees/models.py backend/employees/migrations/ backend/tests/test_employees_models.py
git commit -m "feat: ajoute TypeContrat.duree_indeterminee

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Exposer `duree_indeterminee` dans le référentiel TypeContrat + forcer `date_fin=None` sur Contrat

**Files:**
- Modify: `backend/employees/referentiel_views.py` (serializer `TypeContrat`)
- Modify: `backend/employees/serializers.py` (`ContratSerializer` ou équivalent)
- Test: `backend/tests/` (fichier de test contrats existant — identifier via `grep -rl "ContratSerializer\|class.*Contrat" backend/tests/`)

**Interfaces:**
- Consumes: `TypeContrat.duree_indeterminee` (Task 1)
- Produces: `TypeContratSerializer` expose `duree_indeterminee` ; `ContratSerializer.validate()` force `date_fin=None` si le type a `duree_indeterminee=True`

- [ ] **Step 1: Localiser les serializers concernés**

Run: `cd backend && grep -n "class TypeContratSerializer" employees/referentiel_views.py`
Run: `cd backend && grep -n "class ContratSerializer\|class ContratCreateUpdateSerializer" employees/serializers.py`

Noter les noms exacts de classes et champs `fields = [...]` existants pour les étapes suivantes.

- [ ] **Step 2: Write the failing test**

Ajouter dans le fichier de test Contrat identifié à l'étape 1 (adapter le nom de classe serializer trouvé) :

```python
def test_contrat_date_fin_forcee_none_si_duree_indeterminee(db):
    from employees.models import TypeContrat, Employee
    from employees.serializers import ContratCreateUpdateSerializer  # ajuster si nom différent

    type_cdi = TypeContrat.objects.create(nom="CDI", duree_indeterminee=True)
    employee = Employee.objects.create(matricule="T-001", nom="Test", prenom="Test")
    data = {
        "numero_contrat": "C-TEST-001",
        "employee": employee.id,
        "type_contrat": type_cdi.id,
        "date_debut": "2026-01-01",
        "date_fin": "2030-01-01",
    }
    serializer = ContratCreateUpdateSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data.get("date_fin") is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/<fichier_test_contrat>.py -k duree_indeterminee -v`
Expected: FAIL — `date_fin` vaut `2030-01-01` dans `validated_data`

- [ ] **Step 4: Exposer le champ dans TypeContratSerializer**

Dans `backend/employees/referentiel_views.py`, trouver `class TypeContratSerializer` et ajouter `duree_indeterminee` à son `Meta.fields` (garder le reste inchangé) :

```python
class TypeContratSerializer(serializers.ModelSerializer):
    class Meta:
        model = TypeContrat
        fields = ['id', 'nom', 'description', 'is_active', 'duree_indeterminee']
```

(Ajuster la liste exacte de `fields` pour ne pas retirer de champs existants — se référer au contenu lu à l'étape 1.)

- [ ] **Step 5: Forcer `date_fin=None` dans le serializer Contrat**

Dans `backend/employees/serializers.py`, dans la classe serializer Contrat identifiée, ajouter/étendre `validate()` :

```python
    def validate(self, attrs):
        attrs = super().validate(attrs)
        type_contrat = attrs.get('type_contrat', getattr(self.instance, 'type_contrat', None))
        if type_contrat is not None and type_contrat.duree_indeterminee:
            attrs['date_fin'] = None
        return attrs
```

(Si une méthode `validate()` existe déjà sur cette classe, fusionner cette logique dedans plutôt que d'en créer une deuxième.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/<fichier_test_contrat>.py -k duree_indeterminee -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/employees/referentiel_views.py backend/employees/serializers.py backend/tests/
git commit -m "feat: force date_fin=None pour un contrat de type durée indéterminée

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: UI `/parametres` — case "Durée indéterminée" sur Types de contrat

**Files:**
- Modify: `frontend/src/pages/Parametres.jsx`
- Test: `frontend/src/__tests__/Parametres.test.jsx` (si existant — sinon `grep -rl "types-contrat\|TypeContrat" frontend/src/__tests__/`)

**Interfaces:**
- Consumes: `TypeContratSerializer.duree_indeterminee` (Task 2, exposé par `GET/POST/PATCH /ref/types-contrat/`)

- [ ] **Step 1: Localiser la config d'onglet Types de contrat**

Run: `cd frontend && grep -n "types-contrat\|types_contrat" src/config/parametresTabs.js`

Repérer comment les champs de formulaire (`nom`, `description`, `is_active`) sont déclarés pour ce référentiel (probablement un tableau `fields` par onglet).

- [ ] **Step 2: Write the failing test**

Identifier le fichier de test Parametres (`grep -rl "Parametres" frontend/src/__tests__/`). Ajouter :

```jsx
test("le formulaire Types de contrat affiche la case Durée indéterminée", async () => {
  // Setup identique aux autres tests de cette page (rendu, sélection onglet
  // "Types de contrat", ouverture du formulaire d'ajout — reprendre le
  // pattern exact déjà utilisé dans ce fichier pour un autre onglet, ex.
  // Catégories, et l'adapter à "Types de contrat").
  expect(screen.getByLabelText(/durée indéterminée/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- Parametres -t "Durée indéterminée"`
Expected: FAIL — élément introuvable

- [ ] **Step 4: Ajouter le champ au formulaire**

Dans `frontend/src/config/parametresTabs.js`, sur l'entrée du référentiel `types-contrat`, ajouter un champ de type checkbox dans sa liste `fields` (suivre exactement le pattern des champs booléens existants ailleurs dans ce fichier, ex. `is_active` s'il y est déclaré explicitement, ou le pattern utilisé par `MotifArchivage`/`TypeDocument.obligatoire`) :

```js
{ key: 'duree_indeterminee', label: 'Durée indéterminée', type: 'checkbox' }
```

Si `Parametres.jsx` rend les champs génériquement depuis cette config (cas probable vu le pattern décrit dans CLAUDE.md pour les autres onglets), aucune autre modification n'est nécessaire. Sinon, ajouter le rendu explicite du champ dans le formulaire du composant, au même endroit que les autres champs de cet onglet.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- Parametres -t "Durée indéterminée"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/config/parametresTabs.js frontend/src/__tests__/
git commit -m "feat(parametres): case Durée indéterminée sur Types de contrat

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Masquer "Date de fin" dans le formulaire Contrat pour un type durée indéterminée

**Files:**
- Modify: le composant contenant le formulaire de création/édition de contrat — localiser via `grep -rn "date_fin" frontend/src/pages/EmployeeDetail.jsx frontend/src/pages/ContratDetail.jsx frontend/src/components/employeeDetail/`
- Test: fichier de test correspondant (`EmployeeDetail.test.jsx` ou `ContratDetail.test.jsx`, ou test dédié au formulaire contrat s'il existe)

**Interfaces:**
- Consumes: `type_contrat.duree_indeterminee` (renvoyé par `/ref/types-contrat/`, Task 2)

- [ ] **Step 1: Localiser le formulaire contrat exact**

Run: `cd frontend && grep -rn "date_fin" src/pages/EmployeeDetail.jsx src/pages/ContratDetail.jsx src/components/employeeDetail/`

Identifier le composant/fonction qui rend le `<input>`/`<select>` "Date de fin" et le state local du formulaire contrat (ex. `contratForm.type_contrat`).

- [ ] **Step 2: Write the failing test**

Dans le fichier de test identifié, ajouter (adapter le setup exact — rendu du composant, ouverture du formulaire d'ajout de contrat — au pattern déjà utilisé dans ce fichier pour tester d'autres champs du même formulaire) :

```jsx
test("masque Date de fin quand le type de contrat est à durée indéterminée", async () => {
  // reprendre le mock de types de contrat existant dans ce fichier et y
  // inclure un type avec duree_indeterminee: true, ex. { id: 'tc-cdi',
  // nom: 'CDI', duree_indeterminee: true }
  // ouvrir le formulaire de contrat, sélectionner ce type
  expect(screen.queryByLabelText(/date de fin/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- <fichier> -t "durée indéterminée"`
Expected: FAIL — le champ Date de fin est présent

- [ ] **Step 4: Implémenter le masquage conditionnel**

Dans le composant localisé à l'étape 1, entourer le bloc JSX du champ "Date de fin" d'une condition basée sur le type sélectionné, et vider la valeur locale au changement de type :

```jsx
const selectedTypeContrat = typesContratList.find(t => t.id === contratForm.type_contrat);
const dureeIndeterminee = selectedTypeContrat?.duree_indeterminee === true;
```

```jsx
{!dureeIndeterminee && (
  <div>
    <label>Date de fin</label>
    <input
      type="date"
      value={contratForm.date_fin || ''}
      onChange={(e) => setContratForm({ ...contratForm, date_fin: e.target.value })}
    />
  </div>
)}
```

Sur le `onChange` du select "Type de contrat", ajouter la remise à vide :

```jsx
onChange={(e) => {
  const nextType = typesContratList.find(t => t.id === e.target.value);
  setContratForm({
    ...contratForm,
    type_contrat: e.target.value,
    date_fin: nextType?.duree_indeterminee ? '' : contratForm.date_fin,
  });
}}
```

(Adapter les noms exacts de variables/state au code réel lu à l'étape 1 — ces extraits illustrent la logique, pas le code final mot pour mot si les noms diffèrent.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- <fichier> -t "durée indéterminée"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add <fichier_modifie> frontend/src/__tests__/
git commit -m "feat: masque Date de fin pour un type de contrat à durée indéterminée

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Modèle `ChampPersonnaliseOption` + type "liste"

**Files:**
- Modify: `backend/employees/models.py` (`ChampPersonnalise.TypeChamp`, nouveau modèle `ChampPersonnaliseOption`)
- Test: `backend/tests/test_employees_models.py`

**Interfaces:**
- Produces: `ChampPersonnalise.TypeChamp.LISTE = 'liste'` ; `ChampPersonnaliseOption(champ, valeur, ordre, is_active)`

- [ ] **Step 1: Write the failing test**

```python
def test_champ_personnalise_type_liste_et_options():
    from employees.models import ChampPersonnalise, ChampPersonnaliseOption

    champ = ChampPersonnalise.objects.create(
        nom="Situation familiale", code="SITUATION_FAM",
        type_champ=ChampPersonnalise.TypeChamp.LISTE,
    )
    opt1 = ChampPersonnaliseOption.objects.create(champ=champ, valeur="Célibataire", ordre=1)
    opt2 = ChampPersonnaliseOption.objects.create(champ=champ, valeur="Marié", ordre=2)

    assert list(champ.options.all()) == [opt1, opt2]
    assert opt1.is_active is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_employees_models.py -k champ_personnalise_type_liste -v`
Expected: FAIL — `ImportError: cannot import name 'ChampPersonnaliseOption'`

- [ ] **Step 3: Ajouter le type LISTE et le modèle**

Dans `backend/employees/models.py`, classe `ChampPersonnalise`, modifier `TypeChamp` :

```python
    class TypeChamp(models.TextChoices):
        TEXTE = 'texte', 'Texte'
        NOMBRE = 'nombre', 'Nombre'
        DATE = 'date', 'Date'
        BOOLEEN = 'booleen', 'Booléen (Oui/Non)'
        LISTE = 'liste', 'Liste (choix unique)'
```

Ajouter le nouveau modèle juste après la classe `ChampPersonnalise` (avant `EmployeeChampValeur` si elle suit) :

```python
class ChampPersonnaliseOption(models.Model):
    """
    Une valeur possible pour un ChampPersonnalise de type LISTE. Le retrait
    d'une option est toujours un soft-delete (is_active=False) — une valeur
    déjà enregistrée dans EmployeeChampValeur pour une option désactivée
    reste affichée telle quelle, sans lien cassé.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    champ = models.ForeignKey(
        ChampPersonnalise, on_delete=models.CASCADE, related_name='options'
    )
    valeur = models.CharField(max_length=200, verbose_name="Valeur")
    ordre = models.PositiveSmallIntegerField(default=0, verbose_name="Ordre d'affichage")
    is_active = models.BooleanField(default=True, verbose_name="Actif")

    class Meta:
        db_table = 'champs_personnalises_options'
        verbose_name = "Option de champ personnalisé"
        ordering = ['ordre', 'valeur']

    def __str__(self):
        return f"{self.champ.nom} — {self.valeur}"
```

- [ ] **Step 4: Générer et appliquer la migration**

Run: `cd backend && python manage.py makemigrations employees -n champ_personnalise_option`
Run: `cd backend && python manage.py migrate`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_employees_models.py -k champ_personnalise_type_liste -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/employees/models.py backend/employees/migrations/ backend/tests/test_employees_models.py
git commit -m "feat: ajoute ChampPersonnaliseOption et type de champ liste

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Endpoints CRUD options + validation valeur liste

**Files:**
- Modify: `backend/employees/referentiel_views.py` (serializer + vues options)
- Modify: `backend/employees/urls.py` (nouvelles routes)
- Modify: `backend/employees/views.py` (validation dans la vue `PATCH /employees/<id>/champs/`)
- Test: `backend/tests/` (fichier de test champs personnalisés existant — `grep -rl "ChampPersonnalise" backend/tests/`)

**Interfaces:**
- Consumes: `ChampPersonnaliseOption` (Task 5)
- Produces: `GET/POST /api/ref/champs-personnalises/<id>/options/`, `PATCH /api/ref/champs-personnalises/options/<option_id>/`

- [ ] **Step 1: Localiser la vue PATCH champs existante**

Run: `cd backend && grep -n "def patch\|class.*ChampsView\|champs/" employees/views.py employees/urls.py`

Noter le nom exact de la vue qui gère `PATCH /api/employees/<id>/champs/`.

- [ ] **Step 2: Write the failing test — validation valeur liste**

Dans le fichier de test identifié :

```python
def test_patch_champs_valeur_liste_invalide_rejetee(admin_client, employee_factory):
    from employees.models import ChampPersonnalise, ChampPersonnaliseOption

    employee = employee_factory()
    champ = ChampPersonnalise.objects.create(
        nom="Situation familiale", code="SIT_FAM_T",
        type_champ=ChampPersonnalise.TypeChamp.LISTE,
    )
    ChampPersonnaliseOption.objects.create(champ=champ, valeur="Marié", ordre=1)

    response = admin_client.patch(
        f"/api/employees/{employee.id}/champs/",
        {str(champ.id): "ValeurInexistante"},
        content_type="application/json",
    )
    assert response.status_code == 400


def test_patch_champs_valeur_liste_valide_acceptee(admin_client, employee_factory):
    from employees.models import ChampPersonnalise, ChampPersonnaliseOption, EmployeeChampValeur

    employee = employee_factory()
    champ = ChampPersonnalise.objects.create(
        nom="Situation familiale", code="SIT_FAM_V",
        type_champ=ChampPersonnalise.TypeChamp.LISTE,
    )
    ChampPersonnaliseOption.objects.create(champ=champ, valeur="Marié", ordre=1)

    response = admin_client.patch(
        f"/api/employees/{employee.id}/champs/",
        {str(champ.id): "Marié"},
        content_type="application/json",
    )
    assert response.status_code == 200
    assert EmployeeChampValeur.objects.get(employee=employee, champ=champ).valeur == "Marié"
```

(Adapter `admin_client`/`employee_factory` aux fixtures pytest réellement utilisées dans ce fichier — les reprendre telles quelles depuis un test existant du même fichier plutôt que d'en inventer de nouvelles.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/<fichier_champs>.py -k patch_champs_valeur_liste -v`
Expected: FAIL — la valeur invalide est acceptée (pas de 400)

- [ ] **Step 4: Ajouter la validation dans la vue PATCH champs**

Dans `backend/employees/views.py`, dans la vue localisée à l'étape 1, avant l'enregistrement de chaque valeur, ajouter :

```python
from .models import ChampPersonnalise, ChampPersonnaliseOption, EmployeeChampValeur

# ... à l'intérieur de la boucle qui traite chaque {champ_id: valeur} du payload ...
if champ.type_champ == ChampPersonnalise.TypeChamp.LISTE and valeur:
    options_valides = ChampPersonnaliseOption.objects.filter(
        champ=champ, is_active=True, valeur=valeur
    )
    if not options_valides.exists():
        return Response(
            {'error': f"Valeur invalide pour le champ liste '{champ.nom}'."},
            status=status.HTTP_400_BAD_REQUEST,
        )
```

(Insérer ce bloc au bon endroit dans la boucle/logique existante — lire le code réel de la vue avant d'insérer, pour respecter la structure en place, par exemple si les champs sont validés un par un avant tout `save()`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/<fichier_champs>.py -k patch_champs_valeur_liste -v`
Expected: PASS (2 tests)

- [ ] **Step 6: Write the failing test — CRUD options**

```python
def test_crud_options_champ_personnalise(admin_client):
    from employees.models import ChampPersonnalise

    champ = ChampPersonnalise.objects.create(
        nom="Situation familiale", code="SIT_FAM_CRUD",
        type_champ=ChampPersonnalise.TypeChamp.LISTE,
    )

    resp_create = admin_client.post(
        f"/api/ref/champs-personnalises/{champ.id}/options/",
        {"valeur": "Divorcé", "ordre": 1},
        content_type="application/json",
    )
    assert resp_create.status_code == 201
    option_id = resp_create.data["id"]

    resp_list = admin_client.get(f"/api/ref/champs-personnalises/{champ.id}/options/")
    assert resp_list.status_code == 200
    assert len(resp_list.data) == 1

    resp_patch = admin_client.patch(
        f"/api/ref/champs-personnalises/options/{option_id}/",
        {"is_active": False},
        content_type="application/json",
    )
    assert resp_patch.status_code == 200
    assert resp_patch.data["is_active"] is False
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd backend && pytest tests/<fichier_champs>.py -k crud_options_champ_personnalise -v`
Expected: FAIL — 404 (routes inexistantes)

- [ ] **Step 8: Ajouter serializer + vues + routes**

Dans `backend/employees/referentiel_views.py` :

```python
from rest_framework import generics
from .models import ChampPersonnaliseOption


class ChampPersonnaliseOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChampPersonnaliseOption
        fields = ['id', 'champ', 'valeur', 'ordre', 'is_active']
        read_only_fields = ['champ']


class ChampPersonnaliseOptionListCreateView(generics.ListCreateAPIView):
    serializer_class = ChampPersonnaliseOptionSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return ChampPersonnaliseOption.objects.filter(champ_id=self.kwargs['champ_id'])

    def perform_create(self, serializer):
        serializer.save(champ_id=self.kwargs['champ_id'])


class ChampPersonnaliseOptionDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = ChampPersonnaliseOptionSerializer
    permission_classes = [IsAdmin]
    queryset = ChampPersonnaliseOption.objects.all()
```

(`IsAdmin` doit être importé depuis le même module que les autres vues de `referentiel_views.py` — vérifier l'import déjà en tête de fichier.)

Dans `backend/employees/urls.py`, ajouter :

```python
path('ref/champs-personnalises/<uuid:champ_id>/options/',
     ChampPersonnaliseOptionListCreateView.as_view()),
path('ref/champs-personnalises/options/<uuid:pk>/',
     ChampPersonnaliseOptionDetailView.as_view()),
```

(Adapter le préfixe exact déjà utilisé pour les autres routes `ref/` dans ce fichier — reprendre le style local plutôt que ces chemins mot pour mot s'ils diffèrent.)

- [ ] **Step 9: Run test to verify it passes**

Run: `cd backend && pytest tests/<fichier_champs>.py -k crud_options_champ_personnalise -v`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/employees/referentiel_views.py backend/employees/urls.py backend/employees/views.py backend/tests/
git commit -m "feat: CRUD options de champ liste + validation valeur

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: UI `/parametres` — gestion des options d'un champ liste

**Files:**
- Modify: `frontend/src/pages/Parametres.jsx`
- Test: fichier de test Parametres identifié en Task 3

**Interfaces:**
- Consumes: `GET/POST /ref/champs-personnalises/<id>/options/`, `PATCH /ref/champs-personnalises/options/<id>/` (Task 6)

- [ ] **Step 1: Localiser le formulaire d'édition d'un champ personnalisé**

Run: `cd frontend && grep -n "type_champ\|ChampPersonnalise" src/pages/Parametres.jsx`

Identifier où le `<select>` "Type" (texte/nombre/date/booléen) est rendu dans le formulaire d'ajout/édition.

- [ ] **Step 2: Write the failing test**

```jsx
test("affiche la gestion des options quand le type Liste est sélectionné", async () => {
  // reprendre le setup existant du fichier pour ouvrir le formulaire
  // d'édition d'un champ personnalisé, puis sélectionner "Liste (choix unique)"
  // dans le select Type
  expect(await screen.findByText(/ajouter une option/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- Parametres -t "gestion des options"`
Expected: FAIL

- [ ] **Step 4: Implémenter le sous-panneau Options**

Ajouter l'ajout d'option `{ value: 'liste', label: 'Liste (choix unique)' }` aux choix du select Type (au même endroit que `texte`/`nombre`/`date`/`booleen`).

Ajouter un composant local dans `Parametres.jsx` (ou un nouveau fichier `frontend/src/components/parametres/ChampListeOptions.jsx` si le fichier `Parametres.jsx` est déjà volumineux) :

```jsx
function ChampListeOptions({ champId, options, onOptionsChange }) {
  const [nouvelleValeur, setNouvelleValeur] = useState('');

  const ajouterOption = async () => {
    if (!nouvelleValeur.trim()) return;
    const resp = await api.post(`/ref/champs-personnalises/${champId}/options/`, {
      valeur: nouvelleValeur.trim(),
      ordre: options.length,
    });
    onOptionsChange([...options, resp.data]);
    setNouvelleValeur('');
  };

  const toggleActive = async (option) => {
    const resp = await api.patch(`/ref/champs-personnalises/options/${option.id}/`, {
      is_active: !option.is_active,
    });
    onOptionsChange(options.map(o => (o.id === option.id ? resp.data : o)));
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: theme.textSecondary }}>
        Options
      </div>
      {options.map((option) => (
        <div key={option.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ opacity: option.is_active ? 1 : 0.5 }}>{option.valeur}</span>
          <button type="button" onClick={() => toggleActive(option)}>
            {option.is_active ? 'Désactiver' : 'Réactiver'}
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          value={nouvelleValeur}
          onChange={(e) => setNouvelleValeur(e.target.value)}
          placeholder="Nouvelle valeur"
        />
        <button type="button" onClick={ajouterOption}>Ajouter une option</button>
      </div>
    </div>
  );
}
```

Monter `<ChampListeOptions />` dans le formulaire du champ personnalisé, uniquement quand `formChamp.type_champ === 'liste'` et que le champ est en édition (un champ pas encore créé n'a pas encore d'`id` pour rattacher des options — désactiver/masquer le sous-panneau tant que la création initiale n'est pas sauvegardée, avec une note "Enregistrez le champ d'abord pour ajouter des options").

(Adapter les noms `api`, `theme`, le state du formulaire (`formChamp`) aux identifiants réels du fichier — lire le code autour du point localisé à l'étape 1 avant d'intégrer.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- Parametres -t "gestion des options"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Parametres.jsx frontend/src/components/parametres/ frontend/src/__tests__/
git commit -m "feat(parametres): gestion des options d'un champ personnalisé liste

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Fiche employé — rendu `<select>` pour un champ liste

**Files:**
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Test: `frontend/src/__tests__/EmployeeDetail.test.jsx`

**Interfaces:**
- Consumes: `EmployeeDetailSerializer.champs_personnalises` (déjà existant, contient `type_champ` par champ) — vérifier qu'il inclut aussi les options actives (voir Step 1)

- [ ] **Step 1: Vérifier/étendre le serializer employé pour inclure les options**

Run: `cd backend && grep -n "champs_personnalises" employees/serializers.py`

Si la sérialisation actuelle de `champs_personnalises` ne renvoie pas les options pour un champ `LISTE`, étendre l'entrée de chaque champ pour inclure `options: [{id, valeur}]` (options actives uniquement, plus l'option courante si inactive) :

```python
def _serialize_champ_personnalise(champ, valeur_actuelle):
    data = {
        'id': str(champ.id), 'code': champ.code, 'nom': champ.nom,
        'type_champ': champ.type_champ, 'valeur': valeur_actuelle,
    }
    if champ.type_champ == ChampPersonnalise.TypeChamp.LISTE:
        options_qs = champ.options.filter(is_active=True)
        if valeur_actuelle and not options_qs.filter(valeur=valeur_actuelle).exists():
            options_qs = list(options_qs) + list(
                champ.options.filter(is_active=False, valeur=valeur_actuelle)
            )
        data['options'] = [
            {'id': str(o.id), 'valeur': o.valeur}
            for o in (options_qs if isinstance(options_qs, list) else options_qs)
        ]
    return data
```

(Intégrer cette logique dans la méthode/fonction existante qui construit `champs_personnalises` plutôt que la dupliquer — lire le code réel avant d'insérer.)

- [ ] **Step 2: Write the failing test — backend**

Dans le fichier de test employé détail (`grep -rl "champs_personnalises" backend/tests/`) :

```python
def test_champs_personnalises_liste_inclut_options(admin_client, employee_factory):
    from employees.models import ChampPersonnalise, ChampPersonnaliseOption

    employee = employee_factory()
    champ = ChampPersonnalise.objects.create(
        nom="Situation familiale", code="SIT_FAM_DET",
        type_champ=ChampPersonnalise.TypeChamp.LISTE,
    )
    ChampPersonnaliseOption.objects.create(champ=champ, valeur="Marié", ordre=1)

    response = admin_client.get(f"/api/employees/{employee.id}/")
    champ_data = next(
        c for c in response.data["champs_personnalises"] if c["code"] == "SIT_FAM_DET"
    )
    assert champ_data["options"] == [{"id": str(ChampPersonnaliseOption.objects.get().id), "valeur": "Marié"}]
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/<fichier>.py -k champs_personnalises_liste_inclut_options -v`
Expected: FAIL — `KeyError: 'options'`

- [ ] **Step 4: Implémenter (voir Step 1) et relancer**

Run: `cd backend && pytest tests/<fichier>.py -k champs_personnalises_liste_inclut_options -v`
Expected: PASS

- [ ] **Step 5: Write the failing test — frontend**

Dans `frontend/src/__tests__/EmployeeDetail.test.jsx`, reprendre le mock existant de `champs_personnalises` et y ajouter une entrée de type liste :

```jsx
test("rend un select pour un champ personnalisé de type liste", async () => {
  // ajouter au mock champs_personnalises existant :
  // { id: 'c1', code: 'SIT_FAM', nom: 'Situation familiale', type_champ: 'liste',
  //   valeur: 'Marié', options: [{id: 'o1', valeur: 'Célibataire'}, {id: 'o2', valeur: 'Marié'}] }
  // render du composant comme dans les autres tests de ce fichier
  const select = await screen.findByLabelText(/situation familiale/i);
  expect(select.tagName).toBe('SELECT');
  expect(select.value).toBe('Marié');
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npm test -- EmployeeDetail -t "type liste"`
Expected: FAIL — rendu actuel est un input texte, pas un select

- [ ] **Step 7: Implémenter le rendu conditionnel**

Localiser le rendu des champs personnalisés dans `EmployeeDetail.jsx` (`grep -n "champs_personnalises" src/pages/EmployeeDetail.jsx`) et ajouter une branche :

```jsx
{champ.type_champ === 'liste' ? (
  <select
    id={champ.code}
    aria-label={champ.nom}
    value={champValeurs[champ.id] ?? ''}
    onChange={(e) => setChampValeurs({ ...champValeurs, [champ.id]: e.target.value })}
  >
    <option value="">-- Sélectionner --</option>
    {champ.options.map((option) => (
      <option key={option.id} value={option.valeur}>{option.valeur}</option>
    ))}
  </select>
) : (
  /* rendu existant texte/nombre/date/booléen, inchangé */
  null
)}
```

(Adapter aux noms réels de state/variables trouvés — `champValeurs` est illustratif, ne pas introduire un second state parallèle si un state existant gère déjà la saisie des champs personnalisés.)

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npm test -- EmployeeDetail -t "type liste"`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/employees/serializers.py backend/tests/ frontend/src/pages/EmployeeDetail.jsx frontend/src/__tests__/EmployeeDetail.test.jsx
git commit -m "feat: rend un select pour un champ personnalisé de type liste

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Helper `formatDateFR` + application sur les affichages principaux

**Files:**
- Create: `frontend/src/utils/formatDate.js`
- Test: `frontend/src/__tests__/formatDate.test.js`
- Modify: `frontend/src/components/employees/EmployeesTable.jsx`

**Interfaces:**
- Produces: `formatDateFR(isoString: string | null | undefined): string`

- [ ] **Step 1: Write the failing test**

Créer `frontend/src/__tests__/formatDate.test.js` :

```js
import { formatDateFR } from '../utils/formatDate';

describe('formatDateFR', () => {
  test('formate une date ISO en DD/MM/YYYY', () => {
    expect(formatDateFR('2026-09-17')).toBe('17/09/2026');
  });

  test('formate une date ISO avec heure', () => {
    expect(formatDateFR('2026-01-05T14:30:00Z')).toBe('05/01/2026');
  });

  test('retourne un tiret pour null', () => {
    expect(formatDateFR(null)).toBe('—');
  });

  test('retourne un tiret pour undefined', () => {
    expect(formatDateFR(undefined)).toBe('—');
  });

  test('retourne un tiret pour une chaîne vide', () => {
    expect(formatDateFR('')).toBe('—');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- formatDate`
Expected: FAIL — module introuvable

- [ ] **Step 3: Créer le helper**

Créer `frontend/src/utils/formatDate.js` :

```js
export function formatDateFR(isoString) {
  if (!isoString) return '—';
  const datePart = String(isoString).slice(0, 10);
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d || y.length !== 4) return '—';
  return `${d}/${m}/${y}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- formatDate`
Expected: PASS (5 tests)

- [ ] **Step 5: Appliquer sur EmployeesTable.jsx**

Dans `frontend/src/components/employees/EmployeesTable.jsx`, ajouter l'import :

```js
import { formatDateFR } from '../../utils/formatDate';
```

Remplacer les deux affichages bruts identifiés (lignes ~994 et ~1012, `emp.date_naissance` / `emp.date_embauche`) :

```jsx
{emp.date_naissance ? formatDateFR(emp.date_naissance) : (
```

(Garder le fallback JSX existant après le `(` — ne modifier que la valeur affichée quand la date est présente, pas la structure du fallback "—"/placeholder déjà en place.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/formatDate.js frontend/src/__tests__/formatDate.test.js frontend/src/components/employees/EmployeesTable.jsx
git commit -m "feat: helper formatDateFR (DD/MM/YYYY) + application sur la liste employés

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Appliquer `formatDateFR` sur les autres pages d'affichage

**Files:**
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Modify: `frontend/src/pages/ContratDetail.jsx`
- Modify: `frontend/src/components/employeeDetail/DossierTab.jsx`
- Modify: `frontend/src/components/employeeDetail/CarriereTab.jsx`
- Modify: `frontend/src/pages/AuditLogs.jsx`
- Modify: `frontend/src/pages/Statistiques.jsx`
- Modify: `frontend/src/pages/Users.jsx`
- Test: tests existants de ces fichiers (non-régression, pas de nouveau test dédié — ce sont des remplacements de rendu)

**Interfaces:**
- Consumes: `formatDateFR` (Task 9)

- [ ] **Step 1: Recenser tous les points d'affichage de date brut**

Run: `cd frontend && grep -n "toLocaleDateString\|formatDateTime\|date_naissance\|date_embauche\|date_debut\|date_fin\b" src/pages/EmployeeDetail.jsx src/pages/ContratDetail.jsx src/components/employeeDetail/DossierTab.jsx src/components/employeeDetail/CarriereTab.jsx src/pages/AuditLogs.jsx src/pages/Statistiques.jsx src/pages/Users.jsx`

Noter chaque ligne concernée fichier par fichier.

- [ ] **Step 2: Remplacer chaque affichage, fichier par fichier**

Pour chaque fichier de la liste ci-dessus, ajouter `import { formatDateFR } from '.../utils/formatDate';` (ajuster la profondeur du chemin relatif selon l'emplacement du fichier) et :
- Si le fichier a une fonction locale `formatDateTime()` qui combine date+heure (ex. `EmployeeDetail.jsx`, `ContratDetail.jsx`), la réécrire pour déléguer la partie date à `formatDateFR` :

```js
function formatDateTime(isoString) {
  if (!isoString) return '—';
  const datePart = formatDateFR(isoString);
  const heure = new Date(isoString).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${heure}`;
}
```

- Si le fichier affiche une date brute (`{emp.date_naissance}`, `{contrat.date_debut}`, etc.), remplacer par `{formatDateFR(emp.date_naissance)}` etc.
- Ne pas toucher aux `<input type="date">` (leur `value` doit rester au format ISO `YYYY-MM-DD` pour que le navigateur les comprenne — seul l'affichage en lecture change).

- [ ] **Step 3: Lancer la suite de tests frontend complète pour repérer les régressions**

Run: `cd frontend && npm test`
Expected: PASS — si un test existant vérifiait un texte de date au format ISO (`expect(screen.getByText('2026-09-17'))`), le mettre à jour pour attendre `'17/09/2026'`.

- [ ] **Step 4: Corriger les tests cassés identifiés à l'étape 3**

Pour chaque échec lié au format de date, remplacer l'assertion ISO par l'assertion `DD/MM/YYYY` correspondante dans le fichier de test concerné.

- [ ] **Step 5: Run tests to verify all pass**

Run: `cd frontend && npm test`
Expected: PASS (tous les tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/EmployeeDetail.jsx frontend/src/pages/ContratDetail.jsx frontend/src/components/employeeDetail/DossierTab.jsx frontend/src/components/employeeDetail/CarriereTab.jsx frontend/src/pages/AuditLogs.jsx frontend/src/pages/Statistiques.jsx frontend/src/pages/Users.jsx frontend/src/__tests__/
git commit -m "feat: applique le format DD/MM/YYYY sur tous les affichages de date restants

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Format DD/MM/YYYY dans les exports xlsx

**Files:**
- Modify: `backend/audit/stats.py` (export `/reporting/stats-export.xlsx/`)
- Modify: `backend/employees/import_views.py` (templates téléchargeables `EmployeeImportTemplateView`/`ReferentielImportTemplateView`)
- Test: fichier de test export existant (`grep -rl "stats-export\|stats_export" backend/tests/`)

**Interfaces:**
- Consumes: `openpyxl` (déjà une dépendance du projet)

- [ ] **Step 1: Localiser l'écriture des colonnes date dans stats.py**

Run: `cd backend && grep -n "date\|Date" audit/stats.py | grep -i "cell\|append\|write"`

Identifier chaque endroit où une valeur de type date est écrite dans une cellule (probablement via `ws.append([...])` ou `ws.cell(...)`).

- [ ] **Step 2: Write the failing test**

Dans le fichier de test export identifié :

```python
def test_export_xlsx_colonne_date_a_le_bon_format(admin_client, employee_factory):
    import openpyxl
    import io

    employee_factory(date_embauche="2026-01-15")
    response = admin_client.get("/api/reporting/stats-export.xlsx/")
    assert response.status_code == 200

    wb = openpyxl.load_workbook(io.BytesIO(response.content))
    # Adapter le nom de feuille/la colonne exacte selon la structure réelle
    # du classeur généré par build_stats_detail() — inspecter d'abord
    # wb.sheetnames et la ligne d'en-tête pour localiser la bonne colonne.
    found_date_format = False
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if cell.number_format == 'DD/MM/YYYY':
                    found_date_format = True
    assert found_date_format, "Aucune cellule avec le format DD/MM/YYYY trouvée"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/<fichier_export>.py -k export_xlsx_colonne_date -v`
Expected: FAIL — `found_date_format` reste `False`

- [ ] **Step 4: Appliquer `number_format` sur les cellules date**

Dans `backend/audit/stats.py`, pour chaque cellule contenant une date identifiée à l'étape 1, écrire l'objet `date` Python (pas une chaîne formatée) puis fixer son format :

```python
cell = ws.cell(row=row_idx, column=col_idx, value=employee.date_embauche)
cell.number_format = 'DD/MM/YYYY'
```

(Adapter à la structure réelle du code — si les lignes sont construites via `ws.append([...])`, il faut d'abord `append`, puis reboucler sur les cellules de la colonne date pour fixer `number_format`, `openpyxl` n'acceptant pas ce paramètre dans `append()`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/<fichier_export>.py -k export_xlsx_colonne_date -v`
Expected: PASS

- [ ] **Step 6: Répéter pour les templates d'import**

Run: `cd backend && grep -n "date" employees/import_views.py | grep -i "cell\|append"`

Appliquer le même traitement (`cell.number_format = 'DD/MM/YYYY'`) aux colonnes date des templates `EmployeeImportTemplateView`/`ReferentielImportTemplateView` s'il y en a (ex. colonne exemple `date_naissance`/`date_embauche` dans le template employés).

- [ ] **Step 7: Run full backend suite**

Run: `cd backend && pytest`
Expected: PASS (aucune régression)

- [ ] **Step 8: Commit**

```bash
git add backend/audit/stats.py backend/employees/import_views.py backend/tests/
git commit -m "feat: format DD/MM/YYYY sur les colonnes date des exports xlsx

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Vérification finale

**Files:** aucun fichier modifié — étape de validation uniquement.

- [ ] **Step 1: Lancer la suite backend complète**

Run: `cd backend && pytest`
Expected: PASS (tous les tests, y compris les 188 tests pré-existants)

- [ ] **Step 2: Lancer la suite frontend complète**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: PASS (tous les tests, y compris les tests pré-existants)

- [ ] **Step 3: Mettre à jour la documentation projet**

Ajouter une section dans `c:\Users\filali\SOMIZ\CLAUDE.md` (à la suite des sections similaires déjà présentes, ex. après la section "Champs personnalisés") décrivant :
- `TypeContrat.duree_indeterminee` et son effet sur le formulaire Contrat + `ContratSerializer.validate()`.
- Le type de champ `liste` + `ChampPersonnaliseOption` (soft-delete des options, endpoints CRUD).
- Le helper `formatDateFR` et son périmètre (affichage + exports xlsx, pas les inputs de saisie ni le parsing d'import).

- [ ] **Step 4: Commit de la documentation**

```bash
git add CLAUDE.md
git commit -m "docs: documente durée indéterminée, champ liste et format date DD/MM/YYYY

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
