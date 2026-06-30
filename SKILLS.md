# Skills disponibles

Détail de chaque skill : ce qu'il contient, ce qu'il impose, où il s'applique sur SOMIZ. Chaque skill charge son fichier `SKILL.md` en contexte au moment de l'invocation.

## Superpowers (obra/superpowers) — 14 skills

### brainstorming
Avant tout code nouveau (feature, composant, comportement). Bloque l'implémentation tant qu'un design n'a pas été présenté et approuvé — même pour un projet "trop simple". Procédure : explorer le contexte du projet, poser des questions une par une, proposer 2-3 approches avec recommandation, présenter le design par sections, écrire la spec dans `docs/superpowers/specs/YYYY-MM-DD-<sujet>-design.md`, la committer, puis enchaîner sur `writing-plans`. Propose aussi un "visual companion" (mockups dans un onglet navigateur) seulement quand une question est vraiment plus claire montrée que décrite.
**Sur SOMIZ :** pertinent pour une nouvelle page ou un nouveau flux (ex. import CSV avancé), pas pour un fix de bug ponctuel.

### writing-plans
Transforme une spec approuvée en plan d'implémentation détaillé, écrit pour un développeur qui ne connaît rien au projet. Chaque tâche liste fichiers exacts à créer/modifier, code complet (jamais de "TBD" ou "ajouter la gestion d'erreurs" vague), commandes de test attendues, et étapes de 2-5 minutes (écrire le test → vérifier qu'il échoue → implémenter → vérifier qu'il passe → commit). Sauvegardé dans `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`. Termine par un choix d'exécution : subagent-driven-development ou executing-plans.

### test-driven-development
Loi : **aucun code de prod sans test qui échoue d'abord.** Cycle RED (test minimal qui échoue) → vérifier l'échec exact → GREEN (code minimal qui passe) → vérifier que tout passe → REFACTOR. Code écrit avant le test doit être supprimé, pas gardé "en référence". Contient une checklist de vérification finale et un tableau de contre-arguments ("je testerai après" → un test qui passe du premier coup ne prouve rien).
**Sur SOMIZ :** directement applicable — `pytest` (141+ tests backend) et Jest/RTL (206+ tests frontend) tournent déjà à chaque changement.

### systematic-debugging
Loi : **aucun fix sans avoir trouvé la cause racine.** 4 phases obligatoires : (1) investigation — lire les erreurs en entier, reproduire de façon fiable, vérifier les changements récents, instrumenter chaque frontière de composant si système multi-couches ; (2) analyse de pattern — comparer avec du code qui marche ; (3) hypothèse unique testée minimalement ; (4) implémentation — test qui reproduit le bug, fix unique, vérification. Si 3 fixes échouent d'affilée, le skill force à remettre en question l'architecture plutôt que tenter un 4e fix.
**Sur SOMIZ :** à invoquer avant tout fix sur les tests actuellement modifiés (EmployeeForm, Employees, Parametres) plutôt que patcher à l'aveugle.

### subagent-driven-development
Exécute un plan dans la session courante en dispatchant un sous-agent "implémenteur" frais par tâche, suivi d'une revue de tâche (conformité spec + qualité code), puis une revue finale sur toute la branche. Gère 4 statuts d'implémenteur (DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED) et un système de progression durable (`.superpowers/sdd/progress.md`) qui survit à une compaction de contexte. Choisit le modèle (cheap/standard/capable) selon la complexité de chaque tâche pour limiter le coût.
**Sur SOMIZ :** utile pour un plan à plusieurs tâches indépendantes (ex. ajouter 3 nouveaux référentiels dans Paramètres). Overkill pour un fix d'une ligne.

### executing-plans
Alternative à `subagent-driven-development` pour une session séparée sans sous-agents (ou plateforme sans support sous-agents) : charge le plan, le relit de façon critique, exécute chaque tâche dans l'ordre exact, s'arrête sur tout blocage plutôt que de deviner, termine par `finishing-a-development-branch`.

