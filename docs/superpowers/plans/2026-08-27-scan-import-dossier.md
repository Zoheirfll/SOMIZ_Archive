# Scanner et import complet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un ADMIN d'importer en une seule opération un lot de fichiers scannés (PDF multi-pages et/ou images) pour un employé, en répartissant les pages/fichiers entre plusieurs types de documents via une modale, plutôt que d'uploader chaque document séparément.

**Architecture:** Le découpage réel des PDF se fait côté backend (nouvel endpoint `POST /api/employees/<id>/documents/scan-import/`) avec `pypdf`. Le frontend génère seulement les miniatures (via `react-pdf`, déjà présent) pour l'aperçu et construit un plan JSON décrivant quelles pages de quel fichier vont dans quel groupe/type de document ; le plan et les fichiers originaux (envoyés une seule fois chacun) sont postés ensemble. Chaque groupe crée un `EmployeeDocument` en réutilisant le pipeline de validation/versioning/audit existant.

**Tech Stack:** Django REST Framework, pypdf (nouveau), python-magic (existant), React 19, react-pdf 9.2.1 (existant).

## Global Constraints

- Formats acceptés : mêmes MIME que l'upload normal — `application/pdf`, `image/jpeg`, `image/png`, `image/tiff` (`backend/config/settings.py:190-195`, `ALLOWED_MIME_TYPES`). Pas de `image/webp` pour les documents (réservé aux photos de profil).
- Taille max par fichier : `settings.MAX_UPLOAD_SIZE_MB` (20 Mo), même règle que l'upload normal.
- Limites nouvelles à cette fonctionnalité : max 20 fichiers par import, max 100 pages au total (validées côté serializer backend).
- ADMIN uniquement (`IsAdmin`), même permission que `DocumentListUploadView.post`.
- Un seul employé à la fois — pas de multi-employés, pas d'intégration `ContratDetail.jsx` dans cette version.
- Styles inline uniquement, tokens `theme.js`, jamais de hex en dur (`c:\Users\filali\SOMIZ\CLAUDE.md`).
- Pas de `window.confirm`/`window.prompt` — utiliser `useConfirm()`/`usePrompt()` de `frontend/src/components/ConfirmDialog.jsx`.
- Audit : une entrée `AuditLog.Action.UPLOAD` par `EmployeeDocument` créé (comportement identique à l'upload normal, pas de nouveau type d'action).

---

## File Structure

- **Create** `backend/employees/pdf_utils.py` — fonctions pures de découpage PDF (pypdf), testables indépendamment de la vue.
- **Modify** `backend/requirements.txt` — ajoute `pypdf`.
- **Modify** `backend/employees/serializers.py` — ajoute `ScanImportSerializer` (valide `plan` + `files`).
- **Modify** `backend/employees/views.py` — ajoute `ScanImportView`.
- **Modify** `backend/employees/urls.py` — nouvelle route.
- **Create** `backend/tests/test_scan_import.py` — tests backend.
- **Create** `frontend/src/components/ScanImportModal.jsx` — modale complète (sélection fichiers, grille de miniatures, groupes, soumission).
- **Modify** `frontend/src/pages/EmployeeDetail.jsx` — bouton "Scanner un dossier" + intégration de la modale.
- **Create** `frontend/src/__tests__/ScanImportModal.test.jsx` — tests frontend.

---

### Task 1: Découpage PDF backend (`pdf_utils.py`)

**Files:**
- Create: `backend/employees/pdf_utils.py`
- Modify: `backend/requirements.txt`
- Test: `backend/tests/test_scan_import.py` (section découpage, créée dans cette tâche)

