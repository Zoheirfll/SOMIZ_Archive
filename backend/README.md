# SOMIZ — Système d'Archivage des Dossiers Employés
## Backend Django REST API

### Prérequis
- Python 3.10+
- PostgreSQL 18
- Redis 6+ (optionnel en développement)

---

### Installation

**Option rapide (Windows) — double-cliquer sur `install.bat` à la racine du projet.**

Ou manuellement :

```bash
# 1. Créer l'environnement virtuel
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# 2. Installer les dépendances
python -m pip install -r requirements.txt

# 3. Configurer l'environnement
# Créer backend/.env avec les variables (voir section Configuration ci-dessous)

# 4. Créer la base de données PostgreSQL
psql -U postgres
CREATE DATABASE somiz_archivage;
CREATE USER somiz_user WITH PASSWORD 'votre_mot_de_passe';
GRANT ALL PRIVILEGES ON DATABASE somiz_archivage TO somiz_user;
ALTER USER somiz_user CREATEDB;  -- requis pour les tests
\q

# 5. Appliquer les migrations
python manage.py migrate

# 6. Créer le premier compte ADMIN
python manage.py createsuperuser

# 7. Lancer le serveur de développement
python manage.py runserver
```

### Lancer les tests

```bash
# Depuis backend/
python -m pip install pytest pytest-django
python -m pytest tests/ -v
```

---

### Structure du projet

```
SOMIZ/
├── install.bat / install.sh     ← Scripts d'installation automatique
├── contenu.md                   ← Documentation complète du projet
├── requirements.md              ← Dépendances pour le chef de département
│
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── pytest.ini               ← Config tests (lancés depuis backend/)
│   ├── .env                     ← Variables d'environnement (non versionné)
│   ├── config/
│   │   ├── settings.py          ← Configuration Django complète
│   │   └── urls.py              ← Routing principal
│   ├── accounts/                ← Utilisateurs + Auth JWT
│   ├── employees/               ← Employés + Documents + Référentiels
│   ├── audit/                   ← Journal de traçabilité
│   ├── media/                   ← Fichiers uploadés (non versionné)
│   ├── logs/                    ← Logs applicatifs (non versionné)
│   └── tests/                   ← 109 tests pytest
│
└── frontend/
    ├── package.json
    ├── src/
    │   ├── pages/               ← 10 pages React
    │   ├── components/          ← Navbar, ProtectedRoute, SecureDocViewer
    │   ├── services/            ← api.js, auth.js
    │   ├── context/             ← AuthContext.js
    │   └── __tests__/          ← Tests React (Jest + RTL)
    └── public/
```

---

### Endpoints principaux

| Méthode | URL | Rôle |
|---------|-----|------|
| POST | /api/auth/login/ | PUBLIC |
| GET | /api/employees/ | AUTH |
| POST | /api/employees/ | ADMIN |
| GET | /api/employees/{id}/ | AUTH |
| POST | /api/employees/{id}/documents/ | ADMIN |
| GET | /api/documents/{id}/view/ | AUTH (inline uniquement) |
| GET | /api/admin/stats/ | ADMIN |
| GET | /api/admin/audit-logs/ | ADMIN |

---

### Sécurité — points critiques

- **Zéro téléchargement** : `Content-Disposition: inline` systématique
- **Fichiers inaccessibles** : `/media/` n'est pas servi par Nginx directement
- **JWT court** : 2h access / 24h refresh avec blacklist au logout
- **Audit complet** : chaque consultation est tracée (qui, quoi, quand, IP)
- **Blocage brute-force** : 5 tentatives max puis 30 min de blocage
