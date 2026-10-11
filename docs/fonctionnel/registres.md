# Registres de mouvement et de réception (2026-10-11)

> À lire avant de toucher à l'app `registres` (registre 01 mouvement, registre 02 réception/classement, export, impression).
>
> Spec : `docs/superpowers/specs/2026-10-10-registres-design.md` — plan : `docs/superpowers/plans/2026-10-11-registres.md`.
> Journal de sécurité : `securite.md` point 46.

---

## Besoin

Tenir les deux registres d'un service d'archives, à partir de la note manuscrite du propriétaire :

- **Registre 01 — mouvement** : sortie et retour des dossiers/documents **physiques** (papier), saisis à la main.
  Les consultations numériques n'y figurent **pas** (décision du propriétaire, 2026-10-11 : ce ne sont pas des
  mouvements physiques ; elles se suivent dans `/consultations`).
- **Registre 02 — enregistrement et classement** : documents reçus (type, nombre, expéditeur, réception, classement).

Chaque registre s'imprime (PDF) et s'exporte (Excel). Pas d'envoi par e-mail (décision : ne pas faire sortir de
données RH de l'application).

## Qui fait quoi

SUPERADMIN (toujours, il a tous les droits), ou ADMIN portant **`User.charge_registre`** (`can_manage_registres`).
Même schéma que `charge_consultation` / `charge_attestation` : le drapeau n'est attribuable que par un
**SUPERADMIN** (`UserSerializer` / `UserCreateSerializer`, 400 pour tout autre compte, y compris l'auto-attribution),
n'a de sens que pour un ADMIN (forcé à `false` pour les autres rôles), et se règle sur `/users` (case à la création,
bouton « Registres ✓/✗ » pour le SUPERADMIN). **Indépendant** de `charge_consultation` : un chargé des consultations
n'entre pas dans les registres sans être coché ici (testé). Tout autre compte reçoit **403** sur les routes de
liste, création, modification, retour, classement, annulation et export ; **404** seulement pour une référence
introuvable. (Décision du propriétaire, 2026-10-11 ; la première version réutilisait `charge_consultation`.)

**Registre commun** : tous les comptes autorisés voient et alimentent **les mêmes lignes** (aucun filtrage par
auteur). Chaque ligne porte **qui l'a saisie** (`saisi_par`, colonne « Saisi par » à l'écran, en PDF et en Excel) :
le serveur le pose depuis le compte connecté, le client ne peut pas le fixer (testé).

## Modèle de données (`backend/registres/models.py`)

- `RegistreReferenceCounter` — compteur par (type `M`/`R`, année) sous `select_for_update()`.
- `MouvementArchive` — `reference` `M-NNNNN/AA`, `employee` optionnel (FK `PROTECT`), `nom_libre`, `beneficiaire`,
  `fonction`, `service`, `numero_contrat`, `type_documents`, `nombre_documents`, `date_depart`, `date_retour`
  (null = non rendu), `observation`, `is_active` + `motif_annulation`, `saisi_par`.
- `ReceptionDocument` — `reference` `R-NNNNN/AA`, `type_document`, `nombre`, `expediteur`, `date_reception`,
  `date_classement` (null = non classé), `observation`, `is_active` + `motif_annulation`, `saisi_par`.
