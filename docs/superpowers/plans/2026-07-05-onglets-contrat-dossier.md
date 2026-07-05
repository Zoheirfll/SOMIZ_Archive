# Onglets par contrat dans le Dossier employé — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dans l'onglet "Dossier" de `EmployeeDetail.jsx`, ajouter un sélecteur d'onglets par contrat (le dernier contrat sélectionné par défaut) qui filtre la liste de documents affichés (dossier général + documents du contrat sélectionné) et route l'upload vers le bon endpoint (`/employees/{id}/documents/` ou `/contrats/{contratId}/documents/`).

**Architecture:** Modification unique de `frontend/src/pages/EmployeeDetail.jsx` (composant existant, pas de nouveau fichier) : un nouveau state `selectedContratId`, une petite fonction de filtrage pure, une rangée d'onglets JSX, et un branchement conditionnel de l'URL d'upload. Aucun changement backend — les deux endpoints existent déjà.

**Tech Stack:** React 19, Jest + React Testing Library, Axios (`api` service).

## Global Constraints

- Styles inline uniquement (`style={{}}`), tokens depuis `frontend/src/styles/theme.js` — jamais de hex en dur.
- Ne pas modifier le backend : les endpoints `POST /api/employees/{id}/documents/` et `POST /api/contrats/{id}/documents/` existent déjà et suffisent.
- `documents_manquants` reste global (pas de filtrage par contrat) — comportement de quick-upload inchangé.
- 0 contrat → aucun onglet affiché, comportement actuel conservé à l'identique.

---

## Contexte fichier

`frontend/src/pages/EmployeeDetail.jsx` est un composant de ~1440 lignes. Les zones pertinentes pour ce plan (numéros de ligne avant modification) :

- L.16 : state `[contrats, setContrats]`
- L.72-79 : `fetchContrats` — `GET /employees/{id}/contrats/`, résultat trié par le backend (le plus récent en premier, `numero_contrat` etc.)
- L.168-201 : `handleUpload` — poste actuellement toujours sur `/employees/${id}/documents/`
- L.913-1298 : bloc JSX de l'onglet "dossier" (sidebar documents + upload)
- L.944 : en-tête `Documents ({employee.documents?.length || 0})`
- L.948 : `employee.documents?.map((doc) => ...)` — liste actuellement non filtrée
- L.982-993 : badge numéro de contrat déjà affiché sur les documents qui en ont un (à conserver tel quel)
- L.1238-1284 : formulaire d'upload (select type + input file, appelle `handleUpload`)

Le test `frontend/src/__tests__/EmployeeDetail.test.jsx` définit `mockContrats` avec un seul contrat `contrat-1` / `CTR-2020-001`. Avec ce plan, ce contrat devient automatiquement sélectionné par défaut dès qu'il y a ≥1 contrat, ce qui change le comportement du test existant "upload réussi appelle api.post avec FormData" (L.215-234 actuel) : l'upload doit maintenant cibler `/contrats/contrat-1/documents/` au lieu de `/employees/emp-uuid/documents/`. Ce test sera corrigé dans la Task 2.

---

### Task 1: State de sélection de contrat + onglets + filtrage des documents affichés

**Files:**
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Test: `frontend/src/__tests__/EmployeeDetail.test.jsx`

**Interfaces:**
- Produces: state `selectedContratId` (string | null) et fonction `getDocumentsAffiches(employee, contrats, selectedContratId)` — utilisée aussi en Task 2 pour déterminer l'URL d'upload.

- [ ] **Step 1: Écrire le test qui échoue — sélection par défaut du dernier contrat**

Ajouter dans `frontend/src/__tests__/EmployeeDetail.test.jsx`, dans un nouveau bloc `describe` après celui des documents (après la ligne 174, avant `describe("EmployeeDetail — navigation"`) :

