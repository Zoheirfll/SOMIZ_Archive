# Navigation type ERP — palette de commandes & breadcrumbs — design

Date : 2026-09-27

## Objectif

Faciliter la navigation dans SOMIZ, façon ERP, sans remettre en cause la
navbar horizontale existante : ajouter une **palette de commandes**
(`Ctrl+K`) pour sauter directement vers un employé, une attestation, une
page ou une action fréquente, et compléter les **fils d'Ariane** manquants
sur les fiches de détail. Aucune sidebar persistante, aucun bouton
flottant séparé, aucun historique de "pages récentes" — décisions actées
avec l'utilisateur pendant le brainstorming.

Contraintes actées avec l'utilisateur :
- Recherche globale dans la palette : employés, contrats (via le même
  canal que les employés), attestations, pages/actions de l'app.
- Périmètre de recherche employés : **identique** à `/employees/search/`
  existant (pas de nouvel endpoint combiné) — le scoping déjà en place
  (`can_access_employee`/`employee_scope_q`) s'applique tel quel.
- Actions rapides ("nouvel employé", "nouvelle demande d'attestation")
  intégrées à la palette, pas de bouton flottant séparé.
- Breadcrumbs enrichis : fil d'Ariane cliquable sur les pages profondes
  qui n'en ont pas encore, pas d'historique de navigation persistant.

## État actuel (ce qui existe déjà et sera réutilisé)

- `config/keyboardShortcuts.js` — registre central `DEFAULT_SHORTCUTS`
  (combo, label, path, catégorie, `adminOnly`), personnalisable via
  `KeyboardShortcutsContext`/`localStorage`, consommé par `GlobalShortcuts`
  (liaison réelle) et `KeyboardShortcutsHelp` (aide + personnalisation).
  Contient déjà les entrées de navigation rapide (`Alt+E` → Employés,
  `Alt+U` → Utilisateurs, etc.).
- `useShortcut(combo, handler, {enabled, allowInInputs})`
  (`hooks/useKeyboardShortcuts.js`) — gère déjà Alt/Ctrl/Shift (pas Meta/
  Cmd — non nécessaire ici, `Ctrl+K` suffit).
- `GET /api/employees/search/?q=` (`employee_search`,
  `backend/employees/views.py`) — déjà scopé (`employee_scope_q()`),
  déjà `IsAdminOrConsultant` (malgré son nom, ouvert à tous rôles actifs
  y compris GESTIONNAIRE), déjà cherche sur nom/prénom/matricule/
  `contrats__numero_contrat`. Retourne des `Employee` (avec
  `numero_contrat_actif` = dernier contrat, pas forcément celui qui a
  matché la recherche).
- `GET /api/attestations/demandes/?q=` (`backend/attestations/views.py`)
  — déjà filtre `reference__icontains`, déjà scopé demandeur/traiteur.
- `components/Breadcrumb.jsx` — composant générique déjà utilisé dans
  `Employees.jsx` (drill-down organisationnel). `ContratDetail.jsx` a un
  breadcrumb 3 niveaux codé en dur (pas le composant générique).
  `EmployeeDetail.jsx` et `AttestationDetail.jsx` n'ont qu'un bouton
  "← Retour" plat.
- `components/KeyboardShortcutsHelp.jsx` — modale de référence pour le
  style (overlay + card `theme.surface`/`theme.shadowLg`, `Kbd`/`Combo`).

## 1. Palette de commandes (`Ctrl+K`)

### Nouveaux fichiers

- `frontend/src/context/CommandPaletteContext.jsx` — même pattern que
  `KeyboardShortcutsContext` : `{ isOpen, open, close, toggle }` via
  `useState` + Provider, pas de state persistant (rien à sauvegarder).
- `frontend/src/components/CommandPalette.jsx` — la modale elle-même.
- `frontend/src/config/commandPaletteActions.js` — les 2 entrées
  d'action statiques (voir plus bas), pour ne pas polluer
  `keyboardShortcuts.js` qui reste dédié aux raccourcis liés à une
  vraie combinaison de touches.

### Déclenchement

- Nouvelle entrée dans `DEFAULT_SHORTCUTS` :
  `{ id: "command-palette", combo: "Ctrl+K", label: "Recherche rapide", category: "navigation" }`.
  Apparaît automatiquement dans l'aide raccourcis et reste
  personnalisable — aucune logique spécifique à ajouter dans
  `KeyboardShortcutsHelp.jsx`.
- `GlobalShortcuts.jsx` : ce combo n'ouvre pas une page comme les autres
  raccourcis `quick`, donc traité à part (comme `help-toggle` déjà géré à
  part) : `if (s.id === "command-palette") handler = openPalette;`.
- Icône loupe dans le drawer mobile (`Navbar.jsx`, à côté du bouton
  hamburger existant), même `onClick={openPalette}` — un seul composant
  `CommandPalette` couvre desktop et mobile, pas de variante tactile
  séparée.