### dispatching-parallel-agents
À utiliser quand 2+ problèmes sont indépendants (fichiers de test différents, sous-systèmes différents, pas d'état partagé) : dispatcher un sous-agent par domaine en parallèle (plusieurs appels dans le même message), plutôt qu'investiguer séquentiellement. Ne pas utiliser si les échecs sont liés — un seul fix pourrait tous les résoudre.
**Sur SOMIZ :** si les 4 fichiers de test actuellement modifiés (EmployeeForm, Employees, Parametres, Security) échouent pour des raisons indépendantes, ce skill permettrait de les corriger en parallèle au lieu d'un par un.

### requesting-code-review
Après une tâche/feature majeure ou avant un merge : dispatcher un sous-agent "reviewer" avec uniquement les SHAs de début/fin et la description — jamais l'historique de la session — pour qu'il évalue le code sans biais. Le retour classe les problèmes en Critical/Important/Minor ; Critical et Important doivent être corrigés avant de continuer.

### receiving-code-review
Discipline pour traiter un retour de revue : lire en entier sans réagir, reformuler l'exigence, vérifier contre le code réel, évaluer techniquement, puis répondre ou pousser un refus argumenté. Interdit l'accord performatif ("Vous avez totalement raison !", "Merci !") — soit on agit, soit on questionne techniquement. Distingue retour du partenaire humain (de confiance) vs retour externe (à vérifier point par point : casse-t-il l'existant, le reviewer a-t-il le contexte complet).

### using-git-worktrees
Crée un espace de travail isolé pour une feature. Détecte d'abord si une isolation existe déjà (évite les worktrees imbriqués), préfère les outils natifs de la plateforme à `git worktree add`, installe les dépendances du projet, vérifie une baseline de tests propre avant de commencer. Table de décision complète pour les cas limites (sous-module, erreur de permission, dossier non ignoré par git).

### finishing-a-development-branch
Une fois l'implémentation terminée et les tests verts : vérifie les tests, détecte l'état du dépôt (repo normal / worktree / detached HEAD), puis présente exactement 4 options (merge local, push + PR, garder en l'état, abandonner) — jamais de question ouverte. Le abandon exige une confirmation tapée explicitement. Le nettoyage du worktree ne se fait que pour les options "merge" et "abandonner", jamais pour "PR" ou "garder".

### verification-before-completion
Loi : **aucune déclaration de succès sans preuve fraîche.** Avant toute phrase du type "ça marche", "les tests passent", "corrigé" : identifier la commande qui le prouve, l'exécuter dans ce message, lire la sortie complète, puis seulement affirmer. Interdit les mots "devrait", "probablement", toute expression de satisfaction ("Parfait !", "Terminé !") avant vérification réelle, et la confiance aveugle dans le rapport d'un sous-agent (vérifier le diff git à la place).
**Sur SOMIZ :** s'applique directement avant de dire que les tests frontend/backend modifiés passent — exécuter `pytest` / `npm test` et lire la sortie, pas supposer.

### writing-skills
Pour créer ou modifier un skill : applique le TDD à la documentation — scénario de pression avec sous-agent SANS le skill (RED, observer les rationalisations exactes), écrire le skill minimal qui les contre (GREEN), retester et boucher les nouvelles échappatoires (REFACTOR). Règles de structure : frontmatter avec `name`/`description` (la description ne doit décrire QUE le déclencheur, jamais résumer le processus, sinon l'agent suit le résumé au lieu de lire le skill en entier), limites de mots, pas de liens `@` qui forcent le chargement.

### using-superpowers
Se charge en début de conversation. Règle : si un skill a ne serait-ce que 1% de chance de s'appliquer, l'invoquer AVANT toute réponse, y compris une question de clarification. Donne une table de "drapeaux rouges" (pensées du type "c'est juste une question simple" → c'est une rationalisation, vérifier quand même). Priorité : skills de process (brainstorming, systematic-debugging) avant skills d'implémentation.

---

## Skills natifs Claude Code

| Skill | Ce qu'il fait | Quand |
|---|---|---|
| `code-review` | Revue du diff courant : bugs, réutilisation, simplification. `--comment` poste en inline sur la PR, `--fix` applique les correctifs trouvés, mode `ultra` lance une revue cloud multi-agents (facturée, déclenchée par l'utilisateur uniquement) | Avant merge, après une feature |
| `verify` | Lance l'app réellement (dev server, navigateur) pour observer le comportement avant de déclarer un fix validé | Changements UI/frontend |
| `simplify` | Revoit le code déjà modifié pour réutilisation/simplification — ne cherche pas de bugs | Nettoyage post-implémentation |
| `security-review` | Revue de sécurité ciblée du code modifié | Code touchant auth, uploads, permissions |
| `review` | Revue d'une PR GitHub existante (`gh pr view` etc.) | PR externe à examiner |
| `context-engineering` | Configure les fichiers de règles et le contexte d'un agent (nouvelle session, baisse de qualité perçue) | Setup de session |
| `claude-api` | Référence API Claude/SDK Anthropic (modèles, pricing, streaming, tool use) | Dès que Claude/Anthropic/un LLM est mentionné sans fournisseur précisé |
| `run` | Lance et pilote l'app du projet | Vérifier un changement en conditions réelles |
| `init` | Génère un CLAUDE.md documentant le codebase | Nouveau projet sans documentation |
| `update-config` | Modifie hooks/permissions/env dans `settings.json` | Changer le comportement du harness |
| `keybindings-help` | Personnalise les raccourcis clavier | — |
| `fewer-permission-prompts` | Scanne les transcripts pour ajouter une allowlist Bash/MCP | Réduire les confirmations répétitives |
| `loop` | Répète un prompt/slash-command à intervalle régulier | Tâche récurrente |
| `schedule` | Crée/gère des agents cloud sur cron | Automatisation différée |
| `find-skills` | Cherche un skill existant via `npx skills find` avant d'en écrire un | Découverte (utilisé pour installer superpowers) |
| `graphify` | Transforme code/docs/projet en graphe de connaissances interrogeable | Analyse d'architecture |
| `stop-slop` | Supprime les tics d'écriture IA (ce message l'utilise) | Rédaction de texte |

## Skills Design (groupe `design`)

Aucun usage sur SOMIZ jusqu'ici — le projet impose des styles inline + `theme.js` centralisé, pas de génération de logo/slides/bannière.

| Skill | Contenu |
|---|---|
| `design` | Identité de marque, design tokens, logos (55 styles), CIP (50 livrables), présentations HTML, bannières (22 styles), icônes (15 styles), photos sociales |
| `design-system` | Architecture de tokens à 3 couches (primitif→sémantique→composant), specs de composants |
| `ui-ux-pro-max` | 67 styles UI, 161 palettes, 57 pairings de polices, 21 stacks (React, Vue, Svelte...). Plan/build/review d'éléments concrets (boutons, modales, tableaux) |
| `banner-design`, `brand`, `slides`, `ui-styling` | Bannières, voix de marque, présentations, stylisation UI générique |

---
*Mis à jour 2026-06-30, contenu vérifié en lisant chaque `SKILL.md` source dans `~/.claude/skills/`.*
