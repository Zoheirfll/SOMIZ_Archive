# Types de contrat sans date de fin, champ personnalisé "liste", format de date DD/MM/YYYY

Date : 2026-09-17

## Contexte

Trois évolutions indépendantes demandées ensemble :
1. Certains types de contrat (CDI, "Permanent"...) ne doivent jamais avoir de date de fin.
2. Les champs personnalisés (`ChampPersonnalise`) n'ont que texte/nombre/date/booléen — besoin d'un type "liste" (choix unique parmi des valeurs prédéfinies, éditables).
3. Les dates affichées à l'écran doivent être en format `DD/MM/YYYY` (actuellement ISO brut ou format navigateur selon l'endroit), y compris dans les exports xlsx.

## 1. Types de contrat — durée indéterminée

- `TypeContrat.duree_indeterminee` (nouveau `BooleanField`, `default=False`).
- `/parametres` → onglet "Types de contrat" : case à cocher "Durée indéterminée (pas de date de fin)" dans le formulaire d'ajout/édition.
- Formulaire Contrat (`EmployeeDetail.jsx`/`ContratDetail.jsx`, création/édition de contrat) : dès que le `type_contrat` sélectionné a `duree_indeterminee=True`, le champ "Date de fin" est masqué (pas juste désactivé) et sa valeur locale vidée.
- Backend `ContratSerializer.validate()` : si le `type_contrat` résultant a `duree_indeterminee=True`, force `date_fin=None` dans les données validées, même si le payload en envoie une — garde-fou serveur (même pattern que les forçages déjà existants pour `motif_archivage`/`statut`).
- Aucun changement à `Employee.date_fin_contrat` / `sync_statut_from_dernier_contrat()` — la synchro existante recopie déjà `date_fin` du dernier contrat, qui sera `None` du fait du garde-fou ci-dessus.
- Migration Django simple (ajout de colonne, pas de backfill nécessaire — les contrats existants gardent leur `date_fin` actuelle).

## 2. Champ personnalisé "liste"

- `ChampPersonnalise.TypeChamp` gagne `LISTE = 'liste', 'Liste (choix unique)'`.
- Nouveau modèle `ChampPersonnaliseOption` :
  - `id` (UUID pk, comme les autres modèles du projet)
  - `champ` (FK → `ChampPersonnalise`, `on_delete=CASCADE`, `related_name='options'`)
  - `valeur` (`CharField(max_length=200)`)
  - `ordre` (`PositiveSmallIntegerField(default=0)`)
  - `is_active` (`BooleanField(default=True)`)
  - `Meta.ordering = ['ordre', 'valeur']`
- `EmployeeChampValeur.valeur` ne change pas de type (reste `CharField` texte libre) — pour un champ `LISTE`, la valeur stockée est le libellé de l'option choisie (pas de FK). Une option désactivée (`is_active=False`) n'apparaît plus dans les choix proposés mais une valeur déjà enregistrée reste affichée telle quelle (pas de perte de donnée, cohérent avec le pattern `is_active` du reste du projet).
- Validation `PATCH /api/employees/<id>/champs/` (`employees/views.py`) : pour un champ `type_champ=LISTE`, la valeur soumise doit correspondre au `valeur` d'une `ChampPersonnaliseOption` `is_active=True` de ce champ, sinon 400. Une valeur déjà enregistrée mais devenue orpheline (option désactivée depuis) n'est pas resoumise automatiquement — seule une nouvelle saisie est validée.
- Endpoints options (ADMIN only, CRUD) :
  - `GET /api/ref/champs-personnalises/<id>/options/`
  - `POST /api/ref/champs-personnalises/<id>/options/` (créer une option)
  - `PATCH /api/ref/champs-personnalises/options/<option_id>/` (renommer, réordonner, activer/désactiver)
  - `DELETE` non exposé — la désactivation (`is_active=False`) est le seul mécanisme de retrait, cohérent avec la décision "soft-delete".
- UI `/parametres` → "Champs personnalisés" : quand `type_champ` = "Liste" est sélectionné dans le formulaire d'un champ, un sous-panneau "Options" apparaît (ajouter une valeur, réordonner par drag ou boutons ↑/↓, toggle actif/inactif) — même esprit que les autres CRUD de référentiels de la page.
- Fiche employé (`EmployeeDetail.jsx`, panneau Informations) : un champ personnalisé `LISTE` se rend comme un `<select>` (options actives + l'option actuellement sélectionnée si elle est inactive, pour ne pas la faire disparaître du select) au lieu d'un input texte.
- Import CSV/xlsx (`import_views.py`) : une colonne correspondant à un champ `LISTE` est acceptée si sa valeur correspond exactement à une option active (comparaison insensible à la casse comme le reste des colonnes optionnelles) ; sinon la ligne est rejetée avec une erreur explicite (comme les autres colonnes invalides).

## 3. Format de date DD/MM/YYYY

- Nouveau helper `frontend/src/utils/formatDate.js` :
  ```js
  export function formatDateFR(isoString) {
    if (!isoString) return '—';
    const [y, m, d] = isoString.slice(0, 10).split('-');
    if (!y || !m || !d) return '—';
    return `${d}/${m}/${y}`;
  }
  ```
  (parsing manuel de la chaîne ISO `YYYY-MM-DD`/`YYYY-MM-DDTHH:mm:ss...` — évite tout décalage de fuseau horaire que `new Date().toLocaleDateString()` peut introduire).
- Remplace tous les affichages de date actuellement bruts ou dupliqués : `EmployeesTable.jsx` (`date_naissance`, `date_embauche` bruts), `EmployeeDetail.jsx`, `ContratDetail.jsx`, `DossierTab.jsx`, `CarriereTab.jsx`, `AuditLogs.jsx`, `Statistiques.jsx`, `Users.jsx`, `Import.jsx`. Les `formatDateTime()` locaux dupliqués (upload de fichiers) sont réécrits pour utiliser `formatDateFR` pour la partie date, en conservant l'heure séparément si déjà affichée.
- Non concerné : les `<input type="date">` de saisie (formulaires), qui gardent le format natif du navigateur — pas personnalisable en HTML standard sans remplacer le composant, hors scope.
- Exports xlsx (`backend/audit/stats.py` pour `/reporting/stats-export.xlsx/`, `import_views.py` pour les templates téléchargeables) : les cellules de colonnes date sont écrites comme objets `date`/`datetime` Python (pas des chaînes) avec `cell.number_format = 'DD/MM/YYYY'` — affichage correct quel que soit le paramètre régional Excel de l'admin, sans changer le type de donnée sous-jacent.
- Le parsing des imports (lecture CSV/xlsx en entrée) n'est pas modifié par ce chantier — reste au format actuellement accepté (ISO `YYYY-MM-DD`).

## Tests

- Backend : nouveaux tests pour `ContratSerializer.validate()` (date_fin forcée à None si type durée indéterminée), `ChampPersonnaliseOption` CRUD + validation de valeur liste dans `PATCH /champs/`, format `number_format` des exports xlsx (vérifier au moins que la cellule contient un objet date, pas une string).
- Frontend : tests `formatDateFR` (cas normal, `null`, chaîne malformée), rendu `<select>` pour un champ liste sur `EmployeeDetail.jsx`, masquage du champ Date de fin quand un type durée indéterminée est sélectionné dans le formulaire contrat.
- Lancer la suite complète (`pytest` + `npm test`) avant de considérer le travail terminé, conformément à la convention du projet (modifications touchant `employees`, modèles/scoping).