### Contenu et comportement

- **Ouverture, champ vide** : liste immédiate des "Pages & actions" (voir
  ci-dessous), pas d'état vide — l'utilisateur voit tout de suite de quoi
  il dispose.
- **Dès 2 caractères** : debounce 300 ms (`setTimeout`/`clearTimeout` dans
  un `useEffect`, pattern déjà utilisé ailleurs dans le projet pour les
  champs de recherche), puis 2 appels `axios` en parallèle
  (`Promise.allSettled` — un des deux qui échoue ne doit pas faire
  disparaître les résultats de l'autre) :
  - `api.get("/employees/search/", { params: { q } })` → section
    **"Employés"**. Chaque résultat affiche nom/prénom, matricule,
    service, et — si `numero_contrat_actif` est renseigné — un badge
    `N° <contrat>` à titre indicatif (pas de lien direct dessus, voir
    limite assumée ci-dessous). Clic/Entrée → `navigate(`/employees/${matricule}`)`.
  - `api.get("/attestations/demandes/", { params: { q } })` — **seulement
    si `canSeeAttestations`** (même condition que le lien navbar
    existant, `user?.role === "GESTIONNAIRE" || user?.can_manage_attestations`)
    → section **"Attestations"**, affichage référence + nom employé +
    statut. Clic/Entrée → `navigate(`/attestations/${ref.replace("/", "-")}`)`
    (même encodage que `Attestations.jsx`/`AttestationNouvelle.jsx`).
  - **Limite assumée, documentée dans le composant** : un résultat
    employé trouvé via son n° de contrat mène à la fiche employé, pas
    directement à la page de ce contrat précis — `employee_search` ne
    renvoie que le dernier contrat actif, pas l'UUID du contrat
    effectivement matché. Corriger ça nécessiterait de modifier
    l'endpoint backend (renvoyer l'UUID du contrat matché) — hors
    scope ici (YAGNI, l'utilisateur n'a pas demandé ce niveau de
    précision, et ça toucherait un endpoint déjà utilisé par d'autres
    consommateurs comme `AttestationNouvelle.jsx`).
- **Section "Pages & actions"** (filtrage client-side, aucun appel
  réseau, toujours visible même avec une requête tapée) :
  - Les entrées `DEFAULT_SHORTCUTS` de catégorie `quick` (déjà filtrées
    par `adminOnly` existant).
  - Les entrées du menu "Administration" de `Navbar.jsx`
    (`adminMenuLinks`) — dupliquées dans `commandPaletteActions.js`
    pour éviter un couplage entre `Navbar.jsx` et la palette (elles
    déjà commented in the code as items with `path`+`label` triviaux,
    coût de duplication faible, cf. remarque plus bas sur la
    consolidation).
  - 2 nouvelles entrées d'action, définies dans
    `commandPaletteActions.js` avec un `roleFilter(user)` :
    - "Nouvel employé" → `/employees/nouveau`, visible si `isAdmin(user?.role)`
      (même condition que le bouton "Nouvel employé" existant sur
      `Employees.jsx`).
    - "Nouvelle demande d'attestation" → `/attestations/nouvelle`,
      visible si `["SUPERADMIN", "GESTIONNAIRE"].includes(user?.role)`
      (même condition que le bouton existant sur `Attestations.jsx`/
      `DossierTab.jsx`).
  - Filtrage texte : recherche insensible à la casse/accents sur le
    `label` (normalisation simple `toLowerCase()` + retrait des accents
    via `.normalize("NFD").replace(/[̀-ͯ]/g, "")` — pas de
    lib de fuzzy-search supplémentaire, YAGNI).
- **Regroupement affiché** : 3 sections dans cet ordre — "Employés",
  "Attestations" (si visible), "Pages & actions" — chacune avec un
  petit en-tête label (même style que les groupes de la modale d'aide
  raccourcis).
