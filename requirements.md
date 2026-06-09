# SOMIZ — Dépendances techniques complètes
## Document à remettre au chef de département

---

## Environnement d'exécution requis

| Composant | Version minimale | Version utilisée | Remarque |
|---|---|---|---|
| **Python** | 3.10 | 3.10.4 | Obligatoire pour le backend |
| **Node.js** | 18.x | 24.11.1 | Obligatoire pour le frontend |
| **npm** | 9.x | 10.8.3 | Gestionnaire de paquets JS |
| **PostgreSQL** | 14 | 14+ | Base de données principale |
| **Redis** | 6.x | 6+ | Cache (optionnel en dev, obligatoire en prod) |

---

## 1. Dépendances Backend (Python / Django)

### Installation
```bash
cd backend
pip install -r requirements.txt
```

### Fichier `backend/requirements.txt`

| Package | Version | Licence | Description |
|---|---|---|---|
| **Django** | 4.2.13 | BSD-3 | Framework web Python principal |
| **djangorestframework** | 3.15.1 | BSD-2 | Toolkit pour construire les API REST |
| **djangorestframework-simplejwt** | 5.3.1 | MIT | Authentification JWT (access + refresh tokens) |
| **django-cors-headers** | 4.3.1 | MIT | Gestion des en-têtes CORS (React ↔ Django) |
| **psycopg2-binary** | 2.9.9 | LGPL-3 | Driver PostgreSQL pour Python |
| **Pillow** | 10.3.0 | HPND | Traitement et validation des images uploadées |
| **python-magic** | 0.4.27 | MIT | Validation MIME réelle des fichiers (via libmagic) |
| **redis** | 5.0.4 | MIT | Client Python pour Redis (cache) |
| **django-redis** | 5.4.0 | BSD-3 | Backend de cache Redis pour Django |
| **python-decouple** | 3.8 | MIT | Gestion des variables d'environnement (.env) |
| **gunicorn** | 22.0.0 | MIT | Serveur WSGI pour la production |

### Dépendances de test backend (optionnel, pour les développeurs)

| Package | Version | Description |
|---|---|---|
| **pytest** | 8.x | Framework de tests Python |
| **pytest-django** | 4.8.x | Plugin pytest pour Django |
| **pytest-cov** | 5.x | Rapport de couverture de code |

---

## 2. Dépendances Frontend (JavaScript / React)

### Installation
```bash
cd frontend
npm install
```

### Dépendances de production (`dependencies`)

| Package | Version | Licence | Description |
|---|---|---|---|
| **react** | ^19.2.6 | MIT | Framework UI principal |
| **react-dom** | ^19.2.6 | MIT | Rendu React dans le DOM |
| **react-router-dom** | ^7.15.1 | MIT | Routage côté client (SPA) |
| **axios** | ^1.16.1 | MIT | Client HTTP pour appeler l'API Django |
| **react-pdf** | ^9.2.1 | MIT | Visionneuse PDF intégrée (PDF.js) |
| **web-vitals** | ^2.1.4 | Apache-2.0 | Métriques de performance web |

### Dépendances de développement / test (`devDependencies`)

| Package | Version | Licence | Description |
|---|---|---|---|
| **react-scripts** | 5.0.1 | MIT | Outils de build CRA (webpack, babel, eslint) |
| **@testing-library/react** | ^16.3.2 | MIT | Tests de composants React |
| **@testing-library/jest-dom** | ^6.9.1 | MIT | Matchers Jest pour assertions DOM |
| **@testing-library/user-event** | ^13.5.0 | MIT | Simulation d'interactions utilisateur |
| **@testing-library/dom** | ^10.4.1 | MIT | Utilitaires DOM pour les tests |

---

## 3. Dépendances système (à installer sur le serveur)

Ces dépendances doivent être installées au niveau du système d'exploitation, **avant** l'installation des paquets Python.

### Linux (Ubuntu / Debian)
```bash
# Python et pip
sudo apt install python3.10 python3.10-venv python3-pip

# Bibliothèque libmagic (requis par python-magic)
sudo apt install libmagic1

# PostgreSQL
sudo apt install postgresql postgresql-contrib

# Redis (optionnel en développement)
sudo apt install redis-server

# Node.js (via nvm ou apt)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs
```

### Windows (développement local)
```
- Python 3.10+ : https://www.python.org/downloads/
- Node.js 20+ : https://nodejs.org/
- PostgreSQL 14+ : https://www.postgresql.org/download/windows/
- Redis (optionnel) : https://github.com/microsoftarchive/redis/releases
- libmagic pour python-magic : inclus dans python-magic-bin sur Windows
  → remplacer python-magic==0.4.27 par python-magic-bin==0.4.14
```

---

## 4. Variables d'environnement requises

Le fichier `backend/.env` doit contenir les variables suivantes avant de démarrer l'application :

```env
# Django
SECRET_KEY=votre_cle_secrete_longue_et_aleatoire
DEBUG=False

# Base de données PostgreSQL
DB_NAME=somiz_db
DB_USER=somiz_user
DB_PASSWORD=mot_de_passe_bdd
DB_HOST=localhost
DB_PORT=5432

# Redis (optionnel)
REDIS_URL=redis://localhost:6379/0

# Sécurité
ALLOWED_HOSTS=localhost,127.0.0.1,votre-domaine.intranet
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://votre-domaine.intranet
```

---

## 5. Résumé des commandes d'installation complète

```bash
# ── 1. Cloner / déposer le projet ──────────────────────────────────────
# (copier le dossier SOMIZ/ sur le serveur)

# ── 2. Backend ─────────────────────────────────────────────────────────
cd SOMIZ/backend

# Créer l'environnement virtuel Python
python3 -m venv venv
source venv/bin/activate          # Linux/macOS
# ou : venv\Scripts\activate      # Windows

# Installer les dépendances Python
pip install -r requirements.txt

# Configurer les variables d'environnement
cp .env.example .env              # puis éditer .env avec vos valeurs

# Créer la base de données
python manage.py migrate

# Créer un premier compte ADMIN
python manage.py createsuperuser

# Collecter les fichiers statiques
python manage.py collectstatic --noinput

# ── 3. Frontend ─────────────────────────────────────────────────────────
cd ../frontend

# Installer les dépendances JavaScript
npm install

# Build de production
npm run build

# ── 4. Lancer l'application (développement) ─────────────────────────────
# Terminal 1 — Backend
cd backend && python manage.py runserver

# Terminal 2 — Frontend
cd frontend && npm start
```

---

## 6. Ports utilisés

| Service | Port par défaut | Configurable |
|---|---|---|
| Backend Django (dev) | 8000 | Oui |
| Frontend React (dev) | 3000 | Oui |
| PostgreSQL | 5432 | Oui |
| Redis | 6379 | Oui |

---

*Document préparé le 09/06/2026 — Projet SOMIZ v1.0*
