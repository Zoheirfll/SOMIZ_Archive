# Page Statistiques — design

Date : 2026-09-02

## Contexte

`/dashboard` ("Tableau de bord") existe déjà et couvre des indicateurs
globaux instantanés (employés actifs, dossiers complets, complétude par
type, activité 7 jours). Ce chantier ajoute une page **distincte**,
`/statistiques`, orientée analyse RH plus poussée : répartitions
organisationnelles, démographie, échéances de contrats, évolution dans le
temps avec filtres de date, et export. Les deux pages coexistent — pas de
fusion, pas de suppression de `/dashboard`.

## Accès

Identique à `/dashboard` : ADMIN/SUPERADMIN uniquement
(`["ADMIN","SUPERADMIN"].includes(user?.role)`, sinon redirection vers
`/employees`). Nouvelle entrée dans `Navbar.jsx`, juste après "Tableau de
bord", visible ADMIN only.

## Backend

### Endpoint principal — `GET /api/reporting/stats-detail/`

Nouvelle vue `StatsDetailView` (`backend/audit/views.py`), `IsAdmin`.
Query params : `date_debut`, `date_fin` (ISO `YYYY-MM-DD`, optionnels —
absents = 12 derniers mois par défaut).

Réponse :

```json
{
  "periode": {"debut": "...", "fin": "..."},
  "indicateurs": {
    "recrutements": {"valeur": 12, "variation_pct": 8.3},
    "archivages": {"valeur": 3, "variation_pct": -25.0},
    "dossiers_completes": {"valeur": 5, "variation_pct": 0}
  },
  "repartition_direction": [{"id": "...", "nom": "...", "count": 42}],
  "repartition_departement": [{"id": "...", "nom": "...", "direction_nom": "...", "count": 12}],
  "repartition_categorie": [{"nom": "...", "count": 30}],
  "repartition_type_contrat": [{"nom": "...", "count": 30}],
  "repartition_fonction": [{"nom": "...", "count": 5}],
  "evolution_mensuelle": [{"mois": "2026-01", "recrutements": 4, "archivages": 1}],
  "pyramide_age": [{"tranche": "25-34", "count": 15}],
  "pyramide_anciennete": [{"tranche": "1-3 ans", "count": 20}],
  "contrats_echeance": [
    {"id": "...", "numero_contrat": "...", "employee_id": "...", "employee_nom": "...", "date_fin": "...", "jours_restants": 12}
  ],
  "completude_par_direction": [{"id": "...", "nom": "...", "taux": 82.5, "total": 42, "complets": 34}],
  "completude_par_departement": [{"id": "...", "nom": "...", "direction_nom": "...", "taux": 70.0, "total": 12, "complets": 8}]
}
```

Règles de calcul :

- **Effectif de base** pour toutes les répartitions organisationnelles/
  démographiques/complétude : `Employee.objects.filter(statut='actif')`
  — effectif **courant**, non filtré par la plage de dates (une
  répartition par direction n'a pas de sens "à une date passée" avec le
  modèle actuel, qui ne garde pas l'historique des affectations
  organisationnelles). Seules les séries temporelles et les compteurs de
  mouvement (recrutements, archivages, `evolution_mensuelle`) sont bornés
  par `date_debut`/`date_fin`.
- **Recrutements** sur la période : `Employee.objects.filter(date_embauche__range=[debut, fin])`
  (tous statuts confondus — un employé recruté puis déjà archivé compte
  quand même comme un recrutement de la période).
- **Archivages** sur la période : dérivés de l'audit log existant
  (`AuditLog.Action.MODIFY_EMP` avec `details.transfer.statut.vers`
  passant à `archive`/`inactif`/`demobilise`), filtré sur
  `timestamp__range`. Réutilise le mécanisme déjà en place pour tracer
  les changements de statut (voir section "Archivage employé" du
  CLAUDE.md) plutôt que d'ajouter un nouveau champ de date sur
  `Employee`.