- **Navigation clavier** : la palette construit une liste aplatie de
  tous les résultats affichés (dans l'ordre des sections) pour que
  ↑/↓ déplace un simple index ; Entrée active l'élément sélectionné
  (surbrillance `theme.primaryBg`, même traitement que les lignes
  actives de `Navbar.jsx`) ; `Escape` ferme
  (`useShortcut("Escape", close, { enabled: isOpen, allowInInputs: true })`,
  identique au panneau d'aide raccourcis).
- **Fermeture** : sur navigation (clic/Entrée), sur `Escape`, ou clic sur
  l'overlay — état de recherche réinitialisé à la fermeture (pas de
  persistance de la dernière recherche entre deux ouvertures, comportement
  volontairement simple).
- **États** : "Tapez au moins 2 caractères…" tant que `q.length < 2` et
  qu'aucune section statique ne matche ; "Aucun résultat" si tout est
  vide après recherche ; erreur réseau silencieuse par section (log
  console, pas de message bloquant — cohérent avec le traitement déjà
  fait pour le badge de demandes en attente dans `Navbar.jsx`,
  `.catch(() => {})`).

### Accessibilité / mobile

- Modale : `role="dialog"`, focus posé sur le champ de recherche à
  l'ouverture, piégeage du focus non nécessaire vu la taille réduite du
  contenu (liste + champ), cohérent avec le traitement actuel de
  `KeyboardShortcutsHelp`.
- Sous 768px (`useIsMobile()`) : la modale prend une largeur proche du
  plein écran (comme le drawer mobile de `Navbar.jsx`) plutôt qu'une
  card centrée étroite.

## 2. Actions rapides

Entièrement couvertes par la section "Pages & actions" de la palette
ci-dessus (2 entrées d'action + navigation rapide déjà existante). Pas de
composant supplémentaire.

## 3. Breadcrumbs enrichis

- `EmployeeDetail.jsx` : remplacer le bouton "← Retour" (ligne ~1054) par
  `<Breadcrumb items={[{ label: "Personnel", onClick: () => navigate("/employees") }, { label: `${employee.prenom} ${employee.nom}` }]} />`
  — dernier élément non cliquable (comportement déjà géré par
  `Breadcrumb.jsx` : `disabled` sur le dernier index).
- `AttestationDetail.jsx` : remplacer "← Retour aux demandes" (ligne
  ~272) par
  `<Breadcrumb items={[{ label: "Attestations", onClick: () => navigate("/attestations") }, { label: demande.reference }]} />`.
- `ContratDetail.jsx` : **remplacer** le breadcrumb 3 niveaux codé en dur
  (lignes ~535-545) par le composant générique `Breadcrumb` avec les 3
  mêmes items (Employés → Employé → N° contrat) — supprime la
  duplication de style, aligne ce composant sur le pattern déjà en place
  ailleurs (Employees.jsx). Le style actuel du breadcrumb de
  `ContratDetail.jsx` utilise des couleurs blanches translucides
  (`rgba(255,255,255,0.12)`) adaptées au hero header vert foncé — le
  composant générique `Breadcrumb.jsx` utilise `theme.primary`/
  `theme.text`, pensés pour un fond clair. **Il faudra donc que
  `Breadcrumb.jsx` accepte une prop `variant="hero"` optionnelle**
  (texte blanc translucide, mêmes couleurs que ce qui existe déjà en dur
  dans `ContratDetail.jsx`) pour rester utilisable à la fois dans le
  hero header (fond vert foncé) et ailleurs (fond clair, `Employees.jsx`).
  `EmployeeDetail.jsx`/`AttestationDetail.jsx` utiliseront aussi ce
  `variant="hero"` puisque leurs boutons "← Retour" actuels sont eux
  aussi dans un hero header à fond foncé (à vérifier au moment de
  l'implémentation, mais cohérent avec le pattern hero header documenté
  dans le CLAUDE.md du projet).
- Pas d'historique de pages visitées.

## Tests à prévoir

- **Frontend (Jest)** :
  - `CommandPalette.test.jsx` : ouverture via `Ctrl+K`, affichage des
    "Pages & actions" à vide, debounce + appel des 2 endpoints après 2
    caractères, filtrage par rôle des 2 actions statiques (ADMIN voit
    "Nouvel employé" mais pas GESTIONNAIRE, et inversement pour
    "Nouvelle demande d'attestation"), navigation clavier (↑/↓/Entrée),
    fermeture sur `Escape` et sur clic overlay, masquage de la section
    Attestations si `!canSeeAttestations`.
  - `GlobalShortcuts`/`KeyboardShortcutsHelp` : vérifier que la nouvelle
    entrée `command-palette` apparaît dans l'aide et reste
    personnalisable (probablement déjà couvert par des tests
    génériques existants sur `DEFAULT_SHORTCUTS`, à vérifier plutôt qu'à
    dupliquer).
  - Tests existants sur `EmployeeDetail.jsx`/`AttestationDetail.jsx` qui
    cherchent le texte "← Retour" / "← Retour aux demandes" : à mettre à
    jour pour chercher les nouveaux labels de breadcrumb à la place.
  - `Breadcrumb.jsx` : test du nouveau `variant="hero"` (couleurs
    différentes, comportement clic identique).
- **Backend** : aucun changement d'endpoint, donc aucun nouveau test
  backend requis pour ce chantier — les tests existants sur
  `employee_search`/`DemandeAttestationListCreateView` couvrent déjà le
  scoping réutilisé tel quel.

## Hors scope (explicitement écarté)

- Sidebar persistante.
- Bouton flottant "+" séparé de la palette.
- Historique de navigation ("pages récentes").
- Nouvel endpoint backend combiné employés+contrats+attestations.
- Résolution de l'UUID du contrat exact matché par la recherche (limite
  assumée, voir section 1).
