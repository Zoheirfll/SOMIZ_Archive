"""
SOMIZ — Système d'Archivage des Dossiers Employés
Settings de production / intranet
"""

from pathlib import Path
from decouple import config
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

# ─── SÉCURITÉ ────────────────────────────────────────────────────────────────
SECRET_KEY = config('SECRET_KEY')
DEBUG = config('DEBUG', default=False, cast=bool)

# Secret partagé avec le GRH pour vérifier la signature HMAC des webhooks
# de synchronisation employé (voir employees/grh_integration.py). Pas de
# valeur par défaut en dehors des tests — doit être défini explicitement
# dans .env avant d'activer l'intégration en prod.
GRH_WEBHOOK_SECRET = config('GRH_WEBHOOK_SECRET', default='dev-only-change-me')

# Intranet uniquement — adapter selon l'IP/le nom d'hôte du serveur SOMIZ.
# ALLOWED_HOSTS ne supporte PAS la notation CIDR (ex: 192.168.1.0/24) : Django
# ne fait que des correspondances exactes ou par sous-domaine (préfixe ".").
# Lister l'IP ou le hostname réel du serveur via la variable d'env ALLOWED_HOSTS.
ALLOWED_HOSTS = config(
    'ALLOWED_HOSTS',
    default='localhost,127.0.0.1',
    cast=lambda v: [s.strip() for s in v.split(',')]
)

# ─── APPLICATIONS ─────────────────────────────────────────────────────────────
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
]

LOCAL_APPS = [
    'accounts',
    'employees',
    'documents',
    'audit',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'config.middleware.PermissionsPolicyMiddleware',
    # Middleware custom : log chaque requête authentifiée
    'audit.middleware.AuditMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

# ─── BASE DE DONNÉES ──────────────────────────────────────────────────────────
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='somiz_archivage'),
        'USER': config('DB_USER', default='somiz_user'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
        'OPTIONS': {
            'connect_timeout': 10,
        },
        'CONN_MAX_AGE': 60,  # Connection pooling
    }
}

# ─── CACHE REDIS ──────────────────────────────────────────────────────────────
# Requis en prod (multi-worker) : LocMemCache est par-processus, donc le
# rate-limiting DRF et l'alerte de consultation en masse (audit.middleware)
# seraient comptés indépendamment par worker et perdraient toute efficacité.
REDIS_URL = config('REDIS_URL', default=None)
if REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django_redis.cache.RedisCache',
            'LOCATION': REDIS_URL,
            'OPTIONS': {
                'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            },
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    }

# ─── AUTHENTIFICATION ─────────────────────────────────────────────────────────
AUTH_USER_MODEL = 'accounts.User'

# Réutilise le verrouillage anti-brute-force (accounts.models.User) pour tout
# login passant par django.contrib.auth.authenticate() — /django-admin/ inclus.
AUTHENTICATION_BACKENDS = ['accounts.backends.LockoutModelBackend']

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 10}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ─── JWT CONFIGURATION ────────────────────────────────────────────────────────
# Note : CookieTokenRefreshView (accounts/views.py) ne fait PAS de rotation —
# elle réutilise le même refresh token (exp figé à la création) pour émettre
# de nouveaux access tokens. REFRESH_TOKEN_LIFETIME est donc déjà un plafond
# de session ABSOLU (pas glissant) : 10h couvre une journée de travail avec
# marge, sans laisser une session active indéfiniment sur un poste oublié.
# ROTATE_REFRESH_TOKENS/BLACKLIST_AFTER_ROTATION ne sont pas utilisés par ce
# flux custom (settings conservés pour un usage futur de TokenRefreshView).
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=2),
    'REFRESH_TOKEN_LIFETIME': timedelta(hours=10),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
}

# Cookies JWT httpOnly — SameSite=Lax compatible HTTP (intranet)
JWT_COOKIE_SECURE = config('JWT_COOKIE_SECURE', default=False, cast=bool)  # True en HTTPS
JWT_COOKIE_SAMESITE = 'Lax'

# ─── DJANGO REST FRAMEWORK ────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'accounts.cookie_auth.JWTCookieAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
        'accounts.permissions.HasConsented',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '10/min',        # Login attempts limités
        'user': '200/min',       # Usage normal
        'consultation': '30/min', # Vues de documents — ralentit l'exfiltration en masse
    },
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    )
}