- **Registre 01** (`registres/services.py`, `registre_mouvements`) : les `MouvementArchive` de l'année, triés par
  date de départ, avec recherche et filtre « non rendus ». Aucune dépendance à l'app `consultations`.
  (`user` reste dans la signature de `registre_mouvements` pour qu'un éventuel scoping ne change pas les appelants.)
- **« Nom prénom » de la note manuscrite** (décision du propriétaire, 2026-10-11) : les **deux** sont affichés côte à
  côte, avec le même poids, sous des libellés explicites dans l'écran, le PDF et l'Excel — **Bénéficiaire (qui
  emporte le dossier)** (le demandeur pour une consultation) et **Employé concerné (dossier)**. Fonction, service et
  n° de contrat sont ceux de l'employé concerné.

## API (`/api/registres/`)

| Route | Rôle |
|---|---|
| `GET/POST mouvements/` | Registre 01 d'une année (`annee`, `q`, `statut=en_cours`, `page`, `page_size`) / nouvelle ligne manuelle |
| `GET/PATCH/DELETE mouvements/<slug>/` | Détail / modification (diff tracé) / suppression définitive (ligne annulée uniquement, instantané tracé) |
| `POST mouvements/<slug>/retour/` | Enregistre le retour (date du jour, ou `date_retour` fournie) |
| `POST mouvements/<slug>/annuler/` | Annulation avec `motif` obligatoire |
| `GET/POST receptions/` | Registre 02 d'une année (`annee`, `q`, `statut=a_classer`, `page`, `page_size`) / nouvelle réception |
| `GET/PATCH receptions/<slug>/`, `POST …/classer/`, `POST …/annuler/` | Symétrique |
| `GET <registre>/export/?fmt=xlsx\|pdf` | Export Excel / impression PDF, tracés |

Slug d'URL : `/` → `-` (`M-00001/26` → `M-00001-26`).

**Pagination (2026-10-11)** : les deux listes renvoient `{annee, count, page, page_size, num_pages, results}`.
`page_size` vaut 50 par défaut et 200 au maximum (une valeur plus grande est plafonnée, une valeur non numérique
ou < 1 donne 400) ; une page hors plage renvoie `results: []` avec le bon `count`. La pagination s'applique
**après** filtrage et tri (`views.paginer`). L'**export ne pagine jamais** : un registre imprimé ou exporté contient
toutes les lignes de l'année filtrée (testé).

## Règles et pièges

- **Suppression possible, mais en deux temps et auditée** (décision du propriétaire, 2026-10-11 ; la première version
  interdisait tout `DELETE`). (1) **Annuler** la ligne avec un motif obligatoire : soft-delete, la ligne reste visible,
  barrée, et n'est plus modifiable. (2) **Supprimer définitivement** (`DELETE …/<slug>/`) : refusé (400) tant que la
  ligne est active ; un **instantané complet** (tous les champs, motif d'annulation, auteur de la saisie, date de
  création) est écrit dans l'audit (`DELETE_MOUVEMENT` / `DELETE_RECEPTION`, `details.snapshot`) **avant** l'effacement,
  dans la même transaction (si l'audit échoue, rien n'est supprimé). La référence n'est **jamais réattribuée**
  (compteur à vie) : un trou de numérotation s'explique par l'audit. À l'écran, confirmation renforcée : il faut
  **saisir la référence** de la ligne (pas un simple clic).
- Chaque modification trace l'ancienne valeur (`details['changes']`).
- Les erreurs de l'API peuvent être une liste (`ValidationError("…")`), un `detail` ou un dictionnaire par champ :
  l'écran les lit via `messageErreur` (`utils/registres.js`) ; sans cela le vrai message était remplacé par
  « Action impossible. ».
- **Piège `?format=`** : DRF réserve ce paramètre à la négociation de contenu (`URL_FORMAT_OVERRIDE`) et répond 404
  avant d'atteindre la vue pour `xlsx`/`pdf` (un seul moteur de rendu JSON). Le paramètre s'appelle donc **`fmt`**
  (backend `RegistreExportView` et frontend `telechargerRegistre`).
- **Ordre des routes** : `<registre>/export/` doit rester **avant** `<registre>/<ref>/` dans `registres/urls.py`.
- **Injection de formule Excel** : cellules commençant par `= + - @` préfixées d'une apostrophe
  (`exports.neutraliser`). Dates Excel en `DD/MM/YYYY` (`number_format`), PDF en `%d/%m/%Y`. Dans le PDF, `&`, `<`, `>`
  des champs libres sont échappés (ReportLab interprète du balisage).
- **Export sans colonnes sensibles** (NIN, sécu, RIB) ; throttle `registre_export` 10/min ; `Cache-Control: no-store`.
- Le throttle vit dans le cache partagé : `test_registres_export.py` le vide avant chaque test.

## Traçabilité (audit)

Tout ajout, toute modification et toute suppression laissent une trace dans `/audit` :

| Opération | Action d'audit | Détail tracé |
|---|---|---|
| Ajout d'un mouvement / d'une réception | `CREATE_MOUVEMENT` / `CREATE_RECEPTION` | nombre de documents ; expéditeur |
| Modification | `MODIFY_MOUVEMENT` / `MODIFY_RECEPTION` | `changes` : ancienne et nouvelle valeur de chaque champ modifié |
| Annulation (1re étape de la suppression) | `CANCEL_MOUVEMENT` / `CANCEL_RECEPTION` | motif ; la ligne reste en base |
| **Suppression définitive** (après annulation) | `DELETE_MOUVEMENT` / `DELETE_RECEPTION` | `snapshot` : tous les champs de la ligne, motif d'annulation, auteur de la saisie |
| Retour d'un dossier / classement | `RETOUR_MOUVEMENT` / `CLASSER_RECEPTION` | date |
| Impression PDF / export Excel | `PRINT_REGISTRE` / `EXPORT_REGISTRE` | registre, année, filtres, nombre de lignes |
| Attribution ou retrait de `charge_registre` | `MODIFY_USER` | `before` / `after` contenant les trois drapeaux |
| Création d'un compte avec le drapeau | `CREATE_USER` | les trois drapeaux |

**Trou d'audit corrigé le 2026-10-11** : l'audit de modification d'un compte ne contenait que rôle, activation et
périmètres ; attribuer ou retirer `charge_attestation` / `charge_consultation` n'était **pas** tracé. Les trois
drapeaux « chargé de… » sont désormais dans l'instantané (`UserUpdateView.perform_update`) et dans `CREATE_USER`.

La **consultation** (lecture) des registres n'est pas tracée ligne à ligne ; seuls l'export et l'impression le sont.

## Interface (`/registres`)

Page à deux onglets **Mouvements | Réceptions** (`pages/Registres.jsx`), entrée « Registres » de la navbar visible si
`user.can_manage_registres` (exposé par `/auth/me` et la réponse de connexion). Chaque panneau : sélecteur d'année (6 ans), recherche, filtre « Non rendus » /
« À classer », tableau calqué sur la note, pastille Manuel/Consultation, « Enregistrer le retour » / « Classer » en un
clic (refresh **silencieux**, `fetchLignes(true)`), « Annuler » avec motif (modale `usePrompt`, jamais
`window.prompt`), « Imprimer » (PDF) et « Télécharger » (Excel), et un pied de tableau `Pagination` (total de lignes,
Précédent / Suivant). Tout changement de filtre (année, recherche, statut) **revient à la page 1**. Saisie dans
`RegistreModal` (formulaire générique).

- **Employé concerné** (registre 01) : champ `EmployeeSearchField`, autocomplétion sur `/employees/search/` (même
  endpoint que `/consultations/nouvelle`, déjà borné au périmètre côté serveur ; 2 caractères minimum). Le panneau
  envoie `employee: <id>` ; si fonction, service ou n° de contrat sont laissés vides, **le serveur les reprend de
  l'employé** (contrat le plus récent). Sans employé, le « Nom et prénom » libre est obligatoire (erreur serveur
  « Indiquez un employé ou un nom »).

