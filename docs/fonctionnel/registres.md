# Registres de mouvement et de réception (2026-10-11)

> À lire avant de toucher à l'app `registres` (registre 01 mouvement, registre 02 réception/classement, export, impression).
>
> Spec : `docs/superpowers/specs/2026-10-10-registres-design.md` — plan : `docs/superpowers/plans/2026-10-11-registres.md`.
> Journal de sécurité : `securite.md` point 46.

---

## Besoin

Tenir les deux registres d'un service d'archives, à partir de la note manuscrite du propriétaire :

- **Registre 01 — mouvement** : sortie et retour des dossiers/documents (consultations numériques **et** dossiers
  papier saisis à la main).
- **Registre 02 — enregistrement et classement** : documents reçus (type, nombre, expéditeur, réception, classement).

Chaque registre s'imprime (PDF) et s'exporte (Excel). Pas d'envoi par e-mail (décision : ne pas faire sortir de
données RH de l'application).

## Qui fait quoi

SUPERADMIN, ou ADMIN portant `charge_consultation` (`User.can_manage_consultations`). Aucun nouveau drapeau. Tout
autre compte (ADMIN sans le drapeau, CONSULTANT, GESTIONNAIRE) reçoit **403** sur les routes de liste, création,
modification, retour, classement, annulation et export ; **404** seulement pour une référence introuvable.

## Modèle de données (`backend/registres/models.py`)

- `RegistreReferenceCounter` — compteur par (type `M`/`R`, année) sous `select_for_update()`.
- `MouvementArchive` — `reference` `M-NNNNN/AA`, `employee` optionnel (FK `PROTECT`), `nom_libre`, `beneficiaire`,
  `fonction`, `service`, `numero_contrat`, `type_documents`, `nombre_documents`, `date_depart`, `date_retour`
  (null = non rendu), `observation`, `is_active` + `motif_annulation`, `saisi_par`.
- `ReceptionDocument` — `reference` `R-NNNNN/AA`, `type_document`, `nombre`, `expediteur`, `date_reception`,
  `date_classement` (null = non classé), `observation`, `is_active` + `motif_annulation`, `saisi_par`.
- **Vue du registre 01** (`registres/services.py`, `registre_mouvements`) : lignes manuelles + `DemandeConsultation`
  validées ou révoquées de l'année. Les consultations ne sont **jamais copiées** : départ = `date_validation` ; retour
  = date de révocation, sinon échéance si dépassée, sinon « En cours » ; nombre de documents = nombre de
  `ConsultationFichier`. Une consultation garde sa référence `C-NNNNN/AA`.
- **« Nom prénom » de la note manuscrite** (décision du propriétaire, 2026-10-11) : les **deux** sont affichés côte à
  côte, avec le même poids, sous des libellés explicites dans l'écran, le PDF et l'Excel — **Bénéficiaire (qui
  emporte le dossier)** (le demandeur pour une consultation) et **Employé concerné (dossier)**. Fonction, service et
  n° de contrat sont ceux de l'employé concerné.

## API (`/api/registres/`)

| Route | Rôle |
|---|---|
| `GET/POST mouvements/` | Registre 01 d'une année (`annee`, `q`, `statut=en_cours`, `page`, `page_size`) / nouvelle ligne manuelle |
| `GET/PATCH mouvements/<slug>/` | Détail / modification (diff tracé dans l'audit) |
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

- **Aucun DELETE** (405) : pièce probante. Annulation = soft-delete avec motif ; la ligne reste visible, barrée, et
  n'est plus modifiable. Chaque modification trace l'ancienne valeur (`details['changes']`).
- **Piège `Q(a) | Q()`** : combiner le périmètre d'employés avec un `Q()` vide revient à `Q(a)` et exclurait à tort les
  consultations sans employé. `_lignes_consultations` ne combine que si le périmètre est non vide.
- **Piège `?format=`** : DRF réserve ce paramètre à la négociation de contenu (`URL_FORMAT_OVERRIDE`) et répond 404
  avant d'atteindre la vue pour `xlsx`/`pdf` (un seul moteur de rendu JSON). Le paramètre s'appelle donc **`fmt`**
  (backend `RegistreExportView` et frontend `telechargerRegistre`).
- **Ordre des routes** : `<registre>/export/` doit rester **avant** `<registre>/<ref>/` dans `registres/urls.py`.
- **Injection de formule Excel** : cellules commençant par `= + - @` préfixées d'une apostrophe
  (`exports.neutraliser`). Dates Excel en `DD/MM/YYYY` (`number_format`), PDF en `%d/%m/%Y`. Dans le PDF, `&`, `<`, `>`
  des champs libres sont échappés (ReportLab interprète du balisage).
- **Export sans colonnes sensibles** (NIN, sécu, RIB) ; throttle `registre_export` 10/min ; `Cache-Control: no-store`.
- Le throttle vit dans le cache partagé : `test_registres_export.py` le vide avant chaque test.
- Les lignes issues d'une consultation n'ont **aucune action** dans le registre (ni retour, ni annulation) : elles se
  gèrent dans `/consultations`.

## Interface (`/registres`)

Page à deux onglets **Mouvements | Réceptions** (`pages/Registres.jsx`), entrée « Registres » de la navbar visible si
`user.can_manage_consultations`. Chaque panneau : sélecteur d'année (6 ans), recherche, filtre « Non rendus » /
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

- **Copier chaque consultation validée dans `MouvementArchive`** : n° d'ordre stable, mais synchronisation à chaque
  prolongation, révocation ou purge ; un oubli rend le registre faux.
- **Étendre l'app `consultations`** : mélange deux métiers, déjà écarté pour les attestations.
- **Nouveau drapeau « archiviste »** : rôle supplémentaire à gérer pour un gain faible.
- **« Envoyer » par e-mail** : SMTP à configurer et données personnelles hors de SOMIZ.
- **`?format=` pour l'export** : voir le piège ci-dessus.

## Tests

Backend (`backend/tests/test_registres_*.py`, 62 tests ; suite complète : 847 passés avant l'ajout de la pagination, puis les tests registres relancés seuls) : modèles et compteur, actions d'audit, vue unifiée,
API mouvements (permissions sur vraies routes, création, modification, retour, annulation, pas de DELETE), API
réceptions, scoping, export (neutralisation des formules, audit, throttle isolé). Frontend
(`frontend/src/__tests__/Registre*.test.jsx`, 16 tests ; suite complète : 488) : modale (dont champ employé), panneaux
(retour/classement/annulation sans `window.prompt`/`window.confirm`, refresh silencieux, pagination, retour à la
page 1 au changement de filtre, envoi de l'identifiant d'employé), page à onglets.

## Reste à faire / limites

- Vérification manuelle dans un navigateur du parcours complet (création, retour, annulation, impression, export).
- Le registre 01 est calculé en mémoire (lignes manuelles + consultations de l'année) puis paginé : correct jusqu'à
  quelques milliers de lignes par an. Au-delà, il faudrait paginer en base (union SQL) ; non nécessaire aujourd'hui.
- La modale de saisie n'a pas de modification d'une ligne existante (l'API `PATCH` existe) : seules la création, le
  retour, le classement et l'annulation sont exposés dans l'interface.
- Après un `git pull` de cette branche : `python manage.py migrate` (tables `registre_*` et actions d'audit).
  Aucune tâche planifiée à créer.
