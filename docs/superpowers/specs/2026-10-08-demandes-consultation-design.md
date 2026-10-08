# Demandes de consultation de documents archivés — spec de design

Date : 2026-10-08 — Branche : `demande`

## Besoin

Un responsable (ex. un directeur) demande dans l'app à consulter un dossier, un
document ou une information archivés. L'admin d'archive valide, scanne la pièce
(déjà archivée ou externe) et la lui envoie **à travers l'app uniquement**
(confidentialité), pour une durée limitée. À l'échéance, le document n'est plus
consultable. La demande porte une date, une référence et un type, et son suivi
affiche statut, date de validation et échéance.

## Décisions validées

| Sujet | Décision |
|---|---|
| Demandeur | Comptes existants `GESTIONNAIRE` / `CONSULTANT` (pas de nouveau rôle) |
| Traiteur | `SUPERADMIN` toujours ; `ADMIN` seulement si nouveau drapeau `User.charge_consultation` (même mécanisme que `charge_attestation`) |
| Objet de la demande | Employé **optionnel** + description libre ; si employé fourni, `can_access_employee()` s'applique |
| Accès pendant la durée | Lecture seule par défaut ; téléchargement décidé par l'admin, demande par demande (`telechargement_autorise`, `False` par défaut) |
| À l'expiration | Accès coupé côté serveur, fichier **conservé** par défaut pour les admins ; purge possible uniquement via une commande explicite et validée (voir « Fonctions complémentaires ») |
| Architecture | Nouvelle app `consultations` (approche A) ; pas de réutilisation d'`EmployeeDocument` ni de l'app `attestations` |

Approches écartées : (B) généraliser `attestations` avec un type de demande —
couple deux métiers (PDF ReportLab, config de modèle, statuts propres) ;
(C) stocker le scan livré en `EmployeeDocument` — fausserait complétude, OCR et
recherche plein texte.

## Modèle de données

**`DemandeConsultation`** : `reference` unique `C-NNNNN/AA` (compteur annuel sous
`select_for_update()`, même technique que `attestations/reference.py`),
`type_demande` (`dossier`/`document`/`information`), `description`, `employee`
(FK optionnelle), `demandeur`, `traite_par`, `statut`, `motif_rejet`,
`created_at`, `date_validation`, `date_echeance`, `telechargement_autorise`.

**`ConsultationFichier`** : fichier livré, rattaché à la demande (plusieurs
possibles), stocké à part (nom UUID, validation MIME python-magic, 20 Mo max).
Provenance : scan externe uploadé, ou **copie** d'un document archivé de
l'employé (l'original n'est jamais exposé).

## Workflow

```
En cours de validation ──► Validée ──► Expirée (déduite)
        │                     └──► Révoquée
        └──► Rejetée (motif obligatoire)
```

- Seul le traiteur change le statut ; durée choisie à la validation (presets
  1 h / 24 h / 72 h / 7 j), plafond en settings.
- **« Expirée » n'est pas stocké** : déduit de `date_echeance < now()`. Aucune
  tâche planifiée n'est nécessaire pour couper l'accès.
- Le demandeur annule sa demande uniquement en « En cours de validation ».
- Le traiteur ne peut pas traiter sa propre demande (séparation
  demandeur/validateur).

## Sécurité de la livraison

- `GET /api/consultations/<ref>/fichiers/<id>/voir/` : flux authentifié (cookie
  httpOnly), jamais d'URL vers `media/`. Vérifié à **chaque** requête, dans
  l'ordre : (1) demandeur de cette demande ou traiteur ; (2) statut `Validée` ;
  (3) échéance non dépassée. Tiers → **404** ; demandeur légitime hors
  validité → **403** explicite. Le traiteur peut toujours ouvrir.
- `/telecharger/` : endpoint distinct, ouvert seulement si
  `telechargement_autorise`, mêmes trois vérifications, tracé dans l'audit.
- Throttle `consultation` (30/min) appliqué.
- Filigrane (nom du demandeur + référence + date) en surimpression dans le
  viewer. Limite assumée : capture/photo d'écran restent possibles sans
  téléchargement ; le filigrane est aussi incrusté dans la copie servie (voir
  « Fonctions complémentaires »).

## Permissions

- Création : `GESTIONNAIRE`/`CONSULTANT` uniquement (un ADMIN ne crée pas).
- Liste/détail : le demandeur ne voit que ses demandes ; le traiteur voit tout ;
  un ADMIN sans `charge_consultation` n'a aucun accès.
- `charge_consultation` : modifiable dans `/users`, forcé à `False` pour un
  non-ADMIN (garde-fou identique à `charge_attestation`).

## Audit et notifications

Nouvelles `AuditLog.Action` : création, changement de statut (validation, rejet,
révocation), upload d'un fichier livré, **chaque consultation**, chaque
téléchargement. Notifications via `notifications/service.py`, messages neutres
(référence seule) : nouvelle demande → traiteurs ; validée/rejetée/révoquée →
demandeur ; rappels d'échéance et prolongation : voir « Fonctions
complémentaires ».

