# SOMIZ — Guide Développeur

## Projet
**SOMIZ** = Système d'Archivage des Dossiers RH  
Application intranet pour centraliser et gérer les documents administratifs RH des employés.  
Conformité : Loi 18-07/ANPDP (Algérie) + RGPD.

**Rôles utilisateurs :**
- `SUPERADMIN` — mêmes droits qu'un ADMIN (`User.is_admin` renvoie `True` pour les deux), **plus** la visibilité complète sur `/audit` (voir ci-dessous). Ne peut être créé/attribué que via `manage.py shell`/accès direct base — jamais via l'UI ni l'API `/admin-users/` (`UserSerializer.validate_role`/`UserCreateSerializer.validate_role` rejettent toute tentative). Un ADMIN ordinaire ne voit même pas les comptes SUPERADMIN dans `/users` (404 sur leur id, exclus de la liste).
- `ADMIN` — droits complets (lecture, écriture, suppression, import, configuration), toujours accès organisation-wide
- `CONSULTANT` — lecture seule (pas de boutons d'action visibles), peut être restreint à un **périmètre organisationnel** (voir section Scoping ci-dessous) ou laissé sans restriction (comportement historique)
- `GESTIONNAIRE` — lecture seule type CONSULTANT sur son périmètre organisationnel (même mécanisme de scoping exactement), plus le droit de créer des demandes d'attestation de travail pour les employés de ce périmètre (voir section "Demandes d'attestation de travail"). `User.libelle_role` (ex. "Secrétaire", "Superviseur") est un simple libellé d'affichage par compte — aucune permission n'en dépend.

### Journal d'audit — visibilité par rôle (2026-08-30)

Un ADMIN ordinaire voit dans `/audit` **ses propres actions et celles de
tous les comptes CONSULTANT** (qu'il administre — traçabilité RGPD/Loi
18-07 sur ce qu'ils consultent), mais jamais celles d'un autre ADMIN ou
d'un SUPERADMIN — le filtre `user` de la query string reste borné à ce
périmètre côté serveur (`AuditLogListView`, `audit/views.py`), pas
seulement masqué côté UI. Seul un `SUPERADMIN` voit le journal complet
(toutes les actions, tous les comptes) ; chacune de ses consultations est
elle-même tracée (`AuditLog.Action.VIEW_AUDIT_LOG`, détail : filtres
utilisés) pour que ce pouvoir de surveillance reste lui-même auditable.
Aucun rôle ne peut modifier ou purger le journal (pas de DELETE sur
`AuditLog`).

---

## Toujours consulter avant de coder

1. **`contenu.md`** (racine) — documentation fonctionnelle complète du projet (1 000+ lignes)
2. **`frontend/src/styles/theme.js`** — tous les tokens de couleur, ombre, police. **Ne jamais hardcoder un hex dans un composant.**
3. **`frontend/src/styles/animations.css`** — classes d'animation disponibles
4. **`frontend/src/App.js`** — routes et structure de navigation
5. **`backend/employees/models.py`** — modèles de données (Direction, Departement, Service, Employé, Contrat, Document)
6. **`securite.md`** (racine) — journal des correctifs de sécurité, à jour à chaque changement touchant l'auth, les permissions ou la suppression de données
7. **`GRH_INTEGRATION.md`** (racine) — intégration entrante GRH → SOMIZ (synchronisation employés via webhook signé HMAC), voir aussi `docs/GRH_INTEGRATION_SPEC.md` (spec à transmettre à l'équipe GRH). **Non branché en production** : le code existe (`backend/employees/grh_integration.py`, route `/api/employees/grh-sync/`, tests), mais rien n'a encore été validé/activé côté GRH — ne pas considérer cette intégration comme active tant que `GRH_INTEGRATION.md` (section "Ce qui reste à faire") n'est pas soldée

---

## Index de la documentation par chantier

`CLAUDE.md` ne garde que les règles permanentes. Le détail de chaque chantier (dates, pièges, approches abandonnées, incidents) est dans `docs/fonctionnel/` — **lire le fichier concerné avant de toucher à la zone correspondante** :

- [`docs/fonctionnel/scoping.md`](docs/fonctionnel/scoping.md) — À lire avant de toucher à une vue/serializer qui liste ou retrouve des employés, documents, contrats ou champs personnels, ou au modal « Périmètre » de /users.
- [`docs/fonctionnel/referentiels.md`](docs/fonctionnel/referentiels.md) — À lire avant de toucher aux référentiels organisationnels (Direction/Pôle/Département/Service/Cellule/Section), aux slugs d'URL, aux imports CSV/xlsx, aux types de contrat ou aux motifs.
- [`docs/fonctionnel/documents.md`](docs/fonctionnel/documents.md) — À lire avant de toucher aux documents (upload, suppression, renommage, rotation, scan-import), aux types de documents, à la photo de profil ou à l'OCR. Contient l'incident de purge du 2026-07-22.
- [`docs/fonctionnel/employes.md`](docs/fonctionnel/employes.md) — À lire avant de toucher à la fiche/au formulaire/à la liste des employés, aux champs personnalisés, à l'historique de carrière, aux transferts ou à l'archivage.
- [`docs/fonctionnel/statistiques-audit.md`](docs/fonctionnel/statistiques-audit.md) — À lire avant de toucher à /statistiques, à audit/stats.py ou aux liens de preuve vers /audit.
- [`docs/fonctionnel/comptes-conformite.md`](docs/fonctionnel/comptes-conformite.md) — À lire avant de toucher à la suppression de compte, aux permissions IsAdmin/IsAdminOrConsultant ou au flux de consentement.
- [`docs/fonctionnel/attestations.md`](docs/fonctionnel/attestations.md) — À lire avant de toucher à l'app attestations (workflow de statuts, PDF ReportLab, configuration du modèle, mode test, statistiques).
- [`docs/fonctionnel/ui-conventions.md`](docs/fonctionnel/ui-conventions.md) — À lire avant d'écrire ou de modifier une page/un composant React : design system, dates, modales de confirmation, refresh silencieux, responsive.

**Règles critiques à ne jamais oublier, même sans avoir lu le détail :**
- Toute vue qui liste/retrouve employés, documents ou contrats applique le scoping (`employee_scope_q()` / `can_access_employee()`) — voir `scoping.md`.
- Jamais de couleur codée en dur : tokens de `theme.js` ; jamais `window.confirm`/`window.prompt` : `useConfirm()`/`usePrompt()` — voir `ui-conventions.md`.
- Un rafraîchissement après action mutante passe `fetch*(true)` (silencieux), jamais un `setLoading(true)` qui démonte la page — voir `ui-conventions.md`.
- Suppression de documents = hard delete tracé dans l'audit ; jamais de script de purge en masse sans liste validée, normalisation de chemin et sauvegarde — voir `documents.md`.
- Une permission « transversale » se vérifie par un test d'intégration sur une vraie route métier — voir `comptes-conformite.md`.

---

## Exposition locale via tunnel (dev uniquement, 2026-09-15)

Le poste de dev peut avoir `ngrok`, `cloudflared` (Cloudflare Tunnel) et/ou
`Tailscale` installés pour exposer temporairement le serveur de dev React
(port 3000) sur internet à des fins de test/démo — voir `securite.md` point
35 pour le détail de l'incident/config associés (dont un correctif
`frontend/.env` : `HOST=127.0.0.1` au lieu de `localhost`, pour que le
serveur de dev écoute en IPv4 et reste joignable par ces tunnels). **Ne
jamais utiliser ces tunnels pour exposer un environnement avec de vraies
données RH** — ils ne remplacent aucun contrôle d'accès SOMIZ (JWT, RBAC,
scoping), ils exposent le port tel quel à quiconque a l'URL. Le tailnet
Tailscale de cette machine (`desktop-uek2hc8.tail9d7cd0.ts.net`) reste actif
mais son Funnel n'a pas pu être rendu réellement public (DNS renvoyant une
IP interne Tailscale non routable) — non fiable comme solution durable.

