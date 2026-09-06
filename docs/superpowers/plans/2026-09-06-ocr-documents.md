# OCR des documents employés — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un pipeline OCR local (Tesseract), déclenché automatiquement à l'upload, qui alimente une recherche plein texte des documents et propose des suggestions de remplissage de champs employé (validées manuellement par un ADMIN).

**Architecture:** Nouvelle app Django `ocr` (modèle `OcrResult`, tâche Celery `run_ocr`, registre d'extracteurs par `champ_source`). `EmployeeDocumentFile` créé par `DocumentListUploadView`/`ScanImportView` enfile `run_ocr.delay(file.id)`. Un nouveau panneau React "Suggestions OCR" sur `EmployeeDetail.jsx` liste et permet d'appliquer/ignorer les suggestions.

**Tech Stack:** Django 4.2 / DRF, Celery + Redis (broker déjà présent), pytesseract + binaire tesseract-ocr, pdf2image + poppler pour le rendu PDF→image, React 19.

## Global Constraints

- OCR **local uniquement** (Tesseract) — jamais d'appel à une API cloud (conformité Loi 18-07/RGPD).
- **Aucune écriture automatique** sur `Employee`/`EmployeeChampValeur` — toute extraction est une suggestion `en_attente` tant qu'un ADMIN n'a pas cliqué "Appliquer".
- Traitement en tâche de fond (Celery) — l'upload (`DocumentListUploadView.post`, `ScanImportView.post`) ne doit jamais attendre l'OCR.
- Lecture des suggestions/texte OCR : **ADMIN uniquement** (pas de scoping CONSULTANT à gérer en v1).
- Toute action "Appliquer une suggestion" doit être tracée dans `AuditLog` (`Action.MODIFY_EMP`, clé `details.transfer`, même format que le transfert organisationnel/carrière/archivage déjà en place — voir `backend/employees/views.py`, `EmployeeDetailView.perform_update`).
- `OcrResult` est supprimé en cascade avec `EmployeeDocumentFile` (`on_delete=CASCADE`).
- Suivre les conventions déjà en place : `id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`, `db_table` explicite en français-anglais mixte comme le reste du fichier, permissions `IsAdmin`/`IsAdminOrConsultant` de `accounts/permissions.py`.

---

## File Structure

- `backend/ocr/__init__.py`, `apps.py` — nouvelle app Django.
- `backend/ocr/models.py` — modèle `OcrResult`.
- `backend/ocr/migrations/0001_initial.py` — générée par `makemigrations`.
- `backend/ocr/extractors.py` — registre `CHAMP_SOURCE_EXTRACTORS` (regex par `champ_source`) + fonction `extract_fields(champ_source, text)`.
- `backend/ocr/ocr_engine.py` — fonction `run_ocr_on_file(file_path, mime_type) -> (text, confidence)`, isole tout l'appel à pytesseract/pdf2image (mockable dans les tests).
- `backend/ocr/tasks.py` — tâche Celery `run_ocr(file_id)`.
- `backend/ocr/views.py` — `OcrSuggestionListView` (GET par employé), `OcrSuggestionActionView` (POST appliquer/ignorer).
- `backend/ocr/urls.py` — routes de l'app.
- `backend/ocr/tests_extractors.py`, `backend/ocr/tests_views.py`, `backend/ocr/tests_tasks.py` — tests pytest.
- `backend/config/celery.py` — app Celery.
- `backend/config/__init__.py` — importe l'app Celery au démarrage.
- `backend/config/settings.py` — `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`, ajout `'ocr'` à `LOCAL_APPS`.
- `backend/config/urls.py` — `path('api/ocr/', include('ocr.urls'))`.
- `backend/employees/views.py` — dans `DocumentListUploadView.post` et `ScanImportView.post`, après création de chaque `EmployeeDocumentFile`, enfiler `run_ocr.delay(str(file_obj.id))`.
- `backend/requirements.txt` — ajout `celery`, `pytesseract`, `pdf2image`.
- `frontend/src/components/OcrSuggestionsPanel.jsx` — nouveau composant.
- `frontend/src/pages/EmployeeDetail.jsx` — intégration du panneau + badges de statut OCR sur les fichiers.
- `frontend/src/__tests__/OcrSuggestionsPanel.test.js` — tests Jest.

---

### Task 1: App `ocr` — modèle `OcrResult` et migration

**Files:**
- Create: `backend/ocr/__init__.py`
- Create: `backend/ocr/apps.py`
- Create: `backend/ocr/models.py`
- Modify: `backend/config/settings.py` (ajout `'ocr'` à `LOCAL_APPS`)
- Test: `backend/ocr/tests_models.py`

**Interfaces:**
- Produces: `OcrResult` model — champs `file` (`OneToOneField` vers `employees.EmployeeDocumentFile`, `related_name='ocr_result'`, `on_delete=CASCADE`), `status` (`CharField`, choices `PENDING/DONE/FAILED`, default `PENDING`), `raw_text` (`TextField`, blank), `confidence` (`FloatField`, null=True), `extracted_fields` (`JSONField`, default=list), `processed_at` (`DateTimeField`, null=True), `error_message` (`TextField`, blank). `OcrResult.Status` = `TextChoices` avec `PENDING='pending'`, `DONE='done'`, `FAILED='failed'`.

- [ ] **Step 1: Créer l'app et le modèle**

`backend/ocr/__init__.py` :
```python
```

`backend/ocr/apps.py` :
```python
from django.apps import AppConfig


class OcrConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ocr'
    verbose_name = "OCR"
```

`backend/ocr/models.py` :
```python
"""
ocr/models.py
Résultat d'analyse OCR d'un fichier employé — jamais d'écriture directe
sur Employee/EmployeeChampValeur, uniquement des suggestions à valider
(voir docs/superpowers/specs/2026-09-06-ocr-documents-design.md).
"""

from django.db import models


class OcrResult(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'En attente'
        DONE = 'done', 'Terminé'
        FAILED = 'failed', 'Échec'

    file = models.OneToOneField(
        'employees.EmployeeDocumentFile', on_delete=models.CASCADE,
        related_name='ocr_result', verbose_name="Fichier"
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    raw_text = models.TextField(blank=True, verbose_name="Texte extrait")
    confidence = models.FloatField(null=True, blank=True, verbose_name="Confiance")
    extracted_fields = models.JSONField(
        default=list, blank=True, verbose_name="Champs détectés",
        help_text="Liste de {champ_code, valeur, confiance, statut} — statut ∈ en_attente/appliquee/ignoree",
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        db_table = 'ocr_results'
        verbose_name = "Résultat OCR"

    def __str__(self):
        return f"OCR {self.file_id} — {self.status}"
```

Ajouter `'ocr'` dans `LOCAL_APPS` de `backend/config/settings.py` (chercher la liste existante, ex. `LOCAL_APPS = ['accounts', 'employees', 'audit', ...]` et y ajouter `'ocr'`).

- [ ] **Step 2: Générer la migration**

Run: `cd backend && python manage.py makemigrations ocr`
Expected: `Migrations for 'ocr': ocr\migrations\0001_initial.py - Create model OcrResult`

- [ ] **Step 3: Écrire le test du modèle**

`backend/ocr/tests_models.py` :
```python
import pytest
from ocr.models import OcrResult

pytestmark = pytest.mark.django_db


def test_ocr_result_default_status_is_pending(employee_document_file):
    result = OcrResult.objects.create(file=employee_document_file)
    assert result.status == OcrResult.Status.PENDING
    assert result.extracted_fields == []


def test_ocr_result_cascades_on_file_delete(employee_document_file):
    OcrResult.objects.create(file=employee_document_file)
    employee_document_file.delete()
    assert OcrResult.objects.count() == 0
```

Ce test suppose une fixture pytest `employee_document_file` — vérifier dans `backend/tests/conftest.py` si une fixture équivalente existe déjà (ex. `employee`, `type_document`) ; si non, l'ajouter dans `backend/tests/conftest.py` :
```python
@pytest.fixture
def employee_document_file(db, employee, type_document, admin_user):
    from employees.models import EmployeeDocument, EmployeeDocumentFile
    from django.core.files.uploadedfile import SimpleUploadedFile

    doc = EmployeeDocument.objects.create(
        employee=employee, type_doc=type_document, uploaded_by=admin_user
    )
    return EmployeeDocumentFile.objects.create(
        document=doc,
        file=SimpleUploadedFile("test.pdf", b"%PDF-1.4 fake", content_type="application/pdf"),
        file_name="test.pdf",
        file_size=13,
        mime_type="application/pdf",
    )
```
Adapter les noms de fixtures (`employee`, `type_document`, `admin_user`) à ceux réellement présents dans `backend/tests/conftest.py` — les lire avant d'écrire cette fixture.

- [ ] **Step 4: Lancer les migrations et le test**

Run: `cd backend && python manage.py migrate ocr && pytest ocr/tests_models.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add backend/ocr/__init__.py backend/ocr/apps.py backend/ocr/models.py backend/ocr/migrations backend/ocr/tests_models.py backend/config/settings.py backend/tests/conftest.py
git commit -m "feat(ocr): ajoute le modèle OcrResult"
```

---

### Task 2: Extracteurs de champs par `champ_source`

**Files:**
- Create: `backend/ocr/extractors.py`
- Test: `backend/ocr/tests_extractors.py`

**Interfaces:**
- Consumes: rien (module autonome, prend du texte brut en entrée).
- Produces: `extract_fields(champ_source: str, text: str) -> list[dict]` — chaque dict `{champ_code: str, valeur: str, confiance: float}`. Retourne `[]` si `champ_source` n'a pas d'extracteur enregistré ou si aucun candidat trouvé. `CHAMP_SOURCE_EXTRACTORS: dict[str, callable]` — registre exposé pour les tests et pour `ocr/tasks.py` (Task 3).

- [ ] **Step 1: Écrire les tests des extracteurs**

`backend/ocr/tests_extractors.py` :
```python
from ocr.extractors import extract_fields


def test_nin_extractor_finds_18_digit_sequence():
    text = "Nom: DUPONT\nNIN: 123456789012345678\nAutre texte"
    results = extract_fields('nin', text)
    assert len(results) == 1
    assert results[0]['champ_code'] == 'nin'
    assert results[0]['valeur'] == '123456789012345678'
    assert results[0]['confiance'] == 90.0


def test_date_naissance_extractor_finds_date_pattern():
    text = "Né le 15/03/1985 à Alger"
    results = extract_fields('date_naissance', text)
    assert len(results) == 1
    assert results[0]['valeur'] == '15/03/1985'


def test_date_naissance_extractor_finds_multiple_candidates():
    text = "Délivré le 01/01/2020, né le 15/03/1985"
    results = extract_fields('date_naissance', text)
    assert len(results) == 2


def test_unknown_champ_source_returns_empty_list():
    assert extract_fields('champ_inconnu', "peu importe") == []


def test_no_match_returns_empty_list():
    assert extract_fields('nin', "aucun numéro ici") == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest ocr/tests_extractors.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'ocr.extractors'`

- [ ] **Step 3: Implémenter les extracteurs**

`backend/ocr/extractors.py` :
```python
"""
ocr/extractors.py
Règles d'extraction de champs structurés à partir du texte OCR brut,
indexées par le même code `champ_source` que TypeDocument.champ_source
(voir section "Champs cliquables vers le document source" de CLAUDE.md).
Volontairement pas de règles génériques appliquées à tout document —
seuls les champ_source enregistrés ici déclenchent une extraction.
"""

import re


def _extract_nin(text):
    return [
        {'champ_code': 'nin', 'valeur': m.group(0), 'confiance': 90.0}
        for m in re.finditer(r'\b\d{18}\b', text)
    ]


def _extract_date(champ_code):
    def extractor(text):
        return [
            {'champ_code': champ_code, 'valeur': m.group(0), 'confiance': 75.0}
            for m in re.finditer(r'\b\d{2}/\d{2}/\d{4}\b', text)
        ]
    return extractor


CHAMP_SOURCE_EXTRACTORS = {
    'nin': _extract_nin,
    'date_naissance': _extract_date('date_naissance'),
    'date_embauche': _extract_date('date_embauche'),
}


def extract_fields(champ_source, text):
    extractor = CHAMP_SOURCE_EXTRACTORS.get(champ_source)
    if extractor is None or not text:
        return []
    return extractor(text)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest ocr/tests_extractors.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/ocr/extractors.py backend/ocr/tests_extractors.py
git commit -m "feat(ocr): ajoute les extracteurs de champs par champ_source"
```

---

### Task 3: Moteur OCR (Tesseract) isolé et mockable

**Files:**
- Create: `backend/ocr/ocr_engine.py`
- Modify: `backend/requirements.txt`
- Test: `backend/ocr/tests_ocr_engine.py`

**Interfaces:**
- Consumes: rien de spécifique au projet — reçoit un chemin de fichier disque et un mime type.
- Produces: `run_ocr_on_file(file_path: str, mime_type: str) -> tuple[str, float]` — retourne `(texte_concaténé, confiance_moyenne)`. Lève `OcrEngineError` (définie dans ce module) en cas d'échec (fichier illisible, tesseract absent, etc.) — c'est cette exception que `ocr/tasks.py` (Task 4) doit attraper pour marquer `OcrResult.status = FAILED`.

- [ ] **Step 1: Ajouter les dépendances**

Dans `backend/requirements.txt`, sous la section "Découpage PDF (scan/import)", ajouter :
```
# OCR (analyse de documents scannés)
pytesseract==0.3.13
pdf2image==1.17.0
```

Run: `cd backend && pip install pytesseract==0.3.13 pdf2image==1.17.0`
Expected: installation réussie. Noter dans le commit que les binaires système `tesseract-ocr` et `poppler` doivent être installés séparément (hors pip) sur la machine de dev/prod — pas gérable par pip.

- [ ] **Step 2: Écrire les tests (mockant pytesseract/pdf2image)**

`backend/ocr/tests_ocr_engine.py` :
```python
from unittest.mock import patch, MagicMock
import pytest
from ocr.ocr_engine import run_ocr_on_file, OcrEngineError


@patch('ocr.ocr_engine.pytesseract')
@patch('ocr.ocr_engine.Image')
def test_run_ocr_on_image_returns_text_and_confidence(mock_image, mock_pytesseract):
    mock_image.open.return_value = MagicMock()
    mock_pytesseract.image_to_string.return_value = "Texte détecté"
    mock_pytesseract.image_to_data.return_value = {
        'conf': ['95', '88', '-1']
    }
    mock_pytesseract.Output.DICT = 'dict'

    text, confidence = run_ocr_on_file('/fake/path.png', 'image/png')

    assert text == "Texte détecté"
    assert confidence == pytest.approx(91.5)


@patch('ocr.ocr_engine.convert_from_path')
@patch('ocr.ocr_engine.pytesseract')
def test_run_ocr_on_pdf_concatenates_pages(mock_pytesseract, mock_convert):
    mock_convert.return_value = [MagicMock(), MagicMock()]
    mock_pytesseract.image_to_string.side_effect = ["Page 1", "Page 2"]
    mock_pytesseract.image_to_data.return_value = {'conf': ['80']}
    mock_pytesseract.Output.DICT = 'dict'

    text, confidence = run_ocr_on_file('/fake/path.pdf', 'application/pdf')

    assert text == "Page 1\nPage 2"


@patch('ocr.ocr_engine.pytesseract')
@patch('ocr.ocr_engine.Image')
def test_run_ocr_raises_ocr_engine_error_on_failure(mock_image, mock_pytesseract):
    mock_image.open.side_effect = OSError("fichier corrompu")

    with pytest.raises(OcrEngineError):
        run_ocr_on_file('/fake/path.png', 'image/png')
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest ocr/tests_ocr_engine.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'ocr.ocr_engine'`

- [ ] **Step 4: Implémenter le moteur**

`backend/ocr/ocr_engine.py` :
```python
"""
ocr/ocr_engine.py
Appel isolé à Tesseract (via pytesseract) — jamais d'appel réseau, tout
tourne localement (conformité Loi 18-07/RGPD, voir spec OCR).
"""

import pytesseract
from PIL import Image
from pdf2image import convert_from_path


class OcrEngineError(Exception):
    pass


def _confidence_from_data(data):
    scores = [int(c) for c in data.get('conf', []) if c not in ('-1', -1)]
    return sum(scores) / len(scores) if scores else 0.0


def _ocr_image(image):
    text = pytesseract.image_to_string(image)
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
    return text, _confidence_from_data(data)


def run_ocr_on_file(file_path, mime_type):
    try:
        if mime_type == 'application/pdf':
            pages = convert_from_path(file_path)
            texts, confidences = [], []
            for page in pages:
                text, confidence = _ocr_image(page)
                texts.append(text)
                confidences.append(confidence)
            full_text = "\n".join(texts).strip()
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            return full_text, avg_confidence

        image = Image.open(file_path)
        text, confidence = _ocr_image(image)
        return text.strip(), confidence
    except Exception as exc:
        raise OcrEngineError(str(exc)) from exc
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest ocr/tests_ocr_engine.py -v`
Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add backend/ocr/ocr_engine.py backend/ocr/tests_ocr_engine.py backend/requirements.txt
git commit -m "feat(ocr): ajoute le moteur OCR Tesseract isolé"
```

---

### Task 4: Celery — configuration + tâche `run_ocr`

**Files:**
- Create: `backend/config/celery.py`
- Modify: `backend/config/__init__.py`
- Modify: `backend/config/settings.py`
- Create: `backend/ocr/tasks.py`
- Modify: `backend/requirements.txt`
- Test: `backend/ocr/tests_tasks.py`

**Interfaces:**
- Consumes: `run_ocr_on_file` (Task 3, `ocr/ocr_engine.py`), `extract_fields`/`CHAMP_SOURCE_EXTRACTORS` (Task 2, `ocr/extractors.py`), `OcrResult` (Task 1), `employees.models.EmployeeDocumentFile`.
- Produces: tâche Celery `run_ocr(file_id: str)` (nom d'import : `from ocr.tasks import run_ocr`), appelée en `run_ocr.delay(file_id)` depuis `employees/views.py` (Task 5).

- [ ] **Step 1: Ajouter Celery aux dépendances et à la config Django**

Dans `backend/requirements.txt`, section OCR :
```
celery==5.4.0
```
Run: `cd backend && pip install celery==5.4.0`

`backend/config/celery.py` :
```python
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('config')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
```

`backend/config/__init__.py` — ajouter à la fin (créer le fichier avec ce contenu s'il est vide) :
```python
from .celery import app as celery_app

__all__ = ('celery_app',)
```

Dans `backend/config/settings.py`, ajouter près de la section Redis existante (`REDIS_URL`) :
```python
CELERY_BROKER_URL = config('CELERY_BROKER_URL', default=REDIS_URL or 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CELERY_TASK_SERIALIZER = 'json'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_ALWAYS_EAGER = config('CELERY_TASK_ALWAYS_EAGER', default=False, cast=bool)
```
`CELERY_TASK_ALWAYS_EAGER` permet de faire tourner les tâches de façon synchrone en dev/CI si aucun worker n'est lancé — mettre `CELERY_TASK_ALWAYS_EAGER=True` dans `.env` de dev si besoin.

- [ ] **Step 2: Écrire le test de la tâche (Celery en mode eager)**

`backend/ocr/tests_tasks.py` :
```python
from unittest.mock import patch
import pytest
from ocr.models import OcrResult
from ocr.tasks import run_ocr

pytestmark = pytest.mark.django_db


@patch('ocr.tasks.run_ocr_on_file')
def test_run_ocr_creates_done_result_with_no_champ_source(mock_engine, employee_document_file):
    mock_engine.return_value = ("Texte libre sans champ source", 88.0)

    run_ocr(str(employee_document_file.id))

    result = OcrResult.objects.get(file=employee_document_file)
    assert result.status == OcrResult.Status.DONE
    assert result.raw_text == "Texte libre sans champ source"
    assert result.confidence == 88.0
    assert result.extracted_fields == []


@patch('ocr.tasks.run_ocr_on_file')
def test_run_ocr_extracts_fields_when_champ_source_set(mock_engine, employee_document_file):
    employee_document_file.document.type_doc.champ_source = 'nin'
    employee_document_file.document.type_doc.save()
    mock_engine.return_value = ("NIN: 123456789012345678", 92.0)

    run_ocr(str(employee_document_file.id))

    result = OcrResult.objects.get(file=employee_document_file)
    assert len(result.extracted_fields) == 1
    assert result.extracted_fields[0]['champ_code'] == 'nin'
    assert result.extracted_fields[0]['statut'] == 'en_attente'


@patch('ocr.tasks.run_ocr_on_file')
def test_run_ocr_marks_failed_on_engine_error(mock_engine, employee_document_file):
    from ocr.ocr_engine import OcrEngineError
    mock_engine.side_effect = OcrEngineError("tesseract absent")

    run_ocr(str(employee_document_file.id))

    result = OcrResult.objects.get(file=employee_document_file)
    assert result.status == OcrResult.Status.FAILED
    assert "tesseract absent" in result.error_message


def test_run_ocr_is_idempotent_on_rerun(employee_document_file):
    OcrResult.objects.create(file=employee_document_file, status=OcrResult.Status.DONE, raw_text="ancien")
    with patch('ocr.tasks.run_ocr_on_file', return_value=("nouveau", 50.0)):
        run_ocr(str(employee_document_file.id))
    result = OcrResult.objects.get(file=employee_document_file)
    assert result.raw_text == "nouveau"
    assert OcrResult.objects.filter(file=employee_document_file).count() == 1
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest ocr/tests_tasks.py -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'ocr.tasks'`

- [ ] **Step 4: Implémenter la tâche**

`backend/ocr/tasks.py` :
```python
"""
ocr/tasks.py
Tâche de fond déclenchée à chaque création de EmployeeDocumentFile —
voir employees/views.py (DocumentListUploadView.post, ScanImportView.post).
Idempotente : un ré-appel sur le même file_id met à jour l'OcrResult
existant plutôt que d'en créer un second (OneToOneField).
"""

from django.utils import timezone
from celery import shared_task

from ocr.models import OcrResult
from ocr.ocr_engine import run_ocr_on_file, OcrEngineError
from ocr.extractors import extract_fields


@shared_task
def run_ocr(file_id):
    from employees.models import EmployeeDocumentFile

    try:
        file_obj = EmployeeDocumentFile.objects.select_related(
            'document__type_doc'
        ).get(pk=file_id)
    except EmployeeDocumentFile.DoesNotExist:
        return

    result, _ = OcrResult.objects.get_or_create(file=file_obj)

    try:
        text, confidence = run_ocr_on_file(file_obj.file.path, file_obj.mime_type)
    except OcrEngineError as exc:
        result.status = OcrResult.Status.FAILED
        result.error_message = str(exc)
        result.processed_at = timezone.now()
        result.save(update_fields=['status', 'error_message', 'processed_at'])
        return

    champ_source = file_obj.document.type_doc.champ_source
    fields = []
    if champ_source:
        for candidate in extract_fields(champ_source, text):
            fields.append({**candidate, 'statut': 'en_attente'})

    result.status = OcrResult.Status.DONE
    result.raw_text = text
    result.confidence = confidence
    result.extracted_fields = fields
    result.processed_at = timezone.now()
    result.error_message = ''
    result.save(update_fields=[
        'status', 'raw_text', 'confidence', 'extracted_fields',
        'processed_at', 'error_message',
    ])
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest ocr/tests_tasks.py -v`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add backend/config/celery.py backend/config/__init__.py backend/config/settings.py backend/ocr/tasks.py backend/ocr/tests_tasks.py backend/requirements.txt
git commit -m "feat(ocr): ajoute la configuration Celery et la tâche run_ocr"
```

---

### Task 5: Déclenchement à l'upload

**Files:**
- Modify: `backend/employees/views.py` (`DocumentListUploadView.post`, `ScanImportView.post`)
- Test: `backend/employees/tests.py` (ou fichier de test existant couvrant l'upload — repérer le fichier exact avec `grep -r "DocumentListUploadView" backend/tests` avant d'éditer)

**Interfaces:**
- Consumes: `run_ocr` (Task 4, `from ocr.tasks import run_ocr`).
- Produces: rien de nouveau — modifie un comportement existant (effet de bord après upload).

- [ ] **Step 1: Localiser les tests d'upload existants**

Run: `cd backend && grep -rl "DocumentListUploadView\|documents/scan-import" tests/`
Lire le(s) fichier(s) trouvés pour repérer le pattern de test d'upload déjà en place (client, fixtures, assertions) avant d'y ajouter un test.

- [ ] **Step 2: Écrire le test (mock de la tâche Celery)**

Ajouter dans le fichier de test d'upload identifié à l'étape précédente (adapter le nom du test client/fixture au pattern déjà utilisé dans ce fichier) :
```python
from unittest.mock import patch


@patch('employees.views.run_ocr')
def test_upload_document_enqueues_ocr_task(mock_run_ocr, admin_client, employee, type_document):
    # Réutiliser exactement le même appel POST que le test d'upload existant
    # dans ce fichier (URL, payload multipart) — seule l'assertion change.
    ...
    mock_run_ocr.delay.assert_called_once()
```
Adapter cette ébauche au client/fixtures réels du fichier (ne pas inventer `admin_client`/`employee`/`type_document` s'ils portent un autre nom dans ce projet — copier l'en-tête du test d'upload voisin).

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest <fichier_identifié> -k enqueues_ocr -v`
Expected: FAIL (`AttributeError` ou `NameError: run_ocr`, car pas encore importé/appelé dans `views.py`)

- [ ] **Step 4: Ajouter l'import et l'appel dans `views.py`**

En haut de `backend/employees/views.py`, ajouter avec les autres imports locaux :
```python
from ocr.tasks import run_ocr
```

Dans `DocumentListUploadView.post` (`backend/employees/views.py:736-748`), après la boucle de création des `EmployeeDocumentFile` (juste avant `AuditLog.log(...)`), ajouter :
```python
        for ordre, file in enumerate(serializer.validated_data['files'], start=1):
            file.seek(0)
            mime = magic.from_buffer(file.read(2048), mime=True)
            file.seek(0)
            file_obj = EmployeeDocumentFile.objects.create(
                document=doc,
                file=file,
                file_name=file.name,
                file_size=file.size,
                mime_type=mime,
                ordre=ordre,
            )
            run_ocr.delay(str(file_obj.id))
```
(le seul changement est de capturer `EmployeeDocumentFile.objects.create(...)` dans `file_obj` et d'ajouter la ligne `run_ocr.delay(...)`.)

Dans `ScanImportView.post` (`backend/employees/views.py:837-844`), même changement :
```python
                        file_to_save.seek(0)
                        mime = magic.from_buffer(file_to_save.read(2048), mime=True)
                        file_to_save.seek(0)
                        file_obj = EmployeeDocumentFile.objects.create(
                            document=doc,
                            file=file_to_save,
                            file_name=file_name,
                            file_size=file_to_save.size,
                            mime_type=mime,
                            ordre=ordre,
                        )
                        run_ocr.delay(str(file_obj.id))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest <fichier_identifié> -k enqueues_ocr -v`
Expected: PASS

- [ ] **Step 6: Lancer toute la suite backend pour vérifier l'absence de régression**

Run: `cd backend && pytest`
Expected: tous les tests passent (188 préexistants + les nouveaux). Si un test d'upload échoue parce qu'il ne mocke pas `run_ocr` et que Celery n'est pas configuré en mode eager dans les settings de test, vérifier `CELERY_TASK_ALWAYS_EAGER` dans la config de test (`backend/config/settings.py` ou fichier de settings de test dédié) — le mettre à `True` pour l'environnement de test évite de nécessiter un vrai broker Redis pendant `pytest`.

- [ ] **Step 7: Commit**

```bash
git add backend/employees/views.py backend/tests/
git commit -m "feat(ocr): déclenche l'analyse OCR à chaque upload de fichier"
```

---

### Task 6: Endpoints API — lister et appliquer/ignorer les suggestions

**Files:**
- Create: `backend/ocr/urls.py`
- Create: `backend/ocr/serializers.py`
- Create: `backend/ocr/views.py`
- Modify: `backend/config/urls.py`
- Test: `backend/ocr/tests_views.py`

**Interfaces:**
- Consumes: `OcrResult` (Task 1), `accounts.permissions.IsAdmin`, `employees.models.Employee`/`EmployeeChampValeur`, `audit.models.AuditLog`, `accounts` (`resolve_employee` — repérer son emplacement exact dans `employees/views.py`, probablement `employees/utils.py` ou défini localement ; vérifier avec `grep -n "def resolve_employee" backend/employees/*.py` avant d'écrire ce module).
- Produces: `GET /api/ocr/employees/<uuid:emp_id>/suggestions/` (liste les `extracted_fields` `en_attente` de tous les `OcrResult` liés aux documents de cet employé) ; `POST /api/ocr/suggestions/<uuid:ocr_result_id>/<int:field_index>/appliquer/` et `.../ignorer/` (met à jour `statut` dans `extracted_fields[field_index]`, et pour "appliquer" écrit la valeur dans `Employee` ou `EmployeeChampValeur` selon que `champ_code` est un champ système ou un `ChampPersonnalise.code`).

- [ ] **Step 1: Repérer `resolve_employee` et les permissions**

Run: `cd backend && grep -n "def resolve_employee\|^from\|^import" employees/views.py | head -30`
Noter le chemin d'import exact de `resolve_employee` et de `IsAdmin`/`IsAdminOrConsultant` (`accounts.permissions`) pour les réutiliser tels quels dans `ocr/views.py`.

- [ ] **Step 2: Écrire les tests des endpoints**

`backend/ocr/tests_views.py` :
```python
import pytest
from ocr.models import OcrResult

pytestmark = pytest.mark.django_db


def test_list_suggestions_returns_only_en_attente(admin_client, employee, employee_document_file):
    OcrResult.objects.create(
        file=employee_document_file,
        status=OcrResult.Status.DONE,
        extracted_fields=[
            {'champ_code': 'nin', 'valeur': '111111111111111111', 'confiance': 90.0, 'statut': 'en_attente'},
            {'champ_code': 'nin', 'valeur': '222222222222222222', 'confiance': 90.0, 'statut': 'ignoree'},
        ],
    )
    response = admin_client.get(f'/api/ocr/employees/{employee.id}/suggestions/')
    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]['valeur'] == '111111111111111111'


def test_apply_suggestion_writes_employee_field_and_logs_audit(admin_client, employee, employee_document_file):
    result = OcrResult.objects.create(
        file=employee_document_file,
        status=OcrResult.Status.DONE,
        extracted_fields=[
            {'champ_code': 'nin', 'valeur': '333333333333333333', 'confiance': 90.0, 'statut': 'en_attente'},
        ],
    )
    response = admin_client.post(f'/api/ocr/suggestions/{result.id}/0/appliquer/')
    assert response.status_code == 200

    employee.refresh_from_db()
    assert employee.nin == '333333333333333333'

    result.refresh_from_db()
    assert result.extracted_fields[0]['statut'] == 'appliquee'

    from audit.models import AuditLog
    assert AuditLog.objects.filter(action=AuditLog.Action.MODIFY_EMP).exists()


def test_ignore_suggestion_does_not_write_employee_field(admin_client, employee, employee_document_file):
    result = OcrResult.objects.create(
        file=employee_document_file,
        status=OcrResult.Status.DONE,
        extracted_fields=[
            {'champ_code': 'nin', 'valeur': '444444444444444444', 'confiance': 90.0, 'statut': 'en_attente'},
        ],
    )
    response = admin_client.post(f'/api/ocr/suggestions/{result.id}/0/ignorer/')
    assert response.status_code == 200

    employee.refresh_from_db()
    assert employee.nin != '444444444444444444'
    result.refresh_from_db()
    assert result.extracted_fields[0]['statut'] == 'ignoree'


def test_consultant_cannot_access_suggestions(consultant_client, employee, employee_document_file):
    response = consultant_client.get(f'/api/ocr/employees/{employee.id}/suggestions/')
    assert response.status_code in (403, 404)
```
Vérifier au préalable dans `backend/tests/conftest.py` les noms exacts des fixtures client existantes (`admin_client`, `consultant_client` ou équivalents) et les adapter si différents.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest ocr/tests_views.py -v`
Expected: FAIL (404 — routes inexistantes)

- [ ] **Step 4: Implémenter serializers, vues et urls**

`backend/ocr/serializers.py` :
```python
from rest_framework import serializers


class OcrSuggestionSerializer(serializers.Serializer):
    ocr_result_id = serializers.UUIDField(source='result.id')
    field_index = serializers.IntegerField()
    champ_code = serializers.CharField()
    valeur = serializers.CharField()
    confiance = serializers.FloatField()
    document_id = serializers.UUIDField(source='result.file.document_id')
    file_id = serializers.UUIDField(source='result.file_id')
```

`backend/ocr/views.py` :
```python
"""
ocr/views.py
Lecture et validation manuelle des suggestions OCR — ADMIN uniquement
(voir contrainte globale de la spec/du plan : aucune écriture automatique
sur Employee/EmployeeChampValeur).
"""

from django.http import Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from accounts.permissions import IsAdmin
from employees.views import resolve_employee
from employees.models import ChampPersonnalise, EmployeeChampValeur
from audit.models import AuditLog
from ocr.models import OcrResult

SYSTEM_FIELD_CODES = {
    'nin', 'date_naissance', 'date_embauche', 'rib',
    'numero_secu_sociale', 'groupe_sanguin',
}


class OcrSuggestionListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, emp_id):
        employee = resolve_employee(emp_id)
        results = OcrResult.objects.filter(
            file__document__employee=employee, status=OcrResult.Status.DONE
        ).select_related('file__document')

        suggestions = []
        for result in results:
            for index, field in enumerate(result.extracted_fields):
                if field.get('statut') != 'en_attente':
                    continue
                suggestions.append({
                    'ocr_result_id': result.id,
                    'field_index': index,
                    'champ_code': field['champ_code'],
                    'valeur': field['valeur'],
                    'confiance': field['confiance'],
                    'document_id': result.file.document_id,
                    'file_id': result.file_id,
                })
        return Response(suggestions)


class OcrSuggestionActionView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, ocr_result_id, field_index, action):
        try:
            result = OcrResult.objects.select_related(
                'file__document__employee'
            ).get(pk=ocr_result_id)
        except OcrResult.DoesNotExist:
            raise Http404

        try:
            field = result.extracted_fields[field_index]
        except IndexError:
            raise Http404

        if field.get('statut') != 'en_attente':
            return Response(
                {'error': 'Suggestion déjà traitée.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        employee = result.file.document.employee
        champ_code = field['champ_code']
        valeur = field['valeur']

        if action == 'appliquer':
            ancienne_valeur = self._appliquer_champ(employee, champ_code, valeur)
            AuditLog.log(
                request, AuditLog.Action.MODIFY_EMP,
                target=employee,
                details={'transfer': {champ_code: {'de': ancienne_valeur, 'vers': valeur}}, 'source': 'ocr'}
            )
            field['statut'] = 'appliquee'
        elif action == 'ignorer':
            field['statut'] = 'ignoree'
        else:
            raise Http404

        result.extracted_fields[field_index] = field
        result.save(update_fields=['extracted_fields'])
        return Response({'statut': field['statut']})

    def _appliquer_champ(self, employee, champ_code, valeur):
        if champ_code in SYSTEM_FIELD_CODES:
            ancienne_valeur = getattr(employee, champ_code, '')
            setattr(employee, champ_code, valeur)
            employee.save(update_fields=[champ_code])
            return ancienne_valeur

        try:
            champ = ChampPersonnalise.objects.get(code=champ_code, is_active=True)
        except ChampPersonnalise.DoesNotExist:
            raise Http404("Champ cible introuvable.")

        valeur_obj, _ = EmployeeChampValeur.objects.get_or_create(
            employee=employee, champ=champ, defaults={'valeur': valeur}
        )
        ancienne_valeur = valeur_obj.valeur
        valeur_obj.valeur = valeur
        valeur_obj.save(update_fields=['valeur'])
        return ancienne_valeur
```

`backend/ocr/urls.py` :
```python
from django.urls import path
from ocr.views import OcrSuggestionListView, OcrSuggestionActionView

urlpatterns = [
    path('employees/<uuid:emp_id>/suggestions/', OcrSuggestionListView.as_view(), name='ocr-suggestions-list'),
    path(
        'suggestions/<uuid:ocr_result_id>/<int:field_index>/<str:action>/',
        OcrSuggestionActionView.as_view(), name='ocr-suggestion-action'
    ),
]
```

Dans `backend/config/urls.py`, ajouter dans la liste `urlpatterns` (près des autres `include('...urls')`) :
```python
    path('api/ocr/', include('ocr.urls')),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest ocr/tests_views.py -v`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add backend/ocr/serializers.py backend/ocr/views.py backend/ocr/urls.py backend/ocr/tests_views.py backend/config/urls.py
git commit -m "feat(ocr): ajoute les endpoints de suggestions OCR (liste, appliquer, ignorer)"
```

---

### Task 7: Badge de statut OCR sur les fichiers (API + UI)

**Files:**
- Modify: `backend/employees/serializers.py` (exposer le statut OCR sur `EmployeeDocumentSerializer`/le serializer de fichier — repérer le nom exact du serializer de `EmployeeDocumentFile` avant d'éditer)
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Test: `backend/employees/tests.py` (fichier à identifier), `frontend/src/__tests__/EmployeeDetail.test.js` (si un test de rendu de la sidebar Documents existe déjà — l'étendre plutôt que dupliquer)

**Interfaces:**
- Consumes: `OcrResult.status` (Task 1).
- Produces: champ `ocr_status` (`'pending' | 'done' | 'failed' | null`, `null` si aucun `OcrResult`) exposé sur chaque fichier retourné par l'API documents.

- [ ] **Step 1: Repérer le serializer de fichier**

Run: `cd backend && grep -n "class.*Serializer" employees/serializers.py`
Identifier le serializer qui sérialise `EmployeeDocumentFile` (probablement `EmployeeDocumentFileSerializer`, imbriqué dans `EmployeeDocumentSerializer`).

- [ ] **Step 2: Écrire le test backend**

Ajouter dans le fichier de test identifié (même pattern que Task 5 Step 1) :
```python
def test_document_file_exposes_ocr_status(admin_client, employee, employee_document_file):
    from ocr.models import OcrResult
    OcrResult.objects.create(file=employee_document_file, status=OcrResult.Status.DONE)

    response = admin_client.get(f'/api/employees/{employee.id}/documents/')
    fichier = response.data[0]['fichiers'][0]
    assert fichier['ocr_status'] == 'done'


def test_document_file_ocr_status_is_null_without_result(admin_client, employee, employee_document_file):
    response = admin_client.get(f'/api/employees/{employee.id}/documents/')
    fichier = response.data[0]['fichiers'][0]
    assert fichier['ocr_status'] is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest <fichier_identifié> -k ocr_status -v`
Expected: FAIL (`KeyError: 'ocr_status'`)

- [ ] **Step 4: Ajouter le champ au serializer**

Dans le serializer de `EmployeeDocumentFile` repéré à l'étape 1, ajouter :
```python
    ocr_status = serializers.SerializerMethodField()

    def get_ocr_status(self, obj):
        result = getattr(obj, 'ocr_result', None)
        return result.status if result else None
```
Et l'ajouter à `Meta.fields` de ce serializer (chercher la ligne `fields = [...]` existante et y insérer `'ocr_status'`).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest <fichier_identifié> -k ocr_status -v`
Expected: 2 passed

- [ ] **Step 6: Ajouter le badge côté frontend**

Dans `frontend/src/pages/EmployeeDetail.jsx`, repérer l'endroit où chaque fichier de la sidebar Documents affiche déjà ses métadonnées (taille, date — voir section "Scanner et import complet" de `CLAUDE.md`, `formatSizeMo`/`formatDateTime`). Ajouter à côté :
```jsx
{fichier.ocr_status === 'pending' && (
  <span style={{ fontSize: 11, color: theme.textSecondary }}>⏳ Analyse en cours</span>
)}
{fichier.ocr_status === 'done' && (
  <span style={{ fontSize: 11, color: theme.primary }}>✓ Analysé</span>
)}
{fichier.ocr_status === 'failed' && (
  <span style={{ fontSize: 11, color: theme.danger }}>✗ Échec d'analyse</span>
)}
```
(Utiliser les tokens `theme.textSecondary`/`theme.primary`/`theme.danger` déjà importés dans ce fichier — ne pas hardcoder de hex, voir règle absolue de `CLAUDE.md`.)

- [ ] **Step 7: Tester manuellement dans le navigateur**

Lancer le backend (`python manage.py runserver`) et le frontend (`npm start`), uploader un document sur une fiche employé, vérifier que le badge "⏳ Analyse en cours" apparaît puis passe à "✓ Analysé" après rafraîchissement (le worker Celery doit tourner : `celery -A config worker -l info` dans un terminal séparé, ou `CELERY_TASK_ALWAYS_EAGER=True` en dev pour un traitement synchrone immédiat).

- [ ] **Step 8: Commit**

```bash
git add backend/employees/serializers.py frontend/src/pages/EmployeeDetail.jsx backend/employees/tests.py
git commit -m "feat(ocr): affiche le statut d'analyse OCR sur chaque fichier"
```

---

### Task 8: Panneau "Suggestions OCR" (frontend)

**Files:**
- Create: `frontend/src/components/OcrSuggestionsPanel.jsx`
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Create: `frontend/src/__tests__/OcrSuggestionsPanel.test.js`

**Interfaces:**
- Consumes: `GET /api/ocr/employees/<id>/suggestions/`, `POST /api/ocr/suggestions/<id>/<index>/appliquer/`, `POST /api/ocr/suggestions/<id>/<index>/ignorer/` (Task 6). `useConfirm()` de `components/ConfirmDialog.jsx` (voir section "Confirmations & saisies" de `CLAUDE.md`) pour confirmer "Appliquer" (écrase potentiellement une valeur existante).
- Produces: composant `<OcrSuggestionsPanel employeeId={employee.id} />` — exporté par défaut, monté dans `EmployeeDetail.jsx` (ADMIN only, `user?.role === 'ADMIN'`).

- [ ] **Step 1: Écrire le test du composant**

`frontend/src/__tests__/OcrSuggestionsPanel.test.js` :
```jsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import axios from 'axios';
import OcrSuggestionsPanel from '../components/OcrSuggestionsPanel';

jest.mock('axios');

const suggestion = {
  ocr_result_id: 'r1',
  field_index: 0,
  champ_code: 'nin',
  valeur: '123456789012345678',
  confiance: 90,
  document_id: 'd1',
  file_id: 'f1',
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('affiche une liste vide sans message d\'erreur', async () => {
  axios.get.mockResolvedValueOnce({ data: [] });
  render(<OcrSuggestionsPanel employeeId="e1" />);
  await waitFor(() => expect(axios.get).toHaveBeenCalled());
  expect(screen.queryByText(/erreur/i)).not.toBeInTheDocument();
});

test('affiche une suggestion et applique au clic', async () => {
  axios.get.mockResolvedValueOnce({ data: [suggestion] });
  axios.post.mockResolvedValueOnce({ data: { statut: 'appliquee' } });
  render(<OcrSuggestionsPanel employeeId="e1" />);

  expect(await screen.findByText('123456789012345678')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /appliquer/i }));
  fireEvent.click(await screen.findByRole('button', { name: /confirmer/i }));

  await waitFor(() =>
    expect(axios.post).toHaveBeenCalledWith('/api/ocr/suggestions/r1/0/appliquer/')
  );
});

test('ignore une suggestion sans confirmation', async () => {
  axios.get.mockResolvedValueOnce({ data: [suggestion] });
  axios.post.mockResolvedValueOnce({ data: { statut: 'ignoree' } });
  render(<OcrSuggestionsPanel employeeId="e1" />);

  fireEvent.click(await screen.findByRole('button', { name: /ignorer/i }));

  await waitFor(() =>
    expect(axios.post).toHaveBeenCalledWith('/api/ocr/suggestions/r1/0/ignorer/')
  );
});
```
Vérifier au préalable comment `axios` est mocké dans un test existant similaire (ex. `frontend/src/__tests__/EmployeeDetail.test.js`) pour aligner exactement le pattern de mock (`jest.mock('../api/client')` vs `jest.mock('axios')` — utiliser celui réellement en place dans le projet).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- OcrSuggestionsPanel --watchAll=false`
Expected: FAIL (`Cannot find module '../components/OcrSuggestionsPanel'`)

- [ ] **Step 3: Implémenter le composant**

`frontend/src/components/OcrSuggestionsPanel.jsx` :
```jsx
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import theme from '../styles/theme';
import { useConfirm } from './ConfirmDialog';

export default function OcrSuggestionsPanel({ employeeId }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { confirm, ConfirmDialog } = useConfirm();

  const fetchSuggestions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await axios.get(`/api/ocr/employees/${employeeId}/suggestions/`);
      setSuggestions(response.data);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleAction = async (suggestion, action) => {
    if (action === 'appliquer') {
      const ok = await confirm(
        `Appliquer la valeur détectée (${suggestion.valeur}) au champ ${suggestion.champ_code} ?`
      );
      if (!ok) return;
    }
    await axios.post(
      `/api/ocr/suggestions/${suggestion.ocr_result_id}/${suggestion.field_index}/${action}/`
    );
    fetchSuggestions(true);
  };

  if (loading) {
    return <div style={{ padding: 16, color: theme.textSecondary }}>Chargement des suggestions OCR...</div>;
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div style={{ border: theme.border, borderRadius: 16, boxShadow: theme.shadowMd, padding: 20, marginTop: 24 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: theme.textSecondary, marginBottom: 12 }}>
        Suggestions OCR
      </div>
      {suggestions.map((s) => (
        <div
          key={`${s.ocr_result_id}-${s.field_index}`}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: theme.border }}
        >
          <div>
            <strong>{s.champ_code}</strong> : {s.valeur}{' '}
            <span style={{ fontSize: 11, color: theme.textSecondary }}>({Math.round(s.confiance)}%)</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleAction(s, 'appliquer')}>Appliquer</button>
            <button onClick={() => handleAction(s, 'ignorer')}>Ignorer</button>
          </div>
        </div>
      ))}
      {ConfirmDialog}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- OcrSuggestionsPanel --watchAll=false`
Expected: 3 passed (ajuster le mock de `useConfirm`/bouton "Confirmer" si le composant réel `ConfirmDialog.jsx` utilise un autre libellé de bouton — lire `frontend/src/components/ConfirmDialog.jsx` avant cette étape pour aligner le texte exact).

- [ ] **Step 5: Monter le panneau sur la fiche employé**

Dans `frontend/src/pages/EmployeeDetail.jsx`, importer et monter le composant (ADMIN only), à l'endroit où d'autres panneaux annexes sont déjà rendus (ex. après le panneau "Informations" ou dans l'onglet "Dossier") :
```jsx
import OcrSuggestionsPanel from '../components/OcrSuggestionsPanel';
```
```jsx
{user?.role === 'ADMIN' && <OcrSuggestionsPanel employeeId={employee.id} />}
```

- [ ] **Step 6: Tester manuellement dans le navigateur**

Uploader un document dont le `TypeDocument.champ_source` est configuré (ex. `nin` sur "Carte d'identité", via `/parametres`), attendre le traitement OCR, vérifier que la suggestion apparaît sur la fiche employé et que cliquer "Appliquer" (après confirmation) met à jour le champ NIN affiché dans le panneau Informations.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/OcrSuggestionsPanel.jsx frontend/src/pages/EmployeeDetail.jsx frontend/src/__tests__/OcrSuggestionsPanel.test.js
git commit -m "feat(ocr): ajoute le panneau Suggestions OCR sur la fiche employé"
```

---

### Task 9: Recherche plein texte

**Files:**
- Modify: `backend/employees/views.py` (fonction `employee_search`, ou la vue de liste employés — repérer avec `grep -n "def employee_search" backend/employees/views.py`)
- Test: fichier de test existant couvrant `employee_search`

**Interfaces:**
- Consumes: `OcrResult.raw_text` (Task 1).
- Produces: paramètre `?q_contenu=` sur l'endpoint de recherche, filtrant les employés ayant au moins un document dont le texte OCR contient la chaîne recherchée.

- [ ] **Step 1: Localiser `employee_search`**

Run: `cd backend && grep -n "def employee_search" employees/views.py`
Lire la fonction complète pour repérer comment les filtres existants (`q`, `contrats__numero_contrat`) sont combinés.

- [ ] **Step 2: Écrire le test**

Dans le fichier de test d'`employee_search` existant, ajouter :
```python
def test_employee_search_by_ocr_content(admin_client, employee, employee_document_file):
    from ocr.models import OcrResult
    OcrResult.objects.create(
        file=employee_document_file, status=OcrResult.Status.DONE,
        raw_text="Attestation de travail — mention rare xyzzy123"
    )
    response = admin_client.get('/api/employees/search/?q_contenu=xyzzy123')
    assert response.status_code == 200
    assert any(e['id'] == str(employee.id) for e in response.data)
```
(Adapter l'URL exacte de `employee_search` — la lire depuis `backend/employees/urls.py` avant d'écrire ce test.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest <fichier> -k ocr_content -v`
Expected: FAIL (aucun résultat, le paramètre est ignoré)

- [ ] **Step 4: Ajouter le filtre**

Dans `employee_search`, après les filtres existants, ajouter :
```python
    q_contenu = request.GET.get('q_contenu', '').strip()
    if q_contenu:
        queryset = queryset.filter(
            documents__fichiers__ocr_result__raw_text__icontains=q_contenu
        ).distinct()
```
(Adapter le nom de la variable `queryset` au nom réellement utilisé dans cette fonction.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest <fichier> -k ocr_content -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/employees/views.py backend/employees/tests.py
git commit -m "feat(ocr): ajoute la recherche employé par contenu OCR des documents"
```

---

### Task 10: Suite complète + documentation sécurité

**Files:**
- Modify: `securite.md` (racine du projet)
- Modify: `CLAUDE.md` (nouvelle section décrivant le système OCR, sur le modèle des autres sections datées)

**Interfaces:** aucune — tâche de clôture.

- [ ] **Step 1: Lancer la suite complète backend**

Run: `cd backend && pytest`
Expected: tous les tests passent, aucune régression sur les 188+ tests préexistants.

- [ ] **Step 2: Lancer la suite complète frontend**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: tous les tests passent.

- [ ] **Step 3: Documenter dans `securite.md`**

Ajouter un point numéroté (suivre la numérotation existante du fichier — lire la fin de `securite.md` pour connaître le dernier numéro utilisé) décrivant : traitement 100% local (pas d'appel réseau), aucune écriture automatique sur les données employé, accès ADMIN uniquement, suppression en cascade du texte OCR avec le document.

- [ ] **Step 4: Documenter dans `CLAUDE.md`**

Ajouter une section "## OCR des documents (2026-09-06)" résumant : déclenchement automatique à l'upload, Tesseract local via Celery, modèle `OcrResult`, panneau Suggestions OCR ADMIN-only, aucune écriture automatique, recherche plein texte `?q_contenu=`. Lien vers `docs/superpowers/specs/2026-09-06-ocr-documents-design.md`.

- [ ] **Step 5: Commit final**

```bash
git add securite.md CLAUDE.md
git commit -m "docs: documente le système d'OCR dans securite.md et CLAUDE.md"
```

- [ ] **Step 6: Récapituler pour l'utilisateur**

Rappeler que le worker Celery (`celery -A config worker -l info`) et les binaires système `tesseract-ocr`/`poppler` doivent être installés et lancés séparément en dev/prod — non gérés par `pip install -r requirements.txt` seul.
