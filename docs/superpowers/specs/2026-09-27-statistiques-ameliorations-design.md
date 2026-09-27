# Améliorations page /statistiques — 2026-09-27

## Contexte

La page `/statistiques` (backend/audit/stats.py `build_stats_detail()`,
frontend/src/pages/Statistiques.jsx) a quatre lacunes remontées par
l'utilisateur :

1. Les graphiques en donut (Direction/Département/Catégorie/Type de
   contrat/Fonction) n'ont aucun moyen de rechercher une entrée précise —
   la légende maison scrollable (`StatDonutChart.jsx`) devient difficile à
   parcourir dès qu'il y a beaucoup de catégories, et le donut "Par
   Fonction" agrège en plus tout au-delà des 10 fonctions les plus
   fréquentes dans une catégorie "Autres" (`TOP_FONCTIONS = 10`,
   `_repartition_fonction()`), rendant certaines fonctions invisibles y
   compris à la recherche.
2. "Contrats arrivant à échéance (90 jours)" utilise un seuil fixe côté
   backend (`_contrats_echeance()`). Vérifié en base de données de dev :
   ce n'est **pas un bug de requête** — sur 80 contrats, un seul a une
   `date_fin` renseignée (les 79 autres sont en CDI, sans date de fin par
   design — voir CLAUDE.md section "Types de contrat à durée
   indéterminée"), et son échéance tombe à 95 jours, donc juste hors de la
   fenêtre fixe de 90 jours. Le vrai besoin est un seuil réglable
   manuellement.
3. "Complétude par Direction" (radar) et "Complétude par Département"
   (barres) affichent un taux mais n'offrent aucun moyen d'aller voir
   *qui* est incomplet.
4. La section "Mon activité" (et son équivalent SUPERADMIN "Activité par
   administrateur") affiche des compteurs sans lien vers le détail exact
   des actions comptées — seul un lien générique "Voir mon journal
   d'audit →" existe, non filtré par catégorie.

## Périmètre

Spec unique couvrant les 4 chantiers ci-dessous, tous sur
`/statistiques` et les endpoints qui l'alimentent
(`backend/audit/stats.py`, `backend/audit/views.py`). Aucun changement de
modèle de données.

---

## 1. Recherche dans les donuts + suppression du Top 10 Fonction

### Backend

- `backend/audit/stats.py` : suppression de `TOP_FONCTIONS` et de
  `_repartition_fonction()` — `build_stats_detail()` appelle directement
  `_repartition_simple('poste__nom')` pour `repartition_fonction`, exactement
  comme `repartition_categorie`/`repartition_type_contrat`. Aucune
  agrégation "Autres" nulle part dans les répartitions.
- Aucun changement d'API (même clé `repartition_fonction`, juste plus
  d'éléments potentiellement).

### Frontend — `StatDonutChart.jsx`

- Nouveau state interne `search` (chaîne, vide par défaut). Un champ de
  recherche (`<input type="text" placeholder="Rechercher...">`) est
  rendu au-dessus de la légende, **uniquement si `data.length > 8`** (pas
  de champ de recherche pour un donut à 1-8 entrées, ex. "Par Direction"
  avec 1 seule direction).
- Filtrage : `entry.nom.toLowerCase().includes(search.toLowerCase())`.
  - La légende (`DonutLegend`) n'affiche que les entrées correspondantes.
  - Le camembert lui-même garde **toutes** les tranches (le total au
    centre ne doit pas changer pendant une recherche), mais les tranches
    non correspondantes passent à `fillOpacity: 0.15` (au lieu de
    disparaître) — cohérent avec le total affiché au centre qui reste
    celui de l'ensemble des données, pas du sous-ensemble filtré.
  - Si le filtre ne matche aucune entrée : message "Aucun résultat" à la
    place de la légende, camembert grisé en entier.
- Pas de changement de la prop `data` ni de `onSliceClick` — le
  changement est interne au composant.

---

## 2. Seuil réglable — Contrats arrivant à échéance

### Backend

- `backend/audit/stats.py` : `_contrats_echeance(jours=90)` — le
  paramètre remplace la constante `90` codée en dur dans la fonction.
- `build_stats_detail(date_debut, date_fin, requesting_user=None, echeance_jours=90)`
  transmet `echeance_jours` à `_contrats_echeance`.
- `backend/audit/views.py` — `StatsDetailView.get()` et
  `StatsExportView.get()` lisent `?echeance_jours=` (défaut 90), valident
  que c'est un entier entre 1 et 365 (sinon 400 `{'error': '...'}`,
  cohérent avec la validation déjà faite pour les dates), et le passent à
  `build_stats_detail()`.
- Le titre de la section dans l'export xlsx (`_stats_sheet(wb, 'Échéances
  contrats', ...)`) reste inchangé (pas de titre dynamique dans un onglet
  xlsx — le nombre de jours est déjà visible via les dates elles-mêmes).

