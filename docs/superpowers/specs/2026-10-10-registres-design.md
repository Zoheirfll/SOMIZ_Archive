# Registres de mouvement et de réception — design (2026-10-10)

> Branche : `demande`. Source : note manuscrite du propriétaire (Registre 01 / Registre 02) + brainstorming du 2026-10-10.
> Lié à : `docs/fonctionnel/consultations.md`, `docs/fonctionnel/scoping.md`, `securite.md`.

## Besoin

Tenir, dans SOMIZ, les deux registres d'un service d'archives :

- **Registre 01 — mouvement** : sortie et retour des dossiers/documents (consultations numériques **et** dossiers papier).
- **Registre 02 — enregistrement et classement** : documents reçus (type, nombre, expéditeur, réception, classement).

Chaque registre s'imprime (PDF) et s'exporte (Excel). Pas d'envoi par e-mail (décision : éviter de sortir des données RH de l'application).

## Décisions

| Sujet | Décision |
|---|---|
| Périmètre | Les deux registres dans le même chantier |
| Nature d'un mouvement | Consultations validées (automatique) **+** lignes manuelles pour le papier |
| Architecture | Nouvelle app `registres` ; registre 01 = **vue calculée** (pas de copie des consultations) |
| Accès | SUPERADMIN, ou ADMIN avec `charge_consultation`. Aucun nouveau drapeau. Autres : 404 |
| Employé sur une ligne manuelle | Optionnel (FK), sinon nom libre |
| Numérotation | Compteur annuel à vie : `M-NNNNN/AA` (mouvement manuel), `R-NNNNN/AA` (réception). Une ligne issue d'une consultation garde `C-NNNNN/AA` |
| « Envoyer » | Supprimé : Imprimer (PDF) + Télécharger (Excel) seulement |

## Données (`backend/registres/models.py`)

- `RegistreReferenceCounter` : compteur par (type, année), incrémenté sous `select_for_update()` (même mécanisme que `ConsultationReferenceCounter`).
- `MouvementArchive` : `reference`, `employee` (FK nullable), `nom_libre`, `fonction`, `service`, `numero_contrat`,
  `type_documents`, `nombre_documents`, `date_depart`, `date_retour` (null = non rendu), `beneficiaire`, `observation`,
  `is_active` + `motif_annulation` (annulation = soft-delete, la ligne reste visible barrée), `saisi_par`, `created_at`, `updated_at`.
- `ReceptionDocument` : `reference`, `type_document`, `nombre`, `expediteur`, `date_reception`,
  `date_classement` (null = non classé), `observation`, `is_active` + `motif_annulation`, `saisi_par`, `created_at`, `updated_at`.

### Vue du registre 01 (`registres/services.py`)

Union, triée par date de départ, filtrée par année (exercice) :

- lignes `MouvementArchive` actives (et annulées, marquées) ;
- `DemandeConsultation` validées : départ = `date_validation` ; retour = `date_revocation`, sinon `date_echeance` si passée,
  sinon « en cours » ; nombre de documents = nombre de `ConsultationFichier` ; référence = `C-NNNNN/AA`.

Aucune colonne ajoutée à `consultations` : pas de synchronisation à maintenir (prolongation, révocation, purge se reflètent seules).

## Sécurité et règles

- Permission dédiée `registres/permissions.py` : SUPERADMIN ou (ADMIN et `charge_consultation`). Test d'intégration sur une vraie route (règle transversale du projet), pas seulement sur le défaut DRF.
- **Scoping** : une ligne liée à un employé applique `can_access_employee()` ; les consultations de la vue sont filtrées comme dans `consultations`.
- **Aucun DELETE** (pièce probante). Correction = modification tracée (ancienne valeur dans l'audit). Annulation = motif obligatoire.
- **Audit** (`AuditLog.Action`, ≤ 20 caractères) : création, modification, annulation, retour, réception/classement, impression, export.
  Chaque impression et chaque export est tracé (filtres utilisés en détail).
- Export Excel : mêmes rôles uniquement ; aucune colonne sensible (NIN/sécu/RIB). À consigner dans `securite.md`.
- Throttle sur l'export/impression ; validation serveur de toutes les entrées.

## Interface

- Navbar : entrée « Registres » (mêmes rôles), onglets **Mouvements | Réceptions**.
- Liste : sélecteur d'année, recherche, filtres « en cours » (non rendu / non classé), colonnes calquées sur la note ;
  pastille « consultation » / « manuel » sur le registre 01.
- Saisie : modale (recherche d'employé optionnelle, composant déjà utilisé par `/consultations/nouvelle`) ;
  « Enregistrer le retour » en un clic, refresh **silencieux** (`fetch*(true)`).
- Impression PDF (ReportLab) et export Excel : boutons Imprimer / Télécharger.
- Confirmation d'annulation par modale `useConfirm()` (pas de `window.confirm`), tokens `theme.js`, styles inline.

## Approches écartées

- **Copie de chaque consultation validée dans `MouvementArchive` (approche B)** : n° d'ordre stable, mais synchronisation à chaque prolongation/révocation/purge ; un oubli rend le registre faux.
- **Étendre l'app `consultations` (approche C)** : mélange deux métiers, déjà écarté pour les attestations.
- **Nouveau drapeau « archiviste »** : rôle supplémentaire à gérer pour un gain faible.
- **« Envoyer » par e-mail** : SMTP à configurer et données personnelles hors de SOMIZ.

## Tests prévus

Backend (`backend/tests/test_registres_*.py`) : permissions sur vraie route (SUPERADMIN, ADMIN traiteur, ADMIN sans drapeau, CONSULTANT/GESTIONNAIRE → 404), scoping, compteur annuel (unicité, pas de réutilisation), vue unifiée (retour dérivé d'une consultation révoquée/expirée), annulation, audit d'impression/export. Frontend Jest : listes, saisie, retour en un clic, absence de `window.confirm`.

## Reste à faire avant le code

Plan d'implémentation (skill `writing-plans`), après relecture de cette spec.