**Interfaces:**
- Consumes: rien (fonctions pures, pas de dépendance au reste de l'app).
- Produces:
  - `pdf_page_count(file_obj) -> int` — nombre de pages d'un fichier PDF ouvert (file-like, position quelconque, remise à 0 après lecture).
  - `extract_pdf_pages(file_obj, pages: list[int]) -> io.BytesIO` — construit un nouveau PDF ne contenant que les pages listées (1-indexées, dans l'ordre donné), retourne un buffer positionné à 0.
  - `class PdfExtractionError(Exception)` — levée si `file_obj` n'est pas un PDF valide ou si une page demandée n'existe pas.

- [ ] **Step 1: Ajouter la dépendance**

Modifier `backend/requirements.txt` : ajouter une ligne `pypdf==5.1.0` (dernière version stable au moment de l'écriture — garder cohérent avec le reste du fichier qui épingle des versions exactes).

- [ ] **Step 2: Installer la dépendance localement pour pouvoir lancer les tests**

Run: `cd backend && pip install pypdf==5.1.0`
Expected: `Successfully installed pypdf-5.1.0`

- [ ] **Step 3: Écrire le test en échec pour `pdf_page_count` et `extract_pdf_pages`**

Créer `backend/tests/test_scan_import.py` :

```python
import io
import pytest
from pypdf import PdfWriter
from employees.pdf_utils import pdf_page_count, extract_pdf_pages, PdfExtractionError


def make_pdf(nb_pages):
    writer = PdfWriter()
    for _ in range(nb_pages):
        writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf


class TestPdfUtils:
    def test_pdf_page_count(self):
        buf = make_pdf(5)
        assert pdf_page_count(buf) == 5

    def test_pdf_page_count_resets_position(self):
        buf = make_pdf(3)
        pdf_page_count(buf)
        assert buf.tell() == 0

    def test_extract_pdf_pages_subset(self):
        buf = make_pdf(5)
        result = extract_pdf_pages(buf, [2, 3])
        reader_buf = io.BytesIO(result.read())
        from pypdf import PdfReader
        reader = PdfReader(reader_buf)
        assert len(reader.pages) == 2

    def test_extract_pdf_pages_invalid_page_raises(self):
        buf = make_pdf(2)
        with pytest.raises(PdfExtractionError):
            extract_pdf_pages(buf, [1, 5])

    def test_extract_pdf_pages_not_a_pdf_raises(self):
        buf = io.BytesIO(b"not a pdf")
        with pytest.raises(PdfExtractionError):
            extract_pdf_pages(buf, [1])
```

- [ ] **Step 4: Lancer les tests pour vérifier l'échec**

Run: `cd backend && pytest tests/test_scan_import.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'employees.pdf_utils'`

- [ ] **Step 5: Implémenter `pdf_utils.py`**

```python
"""
apps/employees/pdf_utils.py
Découpage de PDF pour l'import groupé (scan/import).
Fonctions pures — pas de dépendance à Django models/settings.
"""

import io
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError


class PdfExtractionError(Exception):
    """PDF invalide ou plage de pages demandée hors limites."""


def pdf_page_count(file_obj):
    """Retourne le nombre de pages d'un PDF. Remet file_obj en position 0."""
    file_obj.seek(0)
    try:
        reader = PdfReader(file_obj)
        count = len(reader.pages)
    except PdfReadError as exc:
        raise PdfExtractionError(f"PDF invalide : {exc}") from exc
    finally:
        file_obj.seek(0)
    return count


def extract_pdf_pages(file_obj, pages):
    """Construit un nouveau PDF contenant uniquement `pages` (1-indexées,
    dans l'ordre donné). Retourne un io.BytesIO positionné à 0.
    Lève PdfExtractionError si le fichier n'est pas un PDF valide ou si
    une page demandée n'existe pas."""
    file_obj.seek(0)
    try:
        reader = PdfReader(file_obj)
    except PdfReadError as exc:
        raise PdfExtractionError(f"PDF invalide : {exc}") from exc
    finally:
        file_obj.seek(0)

    total = len(reader.pages)
    writer = PdfWriter()
    for page_num in pages:
        if page_num < 1 or page_num > total:
            raise PdfExtractionError(
                f"Page {page_num} inexistante (le PDF a {total} page(s))."
            )
        writer.add_page(reader.pages[page_num - 1])

    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf
```

- [ ] **Step 6: Lancer les tests pour vérifier le succès**

Run: `cd backend && pytest tests/test_scan_import.py -v`
Expected: 5 passed

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/employees/pdf_utils.py backend/tests/test_scan_import.py
git commit -m "feat(scan-import): decoupage PDF backend avec pypdf"
```

---

### Task 2: `ScanImportSerializer`

**Files:**
- Modify: `backend/employees/serializers.py`
- Test: `backend/tests/test_scan_import.py` (section serializer, ajoutée dans cette tâche)

**Interfaces:**
- Consumes: `pdf_utils.pdf_page_count` (Task 1), `TypeDocument` (déjà importé dans `serializers.py`).
- Produces: `ScanImportSerializer` — sérialiseur `Serializer` (pas `ModelSerializer`) avec :
  - Input attendu : `{'files': [<fichiers>], 'plan': '<json string>'}`.
  - `validated_data['groups']` : liste de dicts `{'type_doc': <TypeDocument instance>, 'notes': str, 'parts': [{'file': <fichier>, 'pages': [int, ...] | None, 'is_image': bool}]}` — `file` résolu depuis `files` via `file_index`, prêt à consommer directement dans la vue.

- [ ] **Step 1: Écrire les tests en échec**

Ajouter à `backend/tests/test_scan_import.py` :

```python
import json
from django.core.files.uploadedfile import SimpleUploadedFile
from employees.serializers import ScanImportSerializer
from employees.models import TypeDocument


@pytest.mark.django_db
class TestScanImportSerializer:
    def _pdf_file(self, nb_pages=3, name="scan.pdf"):
        buf = make_pdf(nb_pages)
        return SimpleUploadedFile(name, buf.read(), content_type="application/pdf")

    def _image_file(self, name="photo.jpg"):
        # 1x1 JPEG minimal valide (magic bytes suffisent pour python-magic)
        content = bytes.fromhex(
            "ffd8ffe000104a46494600010100000100010000ffdb004300"
            "03020202020302020203030303040604040404040805050506"
            "0605050605070707070806090908080807080a0a0b0c0f0e0a"
            "0b0e0b07070d110d0e0f101011100a0c12131210130f101010"
            "ffd9"
        )
        return SimpleUploadedFile(name, content, content_type="image/jpeg")

    def test_valid_single_group_whole_file(self, db):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        file = self._pdf_file(nb_pages=3)
        plan = json.dumps({
            "groups": [
                {"type_doc": str(type_doc.id), "notes": "", "parts": [
                    {"file_index": 0, "pages": [1, 2, 3]},
                ]},
            ]
        })
        serializer = ScanImportSerializer(data={"files": [file], "plan": plan})
        assert serializer.is_valid(), serializer.errors
        groups = serializer.validated_data["groups"]
        assert len(groups) == 1
        assert groups[0]["type_doc"] == type_doc
        assert groups[0]["parts"][0]["pages"] == [1, 2, 3]

    def test_valid_group_with_image_part(self, db):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        image = self._image_file()
        plan = json.dumps({
            "groups": [
                {"type_doc": str(type_doc.id), "notes": "", "parts": [
                    {"file_index": 0, "is_image": True},
                ]},
            ]
        })
        serializer = ScanImportSerializer(data={"files": [image], "plan": plan})
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["groups"][0]["parts"][0]["is_image"] is True

    def test_invalid_plan_json_rejected(self, db):
        file = self._pdf_file()
        serializer = ScanImportSerializer(data={"files": [file], "plan": "not json"})
        assert not serializer.is_valid()
        assert "plan" in serializer.errors

    def test_category_type_doc_rejected(self, db):
        parent = TypeDocument.objects.create(nom="Etat civil", code="ETAT_CIVIL", is_active=True)
        TypeDocument.objects.create(nom="Acte", code="ACTE", is_active=True, parent=parent)
        file = self._pdf_file()
        plan = json.dumps({
            "groups": [
                {"type_doc": str(parent.id), "notes": "", "parts": [
                    {"file_index": 0, "pages": [1]},
                ]},
            ]
        })
        serializer = ScanImportSerializer(data={"files": [file], "plan": plan})
        assert not serializer.is_valid()

    def test_too_many_files_rejected(self, db):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        files = [self._pdf_file(nb_pages=1, name=f"f{i}.pdf") for i in range(21)]
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "notes": "", "parts": [{"file_index": i, "pages": [1]}]}
            for i in range(21)
        ]})
        serializer = ScanImportSerializer(data={"files": files, "plan": plan})
        assert not serializer.is_valid()
        assert "files" in serializer.errors

    def test_too_many_total_pages_rejected(self, db):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        file = self._pdf_file(nb_pages=1)
        plan = json.dumps({
            "groups": [
                {"type_doc": str(type_doc.id), "notes": "", "parts": [
                    {"file_index": 0, "pages": list(range(1, 102))},
                ]},
            ]
        })
        serializer = ScanImportSerializer(data={"files": [file], "plan": plan})
        assert not serializer.is_valid()
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd backend && pytest tests/test_scan_import.py::TestScanImportSerializer -v`
Expected: FAIL — `ImportError: cannot import name 'ScanImportSerializer'`

- [ ] **Step 3: Implémenter `ScanImportSerializer`**

Ajouter à `backend/employees/serializers.py`, juste après `DocumentUploadSerializer` (fin de la classe existante, ligne ~160) :

```python
import json as _json  # en tête de fichier si `json` n'est pas déjà importé — vérifier avant d'ajouter un doublon

class ScanImportPartSerializer(serializers.Serializer):
    file_index = serializers.IntegerField(min_value=0)
    pages = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False
    )
    is_image = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if not attrs.get("is_image") and not attrs.get("pages"):
            raise serializers.ValidationError(
                "Une part PDF doit préciser au moins une page."
            )
        return attrs


