# SOMIZ — Journal de vérification sécurité

Suivi des points de sécurité vérifiés à la demande, un par un.
Dernière mise à jour : 2026-08-28.

---

## 1. XSS (Cross-Site Scripting) — ✅ Vérifié, sain

**Périmètre vérifié** : `frontend/src/**`, rendu des données serveur (audit logs, employés, documents), viewer de documents.

**Constats :**

- Aucun `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, ni `new Function` dans tout `frontend/src` (recherche exhaustive).
- Tout le rendu de données passe par des expressions JSX (`{...}`), auto-échappées par React. Vérifié en particulier sur [`AuditLogs.jsx`](frontend/src/pages/AuditLogs.jsx) — `username_snapshot` (contrôlable par un attaquant via le champ "utilisateur" à la connexion, y compris pour un login qui échoue), `target_label`, `ip_address`, `user_agent` sont tous rendus en tant que texte JSX, jamais injectés en HTML brut.
- Les seules affectations de `.href`/`window.location.href` trouvées portent sur des `blob:` URLs générées côté client (téléchargement CSV) ou une redirection statique vers `/login` — aucune ne reflète une donnée utilisateur ou serveur.
- [`SecureDocViewer.jsx`](frontend/src/components/SecureDocViewer.jsx) : `renderTextLayer={false}` et `renderAnnotationLayer={false}` sur `react-pdf` — désactive les vecteurs XSS connus de PDF.js via actions URI dans les annotations d'un PDF malveillant.
- Header `X-Content-Type-Options: nosniff` actif globalement (`SECURE_CONTENT_TYPE_NOSNIFF = True` côté Django `SecurityMiddleware`), empêchant le navigateur de réinterpréter un fichier uploadé comme HTML/JS exécutable.
- CSP `default-src 'self'` posée spécifiquement sur les réponses de visualisation de documents ([`employees/views.py:323,410`](backend/employees/views.py)).

**Point mineur (Info, non bloquant) :** aucune CSP n'est posée sur le shell SPA lui-même (`index.html`/build React) — actuellement sans impact puisqu'aucun sink d'injection n'a été trouvé, mais ajouter un header CSP côté reverse-proxy/nginx en prod serait une défense en profondeur supplémentaire.

**Verdict : pas de vulnérabilité XSS identifiée dans le code actuel.**

---

## 2. Rate limiting — ⚠️ Faille trouvée et corrigée

**Périmètre vérifié** : `backend/config/settings.py` (DRF throttling), `accounts/views.py` (login), `accounts/models.py` (lockout), `audit/middleware.py` (alerte volume).

**Constats :**

- Le rate-limiting DRF est bien configuré (`AnonRateThrottle` 10/min, `UserRateThrottle` 200/min) et `LoginView` déclare `throttle_scope = 'anon'`.
- **Faille** : `CACHES` dans `settings.py` était codé en dur sur `django.core.cache.backends.locmem.LocMemCache` — un cache **en mémoire locale, par processus** — alors que `requirements.txt` contient `redis`/`django-redis` et que `.env` définit `REDIS_URL`, jamais branché. En production avec plusieurs workers Gunicorn (config standard Django), chaque worker tient son propre compteur : la limite réelle devient `10 req/min × nb_workers` au lieu de `10 req/min` global, et l'alerte de consultation en masse (`audit/middleware.py`, seuil 20 documents/heure) est diluée de la même façon.
- **Vérifié sain** : le verrouillage anti-brute-force (5 tentatives → 30 min) est stocké en base de données (`failed_login_attempts`, `locked_until` sur le modèle `User`), donc non affecté par ce bug — il fonctionne correctement même multi-workers.
- Pas de flux d'auto-reset de mot de passe par email (seul un reset par ADMIN existe) — pas de vecteur d'énumération de comptes à ce niveau.

**Correctif appliqué** (avec accord préalable) : `settings.py` bascule sur `django_redis.cache.RedisCache` si `REDIS_URL` est défini, avec repli sur `LocMemCache` sinon (dev/CI sans serveur Redis). Redis vérifié fonctionnel en local.

**Verdict : faille réelle en environnement multi-worker, corrigée.**

---

## 3. Secrets en dur (hardcoded API keys) — ✅ Vérifié, sain

**Périmètre vérifié** : code source suivi par git (`git grep`), historique git complet (`git log --all`), `backend/config/settings.py`, `frontend/src/**`.

**Constats :**

- `backend/.env` n'est **jamais** tracké par git — absent de tout l'historique (`git log --all --diff-filter=A`), pas seulement du commit courant. `.gitignore` le couvre explicitement (`backend/.env`, `frontend/.env*`).
- Recherche de motifs `SECRET_KEY=`, `API_KEY=`, `PASSWORD=`, `token=` suivis d'une valeur en dur dans tout le code Python/JS suivi : aucune correspondance réelle (seuls des messages d'aide génériques dans des scripts d'outils tiers, ex. `export GEMINI_API_KEY='your-key'`, qui sont des exemples de commande, pas des clés).
- `SECRET_KEY` et `DB_PASSWORD` dans `settings.py` n'ont **aucune valeur par défaut** (`config('SECRET_KEY')` sans `default=`) — l'app refuse de démarrer si la variable d'environnement manque, au lieu de retomber silencieusement sur une clé faible.
- Aucune clé API (Google, AWS, Stripe, etc.) codée en dur trouvée dans `frontend/src`.

**Rappel (déjà noté au point Info du review initial)** : `backend/.env` local contient un `SECRET_KEY` et un mot de passe Postgres en clair — normal pour un fichier `.env`, mais à faire tourner avant tout partage/déploiement réel.

**Verdict : pas de secret en dur dans le code. Rien à corriger.**

---

## 4. Authentification manquante (missing authentication) — ⚠️ Faille trouvée et corrigée

**Périmètre vérifié** : toutes les vues DRF (`employees/views.py`, `employees/import_views.py`, `employees/referentiel_views.py`, `accounts/views.py`, `accounts/admin_views.py`, `audit/views.py`), `config/urls.py`, service des fichiers média, `django-admin`.

**Constats :**

- Toutes les vues API sont correctement protégées. Certaines (`EmployeeListCreateView`, `EmployeeDetailView`, `ContratListCreateView`, `ContratDetailView`, `ContratDocumentListUploadView`) n'ont pas d'attribut statique `permission_classes` mais utilisent `get_permissions()` (contrôle dynamique par méthode HTTP : `IsAdmin` pour POST/PATCH/DELETE, `IsAdminOrConsultant` pour GET) — ce qui les avait fait échapper à un premier grep littéral, mais elles sont bien gated après lecture du code.
- `MEDIA_URL` n'est jamais servi directement via `urls.py` (pas de `static()`/`serve()`) — confirme qu'il n'y a aucun accès fichier hors des vues authentifiées `FileViewerView`/`DocumentViewerView`.
- **Faille** : `/django-admin/` (interface admin Django native) est exposée dans `config/urls.py` et son usage (`createsuperuser`) est documenté dans `backend/README.md` — donc au moins un compte `is_staff=True` existera dans tout déploiement réel. Son formulaire de login est entièrement séparé du système d'auth de l'app :
  - Aucun verrouillage anti-brute-force (le mécanisme "5 tentatives → 30 min" n'existait que dans `LoginView`) — tentatives de mot de passe illimitées contre un compte superuser.
  - Aucun throttling DRF (ce n'est pas une vue DRF).
  - Les modifications faites via les `ModelAdmin` de `User`, `Employee`, `EmployeeDocument`, `EmployeeDocumentFile` n'étaient **pas** tracées dans `AuditLog` (seul `AuditLogAdmin` était déjà correctement verrouillé en lecture seule/append-only) — un superuser compromis pouvait changer un rôle, réinitialiser un mot de passe ou supprimer un dossier employé sans laisser aucune trace dans `/audit`, sapant la traçabilité RGPD/loi 18-07.

**Correctifs appliqués (avec accord préalable) :**
- [`accounts/backends.py`](backend/accounts/backends.py) : nouveau backend `LockoutModelBackend` qui réutilise `User.is_locked()`/`register_failed_login()`/`reset_login_attempts()` pour **tout** login passant par `django.contrib.auth.authenticate()`, y compris `/django-admin/login/`. Câblé via `AUTHENTICATION_BACKENDS` dans `settings.py`.
- [`accounts/admin.py`](backend/accounts/admin.py) : `UserAdmin.save_model`/`delete_model`/`delete_queryset` écrivent maintenant dans `AuditLog` (`CREATE_USER`/`MODIFY_USER`/nouveau `DELETE_USER`, avec `details={'via': 'django-admin'}`).
- [`employees/admin.py`](backend/employees/admin.py) : mixin `AuditedModelAdminMixin` appliqué à `EmployeeAdmin`, `EmployeeDocumentAdmin`, `EmployeeDocumentFileAdmin` — même principe, avec les actions `CREATE_EMP`/`MODIFY_EMP`/`DELETE_EMP`/`UPLOAD`/`MODIFY_DOC`/`DELETE_DOC` selon le modèle.
- **Non retenu à la demande de l'utilisateur** : restriction d'accès à `/django-admin/` par liste d'IP (`ADMIN_ALLOWED_IPS`) — écartée pour éviter une configuration supplémentaire à maintenir.

**Verdict : faille réelle (audit-bypass + absence de anti-brute-force sur `/django-admin/`), corrigée sur les deux points retenus.**

---

## 5. Authentification faible — mots de passe — ⚠️ Faille trouvée et corrigée

**Périmètre vérifié** : `config/settings.py` (`AUTH_PASSWORD_VALIDATORS`, `PASSWORD_HASHERS`), `accounts/views.py` (`ChangePasswordView`, `AdminResetPasswordView`), `accounts/admin_views.py` (`UserCreateSerializer`).

**Constats :**

- Hashing : PBKDF2 par défaut de Django, pas d'override `PASSWORD_HASHERS` affaibli.
- Aucun mot de passe en clair loggé (`AuditLog.details` ne contient jamais la valeur). `check_password()` utilisé partout (comparaison à temps constant).
- **Faille** : `AUTH_PASSWORD_VALIDATORS` (`UserAttributeSimilarityValidator`, `CommonPasswordValidator`, `NumericPasswordValidator`) configurés dans `settings.py` mais **jamais appelés** par les 3 points d'entrée réels de gestion de mot de passe (`ChangePasswordView`, `AdminResetPasswordView`, `UserCreateSerializer`) — ceux-ci ne vérifiaient que `len(password) >= 10` à la main. Un mot de passe purement numérique, un mot de passe commun de 10+ caractères, ou un mot de passe trop proche du nom d'utilisateur passait sans problème, alors que la configuration prétendait les bloquer. Les validateurs ne s'appliquaient en pratique que via les formulaires natifs Django (`/django-admin/`, `createsuperuser`).

**Correctifs appliqués (avec accord préalable) :**
- [`accounts/views.py`](backend/accounts/views.py) : `ChangePasswordView` et `AdminResetPasswordView` appellent désormais `django.contrib.auth.password_validation.validate_password()` (remplace le check manuel `len(...) < 10`, qui est de toute façon déjà couvert par `MinimumLengthValidator`), avec renvoi des messages d'erreur Django en 400.
- [`accounts/admin_views.py`](backend/accounts/admin_views.py) : `UserCreateSerializer.validate_password()` appelle aussi `validate_password()` (avec un `User` temporaire construit à partir de `username`/`nom`/`prenom` saisis, pour que `UserAttributeSimilarityValidator` fonctionne dès la création).

**Verdict : faille réelle (politique de mot de passe configurée mais non appliquée), corrigée sur les 3 points d'entrée.**

---

## 6. Autorisation faible / IDOR — ⚠️ Faille trouvée et corrigée

**Périmètre vérifié** : `employees/referentiel_views.py` (Direction/Departement/Service/Poste/TypeContrat/Categorie/TypeDocument), `employees/serializers.py`, `employees/views.py` (`EmployeeDetailView`, `ContratDetailView`, `FileViewerView`, `DocumentViewerView`, `FileDeleteView`, `DocumentDeleteView`).

**Constats :**

- Les vues référentiels (CRUD `/parametres`) sont bien protégées via `get_permissions()` dynamique (`IsAdmin` pour POST, `IsAdminOrConsultant` pour GET) — vérifiées en détail, pas de trou.
- Pas d'ID séquentiel devinable : toutes les ressources utilisent des UUID.
- `EmployeeDocumentSerializer` a un champ `contrat` non marqué `read_only`, mais ce serializer n'est **jamais** utilisé en écriture côté client (uniquement `.data` en sortie) — pas exploitable malgré l'apparence.
- Ressources adressées à plat (`/api/documents/{doc_id}/`, pas de nesting parent/enfant) — cohérent avec le modèle d'accès organisation-wide déjà noté comme choix de conception (point 4 du review initial), pas un bug.
- **Faille** : le paramètre `no_log` sur `EmployeeDetailView.retrieve()` et `ContratDetailView.retrieve()` permettait à **n'importe quel client authentifié** (CONSULTANT y compris) de désactiver l'écriture dans `AuditLog` en ajoutant `?no_log=1` à l'URL. Vérifié : ce paramètre n'était **jamais envoyé par le frontend** (aucune occurrence dans `frontend/src`) — code mort côté UI, mais pleinement exploitable via un appel API direct (curl/Postman/devtools). N'importe qui pouvait consulter le dossier complet d'un employé ou d'un contrat sans laisser de trace dans `/audit`, contredisant directement la garantie affichée sur la page elle-même ("Traçabilité RGPD — toutes les actions sont enregistrées").

**Correctif appliqué (avec accord préalable)** : suppression pure du bypass `no_log` dans [`employees/views.py`](backend/employees/views.py) (`EmployeeDetailView.retrieve()` et `ContratDetailView.retrieve()`) — la consultation est désormais **toujours** loguée, sans exception. Aucun test ni appel frontend n'en dépendait.

**Verdict : faille réelle (contournement client-controllable d'un contrôle d'audit obligatoire), corrigée.**

---

## 7. Sécurisation des fichiers média (documents employé/contrat) — ⚠️ Faille trouvée et corrigée

**Périmètre vérifié** : `employees/models.py` (`document_upload_path`, `EmployeeDocumentFile`), stockage/service des fichiers.

**Sain (déjà vérifié en détail au review initial, reconfirmé) :**
- Validation MIME réelle par lecture des octets (`python-magic`), pas par extension.
- Noms de fichiers sur disque régénérés en UUID, jamais le nom original du client.
- `MEDIA_URL` jamais servi directement — seul accès via `FileViewerView`/`DocumentViewerView` authentifiées, streaming, toujours `inline` (jamais `attachment`), avec `X-Content-Type-Options: nosniff` + CSP.
- 20 Mo max, `react-pdf` avec couches annotation/texte désactivées.

**⚠️ Faille trouvée** : `document_upload_path()` intégrait directement `contrat.numero_contrat` et `type_doc.code` dans le chemin de stockage via `os.path.join(...)`, sans validation de caractères — simples `CharField` sans whitelist alphanumérique. Un ADMIN (rôle qui crée ces valeurs via `/parametres`/création de contrat) aurait pu saisir un `numero_contrat` du type `"../../../../windows"` et rediriger l'écriture du fichier hors de l'arborescence `media/employees/{id}/contrats/{numero}/` prévue (path traversal). Réservé au rôle ADMIN, mais pertinent vu la faille de brute-force sur `/django-admin/` du point 4 (ADMIN compromis = scénario réel dans cette app).

**Correctif appliqué (avec accord préalable)** : nouvelle fonction `_safe_path_segment()` dans [`employees/models.py`](backend/employees/models.py) qui ne garde que lettres/chiffres/tiret/underscore (regex, remplace tout le reste par `_`), appliquée à `numero_contrat` et `type_doc.code` au moment de leur utilisation dans `document_upload_path()` — un seul point de contrôle, peu importe comment la valeur est arrivée en base. Aucune migration nécessaire (ne touche que la génération du chemin de fichier, pas les champs en base).

**Verdict : faille réelle (path traversal via données ADMIN non sanitizées), corrigée.**

---

## 8. Input validation — ⚠️ 3 failles trouvées et corrigées

**Périmètre vérifié** : `employees/import_views.py` (import CSV employés + référentiels), sérializers, filtres de requête.

**Sain :**
- Pas de SQL brut (déjà confirmé au review initial) — tout passe par l'ORM Django, paramétré.
- Pas d'export CSV de données utilisateur (seulement des templates vides côté serveur) — pas de risque d'injection de formule (CSV injection).
- `ContratCreateUpdateSerializer`/`EmployeeCreateUpdateSerializer` nettoient bien les entrées du flux API normal (strip/upper/capitalize).

**⚠️ 3 failles trouvées, toutes dans l'import CSV (`EmployeeImportView`, `ReferentielImportView`) :**

1. **Pas de limite de taille de fichier** — contrairement à l'upload de documents (`MAX_UPLOAD_SIZE_MB=20`), l'import CSV faisait `file.read()` sans vérification de taille : un CSV énorme chargé entièrement en mémoire pouvait provoquer un déni de service.
2. **Crash non géré sur ligne CSV malformée** — `v.strip()` sur une valeur `None` (colonne manquante dans une ligne) levait une `AttributeError` non rattrapée, faisant planter tout l'import avec une 500 sur une simple ligne mal formée.
3. **Message d'erreur brut renvoyé au client** — en cas d'échec de la transaction `bulk_create`, `str(e)` renvoyait le message d'exception Python/DB brut au client (détails internes potentiels : colonnes, contraintes SQL, moteur de BDD).

**Correctifs appliqués (avec accord préalable), dans [`employees/import_views.py`](backend/employees/import_views.py)** :
- Nouvelle fonction `_check_csv_size()` réutilisant `settings.MAX_UPLOAD_SIZE_MB`, appelée avant `file.read()` dans `EmployeeImportView` et `ReferentielImportView`.
- `(v or '').strip()` au lieu de `v.strip()` dans les deux boucles de parsing CSV — tolère les colonnes manquantes sans planter.
- Les deux blocs `except Exception` loguent désormais l'exception complète côté serveur (`logger.exception(...)`) et renvoient un message générique au client au lieu de `str(e)`.

**Verdict : 3 failles réelles (DoS potentiel + crash + fuite d'info), corrigées.**

---

## 9. Variables d'environnement — ⚠️ 2 points trouvés et corrigés

**Périmètre vérifié** : `backend/.env`, `frontend/.env`, `settings.py` (tous les appels `config(...)`), usage de `process.env`/`REACT_APP_*` dans `frontend/src`.

**Sain :**
- `backend/.env` jamais commité (confirmé au point 3), toutes les valeurs cohérentes avec `settings.py`, `SECRET_KEY`/`DB_PASSWORD` sans défaut faible.
- `frontend/.env` : `GENERATE_SOURCEMAP=false` correctement positionné (pas de source maps exposées en prod).
- Aucune variable `REACT_APP_*` utilisée dans le code — aucun risque qu'un secret finisse embarqué dans le bundle JS envoyé au navigateur.

**⚠️ Points trouvés :**

1. **`frontend/.env` contenait `DANGEROUSLY_DISABLE_HOST_CHECK=true`** — réglage du serveur de dev Create React App qui désactive la vérification du header `Host` (protection contre le DNS rebinding sur le serveur de dev local). Confirmé avec l'utilisateur que ce n'était pas nécessaire pour le usage ngrok actuel.
2. **Aucun fichier `.env.example`** (ni backend ni frontend) — pas de modèle documentant les clés attendues sans les valeurs réelles.

**Correctifs appliqués (avec accord préalable) :**
- Retrait de `DANGEROUSLY_DISABLE_HOST_CHECK=true` de [`frontend/.env`](frontend/.env) (confirmé sans impact sur le usage ngrok).
- Création de [`backend/.env.example`](backend/.env.example) (toutes les clés lues par `settings.py` via `config(...)`, valeurs placeholder) et [`frontend/.env.example`](frontend/.env.example) — aucun secret réel dans ces fichiers, tous deux non ignorés par `.gitignore` donc committables.

**Verdict : 2 points réels (réglage dev-server risqué + absence de documentation de config), corrigés.**

---

## 10. Dépendances vulnérables — ⚠️ Failles trouvées et corrigées (backend) / dette documentée (frontend)

**Méthode** : `pip-audit` (outil officiel PyPA, installé temporairement dans le venv puis retiré après usage) pour le backend, `npm audit` pour le frontend.

### Backend — 78 CVE connues, dans 4 paquets — corrigé

| Paquet | Avant | Après |
|---|---|---|
| `Django` | 4.2.13 (mai 2024, ~60 CVE accumulées) | 4.2.30 |
| `djangorestframework` | 3.15.1 | 3.15.2 |
| `djangorestframework-simplejwt` | 5.3.1 | 5.5.1 |
| `Pillow` | 10.3.0 (~13 CVE) | 12.3.0 |

Toutes restent dans la même ligne majeure compatible (Django 4.2.x LTS = patchs sans rupture d'API attendue ; Pillow n'est utilisé nulle part directement dans le code de l'app — uniquement transitif). `requirements.txt` mis à jour. Re-scan `pip-audit` après upgrade : **0 vulnérabilité restante**.

### Frontend — 35 → 30 vulnérabilités npm — partiellement corrigé, reste documenté comme dette

Quasi-totalité située dans les dépendances **transitives de `react-scripts`** (webpack-dev-server, sockjs, websocket-driver, svgo, jest, workbox) — outillage de build/dev, jamais expédié dans le bundle de production. `react-scripts` (Create React App) n'est plus activement maintenu par Meta depuis 2023 : aucune nouvelle version ne corrigera ces sous-dépendances figées.

- `npm audit fix` (sans `--force`) appliqué : corrige les paquets ayant un fix compatible sans casser CRA → **35 → 30 vulnérabilités restantes** (9 low, 6 moderate, 13 high, 2 critical). Seul `package-lock.json` modifié, `package.json` inchangé — risque de régression faible.
- Le reste nécessite `npm audit fix --force`, qui installerait `react-scripts@0.0.0` (= le supprimer, aucune version compatible n'existe) — casserait le build. Vraie correction = migration d'outillage (ex. vers Vite), **chantier séparé à planifier**, pas un correctif ponctuel de cette session.

**Verdict : backend corrigé (0 CVE restante) ; frontend partiellement réduit (35→30), le reliquat documenté comme dette technique nécessitant une décision de migration d'outillage.**

---

## 11. CSRF / CORS — ✅ Vérifié, correctif antérieur toujours intact

**Contexte** : le CSRF était quasi inopérant sur toute l'API et a déjà été corrigé en profondeur lors du tout premier passage manuel (avant le début de la séquence numérotée) — `JWTCookieAuthentication.enforce_csrf()` (double-soumission de jeton), cookie `csrftoken` émis au login/refresh, `CSRF_TRUSTED_ORIGINS`, et `axios` configuré côté frontend avec les noms de cookie/header Django.

**Reverérifié aujourd'hui après tous les changements ultérieurs (Redis, admin, imports CSV) — tout est intact et cohérent :**

- **CORS** : `CORS_ALLOWED_ORIGINS` allowlist stricte, aucun wildcard (`CORS_ALLOW_ALL_ORIGINS` absent), aucun header `Access-Control-Allow-Origin` codé en dur. `CorsMiddleware` correctement placé avant `CommonMiddleware`.
- **CSRF** : `enforce_csrf()` toujours en place dans `accounts/cookie_auth.py`, `CSRF_TRUSTED_ORIGINS` aligné sur `CORS_ALLOWED_ORIGINS`, cookie `csrftoken` toujours émis dans `_set_auth_cookies()`.
- **Frontend** : `xsrfCookieName`/`xsrfHeaderName` toujours configurés dans `api.js`, `withCredentials: true` intact. `baseURL: "/api"` relatif — cohérent avec un reverse-proxy servant front et back sur la même origine en prod.

**Verdict : aucune nouvelle faille — le correctif antérieur tient toujours.**

---

## 12. Exposition de données sensibles (logs/erreurs) & gestion de session — ⚠️ Point trouvé et corrigé

**Périmètre vérifié** : logs (`backend/logs/somiz.log`), gestion des exceptions dans les vues, `SIMPLE_JWT`, `CookieTokenRefreshView`.

**Sain :**
- Plus aucune fuite d'exception brute vers le client (les 2 cas du point 8 corrigés, aucun autre `str(e)`/`except Exception as e` nulle part).
- `logs/somiz.log` inspecté : uniquement des entrées `django.request` standard (méthode/statut/path) — aucun mot de passe, token ou corps de requête loggé. Correctement gitignoré.
- `DEBUG` sans défaut faible (`default=False`).

**⚠️ Point trouvé : pas de plafond de session clairement maîtrisé.** En creusant `CookieTokenRefreshView` ([`accounts/views.py`](backend/accounts/views.py)), constat que cette vue custom **ne fait pas de rotation réelle** du refresh token (elle réutilise le même JWT, dont l'`exp` est figé à sa création) — `ROTATE_REFRESH_TOKENS`/`BLACKLIST_AFTER_ROTATION` dans `settings.py` sont donc des réglages **morts**, jamais consultés par ce flux. Conséquence : il existe déjà, de fait, un plafond de session absolu (pas glissant), mais fixé à 24h — plus long qu'une journée de travail normale, ce qui est excessif pour une app RH sensible (une session oubliée sur un poste partagé resterait valide jusqu'à 24h).

**Correctif appliqué (avec accord préalable)** : `SIMPLE_JWT['REFRESH_TOKEN_LIFETIME']` réduit de 24h à **10h** dans [`config/settings.py`](backend/config/settings.py) — couvre une journée de travail avec marge (heures sup), tout en gardant le plafond absolu déjà en place (pas de session glissante indéfinie). Commentaire ajouté pour documenter le comportement réel de `CookieTokenRefreshView` (les réglages `ROTATE_REFRESH_TOKENS`/`BLACKLIST_AFTER_ROTATION` sont conservés tels quels pour un usage futur, mais actuellement inertes).

**Verdict : plafond de session déjà présent mais mal calibré (24h) — réduit à 10h.**

---

## 13. SSRF & logique métier (abus de fonctionnalités) — ⚠️ Faille trouvée et corrigée

**Périmètre vérifié** : requêtes HTTP sortantes (SSRF), `employees/models.py` (`EmployeeDocument.save()`), vues d'upload.

**SSRF : surface nulle.** Aucun import `requests`/`urllib`/`httpx` nulle part dans le backend — aucune fonctionnalité ne récupère une URL fournie par le client côté serveur (pas d'avatar-depuis-URL, webhook, import-depuis-URL). Zéro vecteur SSRF dans l'état actuel de l'app.

**⚠️ Faille trouvée : race condition sur le versioning des documents.** [`EmployeeDocument.save()`](backend/employees/models.py#L367-386) suivait un pattern "lire puis agir" (chercher le document actif existant, l'archiver, créer le nouveau) **sans transaction ni verrou de ligne**, et aucune vue d'upload (`DocumentListUploadView`, `ContratDocumentListUploadView`) n'utilisait `transaction.atomic()`. Deux uploads concurrents du même type de document pour le même employé (double-clic, deux sessions ADMIN simultanées) pouvaient tous les deux lire "aucun actif" avant que l'un des deux ne commit, résultant en **deux documents actifs simultanés** pour le même type/employé — casse l'invariant "un seul document actif par type" dont dépend `dossier_complet`/`documents_manquants`, et fausse la traçabilité des versions.

**Correctif appliqué (avec accord préalable)** : le bloc est maintenant englobé dans `transaction.atomic()` avec `select_for_update()` sur la requête cherchant le document actif existant ([`employees/models.py`](backend/employees/models.py)) — sérialise les requêtes concurrentes sur ce verrou au lieu de les laisser courir en parallèle.

**Limite résiduelle documentée** : `select_for_update()` verrouille des lignes *existantes* — si c'est le tout premier upload pour ce type/employé (aucune ligne à verrouiller), deux requêtes strictement simultanées pourraient en théorie encore passer en parallèle. Une garantie totale demanderait un index unique partiel en base (migration de schéma) — non fait, à évaluer séparément si jugé nécessaire.

**Verdict : SSRF absent (rien à corriger) ; race condition de logique métier réelle, corrigée pour le cas courant (résidu documenté pour le cas rare du tout premier upload).**

---

## 14. Rate-limiting par utilisateur — ⚠️ Point trouvé et corrigé

**Constat** : seul un throttle global existait (`UserRateThrottle` à 200/min, partagé par tous les endpoints). Les endpoints les plus sensibles pour l'exfiltration de données — `FileViewerView`/`DocumentViewerView` (consultation de documents RH) — n'avaient **aucune limite dédiée plus stricte** : un compte légitime mais compromis pouvait consulter des dizaines de documents par minute, bien avant de déclencher l'alerte "20 documents/heure" (qui n'envoie qu'un email, ne bloque rien — point 1 du review initial).

**Correctif appliqué (avec accord préalable)** : nouveau scope `consultation` (`30/min`) dans `DEFAULT_THROTTLE_RATES` ([`config/settings.py`](backend/config/settings.py)), branché via `ScopedRateThrottle` sur `FileViewerView` et `DocumentViewerView` ([`employees/views.py`](backend/employees/views.py)) — largement suffisant pour un usage RH normal, mais ralentit significativement une tentative d'exfiltration en masse par script.

**Verdict : faille réelle (pas de frein sur la consultation en masse), corrigée.**

---

## 15. Sécurité infra de déploiement (nginx/gunicorn/TLS) — 📋 Documenté (pas de déploiement réel actuellement)

**Constat** : SOMIZ tourne uniquement en local (`manage.py runserver`) — confirmé avec l'utilisateur. Aucun fichier `nginx.conf`/`gunicorn.conf.py`/service systemd dans le repo, malgré `gunicorn` présent dans `requirements.txt` et une mention de Nginx dans `backend/README.md`. Rien à corriger dans le code aujourd'hui — ce point est un mémo pour le jour du déploiement réel.

**À faire au moment du déploiement (nginx + gunicorn + TLS) :**
- **TLS obligatoire** avant de flipper `SECURE_SSL_REDIRECT`/`SESSION_COOKIE_SECURE`/`CSRF_COOKIE_SECURE`/`JWT_COOKIE_SECURE` à `True` (voir point "cookies non-Secure" déjà traité — garde-fou déjà en place dans `settings.py`).
- **Nginx ne doit jamais servir `MEDIA_ROOT`/`/media-internal/` directement** — uniquement proxy vers Django/gunicorn, pour préserver le passage obligatoire par `FileViewerView`/`DocumentViewerView` authentifiées (déjà garanti côté code, à ne pas casser côté config nginx).
- **`X-Forwarded-For` de confiance** : si nginx est en frontal, Django doit lire l'IP réelle via `SECURE_PROXY_SSL_HEADER`/`USE_X_FORWARDED_HOST` correctement configurés — sinon `AuditLog._get_ip()` et le rate-limiting par IP (`AnonRateThrottle`) verraient tous les utilisateurs venir de l'IP de nginx (127.0.0.1), cassant silencieusement l'anti-brute-force par IP et l'audit trail des adresses IP.
- **Timeouts gunicorn** : configurer `--timeout` raisonnable + limiter `--workers`/`--worker-connections` pour éviter qu'une requête lente (gros upload) n'épuise tous les workers (DoS involontaire).
- **`ALLOWED_HOSTS`** : mettre le vrai nom d'hôte/IP du serveur de prod (déjà géré via `.env`, cf. point 9).
- **Limite de taille de requête côté nginx** (`client_max_body_size`) alignée sur `MAX_UPLOAD_SIZE_MB` (20 Mo) pour rejeter les gros uploads avant même qu'ils n'atteignent Django/gunicorn.

**Verdict : rien à corriger maintenant — recommandations documentées pour le déploiement futur.**

---

## 16. Tests de charge / résilience DoS — 📋 Documenté (pas fait, à planifier au déploiement)

**Constat** : aucun test de charge n'a jamais été fait sur SOMIZ — l'app tourne uniquement en local, un test de charge maintenant n'aurait pas de valeur représentative (pas d'infra de prod, pas de volumétrie réelle). Décision avec l'utilisateur : documenter plutôt que d'exécuter maintenant.

**À faire au moment du déploiement réel :**
- Outil recommandé : **k6** ou **locust** (scripts Python/JS simulant plusieurs utilisateurs simultanés).
- Scénarios prioritaires à tester, vu les points déjà traités dans ce document :
  - **Upload de documents concurrent** — vérifier que le correctif de race condition (point 13, `select_for_update()`) tient sous charge réelle, pas seulement en théorie.
  - **Consultation de documents en rafale** — confirmer que le throttle `consultation` (30/min, point 14) bloque bien au bon seuil sous Redis en conditions réelles (multi-worker).
  - **Import CSV volumineux** — vérifier le comportement à la limite de `MAX_UPLOAD_SIZE_MB` (point 8) et le temps de traitement d'un import de plusieurs milliers de lignes.
  - **Login en rafale** — confirmer que le verrouillage anti-brute-force (5 tentatives/30 min) et le throttle `anon` (10/min) tiennent sous un vrai scénario d'attaque distribuée (plusieurs IP).
- Objectif : identifier le nombre de workers gunicorn nécessaires et les timeouts appropriés (lié au point 15) avant la mise en production.

**Verdict : non fait — à planifier comme étape de validation avant tout déploiement en production.**

---

## 17. MFA (authentification à deux facteurs) — 📋 Documenté (absent, amélioration future)

**Constat** : SOMIZ n'a aucune 2FA — authentification par mot de passe seul (renforcé par le verrouillage anti-brute-force du point initial et la politique de mot de passe du point 5). Pour une app RH manipulant des données sensibles (dossiers employés, RGPD/loi 18-07), l'ajout d'un second facteur réduirait fortement l'impact d'un mot de passe compromis (phishing, réutilisation de mot de passe).

**Décision avec l'utilisateur** : ne pas implémenter maintenant — c'est un vrai projet à part (pas un correctif ponctuel), pas un correctif de sécurité de cette session.

**Si implémenté un jour, recommandation :**
- **TOTP** (Time-based One-Time Password, type Google Authenticator/Authy) via `django-otp` ou `pyotp` — standard, pas de dépendance à un SMS/email tiers.
- Prioriser l'activation obligatoire pour le rôle **ADMIN** en premier (comptes les plus sensibles, cf. la faille `/django-admin/` du point 4), CONSULTANT en option.
- Prévoir des **codes de récupération** (recovery codes) à usage unique en cas de perte du téléphone, stockés hashés comme un mot de passe.
- Ajouter une étape dans `LoginView` : après validation du mot de passe, si MFA activé, renvoyer un état intermédiaire "code TOTP requis" avant d'émettre les cookies JWT finaux.

**Verdict : absent — documenté comme amélioration future, à planifier comme projet séparé.**

---

## 18. Timing attack sur le login — ⚠️ Faille trouvée et corrigée (2 endroits)

**Constat** : dans `LoginView.post()` ([`accounts/views.py`](backend/accounts/views.py)), quand l'utilisateur n'existe pas, le code retournait immédiatement après l'échec de `User.objects.get()` — aucun hashage de mot de passe n'avait lieu. Quand l'utilisateur existe mais le mot de passe est faux, `user.check_password()` s'exécute (PBKDF2, coûteux en CPU) avant de retourner. Le message et le code HTTP sont identiques dans les deux cas ("Identifiants incorrects.", 401), mais le **temps de réponse diffère mesurablement** — un attaquant peut chronométrer les réponses pour énumérer les noms d'utilisateur valides, même sans jamais voir de message différent.

**Bonus trouvé en vérifiant** : `LockoutModelBackend` ([`accounts/backends.py`](backend/accounts/backends.py), ajouté au point 4 pour protéger `/django-admin/`) avait exactement le même défaut, introduit par inadvertance à ce moment-là.

**Correctif appliqué (avec accord préalable)** dans les deux fichiers : quand l'utilisateur n'existe pas, exécuter quand même un hashage "factice" sur une instance `User()` non sauvegardée (`User().set_password(password)`) avant de retourner l'erreur — égalise le temps de réponse avec le cas "mauvais mot de passe". C'est exactement la mitigation que Django utilise nativement dans `ModelBackend.authenticate()` (issue Django #20760).

**Note** : les branches "compte verrouillé"/"compte désactivé" sautent aussi le hashage, mais ce n'est pas un problème — ces cas révèlent déjà explicitement l'état du compte en clair dans le message de réponse, donc il n'y a rien à cacher niveau timing pour ces branches.

**Verdict : faille réelle (énumération de comptes par timing), corrigée aux 2 endroits concernés.**

---

## 19. Sécurité de la base de données (privilèges DB_USER) — 📋 Documenté (pas changé, risque de casse en local)

**Constat** : `backend/README.md` documente `GRANT ALL PRIVILEGES ON DATABASE somiz_archivage TO somiz_user;` et `ALTER USER somiz_user CREATEDB;` — le compte utilisé par l'app en fonctionnement normal a des droits DDL (créer/supprimer des tables) et le droit de créer de nouvelles bases, alors qu'au quotidien l'app (via l'ORM Django) n'a besoin que de SELECT/INSERT/UPDATE/DELETE sur ses propres tables. `CREATEDB` n'est documenté comme nécessaire que pour les tests (pytest-django crée une base de test) — un besoin de développement, jamais de production.

**Risque** : en cas de fuite de `DB_PASSWORD` (`.env` mal protégé, faille applicative), l'attaquant récupère un compte capable de `DROP TABLE`/créer des bases sur tout le serveur PostgreSQL — bien plus de dégâts qu'un compte limité aux données de l'app.

**Décision avec l'utilisateur** : documenter sans changer la config actuelle — l'app tourne en local, et modifier les privilèges maintenant risquerait de casser `manage.py migrate`/les tests locaux (qui utilisent le même compte).

**Recommandation pour la production (principe du moindre privilège), à appliquer au déploiement :**
```sql
-- Compte "migration" (admin, utilisé ponctuellement lors des déploiements) :
--   garde les droits DDL complets pour lancer `manage.py migrate`.

-- Compte runtime de l'app (utilisé par DB_USER dans .env en production) :
GRANT CONNECT ON DATABASE somiz_archivage TO somiz_user;
GRANT USAGE ON SCHEMA public TO somiz_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO somiz_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO somiz_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO somiz_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO somiz_user;
-- PAS de CREATEDB, PAS de ALL PRIVILEGES pour ce compte en production.
```
Les migrations en production seraient alors lancées avec un compte séparé (ou le propriétaire de la base), pas avec le `DB_USER` applicatif.

**Verdict : configuration actuelle trop permissive selon le principe du moindre privilège — non changée maintenant (usage local), recommandation documentée pour le déploiement en production.**

---

## 20. Purge des données (droit à l'oubli RGPD) — 📋 Documenté (décision métier requise, pas implémenté)

**Constat (déjà noté en Info au review initial)** : le soft-delete (`is_active=False`) est utilisé systématiquement pour les documents/employés/contrats, mais **aucune purge automatique** n'existe après un délai — les fichiers physiques et les lignes en base restent indéfiniment, même longtemps après qu'un employé ait quitté l'entreprise ou qu'un document soit devenu obsolète. `AuditLog` a lui une politique de rétention explicite ("conservé 5 ans minimum (ANPDP)", commentaire dans `audit/models.py`), mais rien d'équivalent pour les dossiers employés eux-mêmes.

**Pourquoi ce n'est pas qu'un choix technique** : la loi 18-07/RGPD impose un "droit à l'oubli" mais aussi des durées de conservation légales variables selon le type de document RH (contrats de travail, bulletins de paie, dossiers médicaux...) — la durée exacte est une décision métier/juridique (à valider avec un service juridique/RH), pas quelque chose que je peux choisir techniquement à la place de l'utilisateur.

**Ce qu'il faudrait faire une fois la durée de rétention décidée :**
- Une commande Django (`manage.py purge_expired_documents`) ou tâche planifiée (cron/Celery beat) qui identifie les enregistrements `is_active=False` dont la date de désactivation dépasse le délai légal, supprime le fichier physique et la ligne en base.
- Écrire un log d'audit spécifique pour chaque purge (nouvelle action `AuditLog.Action.PURGE`) — la suppression légale doit elle-même être traçable.
- Distinguer les types de documents si les durées légales diffèrent (ex. bulletins de paie vs. contrats).

**Verdict : fonctionnalité absente — documentée, en attente d'une décision métier sur la durée de rétention avant toute implémentation.**

---

## 21. En-têtes de sécurité complets — ⚠️ Point trouvé et corrigé (partiellement)

**Bonne surprise en vérifiant** : `SECURE_REFERRER_POLICY`, `X_FRAME_OPTIONS`, `SECURE_CONTENT_TYPE_NOSNIFF` sont déjà **globaux** (posés par `SecurityMiddleware`/`XFrameOptionsMiddleware` sur toutes les réponses) — pas seulement sur les documents comme supposé initialement.

**Manquant trouvé :**
1. **`Permissions-Policy`** — absent partout. L'app n'utilise aucune fonctionnalité navigateur sensible (caméra, micro, géolocalisation, paiement, USB), donc les désactiver explicitement ne casse rien.
2. **CSP globale sur le shell SPA** (`index.html`) — actuellement seulement posée sur les réponses de visualisation de documents. **Non corrigé** : risqué à ajouter à l'aveugle car le frontend utilise des styles inline partout (`style={{}}`), et une CSP stricte sur `style-src` sans `'unsafe-inline'` casserait l'affichage. Les tests Jest actuels ne font pas respecter de vraie CSP (pas de navigateur réel) — impossible à valider sans test manuel en conditions réelles.

**Correctif appliqué (avec accord préalable)** : nouveau [`config/middleware.py`](backend/config/middleware.py) (`PermissionsPolicyMiddleware`) ajouté à `MIDDLEWARE`, pose `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()` sur toutes les réponses.

**Verdict : `Permissions-Policy` corrigé ; CSP globale sur le SPA documentée comme amélioration future nécessitant un test navigateur réel avant implémentation (risque de casser les styles inline).**

---

## 22. Sauvegardes (backup) — 📋 Documenté (rien en place actuellement)

**Constat** : confirmé avec l'utilisateur — aucune sauvegarde automatisée n'existe actuellement pour la base PostgreSQL ni pour les fichiers média (`media/`, documents scannés des employés). En cas de panne disque, corruption, ou incident (y compris un ransomware sur le poste serveur), perte totale et définitive des dossiers RH — aucune reprise possible.

**Recommandations pour le déploiement :**
- **Base de données** : `pg_dump` planifié (cron) avec rotation (ex. quotidien × 30 jours, puis hebdomadaire × 6 mois) — export vers un stockage **séparé physiquement** du serveur applicatif (sinon un incident sur le serveur détruit aussi les backups).
- **Fichiers média** : sauvegarde incrémentale du dossier `media/` (ex. `rsync`/`restic`/`borgbackup`) — les documents scannés ne sont pas dans la base, une sauvegarde DB seule ne suffit pas.
- **Chiffrement des sauvegardes** : les dossiers RH sont des données sensibles (RGPD/loi 18-07) — les backups doivent être chiffrés au repos, pas seulement la base de prod.
- **Accès restreint** : qui peut lire/restaurer les sauvegardes doit être une liste courte et auditée séparément (un backup en clair accessible à tous annule la protection de l'app elle-même).
- **Test de restauration périodique** : une sauvegarde jamais restaurée n'est pas une sauvegarde fiable — prévoir un test de restauration au moins une fois avant la mise en production, puis périodiquement.

**Verdict : absent — recommandations documentées, à mettre en place avant tout déploiement en production (perte de données actuellement irréversible en cas d'incident).**

---

## 23. Supply chain des dépendances (hashes de paquets) — 📋 Documenté (pas implémenté)

**Constat** : `requirements.txt` épingle des versions exactes (`==`, déjà une bonne pratique de base, confirmée au point 10), mais sans **hashes cryptographiques** (`--hash=sha256:...`). Ça veut dire que `pip install` fait confiance au paquet téléchargé depuis PyPI au moment de l'installation, sans vérifier qu'il correspond exactement à un artefact connu et validé — un paquet compromis publié sous le même numéro de version (attaque de la chaîne d'approvisionnement, ex. typosquatting ou compromission d'un mainteneur PyPI) passerait sans détection.

**Ce qu'il faudrait faire :**
- Générer un `requirements.txt` avec hashes via `pip-compile --generate-hashes` (outil `pip-tools`) à partir d'un fichier source `requirements.in`.
- Installer avec `pip install --require-hashes -r requirements.txt` — pip refuse alors toute installation dont le hash ne correspond pas exactement.
- Mettre à jour ce fichier à chaque changement de dépendance (légèrement plus de friction qu'un simple `pip install package==x.y.z`).

**Pourquoi documenté plutôt qu'implémenté maintenant** : changement de workflow de développement (toute mise à jour de dépendance doit repasser par `pip-compile`), pas un correctif ponctuel — mieux vaut l'introduire consciemment plutôt que de le faire à la volée en fin de session d'audit.

**Verdict : absent — recommandation documentée, à évaluer comme amélioration de processus séparée.**

---

## 24. Scoping organisation-wide (accès CONSULTANT non restreint) — ✅ Implémenté complet

**Contexte** : depuis le review initial, un CONSULTANT pouvait consulter n'importe quel employé/document/contrat de l'organisation entière — choix de conception assumé, mais un vrai gap de minimisation des données au sens RGPD/loi 18-07. Chantier complet demandé (pas un pansement), implémenté de bout en bout.

**Modèle de données** ([`accounts/models.py`](backend/accounts/models.py)) :
- 3 nouveaux champs nullable sur `User` : `scope_direction`, `scope_departement`, `scope_service` (FK vers `employees.Direction/Departement/Service`). Aucun des trois renseigné = accès non restreint (comportement historique préservé pour tous les comptes CONSULTANT existants — pas de migration de données nécessaire, juste de schéma).
- `employee_scope_q(prefix='')` : Q object filtrant un queryset Employee (ou un modèle relié via `prefix`, ex. `Contrat` via `employee__`) selon le périmètre — le niveau le plus précis (service) prime sur le plus large (direction).
- `can_access_employee(employee)` : équivalent objet-par-objet pour les vues `get_object()`.
- ADMIN toujours non restreint, quel que soit ce qui est renseigné sur son compte.

**Vues corrigées** ([`employees/views.py`](backend/employees/views.py)) :
- `EmployeeListCreateView.get_queryset()` — filtre par périmètre.
- `EmployeeDetailView.get_queryset()` — 404 (pas 403) pour un employé hors périmètre, ne confirme pas son existence.
- `FileViewerView`, `DocumentViewerView` — vérifient le périmètre de l'employé propriétaire du document avant de servir le fichier.
- `DocumentListUploadView.get()`, `ContratListCreateView.get()`, `ContratDetailView.get_queryset()`, `ContratDocumentListUploadView.get()` — même vérification via l'employé lié.
- `employee_search` — résultats filtrés par périmètre.
- Toutes les vues ADMIN-only (create/update/delete) restent inchangées — l'ADMIN garde l'accès complet par construction.

**API admin** ([`accounts/admin_views.py`](backend/accounts/admin_views.py)) : `UserSerializer` expose et accepte en écriture `scope_direction/departement/service` (+ noms lisibles `*_nom` en lecture seule) ; `UserUpdateView.perform_update` trace les changements de périmètre dans `AuditLog` (`MODIFY_USER`) au même titre que les changements de rôle.

**UI** ([`frontend/src/pages/Users.jsx`](frontend/src/pages/Users.jsx)) : nouvelle colonne "Périmètre" dans le tableau, bouton "Périmètre" (visible pour les comptes CONSULTANT) ouvrant un modal avec sélection en cascade Direction → Département → Service, "Aucun" à chaque niveau pour un accès non restreint.

**Tests** : nouveau fichier [`tests/test_employee_scoping.py`](backend/tests/test_employee_scoping.py) — 18 tests couvrant `employee_scope_q()`/`can_access_employee()` unitairement, le filtrage de liste, le 404 objet-par-objet (employé/document/contrat), et l'API admin d'assignation. **177/177 tests backend et 438/438 tests frontend passent** (aucune régression sur l'existant, `Users.test.jsx` inclus).

**Bug préexistant découvert en testant (hors périmètre, non corrigé)** : `DocumentViewerView` (`/api/documents/{id}/view/`) référence `doc.file`, un attribut qui n'existe pas sur `EmployeeDocument` (le fichier réel vit sur `EmployeeDocumentFile`, exposé via `FileViewerView`/`/api/files/{id}/view/`). Cet endpoint était déjà cassé avant ce chantier — confirmé que le frontend ne l'utilise jamais (seul `/files/{id}/view/` est appelé), donc aucun risque de sécurité actif, juste du code mort. Signalé, pas corrigé (hors sujet du scoping).

**Verdict : gap de conception résolu — le scoping organisation-wide est maintenant une vraie fonctionnalité opérationnelle, optionnelle par compte, rétrocompatible par défaut.**

---

## 25. Audit du chantier "Champs personnalisés" / colonnes configurables (2026-07-25) — ⚠️ Faille trouvée et corrigée

**Contexte** : audit ciblé sur tout ce qui a été ajouté dans ce chantier — `ChampPersonnalise`/`EmployeeChampValeur` (EAV), migration RIB/NIN/Groupe sanguin/N° Sécu, `SystemFieldLabel` (renommage cosmétique), import CSV rendu dynamique (`champs_actifs` matché par `code.lower()`), et l'exposition de nouveaux champs dans `EmployeeListSerializer` (colonnes configurables `/employees`).

**Périmètre vérifié** : `employees/models.py` (`ChampPersonnalise`, `EmployeeChampValeur`, `SystemFieldLabel`), `employees/referentiel_views.py` (CRUD champs personnalisés, libellés système), `employees/views.py` (`EmployeeChampsPersonnalisesView`, `EmployeeListCreateView`), `employees/serializers.py` (`EmployeeListSerializer`, `EmployeeDetailSerializer`), `employees/import_views.py` (import CSV dynamique).

**Sain :**
- `EmployeeChampsPersonnalisesView.patch()` (`/api/employees/<id>/champs/`) : `IsAdmin` uniquement, tracé dans `AuditLog` (`MODIFY_EMP`, détail `champs_personnalises`) — cohérent avec le reste des mutations employé.
- `SystemFieldLabelUpdateView.put()` : `IsAdmin` uniquement ; `SystemFieldLabelListView` (`GET`) : `IsAdminOrConsultant` — ne renvoie que des libellés cosmétiques (`code`/`label`), aucune donnée employé, lecture par CONSULTANT sans risque.
- Nouveaux champs exposés par `EmployeeListSerializer` (`date_naissance`, `date_embauche`, `categorie_nom`, `champs_personnalises`) : déjà accessibles à un CONSULTANT via `EmployeeDetailSerializer` pour tout employé dans son périmètre — les colonnes configurables de la liste n'ouvrent aucun accès nouveau, seulement un raccourci d'affichage sur des données déjà consultables. Le filtrage par périmètre (`employee_scope_q()`) s'applique toujours en amont dans `EmployeeListCreateView.get_queryset()`.
- `EmployeeChampValeur`/`ChampPersonnalise` non exposés en dehors du scoping employé existant — `get_champs_personnalises()` (liste et détail) ne fait qu'un prefetch, pas de requête indépendante contournant le queryset scopé.
- CSV import : ADMIN uniquement (`EmployeeImportView.permission_classes`), taille de fichier toujours vérifiée (`_check_csv_size`), gestion d'erreur générique déjà en place (points 8/12) — la dynamisation par `champs_actifs` ne réintroduit aucune des 3 failles déjà corrigées au point 8.

**⚠️ Faille trouvée** : `ChampPersonnaliseSerializer` (création/modification d'un champ personnalisé, ADMIN via `/parametres`) n'empêchait pas un `code` identique (insensible à la casse) à un champ structurel réservé (`statut`, `poste`, `direction`, `date_embauche`, etc.). Comme l'import CSV construit désormais `champs_actifs = {code.lower(): champ}` à partir de **tous** les `ChampPersonnalise` actifs (voir section "Champs personnalisés" de `CLAUDE.md`), un ADMIN créant par erreur (ou malveillance interne) un champ personnalisé de code `STATUT` aurait fait entrer en collision silencieuse la colonne CSV `statut` (fixe, `Employee.statut`) avec ce nouveau champ dynamique — comportement d'import imprévisible selon l'ordre de traitement, potentiellement une écriture de valeur dans le mauvais champ ou une valeur silencieusement ignorée.

**Correctif appliqué (avec accord préalable)** : `ChampPersonnaliseSerializer.validate_code()` ([`employees/referentiel_views.py`](backend/employees/referentiel_views.py)) rejette désormais (400, message explicite) tout `code` correspondant — insensible à la casse — à un des 13 champs structurels réservés (`RESERVED_CHAMP_CODES` : `matricule`, `numero_contrat`, `nom`, `prenom`, `date_naissance`, `date_embauche`, `statut`, `direction`, `departement`, `service`, `poste`, `type_contrat`, `categorie`). Vérifié : les 4 codes legacy migrés (`RIB`, `NUM_SECU`, `GROUPE_SANGUIN`, `NIN`) ne collisionnent avec aucun de ces noms, aucune migration de données nécessaire. 188/188 tests backend toujours au vert après le correctif.

**Verdict : faille réelle (collision de nom exploitable via l'import CSV dynamique), corrigée. Le reste du chantier (EAV, renommage de libellé, colonnes configurables) ne réintroduit aucune régression sur le scoping, l'audit ou les permissions déjà en place.**

---

## 26. Re-vérification complète des points 1 à 25 (2026-07-25) — ⚠️ 1 point trouvé et corrigé

**Demande** : repasser sur **tous** les points précédents, pas seulement l'audit ciblé du point 25, pour confirmer qu'aucun n'a régressé après le chantier "Champs personnalisés"/colonnes configurables.

**Méthode** : relecture point par point + greps ciblés sur tout `frontend/src` et `backend/` (hors `venv/`) pour les motifs déjà identifiés comme sensibles dans ce document (`dangerouslySetInnerHTML`/`eval`, `no_log`, `str(e)` non catché, secrets en dur, `permission_classes` manquants).

**Résultat point par point :**

| # | Point | Statut |
|---|---|---|
| 1 | XSS | ✅ Intact — aucun nouveau sink (`dangerouslySetInnerHTML`/`innerHTML`/`eval`) introduit dans les nouveaux fichiers/composants. |
| 2 | Rate limiting (Redis) | ✅ Intact — `settings.py` non touché par ce chantier. |
| 3 | Secrets en dur | ✅ Intact — aucun secret introduit (les seuls faux positifs du grep sont des messages d'erreur de formulaire `Users.jsx`, pas des secrets). |
| 4 | Authentification manquante | ✅ Intact — toutes les nouvelles vues (`ChampPersonnaliseListCreateView/DetailView`, `SystemFieldLabelListView/UpdateView`, `EmployeeChampsPersonnalisesView`) déclarent explicitement `permission_classes`/`get_permissions()` (vérifié ligne par ligne, voir extraits ci-dessus). |
| 5 | Mots de passe | ✅ Intact — aucun champ mot de passe touché. |
| 6 | IDOR / `no_log` | ✅ Intact — grep `no_log` dans `employees/` : zéro résultat, le bypass reste supprimé. |
| 7 | Fichiers média | ✅ Intact — aucun changement sur `document_upload_path`/upload de fichiers. |
| 8 | Input validation (CSV) | ✅ Intact + renforcé — `_check_csv_size`, gestion `(v or '').strip()` et `logger.exception()` toujours en place dans `import_views.py` après la dynamisation ; voir aussi la nouvelle faille ci-dessous (§ Faille trouvée). |
| 9 | Variables d'environnement | ✅ Intact — aucun fichier `.env`/`.env.example` touché. |
| 10 | Dépendances vulnérables | ✅ Intact — aucune nouvelle dépendance ajoutée à `requirements.txt`/`package.json` par ce chantier. |
| 11 | CSRF / CORS | ✅ Intact — les nouvelles vues DRF héritent des mêmes classes d'authentification globales (`JWTCookieAuthentication` + `enforce_csrf()`), aucune vue n'a été déclarée avec des `authentication_classes` custom contournant le CSRF. |
| 12 | Logs / session | ✅ Intact — aucun nouveau `except Exception`/`str(e)` renvoyé au client dans le code applicatif (grep limité aux occurrences hors `venv/`, seules des libs tierces remontent). |
| 13 | SSRF / race conditions | ⚠️ Point mineur documenté (non bloquant) — voir ci-dessous. |
| 14 | Rate-limiting par endpoint | ✅ Intact — les nouveaux endpoints (`/ref/champs-personnalises/`, `/ref/system-field-labels/`, `/employees/{id}/champs/`) ne servent aucun fichier/contenu volumineux, restent sous le throttle global `user` (200/min) comme le reste des CRUD référentiels — pas besoin d'un scope dédié comme `consultation`. |
| 15–17, 19, 22, 23 | Infra / charge / MFA / DB privileges / backups / supply chain | ✅ Sans objet — aucun changement dans ces domaines cette session, verdicts déjà documentés inchangés. |
| 18 | Timing attack login | ✅ Intact — `LoginView`/`LockoutModelBackend` non touchés. |
| 20 | Purge RGPD | ✅ Intact — `EmployeeChampValeur` suit une simple `CASCADE` avec `Employee` (pas de rétention indépendante à gérer), cohérent avec l'absence de purge déjà documentée. |
| 21 | En-têtes de sécurité | ✅ Intact — `PermissionsPolicyMiddleware` non touché. |
| 24 | Scoping CONSULTANT | ✅ Reconfirmé — `champs_personnalises` sur `EmployeeListSerializer` ne fait que réexposer dans la liste des données déjà accessibles via le détail pour un employé dans le périmètre (voir point 25). |
| 25 | Collision de code champ personnalisé | ✅ Corrigé ce jour (voir point 25 ci-dessus). |

**⚠️ Faille supplémentaire trouvée en creusant le point 8/13** : `EmployeeChampsPersonnalisesView.patch()` ([`employees/views.py`](backend/employees/views.py)) faisait un `update_or_create()` directement sur `request.data.items()` **sans valider la longueur de la valeur** envoyée pour un champ personnalisé — `EmployeeChampValeur.valeur` est un `CharField(max_length=500)`, donc une valeur plus longue provoquait une `DataError` Postgres non rattrapée (500 non géré, contrairement au pattern déjà en place pour les autres vues depuis le point 8/12 — logguée mais pas de message générique propre au client). Impact limité (ADMIN uniquement) mais incohérent avec le reste de l'API qui valide systématiquement la longueur des champs via les serializers `ModelSerializer` (cette vue n'en utilise pas).

**Correctif appliqué (avec accord préalable)** : ajout d'une vérification explicite `len(valeur) > 500` avant l'upsert, retournant un 400 avec message clair au lieu de laisser Postgres lever une erreur non gérée. 188/188 tests backend toujours au vert après le correctif.

**Point mineur documenté, non corrigé (§13)** : `EmployeeChampValeur.objects.update_or_create()` dans cette même vue n'est pas englobé dans `transaction.atomic()`/`select_for_update()` — deux `PATCH` strictement concurrents sur le même `(employee, champ)` pourraient théoriquement lever une `IntegrityError` sur la contrainte `unique_together` plutôt que de s'enchaîner proprement. Vue réservée à l'ADMIN, usage typiquement séquentiel (un formulaire à la fois) — risque très faible, dans la même veine que le résidu déjà documenté au point 13 pour le premier upload de document. Non corrigé, à réévaluer si l'usage change (ex. édition multi-onglets simultanée).

**Verdict global : 24 des 25 points précédents confirmés intacts sans régression ; 1 faille réelle supplémentaire trouvée et corrigée (validation de longueur manquante sur `EmployeeChampsPersonnalisesView`) ; 1 point mineur documenté sans correctif (race condition à très faible risque, ADMIN-only).**

---

## 27. Consentement Loi 18-07 obligatoire avant tout accès (2026-08-27) — ✅ Implémenté

**Demande** : bloquer l'accès à SOMIZ (tous rôles, y compris ADMIN) tant qu'un utilisateur n'a pas explicitement consenti au traitement de ses données personnelles, conformément à la Loi n°18-07 du 10 juin 2018 (Algérie). Un seul consentement à vie par compte, y compris pour les comptes créés avant ce chantier (jamais consentis juridiquement).

**Implémentation** :
- `User.consent_loi1807_accepted_at` (DateTimeField, `null=True`) — `null` = jamais consenti, sans backfill pour les comptes existants (migration `0008_user_consent_loi1807_accepted_at`).
- `POST /api/auth/consent/` (`ConsentView`, `IsAuthenticated`) enregistre la date et journalise `AuditLog.Action.CONSENT`.
- `LoginView`/`UserMeView` exposent `needs_consent: bool`.
- Frontend : page `/consentement` (case à cocher + boutons Accepter/Refuser), `ProtectedRoute` redirige systématiquement vers `/consentement` si `user.needs_consent` est vrai (sauf sur `/consentement` elle-même).

**⚠️ Point trouvé pendant l'implémentation (corrigé avant merge)** : le plan initial ajoutait une permission `HasConsented` à `REST_FRAMEWORK['DEFAULT_PERMISSION_CLASSES']`, en supposant que cela suffirait à bloquer toute l'API. Un test d'intégration (`test_unconsented_user_blocked_on_protected_route`) a révélé que **la quasi-totalité des vues métier** (`employees/views.py`, `referentiel_views.py`, `import_views.py`, `audit/views.py`, `admin_views.py`) déclarent `permission_classes = [IsAdmin]` ou `[IsAdminOrConsultant]` **explicitement** — en DRF, `permission_classes` déclaré sur une vue **remplace entièrement** le défaut global, il ne s'y ajoute pas. `HasConsented` seule dans `DEFAULT_PERMISSION_CLASSES` n'aurait donc protégé que les quelques vues sans `permission_classes` propre (`LoginView`/`refresh` déjà `AllowAny`, `LogoutView`/`UserMeView`/`ChangePasswordView` déjà `IsAuthenticated`) — c'est-à-dire quasiment aucune vue exposant des données réelles. Un utilisateur non consentant aurait donc pu continuer à consulter `/api/employees/`, documents, contrats, etc. sans blocage réel.

**Correctif appliqué** : le contrôle de consentement est intégré directement dans `IsAdmin.has_permission()` et `IsAdminOrConsultant.has_permission()` (`accounts/permissions.py`) — les deux classes de permission réellement utilisées par toutes les vues métier — plutôt que dans une classe séparée comptant sur le défaut global. `HasConsented` reste définie et branchée dans `DEFAULT_PERMISSION_CLASSES` pour couvrir les futures vues qui n'en déclareraient pas explicitement, mais ce n'est plus le mécanisme de protection principal. Vérifié par `TestHasConsentedIntegration` (bloque `/api/employees/` sans consentement, autorise `logout`/`me`/`consent`) et par la suite complète (236/236 tests backend au vert).

**Verdict : faille de conception trouvée avant merge (blocage non appliqué aux vues métier réelles) grâce aux tests d'intégration prévus au plan, corrigée en déplaçant le contrôle dans les classes de permission effectivement utilisées partout.**

---

## 28. Audit du chantier GRH sync, "Scanner un dossier", transferts d'employé, et re-vérification des fichiers frontend non commités (2026-08-28) — ⚠️ Failles trouvées, non corrigées (en attente de validation)

**Périmètre vérifié** : `backend/employees/grh_integration.py` (nouveau, jamais audité), `backend/employees/urls.py` (route `grh-sync/`), `backend/tests/test_grh_integration.py`, `GRH_INTEGRATION.md`/`docs/GRH_INTEGRATION_SPEC.md` ; `ScanImportView`/`_scan_import_file_name()` (`employees/views.py`), `employees/pdf_utils.py`, sérializers scan-import (`employees/serializers.py`) ; `EmployeeDetailView.perform_update`/`TRANSFER_FIELDS` (`employees/views.py`) ; `git diff HEAD` complet sur `ContratDetail.jsx`, `Dashboard.jsx`, `EmployeeDetail.jsx`, `Employees.jsx`, `Organigramme.jsx`, `Parametres.jsx`, `Users.jsx`.

### 1. Intégration GRH (`grh_integration.py`) — sain sur l'essentiel, 3 failles + 1 point Info

**Sain** : signature HMAC-SHA256 comparée en temps constant (`hmac.compare_digest`) ; requête non signée rejetée en `401` avant toute écriture ; référentiels inconnus rejetés en `400` (pas de FK silencieusement nulle) ; idempotence propre (`update_or_create` sur `matricule`) ; journalisation systématique (`CREATE_EMP`/`MODIFY_EMP`, `details.source='GRH_SYNC'`) ; `AllowAny` cohérent (appel serveur-à-serveur, la vérification HMAC fait office d'authentification — le consentement Loi 18-07 ne s'applique pas, il n'y a pas d'utilisateur humain derrière) ; route bien placée avant `employees/<str:pk>/` ; ne crée jamais de compte `User` ni de document (périmètre restreint volontairement).

**⚠️ Faille 1 (Moyenne) — Pas de protection anti-rejeu.** La signature HMAC ne porte que sur le corps, sans timestamp/nonce. Une requête interceptée reste rejouable indéfiniment. Impact atténué aujourd'hui par l'idempotence, mais deviendrait exploitable si un champ type `statut`/`date_sortie` piloté par le GRH était ajouté un jour (rejouer un vieux payload pourrait réactiver un employé désactivé côté SOMIZ). *Correctif proposé* : header `X-GRH-Timestamp`, fenêtre ±5 min, timestamp inclus dans le message signé (pattern Stripe/GitHub webhooks).

**⚠️ Faille 2 (Moyenne) — Aucune gestion d'exception autour de `update_or_create()`.** `matricule`/dates non validés en longueur/format avant l'upsert DB — une valeur malformée (bug GRH, ou payload forgé si le secret fuit) lève une exception non rattrapée (500 non géré). Même classe de faille que le point 8 (import CSV), pas encore appliquée ici (fichier postérieur au correctif). *Correctif proposé* : `try/except Exception` + `logger.exception()` + réponse générique (jamais `str(e)`), pattern déjà en place ailleurs.

**⚠️ Faille 3 (Faible) — Endpoint entièrement non throttlé (`throttle_classes = []`).** Justifié par un usage serveur-à-serveur en rafale, mais l'endpoint est `AllowAny` et donc accessible réseau — impact DoS réel très faible (HMAC bloque toute écriture), mais rupture non documentée avec la politique globale (tout le reste de l'API a au moins le throttle `anon` 10/min). *Correctif proposé* : scope `ScopedRateThrottle` dédié généreux (ex. `grh_sync: 120/min`) plutôt qu'une désactivation totale.

**Point Info, non bloquant** : `GRH_WEBHOOK_SECRET` a un défaut faible codé en dur (`dev-only-change-me`), contrairement à `SECRET_KEY`/`DB_PASSWORD` qui n'ont aucun défaut (point 3). Risque mitigé tant que l'intégration reste non branchée en production (voir `GRH_INTEGRATION.md`), mais à traiter avant activation réelle (retirer le défaut, ou lever `ImproperlyConfigured` si `DEBUG=False` et secret encore par défaut).

### 2. Scan-import — sain

`ScanImportView`/sérializers réutilisent le même contrôle MIME par lecture d'octets que l'upload classique (pas de chemin parallèle contournant le point 7), `file_index` borné et vérifié contre le nombre de fichiers réels, plages de pages validées contre le nombre réel de pages (`PdfExtractionError` proprement rattrapée), plafond de 100 pages par import (anti-DoS mémoire pypdf), `permission_classes = [IsAdmin]`, chaque groupe dans son propre `transaction.atomic()`, échec d'un groupe n'annule pas les autres, traçabilité `AuditLog.Action.UPLOAD` (`details.via='scan_import'`). Aucun chemin disque construit à partir d'une entrée utilisateur — `_safe_path_segment()` (point 7) reste le seul point de génération de chemin, non contourné.

**Point mineur (Info)** : pas de plafond de taille cumulée sur un même import (jusqu'à ~20 fichiers × 20 Mo). Chaque fichier reste individuellement plafonné ; ADMIN-only ; non bloquant.

### 3. Transferts d'employé — sain

Capture `old_affectation` faite avant `serializer.save()` (pas de contournement possible côté client). Seuls des libellés (noms Direction/Département/Service/Cellule) exposés dans `details.transfer` — aucune donnée personnelle sensible (pas de salaire, NIN, RIB).

### 4. Fichiers frontend non commités — aucune régression

`ContratDetail.jsx`, `EmployeeDetail.jsx`, `Parametres.jsx`, `Users.jsx` : uniquement le pattern `silent`/`fetch*(true)` documenté dans `CLAUDE.md`, aucun nouvel appel API. `Dashboard.jsx`/`Employees.jsx` : nouveaux filtres `dossier_complet`/`type_manquant`, appliqués côté backend **après** `employee_scope_q()` dans `EmployeeListCreateView.get_queryset()` — scoping CONSULTANT intact sur cette nouvelle voie. `Organigramme.jsx` : refonte visuelle (drill-down horizontal) réutilisant la même logique `isAccessible()`/`accessibleDirIds` déjà auditée au point 24 — pas de changement de calcul d'accessibilité. Aucun `dangerouslySetInnerHTML`/`innerHTML`/`eval` introduit, aucun nouveau `no_log`.

**Verdict : 3 failles réelles dans `grh_integration.py` (rejeu — Moyenne ; exception non gérée — Moyenne ; absence de throttle — Faible) + 1 point Info (secret par défaut faible) ; scan-import, transferts d'employé et diffs frontend sains, aucune correction nécessaire de ce côté. Correctifs GRH non appliqués — en attente de validation utilisateur.**

---

## 29. Re-vérification complète des points 1 à 27 (2026-08-28) — ⚠️ 1 régression mineure trouvée et confirmée hors-git

**Demande** : repasser sur tous les points précédents suite aux chantiers menés depuis le 2026-07-25 (scoping types de documents, sous-dossiers, champs personnalisés, colonnes configurables, photo employé, suppression définitive documents, renommage fichier, responsivité mobile, consentement Loi 18-07, scan-import, transferts d'employé).

**Méthode** : relecture directe du code actuel (pas des résumés) + greps ciblés sur les motifs déjà identifiés comme sensibles dans ce document, pour chacun des points 1-27.

**Résultat point par point :**

| # | Point | Statut |
|---|---|---|
| 1 | XSS | ✅ Intact |
| 2 | Rate limiting (Redis) | ✅ Intact |
| 3 | Secrets en dur | ✅ Intact |
| 4 | Authentification manquante | ✅ Intact — toutes les nouvelles vues (`EmployeePhotoView`, `EmployeeChampsPersonnalisesView`, `ScanImportView`, `FileDetailView`, `GRHEmployeeSyncView`) déclarent `permission_classes`/`get_permissions()` explicitement |
| 5 | Mots de passe | ✅ Intact |
| 6 | IDOR / `no_log` | ✅ Intact — grep `no_log` : zéro résultat |
| 7 | Fichiers média / path traversal | ✅ Intact — le scan-import ne contourne pas `_safe_path_segment()` |
| 8 | Input validation (CSV) | ✅ Intact |
| 9 | Variables d'environnement | ⚠️ **Régression trouvée** (voir détail ci-dessous) |
| 10 | Dépendances vulnérables | 🔄 Non re-scanné (`pip-audit`/`npm audit` non relancés dans cette passe — à refaire si souhaité) |
| 11 | CSRF / CORS | ✅ Intact — `GRHEmployeeSyncView` (`AllowAny` + HMAC) est hors périmètre CSRF par nature (pas de cookie/session), ne contourne rien sur les vues authentifiées |
| 12 | Logs / session / fuite d'exceptions | ✅ Intact |
| 13 | SSRF / race conditions | ✅ Intact — `select_for_update()` toujours en place ; point mineur : `pdf_utils.py` relaie le message d'exception `pypdf` (pas une trace Python brute) dans `failed[].error`, vue ADMIN-only, non bloquant |
| 14 | Rate-limiting consultation | ✅ Intact |
| 15–17, 19, 22, 23 | Infra / charge / MFA / DB privileges / backups / supply chain | ✅ Sans objet, aucun changement d'infra |
| 18 | Timing attack login | ✅ Intact |
| 20 | Purge RGPD | ✅ Intact |
| 21 | En-têtes de sécurité | ✅ Intact |
| 24 | Scoping CONSULTANT | ✅ **Reconfirmé en détail** — le modèle a évolué (3 FK simples → M2M multi-niveaux `scope_directions/poles/departements/services/cellules` + dimension indépendante `scope_types_documents`, voir CLAUDE.md), mais tous les points d'entrée listés dans CLAUDE.md appliquent bien les deux dimensions, y compris les vues introduites depuis (`EmployeePhotoView`, `ScanImportView`, `FileDetailView`) |
| 25 | Collision code champ personnalisé | ✅ Intact |
| 26 | Méta-point | ✅ Sans objet |
| 27 | Consentement Loi 18-07 | ✅ Intact — `IsAdmin`/`IsAdminOrConsultant` vérifient toujours `consent_loi1807_accepted_at` ; aucune vue métier récente n'a de `permission_classes` custom contournant ce contrôle (`GRHEmployeeSyncView` en `AllowAny` est un webhook, pas un utilisateur humain — hors périmètre par nature) |

**⚠️ Régression trouvée — Point 9 (`frontend/.env`)** : `DANGEROUSLY_DISABLE_HOST_CHECK=true` est de nouveau présent dans `frontend/.env`, alors qu'il avait été explicitement retiré au point 9. Ce fichier est gitignoré (jamais tracké, confirmé via `git log --all`) — le retrait initial n'a donc laissé aucune trace versionnée, et sa réapparition ne peut venir que d'une réédition locale (manuelle ou régénérée), pas d'un rollback git. `frontend/.env.example` (committé) reste correct — seul le fichier réel local a dérivé. **Sévérité faible** : réglage du serveur de dev CRA uniquement, sans effet en build de production ; risque réel seulement si `npm start` est exposé au-delà de `localhost` (ex. ngrok, cas déjà discuté au point 9).

**Verdict global : 24 des 25 points substantiels reconfirmés intacts sans régression. Une régression réelle trouvée (point 9, sévérité faible, hors du contrôle git) — en attente de confirmation utilisateur (usage ngrok toujours actif ?) avant de la retirer à nouveau. Une évolution notable du scoping CONSULTANT documentée (toujours correctement appliquée, périmètre élargi depuis la rédaction initiale du point 24).**

---

## 30. Périmètre ponctuel employés spécifiques (`EmployeeAccessGrant`, 2026-08-30)

**Contexte** : nouveau canal d'accès CONSULTANT — `EmployeeAccessGrant`
(`user` + `employee` + `type_doc` optionnel) permet à un ADMIN d'accorder
un accès ponctuel à un employé précis (dossier complet ou un seul type de
document), en plus (union) du périmètre organisationnel existant. Voir
CLAUDE.md, section "Périmètre ponctuel — employés spécifiques".

**Vérification** :
- Gestion (`GET`/`PUT /api/admin-users/<id>/employee-grants/`) strictement
  `permission_classes = [IsAdmin]` — un CONSULTANT ne peut ni lire ni
  modifier les grants, y compris les siens (`test_consultant_forbidden`).
- N'étend que la **portée** du scoping employé/document existant —
  n'ajoute aucun nouveau bypass des vérifications de rôle
  (`IsAdmin`/`IsAdminOrConsultant`) ni du consentement Loi 18-07 (point
  27) : `can_access_employee()`/`accessible_type_doc_ids_for_employee()`
  restent appelées après ces contrôles dans chaque vue, jamais à la place.
- Toute modification de grants est tracée dans l'audit log
  (`AuditLog.Action.MODIFY_USER`, `details.action='employee_grants'`),
  même pattern que les autres changements de périmètre
  (`UserUpdateView.perform_update`).
- `EmployeeAccessGrantSerializer.validate_type_doc()` refuse un
  `type_doc` catégorie (`is_categorie`) — cohérent avec le garde-fou
  déjà en place pour `scope_types_documents` (point 25, collision de
  code) et pour l'import CSV.
- Un grant `type_doc` précis n'élargit l'accès qu'au dossier général
  (`EmployeeDocument.contrat=None`) — vérifié explicitement
  (`test_contrat_documents_not_shown_via_partial_dossier_grant`), pour
  éviter qu'un grant destiné à un seul type de document du dossier
  général ne fuite vers les documents de contrat.
- 27 tests dédiés (`backend/tests/test_employee_access_grants.py`),
  suite complète (263 tests) sans régression sur le scoping existant
  (`test_employee_scoping.py`, `test_accounts_models.py`).

**Verdict : sain.** Nouveau canal d'accès correctement isolé derrière
`IsAdmin` pour sa gestion, n'introduit aucun contournement des contrôles
d'authentification/consentement existants, tracé en audit.

---

## À vérifier (en attente)

_(les points suivants seront ajoutés au fur et à mesure des demandes)_
