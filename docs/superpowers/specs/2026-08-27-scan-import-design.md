# Scanner et import complet — Design

Date : 2026-08-27

## Contexte

Aujourd'hui, l'ajout d'un document sur la fiche employé se fait un type à la fois (`DocumentListUploadView.post`, formulaire "Ajouter un document" sur `EmployeeDetail.jsx`). Pour un dossier RH physique numérisé (souvent scanné en un ou plusieurs PDF multi-pages, ou en plusieurs fichiers distincts), l'utilisateur doit aujourd'hui découper et uploader chaque document manuellement. Cette fonctionnalité permet d'importer en une seule opération un lot de fichiers scannés (PDF et/ou images) et de répartir leurs pages entre plusieurs types de documents de l'employé courant.

## Portée

- **Un seul employé à la fois** : point d'entrée depuis `EmployeeDetail.jsx` (fiche employé déjà ouverte). Pas de gestion multi-employés dans cette version.
- **Employé uniquement** pour cette première version — `ContratDetail.jsx` n'est pas couvert (le composant `ScanImportModal` sera conçu pour rester réutilisable, mais son intégration côté contrat est hors scope).
- Formats acceptés : PDF (mono ou multi-pages) et images JPEG/PNG/WebP (une image = une page).
- ADMIN uniquement (même permission que l'upload normal).

## 1. Point d'entrée & UI

- Nouveau bouton **"Scanner un dossier"** dans la sidebar Documents de `EmployeeDetail.jsx`, à côté du bouton existant "Ajouter un document".
- Ouvre une modale `ScanImportModal.jsx` (nouveau composant, `frontend/src/components/`), pattern cohérent avec `ConfirmDialog.jsx` (overlay + `useConfirm()` pour la fermeture si travail en cours).

### Sélection des fichiers

- `<input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp">` + zone drag & drop.
- Limites : max 20 fichiers, 20 Mo par fichier (même règle que l'upload normal, `settings.MAX_FILE_SIZE_MB`), max ~100 pages au total tous fichiers confondus. Dépassement → message d'erreur bloquant l'ajout, pas de troncature silencieuse.
- Fichier invalide (MIME non autorisé côté extension, ou PDF corrompu que pdf.js ne peut pas ouvrir) : rejeté individuellement avec message clair, n'empêche pas l'ajout des autres fichiers valides du même lot.

### Grille de miniatures

- pdf.js (déjà présent dans le projet, utilisé par `SecureDocViewer.jsx`) génère une miniature canvas par page de chaque PDF (`scale ≈ 0.3`). Une image contribue une seule "page" (elle-même comme miniature).
- Grille unique affichant toutes les pages de tous les fichiers, dans l'ordre d'upload, chaque miniature étiquetée avec le nom du fichier source et son numéro de page (ex. "dossier1.pdf — p.2").
- **Sélection intelligente** : cliquer une miniature sélectionne par défaut toutes les pages du même fichier source (comportement "un type par fichier", cas le plus fréquent). Shift/Ctrl-clic permet d'affiner la sélection page par page pour scinder un PDF multi-pages en plusieurs groupes.
- Une sélection active + choix d'un type de document dans un dropdown (même source que l'upload normal : types actifs, non-catégories, groupés par catégorie parente via `<optgroup>`) crée un **groupe**. Chaque groupe a une couleur de surlignage distincte appliquée aux miniatures qui le composent, et une petite liste récapitulative sous la grille ("Groupe 1 — Acte de naissance — 3 pages", avec bouton pour dissoudre/réassigner).
- Une page peut appartenir à au plus un groupe à la fois (la réassigner à un nouveau groupe la retire de l'ancien).

### Validation & import

- Bouton "Importer" toujours actif dès qu'au moins un groupe existe. Les pages non assignées à un groupe sont simplement ignorées.
- Avant l'envoi, un texte récapitulatif ("X pages ne seront pas importées") s'affiche si des pages restent orphelines, pour que l'utilisateur les repère avant de valider (pas de blocage).
- Après réponse backend : récapitulatif final ("4 documents créés" + détail des échecs éventuels par groupe), puis fermeture de la modale et rafraîchissement de la liste de documents de la fiche employé.

## 2. Flux technique

### Frontend → payload

Pour chaque groupe défini par l'utilisateur, le plan d'import est sérialisé en JSON :

```json
{
  "groups": [
    {
      "type_doc": "<uuid>",
      "notes": "",
      "parts": [
        { "file_index": 0, "pages": [1, 2, 3] },
        { "file_index": 1, "is_image": true }
      ]
    }
  ]
}
```

- `file_index` référence la position du fichier dans le tableau `files` envoyé en multipart (chaque fichier original n'est envoyé qu'une seule fois, même s'il contribue à plusieurs groupes).
- Un fichier PDF entièrement couvert par une seule part sur tout son nombre de pages n'a pas besoin d'être redécoupé côté backend (voir ci-dessous).

### Backend — nouvel endpoint

`POST /api/employees/<uuid>/documents/scan-import/` (`ScanImportView`, `employees/views.py`), `IsAdmin`, `MultiPartParser`.

- Champs reçus : `files` (multipart, liste dédupliquée) + `plan` (JSON string, champ `plan`).
- Pour chaque groupe du plan :
  - Résout `type_doc`, vérifie qu'il existe, est actif et n'est pas une catégorie (`is_categorie` → erreur 400 pour ce groupe).
  - Pour chaque `part` :
    - Si `is_image` → fichier utilisé tel quel.
    - Si PDF et la part couvre l'intégralité des pages du fichier source → fichier original réutilisé tel quel (pas de ré-encodage, évite une perte de qualité/métadonnées inutile).
    - Sinon → `pypdf.PdfWriter` extrait les pages listées dans un nouveau PDF construit en mémoire (`io.BytesIO`), passé ensuite dans le même pipeline de validation MIME (python-magic) et de nommage UUID que l'upload normal.
  - Crée un `EmployeeDocument` pour ce type (ou nouvelle version si un document de ce type existe déjà pour l'employé — réutilise la logique de versioning existante dans `EmployeeDocument.save()`), avec un ou plusieurs `EmployeeDocumentFile` (un par `part`, comme un upload multi-fichiers classique).
  - Un `AuditLog` (`Action.CREATE_DOC`) est créé pour chaque `EmployeeDocument` créé — comportement identique à l'upload normal, pas de nouveau type d'action.
- Un groupe qui échoue (page cassée dans un PDF par ailleurs valide, type de document invalide) n'annule pas les autres groupes : chaque groupe est traité indépendamment dans une transaction propre, la réponse liste séparément succès et échecs :

```json
{
  "created": [{ "type_doc": "...", "document_id": "..." }],
  "failed": [{ "type_doc": "...", "error": "..." }]
}
```

- Réutilise le scoping/permissions existants : `resolve_employee` + `can_access_employee`. Pas de vérification `document_type_scope_q` nécessaire ici car l'endpoint est ADMIN only (les CONSULTANTs n'ont jamais accès à l'upload).

### Dépendance backend

Ajout de `pypdf` à `backend/requirements.txt` (pure Python, pas de dépendance système contrairement à pikepdf/poppler).

## 3. Hors scope (explicitement exclu)

- Import multi-employés en une seule modale.
- OCR / détection automatique du type de document à partir du contenu scanné.
- Intégration sur `ContratDetail.jsx` (peut réutiliser `ScanImportModal` dans une itération future).
- Nouveau type d'action d'audit dédié — les entrées `CREATE_DOC` existantes suffisent.

## 4. Tests

- Backend (`pytest`) : nouveau fichier `backend/tests/test_scan_import.py`
  - découpage d'un PDF multi-pages en plusieurs groupes → bon nombre de pages par `EmployeeDocument` créé
  - fichier entièrement couvert par une part → réutilisé tel quel (pas de perte, hash identique au fichier source)
  - groupe avec type invalide/catégorie → erreur pour ce groupe uniquement, autres groupes créés
  - permissions : CONSULTANT → 403 ; ADMIN hors périmètre (n/a car ADMIN toujours non restreint) 
  - audit log : une entrée `CREATE_DOC` par document créé
- Frontend (Jest) : `frontend/src/__tests__/ScanImportModal.test.jsx`
  - sélection d'un fichier → clic sur une page sélectionne tout le fichier
  - Ctrl/Shift-clic → sélection partielle
  - assignation d'un type → groupe créé, surlignage appliqué
  - soumission → payload `plan` correctement construit avec `file_index`/`pages`