- **Dossiers complétés** sur la période : nombre d'employés actifs dont
  la date du dernier document obligatoire uploadé (complétant le
  dossier) tombe dans la période — approximé via
  `EmployeeDocumentFile.uploaded_at` du document obligatoire le plus
  récent parmi ceux requis pour cet employé. Si cette approximation
  s'avère trop coûteuse/complexe à l'implémentation, repli acceptable :
  compter simplement les employés actuellement complets dont la
  date d'embauche tombe dans la période (indicateur simplifié, à trancher
  dans le plan d'implémentation selon la complexité réelle du calcul).
- **Comparaison période précédente** (`variation_pct`) : même durée,
  immédiatement avant `date_debut`. `variation_pct = None` si la valeur
  de la période précédente est 0 (division par zéro évitée, affiché
  "—" côté frontend plutôt que "+∞%").
- **Répartition organisationnelle** : `Employee.actifs.values('direction__nom').annotate(count=Count('id'))`,
  idem département (avec nom de la direction parente pour affichage
  groupé). Pas de niveau Service dans cette page (déjà couvert par le
  drill-down `/employees`) — reste à 2 niveaux pour lisibilité.
- **Répartition catégorie/type de contrat** : groupement direct sur
  `categorie__nom`/`type_contrat__nom`, valeurs nulles regroupées sous
  "Non renseigné".
- **Répartition fonction** : top 10 par effectif décroissant + un groupe
  "Autres" agrégeant le reste, pour éviter une liste trop longue si
  beaucoup de postes distincts existent.
- **Pyramide des âges** : tranches fixes `<25`, `25-34`, `35-44`, `45-54`,
  `55+`, calculées depuis `date_naissance` (employés sans date de
  naissance exclus du graphique, comptés séparément comme "Non
  renseigné" si non nul).
- **Pyramide d'ancienneté** : tranches fixes `<1 an`, `1-3 ans`, `3-5
  ans`, `5-10 ans`, `10+ ans`, depuis `date_embauche` (même traitement
  des valeurs manquantes).
- **Contrats à échéance** : `Contrat.objects.filter(statut='actif',
  date_fin__isnull=False, date_fin__range=[aujourd'hui, aujourd'hui +
  90 jours])`, triés par `date_fin` croissant, avec `jours_restants`
  calculé. Pas de filtre par la plage de dates choisie par l'utilisateur
  (toujours "à partir d'aujourd'hui, 90 jours" — une échéance passée
  n'a pas d'intérêt ici, contrairement aux séries temporelles).
- **Complétude par direction/département** : même définition que
  `AdminStatsView.dossiers_complets` existant (tous les types
  obligatoires actifs, non-catégories, présents), mais groupée
  par-unité plutôt que globalement.

### Endpoint export Excel — `GET /api/reporting/stats-export.xlsx/`

Mêmes query params `date_debut`/`date_fin`. Réutilise le calcul de
`StatsDetailView` (factorisé dans une fonction commune
`build_stats_detail(date_debut, date_fin)` pour éviter la duplication) et
génère un classeur `openpyxl` (dépendance déjà présente) avec un onglet
par section : "Indicateurs", "Répartition organisation", "Répartition
profils", "Évolution", "Démographie", "Échéances contrats",
"Complétude". Réponse `Content-Type:
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`Content-Disposition: attachment; filename="statistiques_somiz_<date>.xlsx"`.
ADMIN only, tracé dans l'audit log (nouveau détail sur une entrée
existante, pas de nouveau type d'action — cohérent avec
`VIEW_AUDIT_LOG` qui trace déjà une consultation sensible).

### Export PDF — pas de nouvel endpoint