```javascript
describe("EmployeeDetail — onglets contrat (dossier)", () => {
  const mockDocContrat = {
    id: "doc-2",
    type_document: "BULLETIN",
    type_document_label: "Bulletin de salaire",
    is_active: true,
    fichiers: [],
    nb_fichiers: 0,
    contrat: "contrat-1",
  };

  const employeeAvecDeuxDocs = {
    ...mockEmployee,
    documents: [mockDoc, mockDocContrat],
  };

  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url.includes("types-documents")) {
        return Promise.resolve({ data: { results: mockTypes } });
      }
      if (url.includes("types-contrat")) {
        return Promise.resolve({ data: { results: [{ id: "tc-1", nom: "CDI" }] } });
      }
      if (url.includes("/contrats/")) {
        return Promise.resolve({ data: mockContrats });
      }
      if (url.includes("files/")) {
        return Promise.resolve({ data: new Blob(["pdf"], { type: "application/pdf" }) });
      }
      return Promise.resolve({ data: employeeAvecDeuxDocs });
    });
  });

  test("affiche un onglet par contrat avec le dernier sélectionné par défaut", async () => {
    renderPage("ADMIN");
    await waitFor(() => {
      expect(screen.getByText("CTR-2020-001")).toBeInTheDocument();
    });
    const onglet = screen.getByRole("button", { name: "CTR-2020-001" });
    expect(onglet).toHaveAttribute("aria-pressed", "true");
  });

  test("le dossier général et les documents du contrat sélectionné sont visibles", async () => {
    renderPage("ADMIN");
    await waitFor(() => {
      expect(screen.getAllByText("Carte Nationale").length).toBeGreaterThan(0);
      expect(screen.getByText("Bulletin de salaire")).toBeInTheDocument();
    });
  });

  test("aucun onglet affiché si l'employé n'a aucun contrat", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("types-documents")) {
        return Promise.resolve({ data: { results: mockTypes } });
      }
      if (url.includes("types-contrat")) {
        return Promise.resolve({ data: { results: [] } });
      }
      if (url.includes("/contrats/")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: mockEmployee });
    });
    renderPage("ADMIN");
    await waitFor(() => screen.getAllByText("EMP-001").length > 0);
    expect(screen.queryByRole("button", { name: "CTR-2020-001" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd frontend && npx jest src/__tests__/EmployeeDetail.test.jsx -t "onglets contrat"`
Expected: FAIL — aucun élément avec le rôle `button` nommé "CTR-2020-001" n'existe encore (les onglets n'ont pas été implémentés).

- [ ] **Step 3: Ajouter le state `selectedContratId` et l'initialiser au dernier contrat**

Dans `frontend/src/pages/EmployeeDetail.jsx`, ajouter le state juste après la ligne définissant `contrats` (actuelle L.16) :

```javascript
  const [contrats, setContrats] = useState([]);
  const [selectedContratId, setSelectedContratId] = useState(null);
```

Modifier `fetchContrats` (actuelle L.72-79) pour sélectionner automatiquement le dernier contrat après chargement :

```javascript
  const fetchContrats = async () => {
    try {
      const response = await api.get(`/employees/${id}/contrats/`);
      setContrats(response.data);
      if (response.data.length > 0) {
        const dernierContrat = [...response.data].sort(
          (a, b) => new Date(a.date_debut || 0) - new Date(b.date_debut || 0),
        ).at(-1);
        setSelectedContratId(dernierContrat.id);
      }
    } catch (err) {
      console.error(err);
    }
  };
```

- [ ] **Step 4: Ajouter la fonction de filtrage des documents**

