# SOMIZ — Système d'Archivage des Dossiers RH
## Documentation complète du projet

---

## Table des matières

1. [Présentation générale](#1-présentation-générale)
2. [Architecture globale](#2-architecture-globale)
3. [Backend — Django REST Framework](#3-backend--django-rest-framework)
   - [Structure des applications](#31-structure-des-applications)
   - [Modèles de données](#32-modèles-de-données)
   - [API REST — Endpoints](#33-api-rest--endpoints)
   - [Sécurité backend](#34-sécurité-backend)
   - [Configuration](#35-configuration)
4. [Frontend — React](#4-frontend--react)
   - [Structure du projet](#41-structure-du-projet)
   - [Pages et fonctionnalités](#42-pages-et-fonctionnalités)
   - [Services et contexte](#43-services-et-contexte)
   - [Composants réutilisables](#44-composants-réutilisables)
5. [Tests](#5-tests)
   - [Tests backend](#51-tests-backend)
   - [Tests frontend](#52-tests-frontend)
   - [Comment lancer les tests](#53-comment-lancer-les-tests)
6. [Flux de données](#6-flux-de-données)
7. [Structure complète des fichiers](#7-structure-complète-des-fichiers)
8. [Dépendances techniques](#8-dépendances-techniques)
9. [Ce qui doit être contenu dans le projet](#9-ce-qui-doit-être-contenu-dans-le-projet)

---

## 1. Présentation générale

**SOMIZ** est une application web de gestion et d'archivage des dossiers RH (Ressources Humaines). Elle est conçue pour fonctionner en **intranet** au sein d'une organisation.

### Objectif principal
Permettre aux équipes RH de centraliser, consulter et gérer les dossiers administratifs des employés (contrats, pièces d'identité, diplômes, etc.) dans le respect des réglementations algériennes (Loi 18-07 / ANPDP) et du RGPD.

### Deux rôles utilisateurs
| Rôle | Droits |
|---|---|
| **ADMIN** | Lecture + Écriture + Suppression + Gestion des utilisateurs |
| **CONSULTANT** | Lecture seule (consultation des dossiers) |

### Technologies utilisées
- **Backend** : Python 3, Django 4.2, Django REST Framework, JWT (SimpleJWT), PostgreSQL
- **Frontend** : React 19, React Router 7, Axios
- **Tests** : pytest (backend), React Testing Library + Jest (frontend)

---

## 2. Architecture globale

```
SOMIZ/
├── .gitignore            ← Unique, couvre backend + frontend
├── install.bat           ← Installation automatique Windows
├── install.sh            ← Installation automatique Linux/macOS
├── contenu.md            ← Documentation complète
├── requirements.md       ← Dépendances pour le chef de département
│
├── backend/              ← API Django REST
│   ├── pytest.ini        ← Config pytest (lancé depuis backend/)
│   ├── requirements.txt
│   ├── manage.py
│   ├── .env              ← Non versionné
│   ├── accounts/         ← Authentification et gestion utilisateurs
│   ├── employees/        ← Cœur métier : employés + documents
│   ├── audit/            ← Journal de traçabilité
│   ├── config/           ← Paramètres Django, URLs racine
│   ├── media/            ← Fichiers uploadés (non versionné)
│   ├── logs/             ← Logs applicatifs (non versionné)
│   └── tests/            ← ~141 tests pytest
│
└── frontend/             ← Application React
    ├── package.json
    ├── src/
    │   ├── pages/        ← 11 pages
    │   ├── components/   ← 3 composants réutilisables
    │   ├── services/     ← Client HTTP + fonctions auth
    │   ├── context/      ← Contexte d'authentification
    │   ├── styles/       ← Thème CSS-in-JS
    │   └── __tests__/   ← Tests React (Jest + RTL)
    └── public/
```

### Flux de communication
```
Navigateur (React)
      ↕  HTTP/REST (JSON)
Django API (/api/...)
      ↕
  PostgreSQL (données)
  media/     (fichiers)
  logs/      (journaux)
```

---

## 3. Backend — Django REST Framework

### 3.1 Structure des applications

#### `accounts/` — Authentification et utilisateurs
Gère les comptes utilisateurs, la connexion JWT, la protection anti-brute-force et la gestion des mots de passe.

**Fichiers clés :**
| Fichier | Rôle |
|---|---|
| `models.py` | Modèle `User` (AbstractBaseUser), `UserManager` |
| `views.py` | `LoginView`, `LogoutView`, `UserMeView`, `ChangePasswordView`, `AdminResetPasswordView` |
| `permissions.py` | `IsAdmin`, `IsAdminOrConsultant` |
| `urls.py` | Routes `/api/auth/...` |
| `admin_views.py` | CRUD utilisateurs via `/api/admin-users/` |
| `admin_urls.py` | Routes `/api/admin-users/` |

---

#### `employees/` — Employés et documents
Cœur métier de l'application. Gère les référentiels organisationnels, les employés et leurs dossiers documentaires.

**Fichiers clés :**
| Fichier | Rôle |
|---|---|
| `models.py` | `Employee`, `Contrat`, `EmployeeDocument`, `EmployeeDocumentFile`, `TypeDocument`, `Direction`, `Departement`, `Service`, `Poste`, `TypeContrat`, `Categorie` |
| `serializers.py` | Sérialisation DRF avec validation MIME (python-magic), serializers Contrat |
| `views.py` | CRUD employés, CRUD contrats, upload/visualisation/suppression de fichiers, recherche, bulk-delete |
| `referentiel_views.py` | CRUD des référentiels (directions, postes, etc.) |
| `import_views.py` | Import en masse d'employés via CSV |
| `urls.py` + `referentiel_urls.py` | Routes `/api/employees/`, `/api/ref/`, `/api/files/` |

---

#### `audit/` — Journal d'audit
Trace toutes les actions sensibles. Table append-only conservée 5 ans minimum (conformité ANPDP).

**Fichiers clés :**
| Fichier | Rôle |
|---|---|
| `models.py` | `AuditLog` avec 11 types d'actions, méthode `.log()`, `_get_ip()` |
| `views.py` | `AuditLogListView`, `AdminStatsView` |
| `middleware.py` | Capture des requêtes authentifiées |
| `urls.py` | Routes `/api/reporting/` |

---

#### `config/` — Configuration générale
| Fichier | Rôle |
|---|---|
| `settings.py` | Base de données, JWT, CORS, sécurité, upload, logs, cache |
| `urls.py` | Routing principal, fallback React pour SPA |

---

### 3.2 Modèles de données

#### Utilisateur (`accounts/models.py`)

```
User
├── id              UUID (PK)
├── username        CharField unique (identifiant de connexion)
├── nom, prenom     CharField
├── role            ADMIN | CONSULTANT
├── failed_login_attempts  PositiveSmallIntegerField (anti-brute-force)
├── locked_until    DateTimeField (verrou temporaire)
├── last_login_ip   GenericIPAddressField
├── created_by      FK(User, self)
└── is_active       BooleanField

Méthodes importantes :
- is_locked()              → True si verrou en cours
- register_failed_login()  → incrémente + verrouille après 5 échecs
- reset_login_attempts()   → réinitialise après connexion réussie
```

#### Référentiels organisationnels (`employees/models.py`)

```
Direction (UUID)
  └── Departement (UUID, FK Direction)
        └── Service (UUID, FK Departement)

Poste (UUID)
TypeContrat (UUID)
Categorie (UUID)
TypeDocument (UUID) — avec flag obligatoire + ordre d'affichage
```

#### Employé (`employees/models.py`)

```
Employee
├── id              UUID (PK)
├── matricule       CharField unique (indexé)
├── nom, prenom     CharField (indexés)
├── date_naissance, date_embauche  DateField
├── statut          actif | inactif | archive (soft-delete)
├── direction       FK(Direction)
├── departement     FK(Departement)
├── service         FK(Service)
├── poste           FK(Poste)
├── type_contrat    FK(TypeContrat)
├── categorie       FK(Categorie)
└── created_by      FK(User)

Propriétés calculées :
- documents_actifs    → queryset des docs actifs
- dossier_complet     → True si tous les TypeDocument obligatoires sont présents
- taux_completude     → % de documents présents sur total des types actifs
```

#### Contrat (`employees/models.py`)

```
Contrat
├── id                UUID (PK)
├── numero_contrat    CharField unique (indexé) — stocké en majuscules
├── employee          FK(Employee, related_name='contrats')
├── type_contrat      FK(TypeContrat, nullable)
├── date_debut        DateField (nullable)
├── date_fin          DateField (nullable)
├── statut            actif | termine | suspendu
├── notes             TextField
└── created_by        FK(User)

Propriétés calculées :
- documents_actifs    → queryset des docs actifs liés à ce contrat
- nb_documents        → entier

Relation : 1 Employee → N Contrats
           1 Contrat  → N EmployeeDocument (dossier propre au contrat)
```

#### Documents (`employees/models.py`)

```
EmployeeDocument  (conteneur)
├── id              UUID (PK)
├── employee        FK(Employee)
├── contrat         FK(Contrat, nullable) — null = dossier général, sinon dossier du contrat
├── type_doc        FK(TypeDocument)
├── version         auto-incrémenté à chaque nouvel upload du même (employee, contrat, type)
├── is_active       False pour les anciennes versions
├── uploaded_by     FK(User)
└── notes           TextField

Comportement : versioning scoped par (employee + contrat + type_doc).
Un document lié à CTR-001 n'interfère pas avec le même type sur CTR-002.

EmployeeDocumentFile  (fichier physique)
├── id              UUID (PK)
├── document        FK(EmployeeDocument)
├── file            FileField
│                   Dossier général : employees/{employee_id}/{type_code}/{uuid}.ext
│                   Dossier contrat : employees/{employee_id}/contrats/{numero}/{type_code}/{uuid}.ext
├── file_name, file_size, mime_type
├── ordre           ordre d'affichage
└── is_active       soft-delete
```

#### Journal d'audit (`audit/models.py`)

```
AuditLog (BIGSERIAL — pas UUID, plus rapide pour les logs)
├── user            FK(User, nullable)
├── username_snapshot  snapshot permanent du username
├── action          VIEW | UPLOAD | DELETE_DOC | MODIFY_DOC |
│                   CREATE_EMP | MODIFY_EMP | DELETE_EMP |
│                   LOGIN | LOGOUT | LOGIN_FAIL | EXPORT
├── target_model, target_id, target_label  (objet concerné)
├── ip_address      (réelle, via X-Forwarded-For si Nginx)
├── user_agent      (navigateur/client)
├── timestamp       (auto, indexé)
└── details         JSONField (données additionnelles)
```

---

### 3.3 API REST — Endpoints

#### Authentification (`/api/auth/`)
| Méthode | URL | Description | Accès |
|---|---|---|---|
| POST | `/api/auth/login/` | Connexion, retourne access+refresh JWT | Public |
| POST | `/api/auth/logout/` | Blackliste le refresh token | Authentifié |
| POST | `/api/auth/refresh/` | Renouvelle le token d'accès | Public |
| GET | `/api/auth/me/` | Informations de l'utilisateur connecté | Authentifié |
| POST | `/api/auth/change-password/` | Changer son propre mot de passe | Authentifié |

#### Gestion utilisateurs (`/api/admin-users/`)
| Méthode | URL | Description | Accès |
|---|---|---|---|
| GET | `/api/admin-users/` | Liste de tous les utilisateurs | ADMIN |
| POST | `/api/admin-users/` | Créer un utilisateur | ADMIN |
| PATCH | `/api/admin-users/{id}/` | Modifier (ex : désactiver) | ADMIN |
| POST | `/api/admin-users/{id}/reset-password/` | Réinitialiser le MDP | ADMIN |

#### Employés (`/api/employees/`)
| Méthode | URL | Description | Accès |
|---|---|---|---|
| GET | `/api/employees/` | Liste paginée (25/page) avec filtres | Authentifié |
| POST | `/api/employees/` | Créer un employé | ADMIN |
| GET | `/api/employees/search/` | Recherche rapide (autocomplete, min 2 chars) | Authentifié |
| GET | `/api/employees/{id}/` | Détail complet (avec documents) | Authentifié |
| PATCH | `/api/employees/{id}/` | Modifier un employé | ADMIN |
| DELETE | `/api/employees/{id}/` | Archiver (soft-delete → statut=archive) | ADMIN |
| POST | `/api/employees/bulk-delete/` | Archive ou suppression en masse (max 500) | ADMIN |

#### Contrats (`/api/employees/{id}/contrats/` et `/api/contrats/`)
| Méthode | URL | Description | Accès |
|---|---|---|---|
| GET | `/api/employees/{id}/contrats/` | Liste des contrats d'un employé | Authentifié |
| POST | `/api/employees/{id}/contrats/` | Créer un contrat | ADMIN |
| GET | `/api/contrats/{id}/` | Détail du contrat + documents | Authentifié |
| PATCH | `/api/contrats/{id}/` | Modifier un contrat | ADMIN |
| DELETE | `/api/contrats/{id}/` | Supprimer un contrat | ADMIN |
| GET | `/api/contrats/{id}/documents/` | Liste des documents du contrat | Authentifié |
| POST | `/api/contrats/{id}/documents/` | Uploader un fichier dans le dossier contrat | ADMIN |

#### Documents et fichiers
| Méthode | URL | Description | Accès |
|---|---|---|---|
| GET | `/api/employees/{id}/documents/` | Liste des documents généraux d'un employé | Authentifié |
| POST | `/api/employees/{id}/documents/` | Uploader un ou plusieurs fichiers | ADMIN |
| GET | `/api/documents/{doc_id}/view/` | Visionner un document (inline) | Authentifié |
| DELETE | `/api/documents/{doc_id}/` | Supprimer un document | ADMIN |
| GET | `/api/files/{file_id}/view/` | Streamer un fichier individuel (inline) | Authentifié |
| DELETE | `/api/files/{file_id}/` | Supprimer un fichier (soft-delete) | ADMIN |

#### Référentiels (`/api/ref/`)
| Méthode | URL | Description |
|---|---|---|
| GET/POST | `/api/ref/directions/` | Directions |
| GET/POST | `/api/ref/departements/` | Départements |
| GET/POST | `/api/ref/services/` | Services |
| GET/POST | `/api/ref/postes/` | Postes |
| GET/POST | `/api/ref/types-contrat/` | Types de contrat |
| GET/POST | `/api/ref/categories/` | Catégories |
| GET/POST | `/api/ref/types-documents/` | Types de documents |
| PATCH/DELETE | `/api/ref/{model}/{id}/` | Modifier / Supprimer |
| POST | `/api/ref/import/{model}/` | Import CSV en masse |

#### Import CSV
| Méthode | URL | Description | Accès |
|---|---|---|---|
| POST | `/api/employees/import/` | Import d'employés via fichier CSV | ADMIN |
| GET | `/api/employees/import/template/` | Télécharger le template CSV | ADMIN |

#### Rapports et audit
| Méthode | URL | Description | Accès |
|---|---|---|---|
| GET | `/api/reporting/audit-logs/` | Journal d'audit (50/page, filtrable) | ADMIN |
| GET | `/api/reporting/stats/` | Statistiques globales + complétude | ADMIN |

---

### 3.4 Sécurité backend

#### Authentification JWT
- Tokens d'accès valides **2 heures**
- Tokens de rafraîchissement valides **24 heures**
- Rotation automatique des refresh tokens
- Blacklisting des tokens lors de la déconnexion

#### Protection anti-brute-force
- **5 tentatives** échouées → verrouillage du compte **30 minutes**
- Le compteur se réinitialise après une connexion réussie
- L'IP est enregistrée à chaque tentative

#### Limitations de débit (throttling)
- **10 requêtes/minute** pour les utilisateurs anonymes (protection endpoint login)
- **200 requêtes/minute** pour les utilisateurs authentifiés

#### Sécurité des fichiers uploadés
- Validation MIME réelle via **python-magic** (pas seulement l'extension)
- Types autorisés : PDF, JPEG, PNG, TIFF
- Taille maximale : **20 Mo par fichier**
- Les fichiers sont servis uniquement en mode **inline** (jamais en téléchargement direct)
- Le chemin de stockage intègre l'UUID de l'employé (pas de prédiction possible)
- Headers de sécurité : `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`

#### En-têtes de sécurité globaux
- `XSS_FILTER` activé
- `CONTENT_TYPE_NOSNIFF` activé
- `X_FRAME_OPTIONS: SAMEORIGIN` (pour l'iframe PDF)
- `REFERRER_POLICY: same-origin`

---

### 3.5 Configuration

#### Base de données
- **PostgreSQL** avec connection pooling
- Timezone : `Africa/Algiers`

#### Cache
- `LocMemCache` en développement
- Redis recommandé en production

#### CORS
Origines autorisées : `localhost:3000`, `localhost:5173`, domaines ngrok (pour les tests)

#### Logs
- Fichier rotatif : `backend/logs/somiz.log`
- Taille max : **10 Mo**, **10 sauvegardes**

---

## 4. Frontend — React

### 4.1 Structure du projet

```
frontend/src/
├── App.js                  ← Router principal (toutes les routes)
├── index.js                ← Point d'entrée React
├── context/
│   └── AuthContext.js      ← État global d'authentification
├── services/
│   ├── api.js              ← Instance Axios + intercepteurs
│   └── auth.js             ← Fonctions login/logout/getUser
├── components/
│   ├── Navbar.jsx          ← Barre de navigation
│   ├── ProtectedRoute.jsx  ← Garde des routes privées
│   └── SecureDocViewer.jsx ← Visionneuse PDF sécurisée
├── pages/
│   ├── Login.jsx           ← Page de connexion
│   ├── Employees.jsx       ← Liste des employés
│   ├── EmployeeDetail.jsx  ← Fiche employé (onglets Dossier / Contrats)
│   ├── EmployeeForm.jsx    ← Formulaire création/édition
│   ├── ContratDetail.jsx   ← Dossier d'un contrat (viewer + upload)
│   ├── Dashboard.jsx       ← Tableau de bord statistiques
│   ├── Users.jsx           ← Gestion des utilisateurs (ADMIN)
│   ├── AuditLogs.jsx       ← Journal d'audit (ADMIN)
│   ├── Parametres.jsx      ← CRUD référentiels (ADMIN)
│   ├── Import.jsx          ← Import CSV d'employés (ADMIN)
│   └── Profil.jsx          ← Profil + changement de MDP
└── styles/
    └── theme.js            ← Thème CSS-in-JS centralisé
```

---

### 4.2 Pages et fonctionnalités

#### `Login.jsx` — Connexion
- Formulaire identifiant / mot de passe
- Bouton toggle afficher/masquer le mot de passe
- Case "Se rappeler de moi" → stockage `localStorage` (persistant) ou `sessionStorage` (session)
- Affichage des messages d'erreur du serveur
- Désactivation du bouton pendant le chargement
- Redirection vers `/employees` après succès

#### `Employees.jsx` — Liste des employés
- Tableau paginé (25 employés par page)
- Recherche en temps réel (debounce 300ms) par nom, prénom ou matricule
- Filtre par statut (Actif / Inactif / Archivé)
- Tri par colonne (clic sur l'en-tête, inversion avec double-clic)
- Sélection multiple avec checkboxes (ADMIN uniquement)
- Barre d'actions contextuelle lors d'une sélection :
  - **Archiver** (soft-delete, statut → archivé)
  - **Supprimer définitivement** (avec confirmation)
- Boutons "Import CSV" et "+ Nouvel employé" (ADMIN uniquement)
- Badges colorés pour le statut et la complétude du dossier

#### `EmployeeDetail.jsx` — Fiche employé
- Affichage complet des informations de l'employé (matricule, nom, statut, direction, département, poste, etc.)
- Taux de complétude du dossier en pourcentage
- **Onglet Dossier** : liste des documents généraux + documents manquants + upload inline
- **Onglet Contrats** : liste de tous les contrats de l'employé (N°, type, dates, statut, nb docs)
  - Formulaire de création de contrat inline (ADMIN)
  - Clic sur un contrat → navigation vers `ContratDetail`
- Visionneuse de fichiers inline (PDF via `react-pdf`, images)
- Upload de un ou plusieurs fichiers par type de document (ADMIN)
- Suppression de fichiers avec confirmation (ADMIN)
- Bouton "Modifier l'employé" (ADMIN)
- Nettoyage automatique des URLs blob à la destruction du composant

#### `ContratDetail.jsx` — Dossier d'un contrat
- Fil d'ariane : Employés › Fiche employé › N° Contrat
- Carte récapitulative : N° contrat, type, dates, statut, nb documents
- Sidebar : liste des documents propres au contrat (versioning indépendant)
- Visionneuse sécurisée inline identique à `EmployeeDetail`
- Upload de fichiers dans le dossier du contrat (ADMIN) → stocké sous `employees/{id}/contrats/{numero}/`
- Suppression de fichiers / documents (ADMIN)

#### `EmployeeForm.jsx` — Création / Modification d'employé
- Formulaire complet avec tous les champs employé
- Chargement automatique des référentiels (directions, postes, types de contrat, etc.)
- Filtrage en cascade : sélectionner une Direction filtre les Départements, sélectionner un Département filtre les Services
- Mode **création** (POST) et mode **édition** (PATCH) détectés via `useParams`
- Pré-remplissage automatique en mode édition
- Validation des champs obligatoires
- Navigation retour après succès

#### `Dashboard.jsx` — Tableau de bord (ADMIN)
- Redirection automatique des CONSULTANT vers `/employees`
- 4 cartes statistiques : Employés actifs, Dossiers complets, Taux de complétude global, Total documents
- Graphique de complétude par type de document (barres de progression)
- Résumé de l'activité des 7 derniers jours
- Message "Aucun employé" si la base est vide

#### `Users.jsx` — Gestion des utilisateurs (ADMIN)
- Liste de tous les comptes avec badges rôle et statut
- Dernière date de connexion (ou "Jamais")
- Formulaire de création d'utilisateur (identifiant, nom, prénom, rôle, mot de passe)
- Validation complète : champs obligatoires, MDP min 10 caractères, confirmation MDP
- Bouton Désactiver / Activer un compte
- Modal de réinitialisation du mot de passe par un ADMIN

#### `AuditLogs.jsx` — Journal d'audit (ADMIN)
- Tableau chronologique de toutes les actions
- Colonnes : Date & Heure, Utilisateur, Action (avec badge coloré), Cible, IP
- Filtre par nom d'utilisateur
- Filtre par type d'action (VIEW, UPLOAD, LOGIN, etc.)
- Pagination (50 entrées par page)

#### `Parametres.jsx` — Référentiels (ADMIN)
- 7 onglets : Directions, Départements, Services, Postes, Types de contrat, Catégories, Types de documents
- Tableau avec boutons Modifier (✏️) et Supprimer (🗑️) par ligne
- Modal d'ajout avec formulaire adapté à chaque référentiel
- Modal d'édition pré-rempli avec les données existantes
- Confirmation avant suppression
- Import CSV par type de référentiel

#### `Import.jsx` — Import CSV (ADMIN)
- Zone de drag & drop pour déposer un fichier CSV
- Sélecteur de fichier classique
- Validation : seulement les fichiers `.csv` acceptés
- Bouton désactivé tant qu'aucun fichier n'est sélectionné
- Affichage du résultat : nombre de créations, erreurs par ligne
- Téléchargement du template CSV

#### `Profil.jsx` — Profil utilisateur
- Affichage des informations du compte connecté (nom, prénom, username, rôle)
- Avatar avec initiales
- Formulaire de changement de mot de passe (ancien MDP, nouveau MDP, confirmation)
- Toggle show/hide pour chaque champ de mot de passe
- Message de succès / erreur après soumission

---

### 4.3 Services et contexte

#### `services/api.js` — Client HTTP Axios
```
Instance axios créée avec baseURL="/api"

Intercepteur REQUEST :
  → Lit le token depuis localStorage ou sessionStorage
  → Ajoute l'en-tête Authorization: Bearer {token}

Intercepteur RESPONSE :
  → Sur erreur 401 (sauf sur /auth/login) :
     - Vide localStorage et sessionStorage
     - Redirige window.location vers /login
```

#### `services/auth.js` — Fonctions d'authentification
```
login(username, password)
  → POST /api/auth/login/
  → Retourne { access, refresh, user }

logout()
  → POST /api/auth/logout/ avec le refresh token
  → Supprime access_token, refresh_token, user de localStorage ET sessionStorage

getUser()
  → Lit l'objet user JSON depuis localStorage ou sessionStorage
  → Retourne null si absent

isAuthenticated()
  → Retourne true si access_token présent dans localStorage ou sessionStorage
```

#### `context/AuthContext.js` — État global
```
AuthProvider
  → État: user (objet user) + authenticated (boolean)
  → Initialisé depuis getUser() et isAuthenticated()

loginSuccess(userData)   → met à jour user et authenticated=true
logoutSuccess()          → remet user=null et authenticated=false

useAuth()                → hook pour consommer le contexte
```

---

### 4.4 Composants réutilisables

#### `ProtectedRoute.jsx`
- Vérifie `authenticated` via `useAuth()`
- Si non authentifié → redirige vers `/login` avec `<Navigate replace />`
- Si authentifié → affiche les enfants

#### `Navbar.jsx`
- Affiche le nom de l'utilisateur et son rôle
- Liens de navigation (visibilité selon le rôle)
- Bouton de déconnexion (appelle `logout()` + `logoutSuccess()`)

#### `SecureDocViewer.jsx`
- Visionneuse de fichiers basée sur `react-pdf`
- Affichage uniquement **inline** (pas de bouton de téléchargement)
- Détection automatique du type MIME
- Gestion des erreurs de chargement

---

## 5. Tests

### 5.1 Tests backend

Dossier : `backend/tests/`
Outil : **pytest** avec **pytest-django**

| Fichier | Ce qui est testé | Nb cas |
|---|---|---|
| `conftest.py` | Fixtures partagées (users, employee, contrat, référentiels) | — |
| `test_accounts_models.py` | `UserManager`, propriétés `User`, brute-force (lock, reset) | 16 |
| `test_accounts_views.py` | `LoginView`, `LogoutView`, `UserMeView`, `ChangePasswordView`, `AdminResetPasswordView` | 25 |
| `test_employees_models.py` | `Employee`, `Contrat`, versioning (general + par contrat), `taux_completude`, `dossier_complet`, référentiels | 31 |
| `test_employees_views.py` | CRUD employés, recherche, filtres, bulk-delete, permissions ADMIN/CONSULTANT | 23 |
| `test_contrat_views.py` | `ContratListCreateView`, `ContratDetailView`, `ContratDocumentListUploadView`, permissions | 21 |
| `test_audit_models.py` | `AuditLog.log()`, `_get_ip()` (X-Forwarded-For), toutes les actions | 17 |
| `test_permissions.py` | `IsAdmin`, `IsAdminOrConsultant` | 8 |

**Total : ~141 cas de test backend**

### 5.2 Tests frontend

Dossier : `frontend/src/__tests__/`
Outils : **Jest** + **React Testing Library** + **@testing-library/user-event**

| Fichier | Page / Module testé | Ce qui est couvert |
|---|---|---|
| `api.test.js` | `services/api.js` | Ajout du token Bearer, redirection 401, cas localStorage/sessionStorage |
| `auth.test.js` | `services/auth.js` | `login()`, `logout()` (vidage storage), `getUser()`, `isAuthenticated()` |
| `AuthContext.test.jsx` | `context/AuthContext.js` | État initial, `loginSuccess()`, `logoutSuccess()` |
| `ProtectedRoute.test.jsx` | `components/ProtectedRoute.jsx` | Redirection si non-authentifié, affichage si authentifié |
| `Login.test.jsx` | `pages/Login.jsx` | Rendu, toggle password, remember-me, succès/erreur, bouton disabled |
| `Employees.test.jsx` | `pages/Employees.jsx` | Liste, recherche, filtre, checkboxes ADMIN/CONSULTANT, bulk actions |
| `EmployeeDetail.test.jsx` | `pages/EmployeeDetail.jsx` | Infos employé, onglets Dossier/Contrats, liste contrats, creation contrat, upload, suppression, navigation |
| `ContratDetail.test.jsx` | `pages/ContratDetail.jsx` | Rendu, fil d'ariane, documents du contrat, upload, suppression, permissions ADMIN/CONSULTANT |
| `EmployeeForm.test.jsx` | `pages/EmployeeForm.jsx` | Mode création/édition, pré-remplissage, référentiels, navigation, soumission |
| `Dashboard.test.jsx` | `pages/Dashboard.jsx` | Redirection CONSULTANT, 4 StatCards, complétude, activité, vide, erreur API |
| `Users.test.jsx` | `pages/Users.jsx` | Liste, création, validation, toggle actif, modal reset MDP |
| `AuditLogs.test.jsx` | `pages/AuditLogs.jsx` | Chargement logs, filtres, pagination, état vide |
| `Parametres.test.jsx` | `pages/Parametres.jsx` | 7 onglets, CRUD référentiels, modals ajout/édition, suppression |
| `Profil.test.jsx` | `pages/Profil.jsx` | Infos user, changement MDP, toggle password, messages succès/erreur |
| `Import.test.jsx` | `pages/Import.jsx` | Drag & drop, sélection CSV, import POST, erreurs, téléchargement template |

**Total : ~145 cas de test frontend**

---

### 5.3 Comment lancer les tests

#### Tests backend

```bash
# Depuis backend/ — pytest.ini est dans ce dossier
cd backend
python -m pip install pytest pytest-django

# Lancer tous les tests (109 cas)
python -m pytest tests/ -v

# Avec rapport de couverture
python -m pytest tests/ --cov=accounts --cov=employees --cov=audit --cov-report=term-missing

# Lancer un fichier spécifique
python -m pytest tests/test_accounts_views.py -v

# Lancer un test spécifique
python -m pytest tests/test_accounts_views.py::TestLoginView::test_login_success -v
```

> **Prérequis PostgreSQL** : l'utilisateur `somiz_user` doit avoir le droit `CREATEDB` :
> ```sql
> ALTER USER somiz_user CREATEDB;
> ```

#### Tests frontend

```bash
# Depuis frontend/
cd frontend

# Lancer tous les tests
npx react-scripts test --watchAll=false

# Lancer un fichier spécifique
npx react-scripts test --watchAll=false --testPathPattern="Login.test"

# Avec rapport de couverture
npx react-scripts test --watchAll=false --coverage
```

---

## 6. Flux de données

### Flux de connexion
```
1. Utilisateur saisit username/password dans Login.jsx
2. login() appelle POST /api/auth/login/
3. Backend vérifie :
   - Utilisateur existe ?
   - Compte verrouillé ? (brute-force)
   - Compte actif ?
   - Mot de passe correct ?
4. Si OK : génère access + refresh JWT, log LOGIN, retourne user
5. Frontend stocke les tokens (localStorage ou sessionStorage selon "remember me")
6. AuthContext.loginSuccess(user) met à jour l'état global
7. navigate("/employees")
```

### Flux de visualisation d'un document
```
1. Utilisateur clique sur un fichier dans EmployeeDetail.jsx
2. api.get("/files/{file_id}/view/", { responseType: "blob" })
3. Backend :
   - Vérifie l'authentification
   - Charge le fichier depuis media/
   - Ajoute les headers de sécurité (CSP, X-Frame-Options, etc.)
   - Retourne le fichier en streaming avec Content-Disposition: inline
   - Log ACTION=VIEW dans AuditLog
4. Frontend crée un URL blob : URL.createObjectURL(response.data)
5. SecureDocViewer affiche le fichier dans une iframe/react-pdf
6. À la destruction du composant : URL.revokeObjectURL() libère la mémoire
```

### Flux d'upload de document
```
1. Utilisateur sélectionne un ou plusieurs fichiers dans EmployeeDetail.jsx
2. Sélectionne le type de document dans le menu déroulant
3. api.post("/employees/{id}/documents/", FormData, multipart)
4. Backend (DocumentListUploadView) :
   - Vérifie les droits ADMIN
   - Valide chaque fichier : MIME réel (python-magic), taille max 20 Mo
   - Si le même type existe déjà : ancienne version → is_active=False, version++
   - Crée EmployeeDocument + N EmployeeDocumentFile
   - Log ACTION=UPLOAD dans AuditLog
5. Frontend : recharge l'employé, affiche message de succès
```

### Flux de déconnexion
```
1. Utilisateur clique sur Déconnexion dans la Navbar
2. logout() appelle POST /api/auth/logout/ avec le refresh token
3. Backend blackliste le refresh token (SimpleJWT), log LOGOUT
4. Frontend vide localStorage ET sessionStorage (access_token, refresh_token, user)
5. AuthContext.logoutSuccess() → authenticated=false, user=null
6. ProtectedRoute redirige automatiquement vers /login
```

---

## 7. Structure complète des fichiers

```
SOMIZ/
│
├── .gitignore                          ← Couvre backend + frontend
├── install.bat                         ← Installation Windows (double-clic)
├── install.sh                          ← Installation Linux/macOS
├── contenu.md                          ← CE FICHIER
├── requirements.md                     ← Dépendances pour le chef de département
│
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── pytest.ini                      ← Config pytest (lancé depuis backend/)
│   ├── .env                            ← Variables d'environnement (non versionné)
│   │
│   ├── config/
│   │   ├── settings.py                 ← Configuration complète Django
│   │   ├── urls.py                     ← Routing racine
│   │   ├── wsgi.py / asgi.py
│   │
│   ├── accounts/
│   │   ├── models.py                   ← User custom
│   │   ├── views.py                    ← Auth views (Login, Logout, Me, ChangePassword, AdminReset)
│   │   ├── permissions.py              ← IsAdmin, IsAdminOrConsultant
│   │   ├── urls.py                     ← /api/auth/
│   │   ├── admin_views.py              ← CRUD users
│   │   ├── admin_urls.py               ← /api/admin-users/
│   │   └── migrations/
│   │
│   ├── employees/
│   │   ├── models.py                   ← Employee, Document, Fichier, Référentiels
│   │   ├── serializers.py              ← DRF serializers avec validation MIME
│   │   ├── views.py                    ← CRUD + upload + visualisation + search + bulk
│   │   ├── referentiel_views.py        ← CRUD référentiels
│   │   ├── import_views.py             ← Import CSV
│   │   ├── urls.py                     ← /api/employees/ + /api/files/
│   │   ├── referentiel_urls.py         ← /api/ref/
│   │   └── migrations/
│   │
│   ├── audit/
│   │   ├── models.py                   ← AuditLog (append-only)
│   │   ├── views.py                    ← AuditLogListView, AdminStatsView
│   │   ├── middleware.py               ← Capture des requêtes
│   │   ├── urls.py                     ← /api/reporting/
│   │   └── migrations/
│   │
│   ├── media/                          ← Fichiers uploadés (non versionné)
│   │   └── employees/{uuid}/{type_code}/{uuid}.ext
│   │
│   ├── logs/                           ← Logs rotatifs (non versionné)
│   │   └── somiz.log
│   │
│   └── tests/                          ← ~141 tests pytest
│       ├── __init__.py
│       ├── conftest.py
│       ├── test_accounts_models.py
│       ├── test_accounts_views.py
│       ├── test_employees_models.py
│       ├── test_employees_views.py
│       ├── test_contrat_views.py
│       ├── test_audit_models.py
│       └── test_permissions.py
│
└── frontend/
    ├── package.json
    ├── public/
    │   ├── index.html
    │   └── pdf.worker.min.js           ← Worker PDF.js (react-pdf)
    │
    └── src/
        ├── App.js                      ← Routes React
        ├── context/
        │   └── AuthContext.js
        ├── services/
        │   ├── api.js
        │   └── auth.js
        ├── components/
        │   ├── Navbar.jsx
        │   ├── ProtectedRoute.jsx
        │   └── SecureDocViewer.jsx
        ├── pages/
        │   ├── Login.jsx
        │   ├── Employees.jsx
        │   ├── EmployeeDetail.jsx
        │   ├── EmployeeForm.jsx
        │   ├── ContratDetail.jsx
        │   ├── Dashboard.jsx
        │   ├── Users.jsx
        │   ├── AuditLogs.jsx
        │   ├── Parametres.jsx
        │   ├── Import.jsx
        │   └── Profil.jsx
        ├── styles/
        │   └── theme.js
        └── __tests__/                  ← Tests React (Jest + RTL)
            ├── setupTests.js
            ├── jest.config.js
            ├── api.test.js
            ├── auth.test.js
            ├── AuthContext.test.jsx
            ├── ProtectedRoute.test.jsx
            ├── Login.test.jsx
            ├── Employees.test.jsx
            ├── EmployeeDetail.test.jsx
            ├── ContratDetail.test.jsx
            ├── EmployeeForm.test.jsx
            ├── Dashboard.test.jsx
            ├── Users.test.jsx
            ├── AuditLogs.test.jsx
            ├── Parametres.test.jsx
            ├── Profil.test.jsx
            └── Import.test.jsx
```

---

## 8. Dépendances techniques

### Backend (`requirements.txt`)
| Package | Version | Rôle |
|---|---|---|
| Django | 4.2.13 | Framework web Python |
| djangorestframework | 3.15.1 | API REST |
| djangorestframework-simplejwt | 5.3.1 | Authentification JWT |
| django-cors-headers | 4.3.1 | CORS pour React |
| psycopg2-binary | 2.9.9 | Driver PostgreSQL |
| Pillow | 10.3.0 | Traitement d'images |
| python-magic | 0.4.27 | Validation MIME réelle |
| redis | 5.0.4 | Cache (optionnel) |
| django-redis | 5.4.0 | Backend cache Redis |
| python-decouple | 3.8 | Gestion variables d'environnement (.env) |
| gunicorn | 22.0.0 | Serveur WSGI production |

### Frontend (`package.json`)
| Package | Version | Rôle |
|---|---|---|
| react | ^19.2.6 | Framework UI |
| react-dom | ^19.2.6 | Rendu DOM |
| react-router-dom | ^7.15.1 | Routing |
| axios | ^1.16.1 | Client HTTP |
| react-pdf | ^9.2.1 | Visionneuse PDF |
| @testing-library/react | ^16.3.2 | Tests composants React |
| @testing-library/jest-dom | ^6.9.1 | Matchers Jest pour le DOM |
| @testing-library/user-event | ^13.5.0 | Simulation interactions utilisateur |
| react-scripts | 5.0.1 | Outils de build (CRA) |

---

## 9. Ce qui doit être contenu dans le projet

### Fonctionnalités obligatoires (déjà présentes)

#### Gestion des utilisateurs
- [x] Connexion sécurisée avec JWT
- [x] Deux rôles : ADMIN et CONSULTANT
- [x] Protection anti-brute-force (5 tentatives → 30 min de verrouillage)
- [x] Changement de mot de passe (par soi-même + par un ADMIN)
- [x] Désactivation de comptes
- [x] Création de comptes (ADMIN uniquement)

#### Gestion des employés
- [x] Création, modification, archivage d'employés
- [x] Suppression définitive (ADMIN)
- [x] Recherche et filtrage (par nom, prénom, matricule, statut)
- [x] Tri des colonnes (ascendant/descendant)
- [x] Pagination (25 par page)
- [x] Actions en masse (archiver / supprimer jusqu'à 500 employés)
- [x] Taux de complétude du dossier calculé automatiquement
- [x] Détection des documents manquants (types obligatoires)

#### Gestion des contrats
- [x] Modèle `Contrat` : N° contrat unique, lié à un employé, type, dates, statut
- [x] 1 matricule → N contrats
- [x] Chaque contrat a son propre dossier de documents (indépendant du dossier général)
- [x] Versioning des documents scoped par contrat
- [x] Chemin de stockage dédié : `employees/{id}/contrats/{numero}/{type}/`
- [x] API complète : CRUD contrats + upload/suppression de documents par contrat
- [x] Onglet "Contrats" dans la fiche employé avec formulaire de création inline
- [x] Page `ContratDetail` avec viewer de documents identique au dossier général

#### Gestion des documents
- [x] Upload de un ou plusieurs fichiers par type de document
- [x] Versioning automatique (ancienne version désactivée, nouvelle créée)
- [x] Visualisation sécurisée inline (pas de téléchargement direct)
- [x] Suppression douce des fichiers (soft-delete)
- [x] Validation MIME réelle (python-magic)
- [x] Limitation de taille (20 Mo par fichier)
- [x] Types acceptés : PDF, JPEG, PNG, TIFF
- [x] Chemin de stockage sécurisé avec UUID

#### Référentiels organisationnels
- [x] CRUD complet pour : Directions, Départements, Services, Postes, Types de contrat, Catégories, Types de documents
- [x] Import CSV en masse par référentiel
- [x] Cascade Direction → Département → Service

#### Conformité et audit
- [x] Journal d'audit complet (11 types d'actions)
- [x] Snapshot du username (permanent, même si le compte est supprimé)
- [x] Capture de l'IP réelle (X-Forwarded-For pour Nginx)
- [x] Données conservées sans modification (table append-only)
- [x] Statistiques et tableau de bord ADMIN

#### Import CSV
- [x] Import d'employés en masse via CSV
- [x] Template CSV téléchargeable
- [x] Zone drag & drop dans l'interface
- [x] Rapport d'import (succès / erreurs par ligne)

### Ce qui pourrait être ajouté (évolutions futures)

#### Fonctionnalités métier
- [ ] Export PDF du dossier complet d'un employé
- [ ] Notifications par email lors d'une échéance de document
- [ ] Gestion des dates d'expiration de documents
- [ ] Historique des versions d'un document (affichage des anciennes versions)
- [ ] Signature électronique des documents
- [ ] Workflow de validation de documents (en attente → validé → rejeté)

#### Technique
- [ ] Redis en production pour le cache et les sessions
- [ ] Déploiement Docker / docker-compose
- [ ] CI/CD (GitHub Actions ou GitLab CI)
- [ ] Rapport de couverture de code automatique
- [ ] Tests d'intégration end-to-end (Playwright ou Cypress)
- [ ] Mode sombre dans l'interface
- [ ] Internationalisation (i18n) arabe
- [ ] PWA (Progressive Web App) pour usage mobile intranet

#### Sécurité renforcée
- [ ] Authentification à deux facteurs (2FA / TOTP)
- [ ] Connexion LDAP / Active Directory
- [ ] Chiffrement des fichiers au repos
- [ ] Rapport RGPD / demande d'accès automatisé

---

*Document mis à jour le 10/06/2026 — SOMIZ v1.1 — feature/us2 : gestion des contrats par N° contrat*