Généré **côté frontend** via l'impression navigateur : une feuille de
style `@media print` dédiée sur la page `/statistiques` (masque la
navbar/les filtres/les boutons, met les graphiques SVG en pleine
largeur), déclenchée par `window.print()` derrière le bouton "Exporter →
PDF". Choix motivé par l'absence de toute dépendance PDF serveur dans le
projet actuellement (vérifié : ni WeasyPrint, ni ReportLab, ni équivalent
frontend comme jsPDF) — éviter d'introduire une dépendance lourde pour ce
besoin, le rendu HTML→PDF navigateur est suffisant pour un rapport
consultable/imprimable.

## Frontend

Nouveau fichier `frontend/src/pages/Statistiques.jsx`, route `/statistiques`
dans `App.js` (protégée ADMIN, même pattern que `/dashboard`).

Structure :

1. **Hero header** vert standard, titre "Statistiques", `InfoNotice` si
   une entrée est ajoutée à `PAGE_NOTICES`.
2. **Barre de filtres** (sous le hero, sticky optionnel) : boutons
   préréglages (30j / 3 mois / 12 mois / Année en cours / Tout) + deux
   `<input type="date">` pour plage libre, bouton "Exporter" (menu
   déroulant Excel/PDF). Changement de filtre → refetch `silent`-like
   (pas de démontage complet de la page, juste les sections chiffrées en
   `Skeleton` pendant le refetch, cohérent avec la convention `silent`
   documentée dans CLAUDE.md même si ici il n'y a pas de sélection locale
   à préserver comme sur une fiche détail).
3. **Cartes indicateurs clés** avec variation (`+8.3%` vert / `-25%`
   rouge / `—` gris si non calculable), réutilise `StatCard` (à extraire
   de `Dashboard.jsx` vers un composant partagé `components/StatCard.jsx`
   si le temps du plan le permet — sinon dupliqué comme le reste du
   pattern existant dans le projet).
4. **Répartition organisationnelle** : barres horizontales par Direction
   (couleur `theme.directionGrad`), sous-liste par Département au clic
   ou affichage direct groupé — trancher dans le plan selon l'espace
   dispo. Cliquable → `/employees?direction=<id>` (filtre déjà supporté
   par `/employees`, à vérifier).
5. **Répartition profils** : 3 mini-listes horizontales (Catégorie, Type
   de contrat, Fonction) avec barres proportionnelles, même style visuel
   que la section "Complétude par type" de Dashboard.
6. **Évolution mensuelle** : graphique en barres empilées SVG fait main
   (pas de nouvelle dépendance graphique — cohérent avec le reste du
   projet qui n'utilise aucune lib de charts), deux séries
   (recrutements vert / archivages rouge/gris), axe X = mois de la
   période filtrée.
7. **Démographie** : deux histogrammes SVG (pyramide âge, pyramide
   ancienneté), même technique que le graphique d'évolution.
8. **Contrats à échéance** : liste/tableau (Numéro contrat, Employé, Date
   fin, Jours restants — badge rouge si <15j, orange si <30j, gris
   sinon), lignes cliquables → `/contrats/<id>`. Fenêtre fixe 90 jours,
   non affectée par les filtres de date globaux (comme précisé côté
   backend).
9. **Complétude par unité** : tableau Direction/Département avec barre
   de progression, même style que Dashboard, trié par taux croissant
   (met en avant les unités à traiter en premier).

`useIsMobile()` pour le layout responsive (grilles → colonne unique sous
768px), conforme à la convention du projet.

## Hors périmètre (v1)

- Pas de drill-down interactif complet (Direction → Département →
  Service) dans les graphiques — `/employees` reste l'outil pour ça,
  cette page reste une vue agrégée.
- Pas de personnalisation/sauvegarde de filtres par utilisateur.
- Pas de rafraîchissement automatique (polling) — chargement à la
  demande (montage + changement de filtre) uniquement.
- L'indicateur "dossiers complétés sur la période" reste volontairement
  flexible dans sa définition exacte (voir note ci-dessus) — le plan
  d'implémentation tranchera entre l'approximation par date d'upload du
  dernier document obligatoire et le repli simplifié, selon la
  complexité réelle constatée en écrivant la requête.