---

## Stack technique

### Backend
- Python 3, Django 5.2 LTS, Django REST Framework 3.17.2
- Authentification JWT via **httpOnly cookies** (résistant au XSS), CSRF en double-soumission (`accounts/cookie_auth.py`)
- Base de données : PostgreSQL
- Cache : Redis (`django-redis`) — rate-limiting DRF fiable en multi-worker, repli sur cache mémoire local si `REDIS_URL` absent (dev/CI)
- Anti-brute-force unifié : 5 tentatives → blocage 30 min, appliqué à `/api/auth/login/` **et** `/django-admin/login/` (`accounts/backends.py`)
- Session JWT : access 2h / refresh 10h (plafond absolu, pas de rotation glissante — voir `CookieTokenRefreshView`)
- Validation MIME : python-magic (20 Mo max par fichier), noms de fichiers régénérés en UUID (pas de path traversal)
- Soft-delete partout (`is_active` flag) — **sauf `EmployeeDocument`/`EmployeeDocumentFile`** (voir section Documents ci-dessous, suppression définitive depuis 2026-07-22)
- Audit logging complet (13 types d'actions incl. `CREATE_USER`/`MODIFY_USER`/`DELETE_USER`), y compris les mutations faites via `/django-admin/`
- Rate-limiting dédié (`consultation`, 30/min) sur la visualisation de documents, en plus du throttle global (`anon` 10/min, `user` 200/min)
- `Permissions-Policy` globale (`config/middleware.py`) désactivant caméra/micro/géoloc/paiement

### Frontend
- React 19, React Router 7, Axios
- **Styles inline uniquement** (`style={{}}`) — pas de Tailwind, pas de CSS modules
- Tokens centralisés dans `theme.js`
- Classes d'animation dans `animations.css`
- Police : **Plus Jakarta Sans** (Google Fonts, chargée dans `index.html`)

---

## Hiérarchie des données

```
Direction
  └── Departement (N par Direction)
        └── Service (N par Département)
              └── Employé (N par Service)
                    ├── Documents (dossier général)
                    └── Contrat (N par Employé)
                          └── Documents (dossier contrat)
```

---


## Routes principales

| Route | Page | Accès |
|---|---|---|
| `/login` | Login | Public |
| `/consentement` | Consentement Loi 18-07 (bloquant si non consenti) | Tous (authentifié) |
| `/employees` | Liste employés (drill-down Direction→Dept→Service→Employé) | Tous |
| `/employees/nouveau` | Créer employé | ADMIN |
| `/employees/:id` | Détail employé + documents + contrats | Tous |
| `/employees/:id/modifier` | Modifier employé | ADMIN |
| `/contrats/:id` | Détail contrat | Tous |
| `/dashboard` | Tableau de bord (indicateurs instantanés) | ADMIN |
| `/statistiques` | Statistiques RH détaillées (filtres, périmètre, export) | ADMIN |
| `/attestations` | Demandes d'attestation de travail (liste ADMIN, "mes demandes" GESTIONNAIRE, reporting) | ADMIN, GESTIONNAIRE |
| `/attestations/nouvelle` | Nouvelle demande d'attestation | ADMIN, GESTIONNAIRE |
| `/attestations/:ref` | Détail, traitement (statuts, aperçu, scan) | ADMIN (lecture pour le demandeur) |
| `/users` | Gestion utilisateurs | ADMIN |
| `/audit` | Logs d'audit | ADMIN |
| `/parametres` | CRUD référentiels (Directions, Depts, Services, Postes...) | ADMIN |
| `/import` | Import CSV employés | ADMIN |
| `/profil` | Profil utilisateur | Tous |

---

## Endpoints API clés

### Référentiels organisationnels
```
GET /ref/directions/
GET /ref/departements/?direction=<uuid>
GET /ref/services/?departement=<uuid>
```

### Employés
```
GET  /api/employees/?service=<uuid>&q=<search>&statut=<statut>&page=<n>
POST /api/employees/
GET  /api/employees/<uuid>/
PATCH /api/employees/<uuid>/
DELETE /api/employees/<uuid>/
```

### Documents & Contrats
```
GET  /api/employees/<uuid>/documents/
POST /api/employees/<uuid>/documents/
POST /api/employees/<uuid>/documents/scan-import/
GET  /api/contrats/<uuid>/
PATCH /api/contrats/<uuid>/
```

---

## Sécurité — règles impératives

- **Ne jamais stocker de token en localStorage** — JWT uniquement via httpOnly cookies
- **Vérifier `user.role`** avant d'afficher tout bouton d'action destructive
- **Pas de deep links vers des documents** — utiliser `SecureDocViewer` qui passe par l'API
- **CORS configuré côté Django** — ne pas modifier sans consulter le backend
- **Les uploads sont validés côté backend** — le frontend n'a pas à valider le MIME type
- **Toute nouvelle vue listant des employés/documents/contrats doit appliquer le scoping** — `request.user.employee_scope_q()` ou `can_access_employee()` (voir section Scoping ci-dessus)
- **Les mutations de mot de passe passent par `django.contrib.auth.password_validation.validate_password()`**, pas juste un check de longueur
- **Journal complet d'audit sécurité** : voir [`securite.md`](securite.md) (racine du projet) — 24 points vérifiés/corrigés, à mettre à jour à chaque nouveau point de sécurité traité

---

## Tests

- Backend : `pytest` (188 tests dans `backend/tests/`)
- Frontend : Jest + React Testing Library (261+ tests dans `frontend/src/__tests__/`)
- Lancer les tests backend : `cd backend && pytest`
- Lancer les tests frontend : `cd frontend && npm test`
- **Après toute modification touchant `accounts`/`employees` (permissions, scoping, modèles) : lancer la suite complète avant de commit** — l'app dépend de PostgreSQL + Redis actifs localement (`REDIS_URL` dans `.env`, repli automatique sur cache mémoire si absent)