# ─── CORS — Intranet uniquement ───────────────────────────────────────────────
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',
    config('INTRANET_URL', default='http://192.168.1.100'),
]
# Django exige que l'origine du front soit explicitement de confiance pour
# accepter les requêtes POST/PATCH/DELETE cross-origin protégées par CSRF.
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_HTTPONLY = False  # doit être lisible en JS pour le double-submit
# ─── FICHIERS MEDIA (Documents scannés) ──────────────────────────────────────
MEDIA_ROOT = BASE_DIR / 'media'
MEDIA_URL = '/media-internal/'  # Pas accessible directement — via API uniquement

# Stockage organisé par employé
# Structure : media/employees/{uuid_employe}/{type_document}/{fichier}
DOCUMENT_UPLOAD_PATH = 'employees/{employee_id}/{doc_type}/'
MAX_UPLOAD_SIZE_MB = 20  # 20 Mo max par fichier
ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff',   # Courant pour les scanners
]

# Photo de profil employé — plus restrictif qu'un document (pas de PDF/TIFF)
MAX_PHOTO_SIZE_MB = 5
ALLOWED_PHOTO_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
]

# ─── FICHIERS STATIQUES ───────────────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# ─── SÉCURITÉ HEADERS ─────────────────────────────────────────────────────────
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'SAMEORIGIN'  # Autorise iframe sur même domaine pour viewer
SECURE_REFERRER_POLICY = 'same-origin'

# En production HTTPS intranet :
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=False, cast=bool)
SESSION_COOKIE_SECURE = config('SESSION_COOKIE_SECURE', default=False, cast=bool)
CSRF_COOKIE_SECURE = config('CSRF_COOKIE_SECURE', default=False, cast=bool)
# Mettre à 31536000 (1 an) en production HTTPS ; 0 = désactivé en HTTP intranet
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=0, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = config('SECURE_HSTS_INCLUDE_SUBDOMAINS', default=False, cast=bool)

# Garde-fou : en dehors de DEBUG (donc "prod"), les cookies JWT/session/CSRF ne
# doivent circuler en clair (non-Secure) que sur un intranet HTTP délibéré —
# jamais par oubli. Si ces flags sont à False sans confirmation explicite,
# on refuse de démarrer plutôt que de laisser une session voler en clair sur
# un réseau qu'on croyait fermé.
if not DEBUG and not (JWT_COOKIE_SECURE and SESSION_COOKIE_SECURE and CSRF_COOKIE_SECURE):
    if not config('INTRANET_HTTP_CONFIRMED', default=False, cast=bool):
        from django.core.exceptions import ImproperlyConfigured
        raise ImproperlyConfigured(
            "Cookies non-Secure (JWT_COOKIE_SECURE/SESSION_COOKIE_SECURE/"
            "CSRF_COOKIE_SECURE) avec DEBUG=False. Si c'est un intranet HTTP "
            "voulu, positionner INTRANET_HTTP_CONFIRMED=True dans .env. "
            "Sinon, activer HTTPS et mettre ces 3 flags à True."
        )

# ─── EMAIL (alertes admin) ────────────────────────────────────────────────────
EMAIL_BACKEND = config(
    'EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend'
)
EMAIL_HOST = config('EMAIL_HOST', default='localhost')
EMAIL_PORT = config('EMAIL_PORT', default=25, cast=int)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=False, cast=bool)
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='somiz@localhost')
ADMINS = [
    tuple(pair.split(':', 1))
    for pair in config('ADMINS', default='').split(',')
    if ':' in pair
]

# ─── AUDIT / LOGGING ─────────────────────────────────────────────────────────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'somiz.log',
            'maxBytes': 10 * 1024 * 1024,  # 10 Mo
            'backupCount': 10,
            'formatter': 'verbose',
        },
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['file', 'console'],
        'level': 'INFO',
    },
    'loggers': {
        'audit': {
            'handlers': ['file'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# ─── INTERNATIONALISATION ─────────────────────────────────────────────────────
LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Africa/Algiers'
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates', BASE_DIR / 'frontend_build'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# ─── LIMITES SÉCURITÉ ─────────────────────────────────────────────────────────
# Blocage compte après N tentatives échouées (géré dans accounts/views.py)
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_DURATION = timedelta(minutes=30)

# Alerte audit si trop de consultations
AUDIT_ALERT_THRESHOLD = 20  # consultations par heure avant alerte

STATICFILES_DIRS = [BASE_DIR / 'frontend_build' / 'static']