class ScanImportGroupSerializer(serializers.Serializer):
    type_doc = serializers.PrimaryKeyRelatedField(
        queryset=TypeDocument.objects.filter(is_active=True, sous_types__isnull=True)
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    parts = ScanImportPartSerializer(many=True)

    def validate_parts(self, parts):
        if not parts:
            raise serializers.ValidationError("Un groupe doit contenir au moins une part.")
        return parts


class ScanImportSerializer(serializers.Serializer):
    """
    Import groupé de fichiers scannés (PDF multi-pages et/ou images) pour
    un employé, répartis en plusieurs groupes/types de documents en une
    seule opération. `plan` est une chaîne JSON (envoyée en multipart aux
    côtés des fichiers) décrivant les groupes ; `file_index` dans chaque
    part référence la position du fichier dans `files`.
    """
    files = serializers.ListField(
        child=serializers.FileField(), min_length=1, max_length=20
    )
    plan = serializers.CharField()

    def validate_plan(self, value):
        try:
            data = _json.loads(value)
        except (ValueError, TypeError):
            raise serializers.ValidationError("JSON invalide.")
        if not isinstance(data, dict) or "groups" not in data:
            raise serializers.ValidationError("Le plan doit contenir une clé 'groups'.")
        return data

    def validate(self, attrs):
        files = attrs["files"]
        max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        for file in files:
            if file.size > max_size:
                raise serializers.ValidationError(
                    f"{file.name} trop lourd. Maximum {settings.MAX_UPLOAD_SIZE_MB} Mo."
                )
            file.seek(0)
            mime = magic.from_buffer(file.read(2048), mime=True)
            file.seek(0)
            if mime not in settings.ALLOWED_MIME_TYPES:
                raise serializers.ValidationError(
                    f"{file.name} : type non autorisé ({mime})."
                )

        groups_serializer = ScanImportGroupSerializer(
            data=attrs["plan"]["groups"], many=True
        )
        if not groups_serializer.is_valid():
            raise serializers.ValidationError({"plan": groups_serializer.errors})

        total_pages = 0
        resolved_groups = []
        for group in groups_serializer.validated_data:
            resolved_parts = []
            for part in group["parts"]:
                idx = part["file_index"]
                if idx >= len(files):
                    raise serializers.ValidationError(
                        {"plan": f"file_index {idx} hors limites."}
                    )
                pages = part.get("pages") or []
                total_pages += len(pages) if pages else 1
                resolved_parts.append({
                    "file": files[idx],
                    "pages": pages or None,
                    "is_image": part.get("is_image", False),
                })
            resolved_groups.append({
                "type_doc": group["type_doc"],
                "notes": group.get("notes", ""),
                "parts": resolved_parts,
            })

        if total_pages > 100:
            raise serializers.ValidationError(
                "Maximum 100 pages au total par import."
            )

        attrs["groups"] = resolved_groups
        return attrs
```

Vérifier en tête de `backend/employees/serializers.py` que `json` n'est pas déjà importé sous un autre nom — si `import json` existe déjà, réutiliser ce nom au lieu de l'alias `_json` dans le code ci-dessus (remplacer `_json` par `json` partout dans le bloc).

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd backend && pytest tests/test_scan_import.py::TestScanImportSerializer -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/employees/serializers.py backend/tests/test_scan_import.py
git commit -m "feat(scan-import): ScanImportSerializer pour valider le plan d'import groupe"
```

---

### Task 3: `ScanImportView` + route + audit

**Files:**
- Modify: `backend/employees/views.py`
- Modify: `backend/employees/urls.py`
- Test: `backend/tests/test_scan_import.py` (section vue, ajoutée dans cette tâche)

**Interfaces:**
- Consumes: `ScanImportSerializer` (Task 2), `pdf_utils.extract_pdf_pages`/`PdfExtractionError` (Task 1), `resolve_employee`, `EmployeeDocument`, `EmployeeDocumentFile`, `AuditLog.Action.UPLOAD`, `IsAdmin` (tous déjà présents dans `views.py`).
- Produces: route `POST /api/employees/<emp_id>/documents/scan-import/`, réponse `{'created': [...], 'failed': [...]}`.

- [ ] **Step 1: Écrire les tests en échec**

Ajouter à `backend/tests/test_scan_import.py` (nécessite les fixtures existantes du projet — suivre le pattern de `backend/tests/test_document_upload.py` pour `admin_client`/`consultant_client`/`employee` ; les réutiliser via les fixtures conftest déjà en place, ne pas les redéfinir si elles existent) :

```python
from employees.models import EmployeeDocument


@pytest.mark.django_db
class TestScanImportView:
    def _url(self, employee):
        return f"/api/employees/{employee.id}/documents/scan-import/"

    def _pdf_bytes(self, nb_pages):
        buf = make_pdf(nb_pages)
        return buf.read()

    def test_admin_can_import_whole_file_group(self, admin_client, employee):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        file = SimpleUploadedFile("cv.pdf", self._pdf_bytes(2), content_type="application/pdf")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "parts": [{"file_index": 0, "pages": [1, 2]}]}
        ]})
        resp = admin_client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        assert resp.status_code == 201, resp.data
        assert len(resp.data["created"]) == 1
        assert len(resp.data["failed"]) == 0
        doc = EmployeeDocument.objects.get(employee=employee, type_doc=type_doc)
        assert doc.nb_fichiers == 1

    def test_split_single_pdf_into_two_groups(self, admin_client, employee):
        type_a = TypeDocument.objects.create(nom="Acte naissance", code="ACTE_NAISS", is_active=True)
        type_b = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        file = SimpleUploadedFile("scan.pdf", self._pdf_bytes(5), content_type="application/pdf")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_a.id), "parts": [{"file_index": 0, "pages": [1, 2, 3]}]},
            {"type_doc": str(type_b.id), "parts": [{"file_index": 0, "pages": [4, 5]}]},
        ]})
        resp = admin_client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        assert resp.status_code == 201, resp.data
        assert len(resp.data["created"]) == 2
        doc_a = EmployeeDocument.objects.get(employee=employee, type_doc=type_a)
        doc_b = EmployeeDocument.objects.get(employee=employee, type_doc=type_b)
        assert doc_a.nb_fichiers == 1
        assert doc_b.nb_fichiers == 1

    def test_consultant_forbidden(self, consultant_client, employee):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        file = SimpleUploadedFile("cv.pdf", self._pdf_bytes(1), content_type="application/pdf")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "parts": [{"file_index": 0, "pages": [1]}]}
        ]})
        resp = consultant_client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        assert resp.status_code == 403

    def test_creates_new_version_if_type_already_has_active_document(self, admin_client, employee):
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc)
        file = SimpleUploadedFile("cv.pdf", self._pdf_bytes(1), content_type="application/pdf")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "parts": [{"file_index": 0, "pages": [1]}]}
        ]})
        resp = admin_client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        assert resp.status_code == 201
        docs = EmployeeDocument.objects.filter(employee=employee, type_doc=type_doc)
        assert docs.count() == 2
        assert docs.get(is_active=True).version == 2

    def test_one_group_failure_does_not_block_others(self, admin_client, employee):
        type_ok = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        type_fail = TypeDocument.objects.create(nom="Diplome", code="DIPLOME", is_active=True)
        file = SimpleUploadedFile("scan.pdf", self._pdf_bytes(2), content_type="application/pdf")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_ok.id), "parts": [{"file_index": 0, "pages": [1]}]},
            {"type_doc": str(type_fail.id), "parts": [{"file_index": 0, "pages": [99]}]},
        ]})
        resp = admin_client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        assert resp.status_code == 201, resp.data
        assert len(resp.data["created"]) == 1
        assert len(resp.data["failed"]) == 1
        assert EmployeeDocument.objects.filter(employee=employee, type_doc=type_ok).exists()
        assert not EmployeeDocument.objects.filter(employee=employee, type_doc=type_fail).exists()

    def test_audit_log_entry_per_document_created(self, admin_client, employee):
        from audit.models import AuditLog
        type_doc = TypeDocument.objects.create(nom="CV", code="CV", is_active=True)
        file = SimpleUploadedFile("cv.pdf", self._pdf_bytes(1), content_type="application/pdf")
        plan = json.dumps({"groups": [
            {"type_doc": str(type_doc.id), "parts": [{"file_index": 0, "pages": [1]}]}
        ]})
        before = AuditLog.objects.filter(action=AuditLog.Action.UPLOAD).count()
        admin_client.post(self._url(employee), {"files": [file], "plan": plan}, format="multipart")
        after = AuditLog.objects.filter(action=AuditLog.Action.UPLOAD).count()
        assert after == before + 1
```

Si les fixtures `admin_client`, `consultant_client`, `employee` n'existent pas exactement sous ces noms, ouvrir `backend/tests/test_document_upload.py` et reprendre exactement les noms de fixtures qui y sont utilisées (probablement définies dans `backend/tests/conftest.py`).

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd backend && pytest tests/test_scan_import.py::TestScanImportView -v`
Expected: FAIL — 404 (route inexistante) ou erreur d'import.

- [ ] **Step 3: Implémenter `ScanImportView`**

Ajouter à `backend/employees/views.py`, juste après `DocumentListUploadView` (après la ligne 451, avant `class FileViewerView`) :

```python
class ScanImportView(APIView):
    """
    POST /api/employees/{emp_id}/documents/scan-import/
    Import groupé : plusieurs fichiers scannés (PDF multi-pages et/ou
    images) répartis en groupes, chaque groupe devenant un
    EmployeeDocument. Un groupe qui échoue (page hors limites, etc.)
    n'annule pas les autres — chaque groupe est traité indépendamment.
    """
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAdmin]

    def post(self, request, emp_id):
        employee = resolve_employee(emp_id)

        serializer = ScanImportSerializer(data={
            'files': request.FILES.getlist('files'),
            'plan': request.data.get('plan', ''),
        })
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        created = []
        failed = []

        for group in serializer.validated_data['groups']:
            type_doc = group['type_doc']
            try:
                with transaction.atomic():
                    doc = EmployeeDocument.objects.create(
                        employee=employee,
                        type_doc=type_doc,
                        uploaded_by=request.user,
                        notes=group.get('notes', ''),
                    )
                    for ordre, part in enumerate(group['parts'], start=1):
                        source_file = part['file']
                        if part['is_image'] or part['pages'] is None:
                            source_file.seek(0)
                            file_to_save = source_file
                            file_name = source_file.name
                        else:
                            total_pages = pdf_page_count(source_file)
                            if list(part['pages']) == list(range(1, total_pages + 1)):
                                source_file.seek(0)
                                file_to_save = source_file
                                file_name = source_file.name
                            else:
                                extracted = extract_pdf_pages(source_file, part['pages'])
                                base_name = os.path.splitext(source_file.name)[0]
                                file_name = f"{base_name}_p{'-'.join(map(str, part['pages']))}.pdf"
                                file_to_save = File(extracted, name=file_name)

                        file_to_save.seek(0) if hasattr(file_to_save, 'seek') else None
                        mime = magic.from_buffer(file_to_save.read(2048), mime=True)
                        file_to_save.seek(0)
                        EmployeeDocumentFile.objects.create(
                            document=doc,
                            file=file_to_save,
                            file_name=file_name,
                            file_size=getattr(source_file, 'size', None) or file_to_save.size,
                            mime_type=mime,
                            ordre=ordre,
                        )

                AuditLog.log(
                    request, AuditLog.Action.UPLOAD,
                    target=doc,
                    details={
                        'type': doc.type_doc.code,
                        'version': doc.version,
                        'nb_fichiers': doc.nb_fichiers,
                        'via': 'scan_import',
                    }
                )
                created.append({
                    'type_doc': str(type_doc.id),
                    'type_doc_nom': type_doc.nom,
                    'document_id': str(doc.id),
                })
            except PdfExtractionError as exc:
                failed.append({'type_doc': str(type_doc.id), 'type_doc_nom': type_doc.nom, 'error': str(exc)})

        return Response(
            {'created': created, 'failed': failed},
            status=status.HTTP_201_CREATED
        )