### Frontend — `Statistiques.jsx`

- Nouveau state `echeanceJours` (défaut `90`), persisté seulement en
  mémoire de page (pas de `localStorage` — cohérent avec le fait que la
  période elle-même n'est pas persistée non plus).
- Contrôle au-dessus du tableau "Contrats arrivant à échéance" : un
  `<select>` avec options 30/60/90/120/180/365 jours, plus une option
  "Personnalisé…" qui affiche un `<input type="number" min="1" max="365">`
  à côté. Changer la valeur redéclenche `fetchStats(..., true)` avec
  `echeance_jours` ajouté aux params existants (période).
- Titre de la section devient dynamique : `Contrats arrivant à échéance
  (${echeanceJours} jours)`.

---

## 3. Drill-down cliquable — Complétude par Direction/Département

Aucun nouvel endpoint : `GET /api/employees/?direction=<id>&dossier_complet=0`
et `?departement=<id>&dossier_complet=0` existent déjà côté
`EmployeeListCreateView` (backend/employees/views.py) et renvoient les
employés incomplets de l'unité.

### Frontend — `Statistiques.jsx`

- **Département** (`RepartitionBar`) : la prop `onClick` existe déjà dans
  le composant mais n'est pas branchée sur l'appel de la section
  "Complétude par Département" — ajout de
  `onClick={() => navigate(`/employees?departement=${r.id}&dossier_complet=0`)}`.
- **Direction** (`StatRadarChart`) : le radar Recharts ne se prête pas
  bien à un clic fiable sur un point/axe. Ajout, sous le radar (et aussi
  utilisé comme fallback existant "Pas assez d'unités pour un radar"), 
  d'une petite liste cliquable (même composant `RepartitionBar`,
  réutilisé) listant chaque Direction avec son taux — cohérente avec
  l'affichage déjà utilisé pour Département, et cliquable de la même
  façon vers `/employees?direction=${r.id}&dossier_complet=0`. Le radar
  reste affiché au-dessus (visuel comparatif), la liste en dessous
  (interaction). Le cas "< 3 unités" (message actuel) est remplacé par
  cette même liste cliquable (plus de message texte sans action).

---

## 4. Liens de preuve — "Mon activité" / "Activité par administrateur"

### Backend

- `backend/audit/stats.py` : `_categorize_emp_log` et `_ACTIVITY_KEYS`
  sont déjà la source de vérité de la classification — pas de duplication,
  `audit/views.py` importe `_categorize_emp_log` depuis `audit.stats`.