- `usePrompt(message, defaut, { confirmLabel })` : libellé du bouton de validation paramétrable (« Renommer » par
  défaut, pour ne pas changer les usages existants).
- Aucune couleur codée en dur : le calque de la modale est un `<div>` en `theme.text` avec opacité, et le texte du
  bouton primaire utilise `theme.surface` (lisible en thème clair comme sombre).
- Pas de bandeau « hero » : il codait des blancs en dur dans les autres pages ; à ajouter si un token dédié existe.

## Approches écartées

- **Fusionner les consultations validées dans le registre 01** (choix initial, **abandonné le 2026-10-11**) : une
  consultation est une livraison numérique, pas un mouvement physique ; la fusion (vue calculée, scoping des
  consultations, colonne « Origine », retour dérivé de l'échéance) a été retirée. Elle avait aussi écarté l'idée de
  **copier** chaque consultation dans `MouvementArchive` (synchronisation à chaque prolongation, révocation ou purge).
- **Étendre l'app `consultations`** : mélange deux métiers, déjà écarté pour les attestations.
- **Nouveau drapeau « archiviste »** : rôle supplémentaire à gérer pour un gain faible.
- **« Envoyer » par e-mail** : SMTP à configurer et données personnelles hors de SOMIZ.
- **`?format=` pour l'export** : voir le piège ci-dessus.
- **Interdire tout `DELETE`** (choix initial, **revu le 2026-10-11**) : un registre est une pièce probante, mais le
  propriétaire veut pouvoir supprimer une ligne saisie par erreur. Compromis retenu : suppression en deux temps
  (annulation motivée, puis suppression avec confirmation renforcée) et instantané complet dans l'audit.
- **Suppression en un clic sur une ligne active** : écartée, elle contournerait l'état intermédiaire « annulée ».

## Tests

Backend (`backend/tests/test_registres_*.py` dont `test_registres_flag.py` pour le drapeau, l'audit des attributions
et le registre commun ; suite complète : 847 passés avant la pagination et le drapeau, puis les tests registres et
`test_consultations_flag.py` relancés seuls : 89 passés) : modèles et compteur, actions d'audit, vue unifiée,
API mouvements (permissions sur vraies routes, création, modification, retour, annulation, pas de DELETE), API
réceptions, scoping, export (neutralisation des formules, audit, throttle isolé). Frontend
(`frontend/src/__tests__/Registre*.test.jsx` ; suite complète : 490 passés) : modale (dont champ employé), panneaux
(retour/classement/annulation sans `window.prompt`/`window.confirm`, refresh silencieux, pagination, retour à la
page 1 au changement de filtre, envoi de l'identifiant d'employé), page à onglets.

## Reste à faire / limites

- Vérification manuelle dans un navigateur du parcours complet (création, retour, annulation, impression, export).
- Le registre 01 est calculé en mémoire (lignes manuelles + consultations de l'année) puis paginé : correct jusqu'à
  quelques milliers de lignes par an. Au-delà, il faudrait paginer en base (union SQL) ; non nécessaire aujourd'hui.
- La modale de saisie n'a pas de modification d'une ligne existante (l'API `PATCH` existe) : seules la création, le
  retour, le classement et l'annulation sont exposés dans l'interface.
- Après un `git pull` de cette branche : `python manage.py migrate` (tables `registre_*`, actions d'audit et colonne
  `auth_users.charge_registre` : **sans elle la connexion renvoie une 500**). Aucune tâche planifiée à créer.
- **Après la migration, personne d'autre que le SUPERADMIN n'a accès** : cocher « Registres » sur `/users` pour chaque
  ADMIN concerné.