```

Ajouter les imports nécessaires en tête de `backend/employees/views.py` :

```python
from django.core.files.base import File
from django.db import transaction
from employees.pdf_utils import pdf_page_count, extract_pdf_pages, PdfExtractionError
```

Et ajouter `ScanImportSerializer` à l'import existant depuis `employees.serializers` (ligne 33-43).

- [ ] **Step 4: Ajouter la route**

Dans `backend/employees/urls.py`, juste après la ligne définissant `doc-list-upload` (ligne 36) :

```python
    path('employees/<str:emp_id>/documents/scan-import/', ScanImportView.as_view(), name='doc-scan-import'),
```

Ajouter `ScanImportView` à l'import des vues en tête du fichier (suivre le pattern d'import déjà utilisé pour `DocumentListUploadView`).

- [ ] **Step 5: Lancer les tests pour vérifier le succès**

Run: `cd backend && pytest tests/test_scan_import.py -v`
Expected: tous les tests passent (17 au total en comptant Tasks 1 et 2)

- [ ] **Step 6: Lancer la suite complète backend (règle CLAUDE.md — toute modification touchant `employees`)**

Run: `cd backend && pytest`
Expected: tous les tests passent, aucune régression sur `test_document_upload.py` ou autres.

- [ ] **Step 7: Commit**

```bash
git add backend/employees/views.py backend/employees/urls.py backend/tests/test_scan_import.py
git commit -m "feat(scan-import): endpoint ScanImportView pour l'import groupe de documents scannes"
```

---

### Task 4: `ScanImportModal` — sélection de fichiers + génération des miniatures

**Files:**
- Create: `frontend/src/components/ScanImportModal.jsx`
- Test: `frontend/src/__tests__/ScanImportModal.test.jsx`

**Interfaces:**
- Consumes: `theme` (`frontend/src/styles/theme.js`), `useConfirm` (`frontend/src/components/ConfirmDialog.jsx`), `react-pdf` (`Document`, `Page`, `pdfjs` — mêmes imports/config worker que `SecureDocViewer.jsx:1-8`), `api` (`frontend/src/services/api.js`).
- Produces: composant `ScanImportModal({ employeeId, typesDocumentsList, onClose, onImported })` :
  - `employeeId: string` — id/matricule de l'employé courant.
  - `typesDocumentsList: array` — même forme que dans `EmployeeDetail.jsx` (`{id, code, nom, parent_nom, is_categorie}`).
  - `onClose: () => void`.
  - `onImported: () => void` — appelé après un import réussi (au moins un groupe créé), pour que le parent rafraîchisse la liste de documents.

Cette tâche couvre uniquement la sélection de fichiers et le calcul de la liste de pages (pas encore le rendu visuel des miniatures ni les groupes — Task 5).

- [ ] **Step 1: Écrire le test en échec pour l'extraction de la liste de pages**

Créer `frontend/src/__tests__/ScanImportModal.test.jsx` :

```jsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ScanImportModal, { buildPageList } from "../components/ScanImportModal";

