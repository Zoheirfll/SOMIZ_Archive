# Champs cliquables vers le document source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an ADMIN configure, per document type, which employee field it justifies (`TypeDocument.champ_source`), and let a click on that field in the employee's "Informations" panel jump to the matching document (select it if present, scroll+highlight the "missing" row if not).

**Architecture:** One new nullable text field on `TypeDocument` (no FK — stores a system field code like `date_naissance` or a `ChampPersonnalise.code`), exposed through the existing `TypeDocumentSerializer` and configurable from the existing "Types de documents" admin form in `Parametres.jsx`. The employee fiche builds a `{champ_source → type_doc}` lookup from the type-document list it already loads, and reuses the existing document-selection/missing-document rendering — no new backend endpoints.

**Tech Stack:** Django 4.2.30 / DRF 3.15.2 (backend), React 19 (frontend), pytest (backend tests), Jest + RTL (frontend tests).

## Global Constraints

- Frontend: inline styles only (`style={{}}`), tokens from `frontend/src/styles/theme.js`.
- No `window.confirm()`/`window.prompt()` — N/A for this feature (no confirmation dialogs needed).
- A category (`TypeDocument.is_categorie`, has `sous_types`) can never carry a `champ_source` — mirrors the existing `obligatoire=False` forcing rule in `TypeDocumentSerializer.validate()`.
- Run `cd backend && ./venv/Scripts/python.exe -m pytest --no-cov` and `cd frontend && npm test -- --watchAll=false` before considering any task done.

---

## File Structure

**Backend:**
- `backend/employees/models.py` — add `TypeDocument.champ_source` field (~line 391, next to `couleur`)
- `backend/employees/migrations/0024_typedocument_champ_source.py` — new
- `backend/employees/referentiel_views.py` — add `champ_source` to `TypeDocumentSerializer.Meta.fields` and to its `validate()`
- `backend/tests/test_type_document_champ_source.py` — new

**Frontend:**
- `frontend/src/pages/Parametres.jsx` — "Champ source" `<select>` in the "types-documents" form case (~line 1940, after the "Obligatoire" block); new `champsPersonnalisesOptions` state fetched once on mount
- `frontend/src/pages/EmployeeDetail.jsx` — `infoFields` entries gain a `code`; new `champToDoc` derived map; `handleFieldClick(code)`; refs on missing-document rows for scroll targeting
- `frontend/src/__tests__/Parametres.test.jsx` — test for the new select
- `frontend/src/__tests__/EmployeeDetail.test.jsx` — tests for click-to-select and click-to-highlight-missing

---

### Task 1: `TypeDocument.champ_source` field + validation + serializer

**Files:**
- Modify: `backend/employees/models.py` (~line 388-392, inside `TypeDocument`)
- Create: `backend/employees/migrations/0024_typedocument_champ_source.py`
- Modify: `backend/employees/referentiel_views.py` (`TypeDocumentSerializer`, ~line 501-522)
- Test: `backend/tests/test_type_document_champ_source.py`

**Interfaces:**
- Produces: `employees.models.TypeDocument.champ_source` (`CharField(max_length=100, blank=True)`); `TypeDocumentSerializer` exposes/validates it.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_type_document_champ_source.py`:

```python
import pytest
from rest_framework.test import APIClient
from employees.models import TypeDocument


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestChampSourceModel:
    def test_champ_source_defaults_blank(self, type_doc_obligatoire):
        assert type_doc_obligatoire.champ_source == ""

    def test_champ_source_can_be_set(self):
        t = TypeDocument.objects.create(nom="Acte de naissance", code="ACTE_NAISSANCE", champ_source="date_naissance")
        assert t.champ_source == "date_naissance"


