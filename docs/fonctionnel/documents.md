# Documents employés — types, upload, scan, OCR

> À lire avant de toucher aux documents (upload, suppression, renommage, rotation, scan-import), aux types de documents, à la photo de profil ou à l'OCR. Contient l'incident de purge du 2026-07-22.
>
> Extrait de `CLAUDE.md` (découpage du 2026-10-01) — contenu déplacé tel quel, sans réécriture.
> Les renvois « voir section X » peuvent pointer vers un autre fichier de `docs/fonctionnel/` ou vers `CLAUDE.md` : voir l'index de `CLAUDE.md`.

---

## Hiérarchie des types de documents — sous-dossiers (2026-07-24)

`TypeDocument` supporte 2 niveaux via un champ auto-référent `parent`
(`FK('self', null=True, on_delete=SET_NULL, related_name='sous_types')`) :
une **catégorie** (ex. "État civil", `parent=None`) regroupe des types
**feuilles** réellement uploadables (ex. "Acte de naissance", "Acte de
mariage", `parent=<catégorie>`). Une catégorie ne peut pas elle-même avoir
un parent (validé dans `TypeDocumentSerializer.validate_parent`, 2 niveaux
max) et n'est jamais rattachable à un `EmployeeDocument`.

- `TypeDocument.is_categorie` (property) — True si le type a des `sous_types` (donc non uploadable).
- Toute requête qui compte/valide des types "réels" (complétude, `documents_manquants`, queryset d'upload) doit filtrer `sous_types__isnull=True` pour exclure les catégories — voir `Employee.dossier_complet`/`taux_completude`, `DocumentUploadSerializer.type_doc`, `EmployeeListCreateView.get_serializer_context`, `employee_search`.
- `EmployeeDocumentSerializer.type_document_parent` / `documents_manquants[].parent_nom` — exposent le nom de la catégorie parente pour permettre au frontend de regrouper visuellement.
- Frontend (`EmployeeDetail.jsx`, `ContratDetail.jsx`) : la sidebar "Documents" regroupe les documents (présents et manquants) par catégorie via `groupDocsByParent()` — un en-tête 📁 précède le premier document de chaque catégorie, les items sont légèrement indentés. Le `<select>` "Ajouter un document" liste les types racine puis les types groupés par `<optgroup>` (catégorie), et exclut toujours les catégories elles-mêmes (`typesDocumentsList` filtré sur `!t.is_categorie`).
- UI de gestion : `/parametres` → onglet "Types de documents" → champ "Catégorie parente" (optionnel) dans le formulaire d'ajout/édition — désactivé (obligatoire forcé à "Optionnel") dès que le type a des sous-types, avec une note explicative.
- **Piège "obligatoire" sur une catégorie** : une catégorie n'étant jamais uploadable, son propre `obligatoire=True` ne compte plus dans aucune statistique (voir `sous_types__isnull=True` ci-dessus) — si un type obligatoire existant reçoit des sous-types (devient une catégorie), l'exigence "disparaît" silencieusement sauf à la reporter explicitement sur au moins un des sous-types. `TypeDocumentSerializer.validate()` force `obligatoire=False` côté serveur dès que l'instance a des `sous_types`, pour qu'on ne puisse pas laisser une catégorie affichée "Obligatoire" par erreur (incident réel du 2026-07-24 : "Expériences professionnelles" et "Sécurité Sociale" étaient devenues des catégories sans que leurs nouveaux enfants soient marqués obligatoires, cassant le taux de complétude partout — dashboard, liste employés, fiche employé).
- **Ordre d'affichage stable** : `EmployeeDocument.Meta.ordering = ['type_doc__ordre', 'type_doc__nom']` (plus `-uploaded_at`) — un document qui passe de "manquant" à "présent" (ou est ré-uploadé en nouvelle version) ne doit pas sauter en tête de liste. Sur `EmployeeDetail.jsx`/`ContratDetail.jsx`, les documents présents et manquants sont fusionnés en une seule séquence triée par l'`ordre` du type (celui de la catégorie parente si groupé) et positionnés via CSS `order` (flex) — pas de réordonnancement DOM — pour qu'un document garde exactement sa place visuelle en changeant de statut.

---

## Champs cliquables vers le document source (2026-08-31)

Sur la fiche employé, un champ du panneau "Informations" (ex. "Date de
naissance") peut être associé à un type de document précis (ex. "Acte de
naissance") : cliquer dessus bascule sur l'onglet "Dossier" et ouvre
directement ce document — ou, s'il est manquant, scroll + surligne
temporairement (2s) sa ligne dans la liste des documents manquants.

- `TypeDocument.champ_source` (`CharField`, blank=True) — code d'un champ
  système (`date_naissance`, `nin`...) ou d'un `ChampPersonnalise.code`.
  Pas de FK, pas de contrainte d'unicité en base. Une catégorie
  (`is_categorie`) ne peut jamais en avoir un —
  `TypeDocumentSerializer.validate()` le force à vide dès que l'instance a
  des `sous_types`, même garde-fou que pour `obligatoire`.
- UI `/parametres` → "Types de documents" : select "Champ source"
  (optionnel), options = les 12 champs de `SYSTEM_FIELDS` + les champs
  personnalisés actifs (chargés une fois au montage de `Parametres.jsx`,
  indépendamment de l'onglet actif).
- `EmployeeDetail.jsx` : `champToDoc` (map `{champ_source → type_doc}`,
  dérivée de `typesDocumentsList` déjà chargé) rend chaque `infoFields`
  correspondant cliquable. `handleFieldClick(code)` cherche d'abord un
  document présent (`documentsAffiches`, par `type_doc_id`) — sinon
  cherche l'entrée `documents_manquants` correspondante (par `id`) et la
  surligne via `missingRowRefs` (map de refs DOM indexée par `code`,
  attachée aux lignes "manquant" existantes).
- **Piège jsdom** : `Element.scrollIntoView` n'existe pas dans jsdom (tests
  Jest) — l'appel doit être `?.scrollIntoView?.(...)`  (chaînage optionnel
  sur la méthode elle-même, pas seulement sur l'élément), sinon une
  `TypeError` différée (dans un `setTimeout`) fait planter toute la suite
  de tests quand elle tourne aux côtés d'autres fichiers — confirmé en
  observant le nombre de tests en échec passer de 55 (baseline connue,
  pré-existante, sans rapport avec ce chantier) à 56 avant ce correctif.

---

## Limites d'upload — fichiers/taille/pages (2026-09-15)

| Canal | Fichiers max | Taille/fichier | Pages max au total | Fusion en 1 PDF |
|---|---|---|---|---|
| Dossier employé (`DocumentListUploadView`) | 50 | 20 Mo | 50 | Oui |
| Documents de contrat (`ContratDocumentListUploadView`) | 50 | 20 Mo | 50 | Oui (aligné le 2026-09-15) |
| Scanner un dossier (`ScanImportView`) | 100 | 20 Mo | 100 | Oui (natif) |

Constantes : `MAX_UPLOAD_SIZE_MB`, `MAX_UPLOAD_PAGES`,
`MAX_SCAN_IMPORT_SIZE_MB` (`backend/config/settings.py`). Toute limite
dépassée renvoie une erreur 400 explicite (`{'error': '...'}` ou
`non_field_errors`) — **jamais silencieuse** : chaque page frontend
concernée (`EmployeeDetail.jsx`, `ContratDetail.jsx`, `ScanImportModal.jsx`)
doit lire `error` en priorité puis les fallbacks DRF (`non_field_errors`,
`files[0]`, `plan`) avant d'afficher un message générique — deux bugs de
ce type (message générique masquant la vraie erreur) corrigés le
2026-09-15 sur `ContratDetail.jsx` et `ScanImportModal.jsx`. Détail complet
: `securite.md` points 34-35.

---

## Documents employés — suppression définitive (2026-07-22)

**Changement de politique** (demande explicite utilisateur, dérogation au soft-delete standard) : la suppression d'un fichier (`FileDeleteView`) ou d'un document (`DocumentDeleteView`) est désormais un **hard delete** — ligne DB + fichier physique supprimés immédiatement, irréversible. Avant ce changement, `EmployeeDocument`/`EmployeeDocumentFile` étaient soft-deleted (`is_active=False`), y compris les anciennes versions remplacées par un ré-upload (mécanisme de versioning dans `EmployeeDocument.save()`) — cet historique de versions a été purgé en même temps (voir incident ci-dessous).

Chaque suppression reste tracée dans l'audit log (`AuditLog.Action.DELETE_DOC`), mais celui-ci ne conserve qu'un **snapshot texte** (nom fichier, type, version) — le contenu du document n'est plus récupérable une fois supprimé.

### Suppression de `TypeDocument` (`/parametres`, onglet "Types de documents")
- Le champ **Code** est modifiable en édition (n'est plus verrouillé après création).
- `TypeDocumentDetailView.destroy` (`employees/referentiel_views.py`) : bloque la suppression avec un message clair (400, pas de 500) s'il reste des documents **actifs** de ce type ; si seuls des documents déjà supprimés/archivés existent, ils sont purgés automatiquement (fichiers + lignes) avant de supprimer le type.

### ⚠️ Incident du 2026-07-22 — script de purge des orphelins media/
Un script one-off pour purger les fichiers orphelins de `backend/media/employees/` (fichiers sans ligne DB correspondante, ~184 fichiers) a mal comparé les chemins (bug de normalisation) et a supprimé **aussi les 7 fichiers activement référencés**. Les fichiers physiques n'ont pas pu être récupérés (pas de git, pas de corbeille — `os.remove()` est définitif) ; 3 d'entre eux (uploadés dans la même session) ont pu être ré-associés car les fichiers physiques n'avaient en fait pas été touchés par une suppression DB séparée juste avant.
- **Leçon** : ne jamais exécuter de script de suppression en masse sur `media/` sans (1) lister précisément les chemins concernés et les faire valider un par un ou par échantillon par l'utilisateur, (2) vérifier la normalisation de chemin (relatif vs absolu) avant tout `os.remove()`, (3) faire une copie de sauvegarde du dossier avant toute purge.
- `media/` est gitignored → aucune récupération possible via git en cas d'erreur.

### Renommage de fichier (2026-07-24)
- `FileDetailView` (`employees/views.py`, ex-`FileDeleteView`) gère désormais `PATCH /api/files/{id}/` (renomme, ADMIN only, log `MODIFY_DOC`) en plus de `DELETE`.
- Frontend : pas d'édition inline (source de bugs — un champ texte ouvert pour un fichier pouvait se fermer sans sauvegarder si on cliquait sur un autre fichier avant que le blur ne se résolve). Utilise `usePrompt()` (`components/ConfirmDialog.jsx`) — une modale avec champ texte, remplace `window.prompt()`. Le nom proposé dans la modale est **sans l'extension** (`.pdf`, `.png`...) ; elle est automatiquement réattachée au nom final envoyé au serveur.
- Affichage : partout où un `file_name` est montré (sidebar, onglets multi-fichiers, en-tête du viewer), l'extension est masquée via un helper local `stripExt()` (dupliqué dans `EmployeeDetail.jsx` et `ContratDetail.jsx`) — cosmétique uniquement, le nom stocké en base garde son extension.

---

## Photo de profil employé (2026-07-24)

- `Employee.photo` (`ImageField`, upload_to `employee_photo_upload_path`, régénéré en UUID).
- `EmployeePhotoView` (`GET`/`POST`/`DELETE` sur `/api/employees/{id}/photo/`) : GET ouvert à ADMIN+CONSULTANT (respecte le scoping via `can_access_employee`), POST/DELETE réservés ADMIN. Upload restreint à JPEG/PNG/WebP, 5 Mo max (`settings.ALLOWED_PHOTO_MIME_TYPES`/`MAX_PHOTO_SIZE_MB` — distinct des réglages documents qui acceptent aussi PDF/TIFF).
- `has_photo` (bool) exposé dans `EmployeeListSerializer`/`EmployeeDetailSerializer` — jamais l'URL/le chemin brut du fichier.
- Frontend : `components/EmployeeAvatar.jsx` — récupère la photo via un fetch blob authentifié (comme les documents, pas de lien direct vers `/media/`), fallback sur les initiales. `shape="square"` (coins arrondis, façon photo d'identité) utilisé sur la fiche employé (grand format, upload via crayon) et dans la liste `/employees` (petit format).

### Ajouter/modifier/supprimer + cadrage à l'upload (2026-09-14)

- Sur `EmployeeDetail.jsx`, le crayon (upload/remplacement) ouvre désormais `components/PhotoCropModal.jsx` (`react-easy-crop`, zoom + déplacement) avant l'envoi — le fichier posté à `/photo/` est toujours le JPEG recadré côté client (canvas), jamais le fichier original. Une icône poubelle séparée (visible seulement si `has_photo`) appelle `DELETE /photo/` via `useConfirm()` (pas de `window.confirm`, voir section dédiée plus bas).
- L'input accepte aussi `application/pdf` (scan de photo d'identité) : `utils/pdfToImage.js` (`pdfFirstPageToImageUrl`, réutilise pdf.js déjà chargé pour `ScanImportModal`) rend la première page du PDF en image PNG côté client avant d'ouvrir la même modale de cadrage — le PDF lui-même n'est jamais envoyé au serveur.
- Aucun changement backend : `EmployeePhotoView` continue de valider JPEG/PNG/WebP, 5 Mo max, quelle que soit la source (image directe ou page de PDF convertie).
- Toute erreur (upload refusé par le serveur, PDF illisible, échec du cadrage) affiche le texte réel — jamais un message vide (convention générale du projet, voir aussi le piège categorie/sous-type documenté ailleurs) : `PhotoCropModal` a son propre encart d'erreur, et `EmployeeDetail.jsx` ferme la modale puis réutilise le bandeau `message` existant en cas d'échec serveur.

---

## Rotation par défaut des documents (2026-09-17)

Dans `SecureDocViewer.jsx`, le bouton ⟳ (pivoter de 90°) reste disponible
pour tout le monde mais ne modifie qu'un état React local (jamais persisté,
comme avant ce chantier). Un ADMIN/SUPERADMIN dispose en plus d'un bouton
**💾 Enregistrer** (absent pour CONSULTANT) qui enregistre la rotation
courante comme **valeur par défaut affichée à tous** les utilisateurs qui
ouvriront ensuite ce document — un CONSULTANT peut toujours pivoter pour
lui-même, mais ça n'écrit jamais cette valeur par défaut.

- `EmployeeDocumentFile.rotation` (image/fichier entier) et
  `EmployeeDocumentFilePage.rotation` (page de PDF, une valeur par page —
  même granularité que le nommage de page déjà existant), choix
  `{0, 90, 180, 270}`.
- `PATCH /api/files/{id}/` et `PATCH /api/files/{id}/pages/{page_id}/`
  (mêmes vues ADMIN only que le renommage) acceptent un champ `rotation`
  optionnel en plus des champs existants.
- `SecureDocViewer` : props `savedRotation` (image), `canSaveRotation`
  (bool, calculé depuis `user.role` par la page appelante),
  `onSaveRotation(rotation, pageId?)`. Câblé sur `EmployeeDetail.jsx`/
  `DossierTab.jsx` (fichier ou page PDF) et `ContratDetail.jsx` (fichier
  uniquement — `pages` n'y est pas encore câblé, un contrat n'a pas le
  panneau de gestion de pages).

---

## Scanner et import complet — documents scannés (2026-08-27/28)

Bouton **"Scanner un dossier"** sur la fiche employé (`EmployeeDetail.jsx`,
sidebar Documents, à côté de "Ajouter un document") : permet d'importer en
une seule opération un lot de fichiers scannés (PDF multi-pages et/ou
images) et de répartir leurs pages entre plusieurs types de documents, au
lieu d'uploader chaque document séparément. **Toujours attaché au dossier
général de l'employé** — jamais à un contrat spécifique (un contrat a sa
propre page dédiée, `ContratDetail.jsx`, pour ses documents ; voir aussi
ci-dessous "Ajouter un document" qui a le même comportement).

- Backend : `POST /api/employees/{id}/documents/scan-import/`
  (`ScanImportView`, `employees/views.py`, ADMIN only). Reçoit `files`
  (multipart, fichiers uniques) + `plan` (JSON décrivant des groupes
  `{type_doc, parts: [{file_index, pages}|{file_index, is_image}]}`).
  Un fichier PDF entièrement couvert par une seule part est réutilisé tel
  quel (pas de ré-encodage) ; sinon `pypdf` (`employees/pdf_utils.py`,
  `extract_pdf_pages`/`pdf_page_count`) découpe les pages demandées. Un
  groupe qui échoue (page hors limites, etc.) n'annule pas les autres —
  réponse `{created: [...], failed: [...]}`.
- **Nom de fichier** : garde le nom du fichier scanné original (cohérent
  avec l'upload normal, traçabilité si le même type est réimporté plus
  tard) — une part obtenue par découpage de pages ajoute juste la plage
  entre parenthèses (`_scan_import_file_name()`, ex. `"scan (p2).pdf"`).
  Ne **pas** renommer d'après le type de document ici (essayé puis
  abandonné : perd la diversité/traçabilité entre imports successifs).
- **Fusion automatique quand plusieurs pages/fichiers rejoignent le même
  type** (2026-09-15) : dans `ScanImportModal.jsx`, glisser plusieurs pages
  (d'un même PDF source ou de fichiers différents, ex. recto + verso) sur
  le même "dossier" 📁 produit un seul `EmployeeDocument` avec un seul
  fichier fusionné (`ScanImportView.post`, `pdf_utils.merge_group_parts`)
  — jamais plusieurs `EmployeeDocumentFile` séparés pour le même groupe.
  Chaque page interne garde le nom de sa source (recto/verso, ou "<nom>
  page N" pour une source multi-page), gérable ensuite individuellement
  via `EmployeeDocumentFilePage` (renommer/réorganiser/remplacer/
  supprimer, panneau "Modifier") — même règle et même mécanisme que
  l'upload manuel multi-fichiers (`DocumentListUploadView.post`, voir plus
  haut "on doit pouvoir renommer les pages"). Un groupe à une seule part
  garde le comportement existant (fichier stocké tel quel ou pages
  extraites, aucune fusion nécessaire).
- Frontend : `components/ScanImportModal.jsx` — pdf.js (`react-pdf`, déjà
  utilisé par `SecureDocViewer`) génère une grille de miniatures. Chaque
  page est **glissée-déposée** (`draggable`) sur un "dossier" 📁 (un par
  type de document, barre au-dessus de la grille) pour l'assigner — pas de
  select+bouton "Assigner". Clic sur une page = bascule sa sélection
  seule (pas de sélection auto de tout le fichier) ; Shift-clic = plage ;
  double-clic = sélectionne tout le fichier source d'un coup ; cliquer un
  dossier avec des pages sélectionnées les assigne aussi (sans drag).
- **`EmployeeDocument.save()` — bug de versioning corrigé** (découvert en
  testant cette feature) : la condition `if not self.pk:` pour détecter
  une insertion ne fonctionnait jamais, car `id` a un
  `default=uuid.uuid4` (le pk est déjà rempli à l'instanciation, avant le
  premier `save()`) — la logique de versioning (un nouvel upload du même
  type désactive l'ancien) ne se déclenchait donc jamais. Corrigé avec
  `self._state.adding` (le bon test pour un modèle à PK UUID avec
  default). Affecte tout le code existant qui crée un `EmployeeDocument`,
  pas seulement le scan-import.
- **Piège Content-Length** : `EmployeeDocumentFile.file_size` doit être la
  taille du fichier réellement enregistré (`file_to_save.size`), jamais
  celle du fichier source original avant découpage — sinon
  `FileViewerView` envoie un `Content-Length` trop grand par rapport aux
  octets transmis, et le navigateur reste bloqué à attendre indéfiniment
  ("Chargement..." qui ne finit jamais) sur les pages extraites d'un PDF.
- **"Ajouter un document" (upload classique) ne s'attribue plus au contrat
  sélectionné** : avant, avec un contrat actif dans la sidebar, l'upload
  partait vers `/contrats/{id}/documents/` ; désormais toujours
  `/employees/{id}/documents/` (le pill de contrat ne sert plus qu'à
  filtrer l'affichage, pas à choisir la destination d'un nouvel upload) —
  comportement volontairement aligné sur "Scanner un dossier".
- Taille de fichier affichée en **Mo** (pas Ko brut) via `formatSizeMo()`
  (dupliqué dans `EmployeeDetail.jsx`/`ContratDetail.jsx`, même pattern que
  `stripExt`), accompagnée de la date/heure d'upload (`formatDateTime()`,
  `EmployeeDocumentFile.uploaded_at`) — affiché à **un seul endroit** (en-tête
  du viewer, span de droite) pour éviter la répétition.
- Bouton "étiquette" (`TagIcon`, `components/icons.jsx`) à côté du crayon
  de renommage manuel : renomme le fichier sélectionné d'après le libellé
  de son type de document en un clic (`handleAutoRenameFile`).
- Sidebar Documents élargie 300px → 340px (icônes d'action 12px → 16px)
  pour laisser la place aux 3 boutons par fichier (renommer d'après le
  type, renommer manuellement, supprimer).

---

## OCR des documents (2026-09-06)

Chaque fichier uploadé (upload classique, "Scanner un dossier", upload
contrat) déclenche automatiquement une analyse OCR **locale** (Tesseract,
jamais d'API cloud — conformité Loi 18-07/RGPD), en tâche de fond via
Celery + Redis (broker déjà utilisé par SOMIZ comme cache/rate-limit).
Objectifs : recherche plein texte des documents et suggestions de
remplissage de champs employé — **jamais d'écriture automatique**. Spec
complète : `docs/superpowers/specs/2026-09-06-ocr-documents-design.md`.

- **App `ocr`** (`backend/ocr/`) : modèle `OcrResult` (`OneToOneField`
  vers `EmployeeDocumentFile`, `on_delete=CASCADE` — supprimé avec le
  fichier), champs `status` (`pending`/`done`/`failed`), `raw_text`,
  `confidence`, `extracted_fields` (JSON, liste de `{champ_code, valeur,
  confiance, statut}`).
- **Extraction de champs** — `ocr/extractors.py`, un registre
  `CHAMP_SOURCE_EXTRACTORS` indexé par le même code que
  `TypeDocument.champ_source` (voir section "Champs cliquables vers le
  document source") : seuls les types de document ayant un
  `champ_source` renseigné déclenchent une extraction (pas de règles
  génériques bruitées sur tout document).
- **Déclenchement** — `employees/views.py`, helper `_enqueue_ocr(file_obj)`
  appelé après chaque création de `EmployeeDocumentFile`
  (`DocumentListUploadView`, `ScanImportView`,
  `ContratDocumentListUploadView`) ; encapsule `run_ocr.delay(...)` dans
  un try/except pour qu'un broker Redis indisponible ne bloque jamais un
  upload — l'OCR est une fonctionnalité annexe, pas un pré-requis.
- **Suggestions — validation manuelle ADMIN uniquement** —
  `GET /api/ocr/employees/<id>/suggestions/`,
  `POST /api/ocr/suggestions/<ocr_result_id>/<field_index>/{appliquer,ignorer}/`
  (`ocr/views.py`, `IsAdmin`). "Appliquer" écrit dans `Employee` (champs
  système) ou `EmployeeChampValeur` (champs personnalisés) et trace
  l'action dans l'audit log existant (`MODIFY_EMP`, `details.transfer`,
  même format que le transfert organisationnel/carrière/archivage) —
  aucune suggestion n'est jamais appliquée automatiquement, quelle que
  soit la confiance Tesseract.
- **UI** — panneau "Suggestions OCR" (`components/OcrSuggestionsPanel.jsx`,
  monté sur `EmployeeDetail.jsx`, ADMIN/SUPERADMIN only) : liste les
  suggestions en attente, boutons Appliquer (avec confirmation
  `useConfirm()`) / Ignorer. Badge de statut (⏳/✓/✗) sur le fichier
  sélectionné dans `DossierTab.jsx` (`EmployeeDocumentFileSerializer.
  ocr_status`).
- **Recherche plein texte** — paramètre `?q_contenu=` sur
  `GET /api/employees/` (`EmployeeListCreateView.get_queryset()`), filtre
  sur `OcrResult.raw_text__icontains` via
  `documents__fichiers__ocr_result__raw_text`.
- **Infra à prévoir hors pip** : binaires système `tesseract-ocr` et
  `poppler` (rendu PDF→image via `pdf2image`), et un worker Celery dédié
  (`celery -A config worker -l info`) à superviser en plus de
  Django/Postgres/Redis — `CELERY_TASK_ALWAYS_EAGER=True` en `.env`
  permet un traitement synchrone en dev sans worker séparé.
