# SOMIZ — Système d'Archivage des Dossiers Employés
## Backend Django REST API

### Prérequis
- Python 3.11+
- PostgreSQL 15
- Redis 7

---

### Installation

```bash
# 1. Créer l'environnement virtuel
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# 2. Installer les dépendances
pip install -r requirements.txt

# 3. Configurer l'environnement
cp .env.example .env
# → Éditer .env avec vos valeurs

# 4. Créer la base de données PostgreSQL
psql -U postgres
CREATE DATABASE somiz_archivage;
CREATE USER somiz_user WITH PASSWORD 'votre_mot_de_passe';
GRANT ALL PRIVILEGES ON DATABASE somiz_archivage TO somiz_user;
\q

# 5. Appliquer les migrations
python manage.py makemigrations accounts employees audit
python manage.py migrate

# 6. Créer le premier compte ADMIN
python manage.py createsuperuser

# 7. Créer le dossier logs
mkdir logs

# 8. Lancer le serveur de développement
python manage.py runserver
```

---

### Structure du projet

```
somiz_archivage/
├── config/
│   ├── settings.py      ← Configuration principale
│   └── urls.py          ← Routage
├── apps/
│   ├── accounts/        ← Utilisateurs + Auth JWT
│   │   ├── models.py    ← User custom (ADMIN / CONSULTANT)
│   │   ├── views.py     ← Login / Logout / Me
│   │   ├── permissions.py
│   │   └── urls.py
│   ├── employees/       ← Employés + Documents
│   │   ├── models.py    ← Employee + EmployeeDocument
│   │   ├── serializers.py
│   │   ├── views.py     ← CRUD + Viewer inline
│   │   └── urls.py
│   └── audit/           ← Traçabilité RGPD/ANPDP
│       ├── models.py    ← AuditLog
│       ├── middleware.py
│       ├── views.py
│       └── urls.py
├── media/               ← Fichiers scannés (hors accès public)
├── logs/                ← Logs applicatifs
├── requirements.txt
└── .env.example
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
