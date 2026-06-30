# SOMIZ — Guide Développeur

## Projet
**SOMIZ** = Système d'Archivage des Dossiers RH  
Application intranet pour centraliser et gérer les documents administratifs RH des employés.  
Conformité : Loi 18-07/ANPDP (Algérie) + RGPD.

**Rôles utilisateurs :**
- `ADMIN` — droits complets (lecture, écriture, suppression, import, configuration)
- `CONSULTANT` — lecture seule (pas de boutons d'action visibles)

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
- Python 3, Django 4.2, Django REST Framework
- Authentification JWT via **httpOnly cookies** (résistant au XSS)
- Base de données : PostgreSQL
- Anti-brute-force : 5 tentatives → blocage 30 min
- Validation MIME : python-magic (20 Mo max par fichier)
- Soft-delete partout (`is_active` flag)
- Audit logging (11 types d'actions)

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

---

## Tests

- Backend : `pytest` (141+ tests dans `backend/`)
- Frontend : Jest + React Testing Library (206+ tests dans `frontend/src/__tests__/`)
- Lancer les tests backend : `cd backend && pytest`
- Lancer les tests frontend : `cd frontend && npm test`
