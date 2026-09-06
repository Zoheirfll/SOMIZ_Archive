# OCR des documents employés — design

Date : 2026-09-06

## Objectif

À chaque upload de document (upload classique et scan-import), extraire
automatiquement le texte du fichier (image ou PDF scanné) via OCR local
(Tesseract), pour :

1. Permettre la recherche plein texte des documents.
2. Suggérer le remplissage de champs employé liés au document (via le
   mécanisme `champ_source` déjà existant, voir section "Champs cliquables
   vers le document source" de `CLAUDE.md`), toujours soumis à validation
   humaine — jamais d'écriture automatique.

Contraintes actées avec l'utilisateur :
- OCR **local** (Tesseract), pas d'API cloud — conformité Loi 18-07/RGPD
  (les documents RH ne quittent jamais l'infrastructure SOMIZ).
- Déclenchement **automatique** à l'upload (upload classique + scan-import),
  pas de bouton "Analyser" à la demande.
- Traitement en **tâche de fond** (Celery + Redis, Redis déjà utilisé par
  SOMIZ comme cache/rate-limit) — l'upload reste rapide, l'OCR peut prendre
  plusieurs secondes par page.
- **Aucune écriture automatique** sur les champs employé, quelle que soit
  la confiance OCR — toujours une suggestion validée manuellement par un
  ADMIN.

## Architecture

- Nouvelle app Django **`ocr`** (traitement, modèle, tâche Celery, registre
  de règles d'extraction) — séparée de `employees` pour garder les
  responsabilités isolées (le module `employees` n'a pas besoin de savoir
  comment fonctionne Tesseract).
- **Celery** + un worker dédié, Redis comme broker (nouvelle dépendance
  d'infra, un service à déployer et superviser en plus de Django/Postgres/
  Redis).
- **pytesseract** (+ binaire `tesseract-ocr` côté OS) pour l'OCR image.
  Pour un PDF, rendu page par page en image (réutilise `pypdf`/`pdf2image`
  + `poppler`, déjà en place pour le découpage PDF du scan-import) avant
  passage à Tesseract ; texte de chaque page concaténé.
- Déclenchement : `EmployeeDocumentFile.save()` (post-création, aussi bien
  pour un upload classique que pour chaque fichier créé par
  `ScanImportView`) enfile une tâche Celery `run_ocr.delay(file_id)`.

## Données

Nouveau modèle **`OcrResult`** (app `ocr`), `OneToOneField` vers
`EmployeeDocumentFile` (`on_delete=CASCADE` — supprimer le fichier
supprime son résultat OCR, cohérent avec la politique de suppression
définitive des documents) :

- `status` — `pending` / `done` / `failed`
- `raw_text` — texte plein extrait (pour la recherche)
- `confidence` — confiance moyenne Tesseract (0–100)
- `extracted_fields` — JSON, liste de
  `{champ_code, valeur, confiance, statut}` où `statut` ∈
  `en_attente`/`appliquee`/`ignoree`
- `processed_at`, `error_message`

Une tâche `run_ocr` recrée/écrase l'`OcrResult` existant si elle est
relancée (ré-upload d'un fichier du même nom, ou retry manuel futur) —
idempotent, pas d'accumulation de résultats obsolètes.

## Extraction des champs

- Un registre en dur `CHAMP_SOURCE_EXTRACTORS` (module `ocr/extractors.py`)
  mappe un `champ_source` (même code que celui utilisé par
  `TypeDocument.champ_source`, voir section "Champs cliquables") à une
  fonction d'extraction (regex/heuristique) : ex. `nin` → 18 chiffres,
  `date_naissance` → motif `\d{2}/\d{2}/\d{4}` (ou variantes).
- La tâche `run_ocr` ne tente l'extraction de champs que si le
  `TypeDocument` du fichier a un `champ_source` non vide et que ce code a
  un extracteur enregistré — pas de règles génériques appliquées à tout
  document (source de bruit).
- Un extracteur peut renvoyer 0, 1 ou plusieurs candidats (ex. plusieurs
  motifs de date trouvés dans le texte) — chacun stocké comme une entrée
  séparée dans `extracted_fields`, à valider/ignorer indépendamment.

## UI

### Panneau "Suggestions OCR" (fiche employé)

Nouvelle section sur `EmployeeDetail.jsx`, visible ADMIN uniquement,
listant toutes les suggestions `en_attente` de cet employé (tous documents
confondus) :
- Champ visé (libellé), valeur détectée, confiance, lien vers le document
  source (ouvre l'onglet Dossier sur ce document, réutilise le mécanisme
  existant de `handleFieldClick`).
- Deux actions par ligne : **Appliquer** (écrit dans `Employee` ou
  `EmployeeChampValeur` selon la nature du champ, marque l'entrée
  `appliquee`, tracé en audit `MODIFY_EMP` avec le détail habituel
  `transfer`) / **Ignorer** (marque `ignoree`, ne réapparaît plus pour ce
  fichier).
- Aucune suggestion si le champ employé cible est déjà rempli **et**
  identique à la valeur détectée (évite du bruit sur des champs déjà
  corrects) ; une suggestion reste proposée si le champ est déjà rempli
  mais différent (l'ADMIN tranche).

### Statut sur les fichiers (sidebar Documents)

Badge par fichier dans la sidebar Documents de `EmployeeDetail.jsx` /
`ContratDetail.jsx` : `⏳ Analyse en cours` / `✓ Analysé` / `✗ Échec
d'analyse` — même emplacement que les indicateurs existants (taille,
date d'upload).

### Recherche plein texte

Nouveau paramètre `?q_contenu=` sur `employee_search`/liste de documents,
filtrant sur `OcrResult.raw_text` (`icontains` dans un premier temps ;
passage à un index Postgres `GIN`/`to_tsvector` seulement si la volumétrie
le justifie — pas fait en v1).

## Permissions & audit

- Lecture des suggestions OCR et du texte extrait : **ADMIN uniquement**
  en v1 (cohérent avec les autres actions de gestion de documents) — pas
  d'exposition à CONSULTANT, le scoping organisationnel/type de document
  existant n'a pas besoin d'être étendu pour cette fonctionnalité tant
  qu'elle reste ADMIN-only.
- "Appliquer une suggestion" est tracé comme une modification normale de
  fiche employé (`AuditLog.Action.MODIFY_EMP`, réutilise la clé
  `details.transfer` déjà utilisée par le transfert organisationnel/
  carrière/archivage).
- Aucune action de purge/modification du texte OCR autre que la
  suppression en cascade avec le fichier — pas de DELETE dédié sur
  `OcrResult`.

## Hors scope (v1)

- Pas de classification automatique du type de document à partir du
  contenu OCR.
- Pas de support optimisé pour le manuscrit (Tesseract est faible dessus
  — à réévaluer plus tard si un besoin réel apparaît).
- Pas d'auto-remplissage, même à confiance élevée.
- Pas d'index Postgres full-text dédié (recherche `icontains` suffisante
  au démarrage).
- Pas de retry automatique sur échec — un échec reste `failed`, un futur
  bouton "Relancer l'analyse" pourra être ajouté séparément si le besoin
  se confirme.

## Tests

- Backend (`pytest`) : tâche `run_ocr` (mock Tesseract), extracteurs par
  `champ_source` (cas valides/invalides/multiples candidats), permissions
  du panneau Suggestions OCR (ADMIN only), cascade de suppression
  `OcrResult` avec `EmployeeDocumentFile`, audit log sur "Appliquer".
- Frontend (Jest) : rendu du panneau Suggestions OCR (vide, avec
  suggestions, actions Appliquer/Ignorer), badges de statut sur les
  fichiers.
