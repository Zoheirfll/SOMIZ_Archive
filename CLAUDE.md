# SOMIZ — Guide Développeur

## Projet
**SOMIZ** = Système d'Archivage des Dossiers RH  
Application intranet pour centraliser et gérer les documents administratifs RH des employés.  
Conformité : Loi 18-07/ANPDP (Algérie) + RGPD.

**Rôles utilisateurs :**
- `ADMIN` — droits complets (lecture, écriture, suppression, import, configuration), toujours accès organisation-wide
- `CONSULTANT` — lecture seule (pas de boutons d'action visibles), peut être restreint à un **périmètre organisationnel** (voir section Scoping ci-dessous) ou laissé sans restriction (comportement historique)

---

## Toujours consulter avant de coder

1. **`contenu.md`** (racine) — documentation fonctionnelle complète du projet (1 000+ lignes)
2. **`frontend/src/styles/theme.js`** — tous les tokens de couleur, ombre, police. **Ne jamais hardcoder un hex dans un composant.**
3. **`frontend/src/styles/animations.css`** — classes d'animation disponibles
4. **`frontend/src/App.js`** — routes et structure de navigation
5. **`backend/employees/models.py`** — modèles de données (Direction, Departement, Service, Employé, Contrat, Document)

---

## Stack technique

### Backend
- Python 3, Django 4.2.30, Django REST Framework 3.15.2
- Authentification JWT via **httpOnly cookies** (résistant au XSS), CSRF en double-soumission (`accounts/cookie_auth.py`)
- Base de données : PostgreSQL
- Cache : Redis (`django-redis`) — rate-limiting DRF fiable en multi-worker, repli sur cache mémoire local si `REDIS_URL` absent (dev/CI)
- Anti-brute-force unifié : 5 tentatives → blocage 30 min, appliqué à `/api/auth/login/` **et** `/django-admin/login/` (`accounts/backends.py`)
- Session JWT : access 2h / refresh 10h (plafond absolu, pas de rotation glissante — voir `CookieTokenRefreshView`)
- Validation MIME : python-magic (20 Mo max par fichier), noms de fichiers régénérés en UUID (pas de path traversal)
- Soft-delete partout (`is_active` flag)
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

## Scoping organisation-wide (périmètre CONSULTANT)

Un CONSULTANT peut être restreint à un périmètre : `User.scope_directions`,
`scope_departements`, `scope_services` (ManyToMany, sélection multiple à
chaque niveau — union : un employé est visible dès qu'il correspond à AU
MOINS un élément choisi, peu importe le niveau). **Aucune sélection nulle
part = accès non restreint** (comportement historique préservé pour tous
les comptes existants).

- `User.employee_scope_q(prefix='')` — Q object à utiliser dans `.filter()` (ex. `prefix='employee__'` pour un queryset `Contrat`).
- `User.can_access_employee(employee)` — équivalent objet-par-objet pour `get_object()`.
- `User.accessible_directions_qs()` / `accessible_departements_qs()` / `accessible_services_qs()` — pour restreindre les listes référentiels (`/ref/*`) au périmètre (utilisé par le filtre cascade de `/employees`).
- ADMIN toujours non restreint, quel que soit ce qui est renseigné sur son compte.
- UI d'assignation : page `/users`, bouton "Périmètre" (visible pour les comptes CONSULTANT) — cases à cocher en cascade (cocher une Direction filtre les Départements affichés à ceux qu'elle contient, etc.), boutons "Tout"/"Aucun" par niveau.
- Toute vue qui liste/retrouve des employés, documents ou contrats doit appliquer ce scoping (voir `employees/views.py` : `EmployeeListCreateView`, `EmployeeDetailView`, `FileViewerView`, `DocumentViewerView`, `ContratListCreateView`, `ContratDetailView`, `ContratDocumentListUploadView`, `employee_search`).

---

## Design System (v2 — actuel)

Le design a été entièrement refondu. Chaque page suit ce pattern :

### Hero header (toutes les pages)
```jsx
<div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: "40px 32px 32px" }}>
  {/* breadcrumb + titre + actions ADMIN */}
</div>
<div style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>
  {/* contenu */}
</div>
```

### Cards
- `borderRadius: 16`, `border: theme.border` (jamais `primaryBorder` pour structurel)
- `boxShadow: theme.shadowMd`
- En-tête de section : barre verte 4px + label uppercase 11px

### Hiérarchie — couleurs par niveau
| Niveau | Couleur | Token gradient |
|---|---|---|
| Direction | Vert `#166534` | `theme.directionGrad` |
| Département | Bleu `#1e40af` | `theme.departementGrad` |
| Service | Violet `#6d28d9` | `theme.serviceGrad` |

### `theme.border` vs `theme.primaryBorder`
- `theme.border` (`#E2E8F0`) → bordures **structurelles** (cards, tables, inputs)
- `theme.primaryBorder` (`#bbf7d0`) → éléments **de marque** (badges actif, avatars)

---

## Conventions UI

### Règle absolue — tokens
```js
import theme from '../styles/theme';

// ✅ Correct
style={{ color: theme.primary, background: theme.primaryBg }}

// ❌ Interdit
style={{ color: '#1A7A3C', background: '#E8F5EE' }}
```

### Classes d'animation disponibles
```css
.anim-fade-in       /* opacité 0→1, 250ms */
.anim-slide-up      /* translateY(12px)→0, 280ms */
.anim-slide-down    /* translateY(-12px)→0, 220ms */
.anim-scale-in      /* scale(0.96)→1, 220ms */
.anim-pop           /* scale(0.8)→1.05→1, 300ms — spring cubic-bezier */
.delay-1 … .delay-8 /* délais en cascade (35ms par palier) */
.btn-lift           /* hover: translateY(-2px) sur boutons */
.card-lift          /* hover: translateY(-3px) + shadow sur cartes */
.input-focus        /* focus: ring vert 3px */
.nav-link           /* transitions de navigation */
.hover-lift         /* hover: translateY(-4px) + shadow plus forte */
```

### Permissions dans les composants
```js
import { useAuth } from '../context/AuthContext';
const { user } = useAuth();

// Afficher uniquement pour ADMIN
{user?.role === 'ADMIN' && <button>Supprimer</button>}
```

### Pattern loading / erreur
```jsx
if (loading) return <div style={{ textAlign: 'center', padding: 40, color: theme.textSecondary }}>Chargement...</div>;
if (error) return <div style={{ color: theme.danger, padding: 20 }}>{error}</div>;
```

---

## Routes principales

| Route | Page | Accès |
|---|---|---|
| `/login` | Login | Public |
| `/employees` | Liste employés (drill-down Direction→Dept→Service→Employé) | Tous |
| `/employees/nouveau` | Créer employé | ADMIN |
| `/employees/:id` | Détail employé + documents + contrats | Tous |
| `/employees/:id/modifier` | Modifier employé | ADMIN |
| `/contrats/:id` | Détail contrat | Tous |
| `/dashboard` | Statistiques | ADMIN |
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