jest.mock("react-pdf", () => ({
  Document: ({ children, onLoadSuccess }) => {
    onLoadSuccess && onLoadSuccess({ numPages: 3 });
    return <div data-testid="pdf-document">{children}</div>;
  },
  Page: ({ pageNumber }) => <div data-testid={`pdf-page-${pageNumber}`} />,
  pdfjs: { GlobalWorkerOptions: {} },
}));

jest.mock("../services/api", () => ({
  post: jest.fn(),
}));

describe("buildPageList", () => {
  it("returns one page entry per PDF page", () => {
    const files = [{ name: "scan.pdf", type: "application/pdf" }];
    const pageCounts = [3];
    const result = buildPageList(files, pageCounts);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ fileIndex: 0, pageNum: 1, fileName: "scan.pdf" });
    expect(result[2]).toMatchObject({ fileIndex: 0, pageNum: 3, fileName: "scan.pdf" });
  });

  it("returns a single entry for an image file", () => {
    const files = [{ name: "photo.jpg", type: "image/jpeg" }];
    const pageCounts = [1];
    const result = buildPageList(files, pageCounts);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ fileIndex: 0, pageNum: 1, isImage: true });
  });

  it("concatenates entries across multiple files in order", () => {
    const files = [
      { name: "a.pdf", type: "application/pdf" },
      { name: "b.jpg", type: "image/jpeg" },
    ];
    const pageCounts = [2, 1];
    const result = buildPageList(files, pageCounts);
    expect(result.map((p) => `${p.fileIndex}-${p.pageNum}`)).toEqual([
      "0-1", "0-2", "1-1",
    ]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd frontend && npx jest ScanImportModal -t "buildPageList" --no-coverage`
Expected: FAIL — module `../components/ScanImportModal` introuvable.

- [ ] **Step 3: Implémenter le squelette de `ScanImportModal.jsx`**

```jsx
import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { theme } from "../styles/theme";
import { useConfirm } from "./ConfirmDialog";
import api from "../services/api";

pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.js`;

const MAX_FILES = 20;
const MAX_TOTAL_PAGES = 100;

// Construit une liste plate d'entrées "page" à partir des fichiers
// sélectionnés — un PDF de N pages contribue N entrées, une image en
// contribue une seule. Ordre = ordre des fichiers, puis ordre des pages.
export function buildPageList(files, pageCounts) {
  const entries = [];
  files.forEach((file, fileIndex) => {
    const isImage = file.type?.startsWith("image/");
    const count = pageCounts[fileIndex] || 1;
    for (let pageNum = 1; pageNum <= count; pageNum++) {
      entries.push({
        id: `${fileIndex}-${pageNum}`,
        fileIndex,
        fileName: file.name,
        pageNum,
        isImage,
      });
    }
  });
  return entries;
}

const ScanImportModal = ({ employeeId, typesDocumentsList, onClose, onImported }) => {
  const { confirm, ConfirmDialog } = useConfirm();
  const [files, setFiles] = useState([]);
  const [pageCounts, setPageCounts] = useState([]);
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(null);

  const handleFilesSelected = useCallback((e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    if (selected.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} fichiers par import.`);
      return;
    }
    setError(null);
    setFiles(selected);
    setPageCounts(new Array(selected.length).fill(null));
    setPages([]);
  }, []);

  const handlePdfLoadSuccess = useCallback((fileIndex, numPages) => {
    setPageCounts((prev) => {
      const next = [...prev];
      next[fileIndex] = numPages;
      if (next.every((c) => c !== null)) {
        const list = buildPageList(files, next);
        if (list.length > MAX_TOTAL_PAGES) {
          setError(`Maximum ${MAX_TOTAL_PAGES} pages au total.`);
        } else {
          setPages(list);
        }
      }
      return next;
    });
  }, [files]);

  const handleClose = async () => {
    if (pages.length > 0) {
      if (!(await confirm("Fermer sans importer ? Le tri effectué sera perdu."))) return;
    }
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: theme.surface, borderRadius: 16, padding: 24, width: "min(960px, 92vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: theme.shadowMd }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Scanner un dossier</div>
          <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", color: theme.textMuted, fontSize: 20 }}>×</button>
        </div>

        {error && (
          <div style={{ color: theme.danger, fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}

        {files.length === 0 && (
          <label
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `2px dashed ${theme.border}`, borderRadius: 12, padding: 40,
              cursor: "pointer", color: theme.textSecondary, fontSize: 13,
            }}
          >
            Cliquez ou déposez un ou plusieurs fichiers PDF / images
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.tiff"
              onChange={handleFilesSelected}
              style={{ display: "none" }}
            />
          </label>
        )}

        {files.filter((f) => f.type === "application/pdf").map((file, i) => {
          const fileIndex = files.indexOf(file);
          return (
            <div key={fileIndex} style={{ display: "none" }}>
              <Document file={file} onLoadSuccess={({ numPages }) => handlePdfLoadSuccess(fileIndex, numPages)}>
                <Page pageNumber={1} width={1} />
              </Document>
            </div>
          );
        })}

        {/* Grille de miniatures et groupes : Task 5 */}
      </div>
      {ConfirmDialog}
    </div>
  );
};

