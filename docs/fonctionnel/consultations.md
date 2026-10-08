# Demandes de consultation d'archives (2026-10-08)

> À lire avant de toucher à l'app `consultations` (workflow, livraison de fichiers, filigrane, expiration, prolongation, rappels, purge).
>
> Spec : `docs/superpowers/specs/2026-10-08-demandes-consultation-design.md` — plan : `docs/superpowers/plans/2026-10-08-demandes-consultation.md`.
> Journal de sécurité : `securite.md` point 44.

---

## Besoin

Un responsable (ex. un directeur) demande dans l'application à consulter un dossier, un
document ou une information archivés. L'admin d'archive valide, scanne la pièce (déjà
archivée ou externe) et la lui envoie **par l'application uniquement** (confidentialité),
pour une durée limitée. À l'échéance, le document n'est plus consultable.

## Qui fait quoi

| Rôle | Peut |
|---|---|
| `GESTIONNAIRE`, `CONSULTANT` | Créer une demande, suivre **ses** demandes, annuler une demande « En cours de validation », consulter la pièce livrée tant que la consultation est ouverte |
| `SUPERADMIN`, `ADMIN` avec `User.charge_consultation` (« traiteur ») | Voir toutes les demandes, valider (en livrant un scan ou en copiant un document archivé), rejeter, révoquer, prolonger ; ouvrir l'original livré |
| `ADMIN` sans le drapeau | Rien (aucun accès, ni lien navbar) |

- Un traiteur **ne crée pas** de demande et **ne traite jamais la sienne** (séparation demandeur/validateur).
- `charge_consultation` n'est attribuable que par un **SUPERADMIN** — voir `securite.md` point 44
  (un ADMIN ordinaire aurait pu se l'attribuer via l'API). Même mécanisme que `charge_attestation`,
  **sans** le défaut de ce dernier.

## Modèle de données (`backend/consultations/models.py`)