@pytest.mark.django_db
class TestChampSourceEndpoint:
    def test_admin_can_set_champ_source(self, admin_user, type_doc_obligatoire):
        resp = auth_client(admin_user).patch(
            f"/api/ref/types-documents/{type_doc_obligatoire.id}/",
            {"champ_source": "date_naissance"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["champ_source"] == "date_naissance"
        type_doc_obligatoire.refresh_from_db()
        assert type_doc_obligatoire.champ_source == "date_naissance"

    def test_champ_source_forced_blank_when_type_becomes_categorie(self, admin_user, type_doc_obligatoire):
        # type_doc_obligatoire devient une catégorie en recevant un sous-type
        enfant = TypeDocument.objects.create(nom="Sous-type", code="SOUS_TYPE", parent=type_doc_obligatoire)
        resp = auth_client(admin_user).patch(
            f"/api/ref/types-documents/{type_doc_obligatoire.id}/",
            {"champ_source": "date_naissance"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["champ_source"] == ""

    def test_list_exposes_champ_source(self, admin_user, type_doc_obligatoire):
        TypeDocument.objects.filter(pk=type_doc_obligatoire.pk).update(champ_source="nin")
        resp = auth_client(admin_user).get("/api/ref/types-documents/")
        item = next(t for t in resp.data if t["id"] == str(type_doc_obligatoire.id))
        assert item["champ_source"] == "nin"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest tests/test_type_document_champ_source.py -v --no-cov`
Expected: FAIL — `TypeError` or `KeyError: 'champ_source'` (field doesn't exist yet)

- [ ] **Step 3: Add the model field**

In `backend/employees/models.py`, inside `class TypeDocument` (after the `couleur` field, before `created_at`, ~line 392):

```python
    champ_source = models.CharField(
        max_length=100, blank=True, verbose_name="Champ source",
        help_text="Code du champ (système ou personnalisé) que ce document justifie — ex. 'date_naissance', 'nin'. Permet de cliquer sur ce champ dans la fiche employé pour ouvrir directement ce document."
    )
```

- [ ] **Step 4: Generate and apply the migration**

Run: `cd backend && ./venv/Scripts/python.exe manage.py makemigrations employees --name typedocument_champ_source`
Expected: creates `backend/employees/migrations/0024_typedocument_champ_source.py` with a single `AddField` operation.

Run: `cd backend && ./venv/Scripts/python.exe manage.py migrate employees`
Expected: `Applying employees.0024_typedocument_champ_source... OK`

- [ ] **Step 5: Update the serializer**

In `backend/employees/referentiel_views.py`, modify `TypeDocumentSerializer` (~line 501-522):

```python
class TypeDocumentSerializer(serializers.ModelSerializer):
    nb_documents = serializers.SerializerMethodField()
    parent_nom = serializers.CharField(source='parent.nom', read_only=True)
    is_categorie = serializers.BooleanField(read_only=True)
    class Meta:
        model = TypeDocument
        fields = [
            'id', 'nom', 'code', 'obligatoire', 'is_active', 'ordre', 'couleur',
            'nb_documents', 'parent', 'parent_nom', 'is_categorie', 'champ_source',
        ]
    def get_nb_documents(self, obj):
        return obj.documents.filter(is_active=True).count()

    def validate(self, attrs):
        # Une catégorie (qui a des sous-types) n'est jamais uploadable
        # directement — son propre "obligatoire" n'a donc aucun effet sur le
        # calcul de complétude (voir sous_types__isnull=True partout ailleurs)
        # et ne doit pas rester à True en base, pour ne pas induire l'admin
        # en erreur en pensant que ça impose encore une exigence. Même
        # raisonnement pour champ_source : une catégorie n'est jamais
        # elle-même sélectionnable comme document, donc jamais "source"
        # d'un champ.
        if self.instance and self.instance.sous_types.exists():
            attrs['obligatoire'] = False
            attrs['champ_source'] = ''
        return attrs
```

(Only the `fields` list and the `validate()` body change — everything else in the class stays as-is.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest tests/test_type_document_champ_source.py -v --no-cov`
Expected: PASS (4 passed)

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest --no-cov -q`
Expected: all tests PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add backend/employees/models.py backend/employees/migrations/0024_typedocument_champ_source.py backend/employees/referentiel_views.py backend/tests/test_type_document_champ_source.py
git commit -m "feat(employees): champ TypeDocument.champ_source (champ justifié par ce document)"
```

---

### Task 2: "Champ source" select dans `/parametres` → Types de documents

**Files:**
- Modify: `frontend/src/pages/Parametres.jsx`
- Test: `frontend/src/__tests__/Parametres.test.jsx`

**Interfaces:**
- Consumes: `TypeDocumentSerializer.champ_source` (Task 1), `GET /api/ref/champs-personnalises/`, the existing `SYSTEM_FIELDS` array (`frontend/src/pages/Parametres.jsx`, ~line 523-536)
- Produces: `form.champ_source` wired into the existing add/edit modal's save flow (already generic — no change needed to the submit handler, which sends the whole `form` object)

- [ ] **Step 1: Write the failing test**

Read the top of `frontend/src/__tests__/Parametres.test.jsx` first to confirm the exact `renderPage()`/`api.get` mock helpers already used by the "types-documents" tab tests in that file (search for `"types-documents"` in the file), then add, following that same style:

```jsx
test("le formulaire Types de documents propose un select Champ source", async () => {
  api.get.mockImplementation((url) => {
    if (url.includes("/ref/types-documents/")) {
      return Promise.resolve({ data: { results: [] } });
    }
    if (url.includes("/ref/champs-personnalises/")) {
      return Promise.resolve({ data: { results: [{ id: "cp-1", nom: "RIB", code: "RIB", is_active: true }] } });
    }
    return Promise.resolve({ data: { results: [] } });
  });
  renderPage();
  fireEvent.click(await screen.findByText("Types de documents"));
  fireEvent.click(await screen.findByText(/\+ Ajouter/i));
  expect(await screen.findByText("Champ source")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Champ source"));
  expect(screen.getByText("RIB")).toBeInTheDocument();
  expect(screen.getByText("Date de naissance")).toBeInTheDocument();
});
```

Adjust the mock/render calls to match whatever helper names the file already uses (e.g. `renderPage` vs a locally-named helper) — read the file before finalizing this snippet.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Parametres.test.jsx`
Expected: FAIL — "Champ source" text not found

- [ ] **Step 3: Fetch champs personnalisés once on mount**

In `frontend/src/pages/Parametres.jsx`, near the top of the main component (find the existing `useState`/`useEffect` block that runs on mount — search for `useEffect(() => {` near the top of the component function), add a dedicated state and fetch that doesn't depend on `activeTab` (unlike the generic `items`/`fetchTab` mechanism used for the visible tab's table):

```jsx
const [champsPersonnalisesOptions, setChampsPersonnalisesOptions] = useState([]);

useEffect(() => {
  api.get("/ref/champs-personnalises/").then((res) => {
    const list = res.data.results || res.data;
    setChampsPersonnalisesOptions(list.filter((c) => c.is_active));
  }).catch(() => {});
}, []);
```

- [ ] **Step 4: Add the select to the types-documents form**

In `frontend/src/pages/Parametres.jsx`, in the `case "types-documents":` block of `renderForm()` (~line 1940-1944, right after the `is_categorie` warning `<div>` that follows the "Obligatoire" select, before the "Couleur" label):

```jsx
            <label style={labelStyle}>Champ source (optionnel)</label>
            <select
              name="champ_source"
              aria-label="Champ source"
              value={modal?.item?.is_categorie ? "" : form.champ_source || ""}
              onChange={handleChange}
              disabled={modal?.item?.is_categorie}
              className="input-focus" style={inputStyle}
            >
              <option value="">-- Aucun --</option>
              <optgroup label="Champs système">
                {SYSTEM_FIELDS.map((f) => (
                  <option key={f.code} value={f.code}>{f.nom}</option>
                ))}
              </optgroup>
              {champsPersonnalisesOptions.length > 0 && (
                <optgroup label="Champs personnalisés">
                  {champsPersonnalisesOptions.map((c) => (
                    <option key={c.code} value={c.code}>{c.nom}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <div style={{ color: theme.textMuted, fontSize: 11, marginTop: -8, marginBottom: 12 }}>
              Le champ de la fiche employé que ce document justifie (ex. "Date de naissance" pour un Acte de naissance) — cliquer sur ce champ, côté fiche employé, ouvrira directement ce document.
            </div>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- Parametres.test.jsx`
Expected: PASS

- [ ] **Step 6: Manually verify in the browser**

Start both dev servers, log in as ADMIN, `/parametres` → "Types de documents" → éditer "Acte de naissance" (ou équivalent) → sélectionner "Date de naissance" dans "Champ source" → Enregistrer → rouvrir la fiche pour confirmer que la valeur est bien conservée.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Parametres.jsx frontend/src/__tests__/Parametres.test.jsx
git commit -m "feat(parametres): select Champ source dans le formulaire Types de documents"
```

---

### Task 3: Champs cliquables sur la fiche employé

**Files:**
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Test: `frontend/src/__tests__/EmployeeDetail.test.jsx`

**Interfaces:**
- Consumes: `typesDocumentsList` (existing state, `frontend/src/pages/EmployeeDetail.jsx:98`, populated by `fetchTypesDocuments()`, now carrying `champ_source` per Task 1), `handleSelectDoc(doc)` (existing, `frontend/src/pages/EmployeeDetail.jsx:309`), `documentsAffiches` (existing, computed at render time from `employee.documents`), `employee.documents_manquants` (existing), `buildDocOrder()` (existing, produces `m-${code}` keys)
- Produces: `infoFields` entries with a `code` property; `champToDoc` map; `handleFieldClick(code)`; `highlightedMissingCode` state; `missingRowRefs` ref map keyed by `code`

- [ ] **Step 1: Write the failing tests**

Read the top of `frontend/src/__tests__/EmployeeDetail.test.jsx` for its exact `mockEmployee`/`mockTypes`/`renderPage`/`api.get` mock shapes (already used throughout this session's other EmployeeDetail tests) before writing these, then append to the file (inside a new `describe` block, following the same structure as the existing `describe("EmployeeDetail — onglet Carrière", ...)` block added earlier this session):

```jsx
describe("EmployeeDetail — champs cliquables vers le document source", () => {
  test("cliquer un champ dont le document existe le sélectionne", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("types-documents")) {
        return Promise.resolve({
          data: {
            results: [
              { id: "type-1", code: "CIN", nom: "Carte Nationale", obligatoire: true, champ_source: "date_naissance" },
              { id: "type-2", code: "CV", nom: "CV", obligatoire: false, champ_source: "" },
            ],
          },
        });
      }
      if (url.includes("types-contrat")) return Promise.resolve({ data: { results: [] } });
      if (url.includes("/historique/")) return Promise.resolve({ data: [] });
      if (url.includes("/ref/postes/") || url.includes("/ref/categories/") || url.includes("/ref/echelles/")) {
        return Promise.resolve({ data: { results: [] } });
      }
      if (url.includes("/contrats/")) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: mockEmployee });
    });
    renderPage();
    const champ = await screen.findByText("Date de naissance");
    fireEvent.click(champ);
    // Le document CIN (déjà présent dans mockEmployee.documents, type_document "CIN")
    // doit être sélectionné — son type_document_label "Carte Nationale" devient visible
    // dans l'en-tête du viewer une fois sélectionné.
    await waitFor(() => {
      expect(screen.getAllByText(/Carte Nationale/).length).toBeGreaterThan(0);
    });
  });

  test("cliquer un champ sans document lié ne fait rien de spécial", async () => {
    renderPage();
    const champ = await screen.findByText("Date de recrutement");
    fireEvent.click(champ);
    // Pas de crash, le champ reste affiché normalement.
    expect(screen.getByText("Date de recrutement")).toBeInTheDocument();
  });
});
```

This test relies on `mockDoc`/`mockTypes` already defined at the top of the file having `type_document: "CIN"` (confirmed present, see `mockDoc` at line ~32-40) — adjust the inline `types-documents` mock above only if the file's real `mockTypes` already includes a `champ_source` you can reuse instead of redefining it inline.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- EmployeeDetail.test.jsx`
Expected: FAIL — clicking "Date de naissance" does nothing (not a link, no handler)

- [ ] **Step 3: Add `code` to each `infoFields` entry**

In `frontend/src/pages/EmployeeDetail.jsx`, modify the `infoFields` array (~line 576-605):

```jsx
  const infoFields = [
    { label: "Matricule", value: employee.matricule, mono: true },
    {
      label: "N° Contrat",
      value: contrats[0]?.numero_contrat || "—",
      mono: true,
    },
    {
      label: "Nom & Prénom",
      value: `${employee.nom} ${employee.prenom}`,
      bold: true,
    },
    { label: "Date de naissance", value: employee.date_naissance || "—", code: "date_naissance" },
    { label: "Date de recrutement", value: employee.date_embauche || "—", code: "date_embauche" },
    { label: "Date de fin de contrat", value: employee.date_fin_contrat || "—", code: "date_fin_contrat" },
    { label: "Statut", value: employee.statut, badge: true, code: "statut" },
    { label: "Direction", value: employee.direction_nom || "—", code: "direction" },
    { label: "Département", value: employee.departement_nom || "—", code: "departement" },
    { label: "Service", value: employee.service_nom || "—", code: "service" },
    ...(employee.cellule_nom
      ? [{ label: "Cellule", value: employee.cellule_nom, code: "cellule" }]
      : []),
    { label: "Fonction", value: employee.poste_nom || "—", code: "poste" },
    { label: "Type de contrat", value: employee.type_contrat_nom || "—", code: "type_contrat" },
    { label: "Catégorie", value: employee.categorie_nom || "—", code: "categorie" },
    ...(employee.champs_personnalises || []).map((c) => ({
      label: c.nom,
      value: c.valeur || "—",
      code: c.code,
    })),
  ];
```

- [ ] **Step 4: Build the `champToDoc` map and click handler**

In `frontend/src/pages/EmployeeDetail.jsx`, near `handleSelectDoc` (defined at line 309), add:

```jsx
  const champToDoc = {};
  typesDocumentsList.forEach((t) => {
    if (t.champ_source) champToDoc[t.champ_source] = t;
  });

  const [highlightedMissingCode, setHighlightedMissingCode] = useState(null);
  const missingRowRefs = useRef({});

  const handleFieldClick = (code) => {
    const typeDoc = champToDoc[code];
    if (!typeDoc) return;
    setActiveTab("dossier");
    const present = documentsAffiches.find((d) => d.type_doc_id === typeDoc.id);
    if (present) {
      handleSelectDoc(present);
      return;
    }
    const manquant = (employee.documents_manquants || []).find((d) => d.id === typeDoc.id);
    if (manquant) {
      setHighlightedMissingCode(manquant.code);
      setTimeout(() => {
        missingRowRefs.current[manquant.code]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 50);
      setTimeout(() => setHighlightedMissingCode(null), 2000);
    }
  };
```

`documentsAffiches` is computed at render time (line 607-611 in the current file) from `employee.documents`, **before** the component's `return` — since `champToDoc`/`handleFieldClick` reference it, they must be declared **after** `documentsAffiches` is computed, not up near `handleSelectDoc`. Move this block to just before the `return (` statement (right after the `documentsAffiches`/`docOrderMap` computation, ~line 614), not next to `handleSelectDoc`. Also add `useRef` to the existing `import { useState, useEffect, useRef } from "react";` at the top of the file if `useRef` isn't already imported (check first — the file may already import it for another ref).

- [ ] **Step 5: Make the field clickable in the render**

Find where `infoFields` is rendered (`infoFields.map((item) => (` at line 722), and wrap the label/value with a click handler when `champToDoc[item.code]` exists. Read the existing row markup at that location first (label + value layout) and add, on the label `<span>` (or equivalent wrapper) — keep every existing style/prop, only add:

```jsx
              style={{
                ...(existing style object, unchanged),
                ...(champToDoc[item.code]
                  ? { cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: theme.textMuted }
                  : {}),
              }}
              onClick={champToDoc[item.code] ? () => handleFieldClick(item.code) : undefined}
```

- [ ] **Step 6: Add the ref and highlight style to missing-document rows**

In the "Documents manquants" block (~line 2044-2085, `{(employee.documents_manquants || []).map((doc) => (`), add a `ref` and conditional highlight background to the row `<div>` that currently has `borderLeft: `3px solid ${doc.couleur || "transparent"}`` (~line 2051-2064):

```jsx
                <div
                  ref={(el) => { missingRowRefs.current[doc.code] = el; }}
                  style={{
                    padding: "10px 16px",
                    borderBottom: doc.parent_nom ? folderRowBorder(doc.couleur) : `1px solid ${theme.border}`,
                    borderLeft: `3px solid ${doc.couleur || "transparent"}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    ...(doc.parent_nom ? folderRowExtraStyle(doc.couleur) : {}),
                    background: highlightedMissingCode === doc.code
                      ? theme.primaryBg
                      : (hexToRgba(doc.couleur, doc.parent_nom ? 0.05 : 0.035) || "#FAFAFA"),
                    transition: "background 0.3s ease",
                    ...(docGroupEnd.has(`m-${doc.code}`)
                      ? { borderRadius: "0 0 8px 8px", borderBottom: folderRowBorder(doc.couleur), marginBottom: 10 }
                      : {}),
                  }}
                >
```

(Only the `ref`, the `background` value, and the new `transition` line change — everything else in this block stays identical to the current code.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npm test -- EmployeeDetail.test.jsx`
Expected: PASS (both new tests + no regressions beyond the already-known pre-existing failure in `"l'ordre visuel (CSS order) suit le champ ordre du type, pas la présence/absence"`)

- [ ] **Step 8: Manually verify in the browser**

Sur une fiche employé : cliquer "Date de naissance" (si un type de document a `champ_source=date_naissance` et qu'un document existe) → bascule sur "Dossier" et sélectionne ce document. Retirer le document (ou tester sur un employé où il est manquant) → cliquer le champ → bascule sur "Dossier", scroll et surlignage temporaire de la ligne "manquant".

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/EmployeeDetail.jsx frontend/src/__tests__/EmployeeDetail.test.jsx
git commit -m "feat(employee-detail): champs cliquables vers le document source associé"
```

---

### Task 4: Régression finale

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest --no-cov -q`
Expected: all PASS

- [ ] **Step 2: Run the full frontend suite**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: PASS, with only the already-documented pre-existing failures (unrelated to this feature — see prior session notes in `docs/superpowers/plans/2026-08-31-historique-carriere.md` Task 10) remaining.

- [ ] **Step 3: Update `CLAUDE.md`**

Add a short new `##` section (pattern: title + date, following every other entry in the file) documenting: the new `TypeDocument.champ_source` field, that it covers system fields and `ChampPersonnalise` fields, that a category can never carry one, and the click behavior on the employee fiche (select if present, scroll+highlight if missing). Place it right after the existing `## Hiérarchie des types de documents — sous-dossiers (2026-07-24)` section, since it directly extends that model.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): documente les champs cliquables vers le document source"
```