export default ScanImportModal;
```

Note d'implémentation : le bloc `Document`/`Page` caché ci-dessus ne sert dans cette tâche qu'à déclencher `onLoadSuccess` pour connaître `numPages` par fichier — le rendu visuel réel des miniatures (une `<Page>` par page, visible, dans la grille) est ajouté en Task 5 en remplaçant ce bloc.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd frontend && npx jest ScanImportModal -t "buildPageList" --no-coverage`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ScanImportModal.jsx frontend/src/__tests__/ScanImportModal.test.jsx
git commit -m "feat(scan-import): squelette ScanImportModal avec selection de fichiers"
```

---

### Task 5: Grille de miniatures + sélection intelligente + groupes

**Files:**
- Modify: `frontend/src/components/ScanImportModal.jsx`
- Modify: `frontend/src/__tests__/ScanImportModal.test.jsx`

**Interfaces:**
- Consumes: `buildPageList` (Task 4), `pages` state (Task 4).
- Produces (nouvel état interne, pas exporté — consommé uniquement par Task 6 dans le même fichier) :
  - `groups: array<{ id, typeDocId, pageIds: string[] }>`.
  - `selectedPageIds: Set<string>`.
  - fonction `assignSelectionToType(typeDocId)` — crée/étend un groupe à partir de `selectedPageIds`.
  - fonction `unassignedPageIds` (dérivé) — pages présentes dans `pages` mais absentes de tout groupe.

- [ ] **Step 1: Écrire les tests en échec pour la logique de sélection/groupement**

Ajouter à `frontend/src/__tests__/ScanImportModal.test.jsx` :

```jsx
import userEvent from "@testing-library/user-event";
import api from "../services/api";

const flushPdfLoad = async () => {
  await waitFor(() => screen.getByTestId("pdf-document"));
};