## Interface

`/consultations` (liste, « mes demandes » ou vue traiteur avec filtres statut/
type et onglet « à traiter »), `/consultations/nouvelle`, `/consultations/:ref`
(stepper Demande → Validation → Échéance, panneau « Traiter » : upload ou copie
d'un archivé, durée, case téléchargement, Valider/Rejeter/Révoquer ; après
expiration, message « Consultation expirée le … » à la place du viewer).
Badge navbar « N à traiter » pour les traiteurs. Viewer : `SecureDocViewer` en
mode restreint (capacités réelles à vérifier à l'implémentation). Conventions :
styles inline, tokens `theme.js`, `useConfirm()`/`usePrompt()`, refresh
silencieux. Révocation : confirmation renforcée.

## Tests

- Backend (TDD) : transitions, expiration (horloge simulée), les trois contrôles
  d'accès sur de vraies routes, séparation demandeur/traiteur, scoping des
  listes, drapeau `charge_consultation`, audit de chaque lecture, notifications
  (`django_capture_on_commit_callbacks`).
- Frontend : visibilité des boutons par rôle, état expiré, parcours de création,
  absence de contrôle de téléchargement par défaut.

## Documentation à produire à l'implémentation

`docs/fonctionnel/consultations.md`, entrée dans l'index de `CLAUDE.md`, nouveau
point dans `securite.md`.

## Fonctions complémentaires (intégrées, 2026-10-08)

Initialement écartées par prudence (YAGNI), réintégrées à la demande de
l'utilisateur. Elles sont livrées dans le même chantier, en dernier lot.

1. **Rappel avant échéance** : commande `manage.py notifier_echeances_consultation`
   (idempotente, une notification par demande et par seuil), à planifier en
   production à côté de `notifier_echeances_contrat`. Seuils : 24 h et 1 h avant
   l'échéance (ignorés si la durée totale est plus courte). Destinataires : le
   demandeur et le traiteur. Message neutre (référence seule). L'accès reste
   coupé par la vérification serveur même si la commande ne tourne pas.
2. **Prolongation** : décidée par le traiteur uniquement (`POST .../prolonger/`),
   sur une demande `Validée` non expirée ou expirée depuis moins de 24 h ; durée
   choisie parmi les presets, plafond cumulé en settings
   (`CONSULTATION_MAX_DUREE_TOTALE`). Chaque prolongation est auditée (ancienne
   et nouvelle échéance) et notifie le demandeur. Le demandeur ne prolonge pas :
   il refait une demande si le délai de grâce est dépassé.
3. **Filigrane incrusté** : à chaque lecture, le serveur génère une copie
   filigranée à la volée (nom du demandeur + référence + date/heure, en
   diagonale répétée) pour les PDF (pypdf + ReportLab, déjà en dépendance) et les
   images (Pillow). L'original livré n'est jamais servi tel quel au demandeur,
   y compris pour `/telecharger/` : la copie téléchargée est donc elle aussi
   filigranée. Rien n'est stocké, la copie est calculée par requête. Le
   filigrane CSS du viewer est conservé en complément. Coût : un rendu par
   lecture, borné par le throttle et la limite de 20 Mo ; à mesurer sur un PDF
   de 50 pages avant de valider la performance.
4. **Purge des scans livrés** : commande `manage.py purger_consultations
   [--jours N] [--dry-run]`, **jamais automatique** et jamais lancée sans étape
   de validation. Concerne uniquement les fichiers de demandes expirées/
   révoquées depuis plus de N jours (défaut 90) et provenant d'un **scan
   externe** (les copies d'archivés ne sont pas concernées, l'original reste
   dans le dossier). Garde-fous (incident du 2026-07-22) : (1) le mode
   `--dry-run` liste précisément chaque fichier concerné, la purge réelle exige
   `--confirmer` après validation de la liste ; (2) normalisation et contrôle
   que chaque chemin est sous `MEDIA_ROOT/consultations/` avant tout
   `os.remove()` ; (3) sauvegarde du dossier avant purge ; (4) chaque
   suppression tracée dans l'audit (snapshot texte : référence, nom, taille).
   La ligne `ConsultationFichier` est conservée avec `supprime_le` renseigné
   (la demande garde son historique, seul le contenu disparaît). **Ceci modifie
   la décision « fichier conservé pour l'admin »** : la conservation reste le
   comportement par défaut, la purge est un outil explicite et opt-in.

### Impacts sur le modèle et les tests

- `DemandeConsultation` : `date_echeance_initiale`, `prolongations` (nombre) ;
  table d'historique ou entrées d'audit pour chaque prolongation.
- `ConsultationFichier` : `supprime_le` (nullable), `origine`
  (`scan_externe`/`copie_archive`).
- Tests : rappels idempotents, plafond de prolongation, délai de grâce,
  filigrane présent sur la sortie PDF et image (texte extrait / pixels),
  original jamais servi, purge refusée sans `--confirmer`, refus d'un chemin
  hors `MEDIA_ROOT`.