- `backend/audit/views.py` — `AuditLogListView.get()` : nouveau paramètre
  `?categorie=<clé>` (une des valeurs de `_ACTIVITY_KEYS`, ex.
  `employes_archives`, `contrats_supprimes`). Quand présent :
  - Pour les catégories issues de `CREATE_EMP`/`MODIFY_EMP`/`DELETE_EMP` :
    filtre `qs` sur `action__in=[...]` puis exclut en Python (ou via
    `Q` équivalent sur `details`) les lignes dont
    `_categorize_emp_log(action, details)[0] != categorie` — la
    classification dépend du contenu JSON de `details`, pas un simple
    `filter()` déclaratif ; comme le volume par utilisateur/période est
    borné (audit d'un compte sur quelques mois), un filtrage Python après
    un `qs.filter(action__in=...)` restreint est acceptable en
    performance (déjà le pattern utilisé par `_activity_counts` côté
    stats).
  - Pour `documents_supprimes` → `action=DELETE_DOC`,
    `documents_modifies` → `action=MODIFY_DOC` (ce sont déjà des
    `AuditLog.Action` distincts, pas besoin de `_categorize_emp_log`).
    `comptes_mdp` est en revanche une sous-catégorie de `MODIFY_EMP`
    (`details.action` ∈ `change_password`/`admin_reset_password`, voir
    `_categorize_emp_log`) — traité par la même branche Python que
    `employes_archives`/`employes_transferts`/etc.
  - Pour `documents_uploades` : cette catégorie ne provient pas du
    journal d'audit mais d'un comptage sur `EmployeeDocument` (documents
    encore présents) — le paramètre `categorie=documents_uploades`
    retombe sur `action=UPLOAD` comme *meilleure approximation*
    disponible dans le journal, avec un bandeau d'avertissement affiché
    côté frontend (voir ci-dessous) expliquant que ce lien peut lister
    plus d'entrées que le compteur si des documents ont été supprimés
    depuis (cohérent avec le commentaire déjà présent dans
    `audit/stats.py` sur ce point).
  - La pagination manuelle (50/page) et le filtrage `user`/`date_debut`/
    `date_fin` existants restent appliqués en plus de `categorie` (même
    logique de scoping par rôle, inchangée).

### Frontend — `Statistiques.jsx`

- `buildAuditLink(username, periode, categorie)` : ajoute `categorie` aux
  `URLSearchParams` si fourni.
- `ActivityGroups` : chaque tuile (`{key, label}`) devient un lien
  (`<a>`/`onClick` + `navigate`, même pattern que le lien "Voir mon
  journal d'audit →" existant) vers
  `/audit?user=<username>&categorie=<key>&date_debut=&date_fin=`. Le lien
  "Voir mon journal d'audit →" (non filtré) reste affiché en plus, pour
  la vue d'ensemble.
- Pour la tuile `documents_uploades` spécifiquement : au clic, affiche
  d'abord une note ("Ce lien liste les uploads du journal — un document
  supprimé depuis reste dans cette liste mais plus dans le compteur
  ci-dessus.") — implémentée simplement comme un `title` HTML sur le lien
  (tooltip), pas une modale, pour rester léger.
- Tableau "Activité par administrateur" (SUPERADMIN) : chaque cellule de
  compteur (`{a[c.key]}`) devient elle-même un lien vers
  `/audit?user=<a.username>&categorie=<c.key>&...` (au lieu du seul lien
  "Audit →" en fin de ligne, qui reste pour la vue non filtrée de cette
  ligne).
- `frontend/src/pages/AuditLogs.jsx` : lit `?categorie=` au montage (comme
  elle lit déjà `?user=`/`?date_debut=`/`?date_fin=`/`?action=`) et
  l'ajoute aux params de la requête `GET /admin/audit-logs/`. Pas de
  contrôle UI dédié pour `categorie` (c'est un filtre uniquement accessible
  par lien profond depuis /statistiques, pas un filtre manuel exposé dans
  l'interface d'/audit — cohérent avec le fait que "catégorie d'activité"
  n'a de sens que dans le contexte de cette page).

---

## Hors périmètre

- Le dashboard (`/dashboard`) n'est pas concerné.
- Aucun changement de modèle de données ni de migration.
- Pas de persistance serveur des filtres/seuils choisis (période,
  échéance, recherche donut) — comportement page uniquement, comme
  aujourd'hui.
- `AdminStatsView` (`/api/audit/stats/`, page différente non utilisée par
  `/statistiques`) n'est pas touchée.

## Tests à prévoir

- Backend : `_repartition_fonction` supprimée, plus de test dessus ;
  ajouter un test vérifiant que `repartition_fonction` renvoie >10
  entrées quand la base en a plus. Test `_contrats_echeance(jours=...)`
  avec plusieurs valeurs. Test `AuditLogListView?categorie=` pour au
  moins 2-3 catégories représentatives (`employes_archives`,
  `documents_supprimes`, `documents_uploades` avec son fallback
  `action=UPLOAD`).
- Frontend : test `StatDonutChart` (recherche filtre la légende, camembert
  garde son total), test `Statistiques.jsx` (changement du seuil
  d'échéance redéclenche l'appel API avec le bon paramètre, clic sur une
  barre de complétude navigue avec les bons query params, clic sur une
  tuile "Mon activité" navigue vers `/audit` avec `categorie`).