Juste avant le `return (` du composant (avant l'actuelle L.287, après la définition de `infoFields`), ajouter :

```javascript
  const documentsAffiches = (employee.documents || []).filter(
    (doc) => !doc.contrat || doc.contrat === selectedContratId,
  );
```

- [ ] **Step 5: Ajouter la rangée d'onglets de contrat et brancher le filtrage dans le JSX**

Dans le bloc de l'onglet "dossier" (actuel L.913-946), juste après le `<div>` d'en-tête "Documents (...)" (actuelle L.932-945) et avant "{/* Documents présents */}" (actuelle L.947), insérer la rangée d'onglets :

```jsx
              {contrats.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    padding: "10px 16px",
                    borderBottom: `1px solid ${theme.border}`,
                    background: theme.bg,
                  }}
                >
                  {[...contrats]
                    .sort((a, b) => new Date(a.date_debut || 0) - new Date(b.date_debut || 0))
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={selectedContratId === c.id}
                        onClick={() => setSelectedContratId(c.id)}
                        style={{
                          background: selectedContratId === c.id ? theme.primary : theme.surface,
                          border: `1px solid ${selectedContratId === c.id ? theme.primary : theme.border}`,
                          color: selectedContratId === c.id ? "#fff" : theme.text,
                          borderRadius: 6,
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: "monospace",
                          cursor: "pointer",
                        }}
                      >
                        {c.numero_contrat}
                      </button>
                    ))}
                </div>
              )}
```

Puis remplacer, dans le même bloc, le texte de l'en-tête (actuelle L.944) :

```jsx
                Documents ({employee.documents?.length || 0})
```

par :

```jsx
                Documents ({documentsAffiches.length})
```

Et remplacer la source de la liste (actuelle L.948) :

```jsx
              {employee.documents?.map((doc) => (
```

par :

```jsx
              {documentsAffiches.map((doc) => (
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `cd frontend && npx jest src/__tests__/EmployeeDetail.test.jsx -t "onglets contrat"`
Expected: PASS — les 3 tests du bloc "onglets contrat" passent.

- [ ] **Step 7: Lancer toute la suite du fichier pour détecter des régressions**

Run: `cd frontend && npx jest src/__tests__/EmployeeDetail.test.jsx`
Expected: le test "upload réussi appelle api.post avec FormData" (describe "upload fichier (ADMIN)") échoue désormais car l'upload cible `/contrats/contrat-1/documents/` au lieu de `/employees/emp-uuid/documents/` (comportement attendu, corrigé en Task 2). Tous les autres tests passent.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/EmployeeDetail.jsx frontend/src/__tests__/EmployeeDetail.test.jsx
git commit -m "feat(dossier): ajoute des onglets par contrat filtrant les documents affichés"
```

---

### Task 2: Router l'upload (formulaire + quick-upload documents manquants) vers le bon endpoint

**Files:**
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Test: `frontend/src/__tests__/EmployeeDetail.test.jsx`

**Interfaces:**
- Consumes: state `selectedContratId` (produit en Task 1).
- Produces: aucune nouvelle interface publique — comportement d'upload uniquement.

- [ ] **Step 1: Corriger le test existant cassé par la Task 1**

Dans `frontend/src/__tests__/EmployeeDetail.test.jsx`, remplacer le test "upload réussi appelle api.post avec FormData" (actuel bloc `describe("EmployeeDetail — upload fichier (ADMIN)"`, test des lignes ~215-234) par :

```javascript
  test("upload réussi appelle api.post sur l'endpoint du contrat sélectionné", async () => {
    api.post.mockResolvedValue({});
    renderPage("ADMIN");
    await waitFor(() => screen.getAllByText("EMP-001").length > 0);
    await waitFor(() => screen.getByText("CTR-2020-001"));

    const fileInputs = document.querySelectorAll('input[type="file"]');
    const mainInput = fileInputs[0];
    if (mainInput) {
      const file = new File(["pdf"], "test.pdf", { type: "application/pdf" });
      fireEvent.change(mainInput, { target: { files: [file] } });
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/contrats/contrat-1/documents/",
          expect.any(FormData),
          expect.any(Object)
        );
      });
    }
  });

  test("upload réussi cible le dossier général si l'employé n'a aucun contrat", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("types-documents")) {
        return Promise.resolve({ data: { results: mockTypes } });
      }
      if (url.includes("types-contrat")) {
        return Promise.resolve({ data: { results: [] } });
      }
      if (url.includes("/contrats/")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: mockEmployee });
    });
    api.post.mockResolvedValue({});
    renderPage("ADMIN");
    await waitFor(() => screen.getAllByText("EMP-001").length > 0);

    const fileInputs = document.querySelectorAll('input[type="file"]');
    const mainInput = fileInputs[0];
    if (mainInput) {
      const file = new File(["pdf"], "test.pdf", { type: "application/pdf" });
      fireEvent.change(mainInput, { target: { files: [file] } });
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          "/employees/emp-uuid/documents/",
          expect.any(FormData),
          expect.any(Object)
        );
      });
    }
  });
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd frontend && npx jest src/__tests__/EmployeeDetail.test.jsx -t "upload réussi"`
Expected: FAIL — `handleUpload` poste toujours sur `/employees/emp-uuid/documents/`, donc le premier test du Step 1 échoue (attend `/contrats/contrat-1/documents/`).

- [ ] **Step 3: Brancher `handleUpload` sur le bon endpoint**

Remplacer, dans `frontend/src/pages/EmployeeDetail.jsx`, le corps de `handleUpload` (actuelle L.168-201) :

```javascript
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);

    const typeSelectionne = typesDocumentsList.find(
      (t) => t.code === uploadType,
    );
    const formData = new FormData();
    formData.append("type_doc", typeSelectionne?.id || uploadType);
    files.forEach((file) => formData.append("files", file));

    const url = selectedContratId
      ? `/contrats/${selectedContratId}/documents/`
      : `/employees/${id}/documents/`;

    try {
      await api.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage({
        type: "success",
        text: `${files.length} fichier(s) uploadé(s) avec succès.`,
      });
      fetchEmployee();
      fetchContrats();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.files?.[0] || "Erreur lors de l'upload.",
      });
    } finally {
      setUploading(false);
      e.target.value = "";
      setTimeout(() => setMessage(null), 4000);
    }
  };
```

(Seuls changements par rapport à l'original : calcul de `url`, `api.post(url, ...)` au lieu de l'URL en dur, et ajout de `fetchContrats()` après succès pour rafraîchir `nb_documents`.)

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd frontend && npx jest src/__tests__/EmployeeDetail.test.jsx -t "upload réussi"`
Expected: PASS pour les deux tests ("cible le contrat sélectionné" et "cible le dossier général sans contrat").

- [ ] **Step 5: Lancer toute la suite du fichier**

Run: `cd frontend && npx jest src/__tests__/EmployeeDetail.test.jsx`
Expected: PASS — tous les tests du fichier passent, y compris ceux de quick-upload (qui continuent de cibler `/employees/{id}/documents/` car ce code chemin n'a pas été touché).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/EmployeeDetail.jsx frontend/src/__tests__/EmployeeDetail.test.jsx
git commit -m "fix(dossier): route l'upload vers le contrat sélectionné ou le dossier général"
```

---

## Vérification finale

- [ ] **Step 1: Lancer toute la suite frontend**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: tous les tests passent (0 échec).

- [ ] **Step 2: Vérification manuelle rapide (optionnelle mais recommandée)**

Lancer le frontend (`npm start`) et le backend (`python manage.py runserver`), ouvrir la fiche d'un employé ayant ≥2 contrats, vérifier :
- Les onglets de contrat s'affichent, triés du plus ancien au plus récent, le plus récent est actif par défaut.
- Cliquer sur un autre onglet change la liste de documents affichés (dossier général + docs de ce contrat).
- Un upload en ADMIN alors qu'un contrat est sélectionné crée bien un document lié à ce contrat (visible dans l'onglet "Contrats" → `nb_documents` incrémenté).