- `DemandeConsultation` — `reference` unique `C-NNNNN/AA` (compteur annuel sous `select_for_update()`),
  `type_demande` (`dossier`/`document`/`information`), `description`, `employee` **optionnel**
  (si fourni : `can_access_employee()` s'applique), `statut`, `motif_rejet`, `demandeur`,
  `traite_par`, `date_validation`, `date_echeance`, `date_echeance_initiale`, `date_revocation`,
  `nb_prolongations`, `telechargement_autorise`, `rappel_24h_envoye`, `rappel_1h_envoye`.
- `ConsultationFichier` — fichier livré, stocké sous `media/consultations/<id demande>/<uuid>`,
  `origine` (`scan_externe` / `copie_archive`), `source_document_file` (trace de la copie),
  `supprime_le` (renseigné par la purge : la ligne reste, le contenu disparaît).
- **« Expirée » n'est pas un statut stocké** : `statut_effectif` le déduit de `date_echeance < now`.
  Aucune tâche planifiée n'est nécessaire pour couper l'accès.

## Workflow

```
En cours de validation ──► Validée ──► (Expirée, dérivée)
        │                     └──► Révoquée
        └──► Rejetée (motif obligatoire)
```

Durées proposées : `settings.CONSULTATION_DUREES_HEURES = [1, 24, 72, 168]`. Plafond de durée
cumulée (validation + prolongations) : `CONSULTATION_MAX_DUREE_TOTALE_HEURES = 720` (30 jours).
Prolongation possible jusqu'à `CONSULTATION_DELAI_GRACE_PROLONGATION_HEURES = 24` h **après**
l'échéance ; au-delà, le demandeur refait une demande.

## Accès aux fichiers — la règle centrale

`GET /api/consultations/demandes/<slug>/fichiers/<uuid>/voir/` (et `/telecharger/`) passe par
`controler_acces()` (`consultations/access.py`) **à chaque requête** :

| Situation | Réponse |
|---|---|
| Tiers (autre demandeur, ADMIN sans drapeau) | **404** — l'existence n'est pas révélée |
| Demandeur : demande en cours / rejetée / révoquée / expirée | **403** avec un message explicite |
| Fichier purgé | **410** |
| Traiteur | toujours autorisé (reçoit l'**original**, en flux) |
| Demandeur, consultation ouverte | copie **filigranée** générée à la volée |

- **Filigrane** (`consultations/filigrane.py`) : nom + référence + date/heure en diagonale répétée,
  PDF (pypdf + ReportLab) et images (Pillow ; TIFF et PNG sortent en PNG). **Échec fermé** : si le
  filigrane ne peut pas être appliqué → **422**, rien n'est servi. Mesure sur le poste de dev :
  PDF de 50 pages en **≈ 2,7 s** (calculé à chaque lecture, non mis en cache) — à surveiller si les
  documents grossissent.
- **Limite assumée** : une capture ou une photo d'écran reste possible ; le filigrane rend la fuite
  attribuable, il ne l'empêche pas.
- **Téléchargement** : endpoint distinct, ouvert seulement si le traiteur a coché
  `telechargement_autorise` (défaut `False`), soumis aux mêmes contrôles, filigrané lui aussi.
- Throttle `consultation` (30/min) ; en-têtes `no-store`, `nosniff` ; jamais de lien direct vers
  `media/` — le frontend charge le fichier en **blob authentifié**.

## Livraison

`POST /api/consultations/demandes/<slug>/valider/` (multipart) : `duree_heures`,
`telechargement_autorise`, `fichiers[]` (scans externes), `copier_fichiers[]` (ids de
`EmployeeDocumentFile` de l'employé de la demande). MIME réel contrôlé (python-magic) dans
`settings.ALLOWED_MIME_TYPES`, 20 Mo max par fichier. Une copie d'archivé est une **vraie copie** :
l'original n'est jamais exposé.

- Piège connu : si la base échoue après l'écriture disque, un fichier orphelin peut rester dans
  `media/consultations/<id>/`. Il n'est jamais référencé ni servi. **Ne jamais le supprimer par un
  script ad hoc** (incident du 2026-07-22, `documents.md`).

## Prolongation, rappels, purge

- **Prolongation** (`services.prolonger`) : traiteur uniquement ; repart de `max(maintenant, ancienne
  échéance)` ; réinitialise les rappels ; auditée (ancienne et nouvelle échéance).
- **Rappels** : `manage.py notifier_echeances_consultation` — 24 h puis 1 h avant l'échéance,
  **idempotent** (drapeaux), un seul rappel si la commande a pris du retard, ignorés si la durée
  totale ≤ au seuil. **À planifier en production toutes les 15 minutes** (rien ne la lance
  aujourd'hui). Sans elle, seuls les rappels manquent : l'accès reste coupé par le serveur.
- **Purge** : `manage.py purger_consultations [--jours 90] [--confirmer] [--sauvegarde-dir DIR]`.
  **Manuelle, jamais planifiée.** Sans `--confirmer` : liste seulement. Concerne uniquement les
  scans *externes* de consultations expirées/révoquées depuis plus de N jours. Garde-fous :
  chemin normalisé (`realpath`) et contenu sous `MEDIA_ROOT/consultations/` (sinon « REFUSÉ »),
  sauvegarde copiée **et vérifiée** avant toute suppression (échec ⇒ aucune suppression), une ligne
  `AuditLog.PURGE_CONSULTATION` par fichier.

## Audit et notifications

- `AuditLog.Action` : `CREATE_CONSULTATION`, `STATUT_CONSULTATION`, `UPLOAD_CONSULTATION`,
  `DELETE_CONSULTATION`, `VIEW_CONSULTATION`, `DL_CONSULTATION`, `PROLONG_CONSULTATION`,
  `PURGE_CONSULTATION` (≤ 20 caractères : `max_length=20`).
- Notifications (`consultations/notifications.py`) : messages **neutres** (référence seule, jamais la
  description ni un nom). Voir `notifications.md`.

## Interface

`/consultations` (liste + filtres statut/type/recherche), `/consultations/nouvelle`,
`/consultations/:ref` (stepper Demande → Validation → Échéance, compte à rebours, viewer
`SecureDocViewer`, panneau de traitement, prolongation, révocation). Le badge navbar « N à traiter »
n'existe que pour les traiteurs. Révocation = confirmation renforcée (saisir la référence).
`SecureDocViewer` n'expose ni téléchargement ni impression ; le bouton « Télécharger » de la page
n'apparaît que si `telechargement_autorise` (ou pour un traiteur), et le serveur refuse de toute
façon sans cette autorisation.

## Approches écartées

- **Généraliser l'app `attestations`** avec un type de demande : couple deux métiers (PDF ReportLab,
  config de modèle, statuts propres) — un changement de l'un risquait de casser l'autre.
- **Stocker le scan livré comme `EmployeeDocument`** : il aurait été compté dans le taux de
  complétude, passé à l'OCR et indexé en recherche plein texte.
- **Statut « Expirée » stocké + tâche planifiée** : une tâche ratée aurait laissé l'accès ouvert.
  Remplacé par un statut dérivé de la date, vérifié à chaque lecture.
- **Nouveau rôle « DIRECTEUR »** : touche tout le modèle de rôles pour un gain faible ; les comptes
  CONSULTANT/GESTIONNAIRE existants (avec leur périmètre) suffisent.

## Tests

92 tests backend (`backend/tests/test_consultations_*.py` : drapeau, modèles, API, traitement,
filigrane, accès, prolongation, rappels, purge) et 4 fichiers Jest (`consultationsUtils`,
`Consultations`, `ConsultationNouvelle`, `ConsultationDetail`).
Piège de test : le throttle `consultation` vit dans le cache partagé — `test_consultations_acces.py`
le vide avant chaque test ; toujours utiliser la fixture `media_tmp` pour que les tests n'écrivent
pas dans `backend/media/`.

## Reste à faire / limites

- Créer la tâche planifiée `notifier_echeances_consultation` en production.
- Vérification manuelle dans un navigateur du parcours complet (voir le compte rendu de livraison).
- `charge_attestation` avait le même défaut d'auto-attribution : corrigé le 2026-10-08 avec le même
  garde-fou (`securite.md` point 44). Contrôler en base qu'aucun ADMIN ne l'a obtenu abusivement.
- Après un `git pull` de cette branche, lancer `python manage.py migrate` (nouvelle colonne
  `auth_users.charge_consultation` et tables `consultation_*`) : sans cela, **la connexion renvoie une 500**.