describe("ScanImportModal - sélection et groupes", () => {
  const typesDocumentsList = [
    { id: "type-a", code: "CV", nom: "CV", parent_nom: null, is_categorie: false },
    { id: "type-b", code: "DIPLOME", nom: "Diplôme", parent_nom: null, is_categorie: false },
  ];

  const selectFile = async (input, file) => {
    await userEvent.upload(input, file);
  };

  it("clicking one page selects every page of its source file by default", async () => {
    render(
      <ScanImportModal
        employeeId="EMP001"
        typesDocumentsList={typesDocumentsList}
        onClose={jest.fn()}
        onImported={jest.fn()}
      />
    );
    const file = new File(["pdf"], "scan.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/cliquez ou déposez/i, { selector: "input" });
    await selectFile(input, file);
    await flushPdfLoad();

    const firstThumb = await screen.findByTestId("scan-page-0-1");
    await userEvent.click(firstThumb);

    expect(screen.getByTestId("scan-page-0-1")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("scan-page-0-2")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("scan-page-0-3")).toHaveAttribute("data-selected", "true");
  });

  it("shift-click narrows selection to a specific page range within the file", async () => {
    render(
      <ScanImportModal
        employeeId="EMP001"
        typesDocumentsList={typesDocumentsList}
        onClose={jest.fn()}
        onImported={jest.fn()}
      />
    );
    const file = new File(["pdf"], "scan.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/cliquez ou déposez/i, { selector: "input" });
    await selectFile(input, file);
    await flushPdfLoad();

    const page1 = await screen.findByTestId("scan-page-0-1");
    const page2 = screen.getByTestId("scan-page-0-2");
    await userEvent.click(page1);
    fireEvent.click(page2, { shiftKey: true });

    expect(screen.getByTestId("scan-page-0-1")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("scan-page-0-2")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("scan-page-0-3")).toHaveAttribute("data-selected", "false");
  });

  it("assigning a type to a selection creates a highlighted group", async () => {
    render(
      <ScanImportModal
        employeeId="EMP001"
        typesDocumentsList={typesDocumentsList}
        onClose={jest.fn()}
        onImported={jest.fn()}
      />
    );
    const file = new File(["pdf"], "scan.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/cliquez ou déposez/i, { selector: "input" });
    await selectFile(input, file);
    await flushPdfLoad();

    const page1 = await screen.findByTestId("scan-page-0-1");
    await userEvent.click(page1);

    const select = screen.getByTestId("scan-assign-type-select");
    await userEvent.selectOptions(select, "type-a");
    await userEvent.click(screen.getByTestId("scan-assign-button"));

    expect(await screen.findByText(/CV — 3 page/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd frontend && npx jest ScanImportModal -t "sélection et groupes" --no-coverage`
Expected: FAIL — `data-testid="scan-page-0-1"` introuvable (grille pas encore rendue).

- [ ] **Step 3: Implémenter la grille et la logique de groupes**

Remplacer dans `ScanImportModal.jsx` la section commentée `{/* Grille de miniatures et groupes : Task 5 */}` et le bloc `Document`/`Page` caché, par :

```jsx
  const [groups, setGroups] = useState([]); // {id, typeDocId, pageIds: []}
  const [selectedPageIds, setSelectedPageIds] = useState(new Set());
  const [lastClickedId, setLastClickedId] = useState(null);
  const [assignTypeId, setAssignTypeId] = useState(typesDocumentsList[0]?.id || "");

  const pageIdOf = (fileIndex, pageNum) => `${fileIndex}-${pageNum}`;

  const groupIdForPage = (pageId) => {
    const g = groups.find((grp) => grp.pageIds.includes(pageId));
    return g ? g.id : null;
  };

  const handlePageClick = (page, e) => {
    const pageId = page.id;
    if (e.shiftKey && lastClickedId) {
      const [lastFileIndex, lastPageNum] = lastClickedId.split("-").map(Number);
      if (lastFileIndex === page.fileIndex) {
        const [lo, hi] = [lastPageNum, page.pageNum].sort((a, b) => a - b);
        const rangeIds = pages
          .filter((p) => p.fileIndex === page.fileIndex && p.pageNum >= lo && p.pageNum <= hi)
          .map((p) => p.id);
        setSelectedPageIds(new Set(rangeIds));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedPageIds((prev) => {
        const next = new Set(prev);
        next.has(pageId) ? next.delete(pageId) : next.add(pageId);
        return next;
      });
      setLastClickedId(pageId);
      return;
    }
    // Clic simple : sélectionne toutes les pages du même fichier source.
    const sameFileIds = pages.filter((p) => p.fileIndex === page.fileIndex).map((p) => p.id);
    setSelectedPageIds(new Set(sameFileIds));
    setLastClickedId(pageId);
  };

  const assignSelectionToType = () => {
    if (!assignTypeId || selectedPageIds.size === 0) return;
    const selectedIds = Array.from(selectedPageIds);
    setGroups((prev) => {
      // Retire les pages sélectionnées de tout groupe existant (une page
      // appartient à au plus un groupe), puis crée/étend le groupe cible.
      const cleaned = prev
        .map((g) => ({ ...g, pageIds: g.pageIds.filter((id) => !selectedIds.includes(id)) }))
        .filter((g) => g.pageIds.length > 0);
      const existingTarget = cleaned.find((g) => g.typeDocId === assignTypeId);
      if (existingTarget) {
        return cleaned.map((g) =>
          g.id === existingTarget.id
            ? { ...g, pageIds: [...g.pageIds, ...selectedIds] }
            : g
        );
      }
      return [...cleaned, { id: `grp-${Date.now()}`, typeDocId: assignTypeId, pageIds: selectedIds }];
    });
    setSelectedPageIds(new Set());
  };

  const unassignedCount = pages.filter((p) => !groupIdForPage(p.id)).length;

  const groupColors = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe", "#fee2e2"];
  const colorForGroup = (groupId) => {
    const idx = groups.findIndex((g) => g.id === groupId);
    return groupColors[idx % groupColors.length];
  };
```

Puis, à la place du rendu caché de `Document`/`Page`, deux blocs distincts : un bloc caché pour connaître `numPages` de chaque PDF (identique à Task 4), et la grille visible :

```jsx
        {files.filter((f) => f.type === "application/pdf").map((file) => {
          const fileIndex = files.indexOf(file);
          return (
            <div key={fileIndex} style={{ display: "none" }}>
              <Document file={file} onLoadSuccess={({ numPages }) => handlePdfLoadSuccess(fileIndex, numPages)}>
                <Page pageNumber={1} width={1} />
              </Document>
            </div>
          );
        })}

        {pages.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <select
                data-testid="scan-assign-type-select"
                value={assignTypeId}
                onChange={(e) => setAssignTypeId(e.target.value)}
                className="input-focus"
                style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12 }}
              >
                {typesDocumentsList.filter((t) => !t.is_categorie).map((t) => (
                  <option key={t.id} value={t.id}>{t.nom}</option>
                ))}
              </select>
              <button
                data-testid="scan-assign-button"
                onClick={assignSelectionToType}
                disabled={selectedPageIds.size === 0}
                className="btn-lift"
                style={{
                  background: selectedPageIds.size === 0 ? theme.border : theme.primary,
                  color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px",
                  fontSize: 12, fontWeight: 700, cursor: selectedPageIds.size === 0 ? "not-allowed" : "pointer",
                }}
              >
                Assigner ({selectedPageIds.size})
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, marginBottom: 16 }}>
              {pages.map((page) => {
                const groupId = groupIdForPage(page.id);
                const isSelected = selectedPageIds.has(page.id);
                return (
                  <div
                    key={page.id}
                    data-testid={`scan-page-${page.id}`}
                    data-selected={isSelected ? "true" : "false"}
                    onClick={(e) => handlePageClick(page, e)}
                    style={{
                      border: `2px solid ${isSelected ? theme.primary : theme.border}`,
                      background: groupId ? colorForGroup(groupId) : theme.surface,
                      borderRadius: 8, padding: 6, cursor: "pointer", textAlign: "center", fontSize: 10,
                    }}
                  >
                    <div style={{ width: "100%", aspectRatio: "3/4", background: "#F1F5F9", borderRadius: 4, marginBottom: 4, overflow: "hidden" }}>
                      {page.isImage ? (
                        <img
                          src={URL.createObjectURL(files[page.fileIndex])}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <Document file={files[page.fileIndex]}>
                          <Page pageNumber={page.pageNum} width={100} />
                        </Document>
                      )}
                    </div>
                    <div style={{ color: theme.textMuted }}>{page.fileName} — p.{page.pageNum}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginBottom: 16 }}>
              {groups.map((g) => {
                const type = typesDocumentsList.find((t) => t.id === g.typeDocId);
                return (
                  <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: colorForGroup(g.id), borderRadius: 6, fontSize: 12, marginBottom: 6 }}>
                    <span>{type?.nom} — {g.pageIds.length} page{g.pageIds.length > 1 ? "s" : ""}</span>
                    <button
                      onClick={() => setGroups((prev) => prev.filter((x) => x.id !== g.id))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: theme.danger, fontSize: 11 }}
                    >
                      Dissoudre
                    </button>
                  </div>
                );
              })}
              {unassignedCount > 0 && (
                <div style={{ color: theme.warning, fontSize: 11 }}>
                  {unassignedCount} page{unassignedCount > 1 ? "s" : ""} non assignée{unassignedCount > 1 ? "s" : ""} — ne sera pas importée.
                </div>
              )}
            </div>
          </>
        )}
```

Ajouter `htmlFor`/`id` reliant le `<label>` et l'`<input>` du Step 3 de Task 4 pour que `getByLabelText` fonctionne dans les tests (`<label htmlFor="scan-file-input">...<input id="scan-file-input" .../></label>`).

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd frontend && npx jest ScanImportModal --no-coverage`
Expected: tous les tests passent (buildPageList + sélection/groupes)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ScanImportModal.jsx frontend/src/__tests__/ScanImportModal.test.jsx
git commit -m "feat(scan-import): grille de miniatures, selection intelligente et groupes"
```

---

### Task 6: Soumission du plan + récapitulatif + intégration `EmployeeDetail.jsx`

**Files:**
- Modify: `frontend/src/components/ScanImportModal.jsx`
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Modify: `frontend/src/__tests__/ScanImportModal.test.jsx`

**Interfaces:**
- Consumes: `groups`, `pages`, `files` (Task 5), `api.post` (`frontend/src/services/api.js`).
- Produces: soumission `POST /employees/{employeeId}/documents/scan-import/` avec `FormData` (`files` + `plan`), affichage du récapitulatif, bouton "Scanner un dossier" dans `EmployeeDetail.jsx`.

- [ ] **Step 1: Écrire le test en échec pour la soumission**

Ajouter à `frontend/src/__tests__/ScanImportModal.test.jsx` :

```jsx
describe("ScanImportModal - soumission", () => {
  const typesDocumentsList = [
    { id: "type-a", code: "CV", nom: "CV", parent_nom: null, is_categorie: false },
  ];

  it("submits the plan with correct file_index/pages and shows the summary", async () => {
    api.post.mockResolvedValue({
      data: { created: [{ type_doc_nom: "CV", document_id: "doc-1" }], failed: [] },
    });
    const onImported = jest.fn();
    render(
      <ScanImportModal
        employeeId="EMP001"
        typesDocumentsList={typesDocumentsList}
        onClose={jest.fn()}
        onImported={onImported}
      />
    );
    const file = new File(["pdf"], "scan.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/cliquez ou déposez/i, { selector: "input" });
    await userEvent.upload(input, file);
    await flushPdfLoad();

    const page1 = await screen.findByTestId("scan-page-0-1");
    await userEvent.click(page1);
    await userEvent.click(screen.getByTestId("scan-assign-button"));

    await userEvent.click(screen.getByTestId("scan-import-submit"));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, formData] = api.post.mock.calls[0];
    expect(url).toBe("/employees/EMP001/documents/scan-import/");
    const plan = JSON.parse(formData.get("plan"));
    expect(plan.groups[0]).toMatchObject({
      type_doc: "type-a",
      parts: [{ file_index: 0, pages: [1, 2, 3] }],
    });

    expect(await screen.findByText(/1 document.*importé/i)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd frontend && npx jest ScanImportModal -t "soumission" --no-coverage`
Expected: FAIL — `data-testid="scan-import-submit"` introuvable.

- [ ] **Step 3: Implémenter la soumission**

Ajouter dans `ScanImportModal.jsx`, après la logique de groupes (Task 5) :

```jsx
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const buildPlan = () => {
    // Regroupe les pages consécutives d'un même fichier au sein d'un
    // groupe en une seule "part" avec la liste ordonnée des numéros de
    // page — le backend n'a pas besoin qu'elles soient contiguës.
    return {
      groups: groups.map((g) => {
        const groupPages = pages.filter((p) => g.pageIds.includes(p.id));
        const byFile = groupPages.reduce((acc, p) => {
          (acc[p.fileIndex] = acc[p.fileIndex] || []).push(p);
          return acc;
        }, {});
        const parts = Object.entries(byFile).map(([fileIndex, pgs]) => {
          const isImage = pgs[0].isImage;
          return isImage
            ? { file_index: Number(fileIndex), is_image: true }
            : { file_index: Number(fileIndex), pages: pgs.map((p) => p.pageNum).sort((a, b) => a - b) };
        });
        return { type_doc: g.typeDocId, notes: "", parts };
      }),
    };
  };

  const handleSubmit = async () => {
    if (groups.length === 0) return;
    setSubmitting(true);
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    formData.append("plan", JSON.stringify(buildPlan()));
    try {
      const resp = await api.post(`/employees/${employeeId}/documents/scan-import/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(resp.data);
      if (resp.data.created.length > 0) onImported();
    } catch (err) {
      setResult({ created: [], failed: [{ error: err.response?.data?.error || "Erreur lors de l'import." }] });
    } finally {
      setSubmitting(false);
    }
  };
```

Et le bouton de soumission + récapitulatif, ajoutés juste après le bloc `{unassignedCount > 0 && (...)}` de Task 5 :

```jsx
            {result ? (
              <div style={{ fontSize: 13, color: theme.text }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {result.created.length} document{result.created.length !== 1 ? "s" : ""} importé{result.created.length !== 1 ? "s" : ""}
                </div>
                {result.failed.length > 0 && (
                  <div style={{ color: theme.danger, fontSize: 12, marginBottom: 8 }}>
                    {result.failed.length} échec(s) : {result.failed.map((f) => f.type_doc_nom || f.error).join(", ")}
                  </div>
                )}
                <button onClick={onClose} style={{ background: theme.primary, color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Fermer
                </button>
              </div>
            ) : (
              <button
                data-testid="scan-import-submit"
                onClick={handleSubmit}
                disabled={groups.length === 0 || submitting}
                className="btn-lift"
                style={{
                  background: groups.length === 0 || submitting ? theme.border : theme.primary,
                  color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px",
                  fontSize: 13, fontWeight: 700,
                  cursor: groups.length === 0 || submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Import en cours..." : "Importer"}
              </button>
            )}
```

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd frontend && npx jest ScanImportModal --no-coverage`
Expected: tous les tests passent

- [ ] **Step 5: Intégrer le bouton dans `EmployeeDetail.jsx`**

Dans `frontend/src/pages/EmployeeDetail.jsx`, ajouter l'import en tête de fichier (après la ligne 13) :

```jsx
import ScanImportModal from "../components/ScanImportModal";
```

Ajouter un state, juste après `const [uploading, setUploading] = useState(false);` (ligne 44) :

```jsx
  const [showScanImport, setShowScanImport] = useState(false);
```

Ajouter le bouton juste avant le `<select>` "Ajouter un document" existant (juste avant la ligne 1536 `Ajouter un document`, à l'intérieur du même bloc de sidebar, avant le `<div>` contenant ce titre) :

```jsx
                  <button
                    onClick={() => setShowScanImport(true)}
                    className="btn-lift"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      width: "100%", background: theme.surface, color: theme.primary,
                      border: `1px solid ${theme.primaryBorder}`, borderRadius: 6,
                      padding: "8px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      marginBottom: 12,
                    }}
                  >
                    <PaperclipIcon size={13} /> Scanner un dossier
                  </button>
```

Ajouter le rendu conditionnel de la modale juste avant la fermeture du composant (chercher où `{ConfirmDialog}` et `{PromptDialog}` sont déjà rendus dans le JSX en fin de fichier, et ajouter juste après) :

```jsx
      {showScanImport && (
        <ScanImportModal
          employeeId={id}
          typesDocumentsList={typesDocumentsList}
          onClose={() => setShowScanImport(false)}
          onImported={() => {
            fetchEmployee();
            fetchContrats();
          }}
        />
      )}
```

- [ ] **Step 6: Lancer la suite complète frontend (règle CLAUDE.md)**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: tous les tests passent, aucune régression sur `EmployeeDetail.test.jsx` ou autres.

- [ ] **Step 7: Test manuel dans le navigateur**

Run: `cd frontend && npm start` (et `cd backend && python manage.py runserver` dans un autre terminal si pas déjà lancé)
- Ouvrir une fiche employé, cliquer "Scanner un dossier".
- Sélectionner un PDF multi-pages réel (3+ pages) : vérifier que les miniatures s'affichent, qu'un clic sélectionne tout le fichier, que Ctrl/Shift-clic affine la sélection.
- Assigner deux groupes différents (ex. pages 1-2 → un type, page 3 → un autre type), cliquer "Importer".
- Vérifier le récapitulatif, fermer la modale, vérifier que les 2 documents apparaissent dans la sidebar Documents avec le bon nombre de pages chacun.
- Tester aussi le cas "plusieurs fichiers" (2 PDF distincts + 1 image), vérifier qu'un clic sélectionne bien tout un fichier à la fois.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ScanImportModal.jsx frontend/src/pages/EmployeeDetail.jsx frontend/src/__tests__/ScanImportModal.test.jsx
git commit -m "feat(scan-import): soumission du plan d'import et bouton Scanner un dossier sur la fiche employe"
```

---

## Self-Review Notes

- **Spec coverage** : point d'entrée (Task 6), sélection fichiers/limites (Task 4), grille de miniatures + sélection intelligente Ctrl/Shift (Task 5), groupes/dropdown type (Task 5), pages non assignées non bloquantes (Task 5/6), découpage PDF backend avec réutilisation du fichier entier si non scindé (Task 3), versioning automatique (Task 3, test dédié), échec partiel par groupe (Task 3, test dédié), audit log une entrée par document (Task 3, test dédié), dépendance pypdf (Task 1) — tous couverts.
- **Hors scope respecté** : pas de tâche touchant `ContratDetail.jsx`, pas de nouveau type d'action d'audit, pas d'OCR.
- **Cohérence des types** : `typesDocumentsList` items utilisent `id` (UUID) partout dans `ScanImportModal` (dropdown, plan envoyé) — cohérent avec `ScanImportSerializer.type_doc` qui est un `PrimaryKeyRelatedField` sur l'id, à la différence du `<select>` d'upload normal dans `EmployeeDetail.jsx` qui utilise `code` (comportement existant non modifié, les deux mécanismes cohabitent sans conflit car ce sont deux endpoints distincts).
