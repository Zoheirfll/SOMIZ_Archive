# Écran de consentement Loi 18-07 (Algérie)

Date : 2026-08-27

## Contexte

La Loi n°18-07 du 10 juin 2018 (Algérie) relative à la protection des
personnes physiques dans le traitement des données à caractère personnel
impose de recueillir le consentement de la personne concernée avant tout
traitement de ses données personnelles. SOMIZ traite des données RH
(documents, contrats, informations administratives) pour chaque
utilisateur ayant un compte. Aucun mécanisme de consentement n'existe
aujourd'hui.

## Objectif

Bloquer l'accès à toute donnée de l'application tant qu'un utilisateur
(ADMIN ou CONSULTANT) n'a pas explicitement donné son consentement — une
seule fois par compte, à vie (pas de version du texte à gérer pour
l'instant). S'applique aussi bien aux nouveaux comptes qu'aux comptes
existants (qui n'ont jamais formellement consenti).

## Backend

### Modèle

`accounts/models.py` — `User` :
```python
consent_loi1807_accepted_at = models.DateTimeField(null=True, blank=True)
```
`null` = consentement jamais donné. Migration Django standard, pas de
backfill : tous les comptes existants repartent avec `null` et seront
invités à consentir à leur prochaine connexion.

### Endpoint

`POST /api/auth/consent/` (nouvelle `ConsentView`, `accounts/views.py`) :
- Permission : `IsAuthenticated` (bypass explicite de `HasConsented`, voir
  ci-dessous — sinon l'utilisateur ne pourrait jamais consentir).
- Enregistre `request.user.consent_loi1807_accepted_at = timezone.now()`
  et sauvegarde (`update_fields=['consent_loi1807_accepted_at']`).
- Log `AuditLog.Action.CONSENT` (nouveau choix dans `audit/models.py`,
  `'CONSENT', 'Consentement Loi 18-07 accepté'`).
- Réponse : `{'message': 'Consentement enregistré.'}`.
- Route ajoutée dans `accounts/urls.py`.

### Permission globale

Nouvelle permission `HasConsented` (`accounts/permissions.py`) :
```python
class HasConsented(BasePermission):
    message = "Consentement au traitement des données personnelles requis (Loi 18-07)."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.consent_loi1807_accepted_at)
```
Ajoutée à `REST_FRAMEWORK['DEFAULT_PERMISSION_CLASSES']` dans
`config/settings.py`, en plus de `IsAuthenticated` :
```python
'DEFAULT_PERMISSION_CLASSES': (
    'rest_framework.permissions.IsAuthenticated',
    'accounts.permissions.HasConsented',
),
```
Cela bloque (403) **toutes** les vues API par défaut tant que le
consentement n'a pas été donné — c'est la vraie barrière de sécurité
(défense en profondeur : le frontend ne fait que guider l'UX).

**Vues exemptées** (permission_classes réécrits explicitement, elles
restent nécessaires avant/pendant le blocage) :
- `LoginView`, `CookieTokenRefreshView` — déjà `AllowAny`, non affectées.
- `LogoutView` — `permission_classes = [IsAuthenticated]` (l'utilisateur
  bloqué doit pouvoir se déconnecter).
- `UserMeView` — `permission_classes = [IsAuthenticated]` (le frontend a
  besoin de lire `needs_consent` sans être lui-même bloqué par un 403).
- `ConsentView` (nouvelle) — `permission_classes = [IsAuthenticated]`.

Toutes les autres vues (employees, documents, contrats, users, audit,
référentiels...) héritent du défaut et sont donc automatiquement
couvertes sans modification individuelle.

### Réponses exposant l'état de consentement

- `LoginView.post()` : ajoute `needs_consent` dans le payload `user`
  retourné (`not bool(user.consent_loi1807_accepted_at)`).
- `UserMeView.get()` : ajoute le même champ `needs_consent`.

## Frontend

### Page `/consentement`

Nouveau composant `frontend/src/pages/Consentement.jsx` :
- Page plein écran, pas de `Navbar`, hero header vert (cohérent avec le
  design system existant — voir pattern hero header dans `CLAUDE.md`).
- Bloc de texte structuré :
  1. Référence légale : Loi n°18-07 du 10 juin 2018 (Algérie).
  2. Responsable du traitement : l'organisme employeur, via SOMIZ.
  3. Finalités : gestion administrative du dossier RH (archivage de
     documents, contrats, informations employé).
  4. Données concernées : identité, documents administratifs, données de
     contrat.
  5. Droits de la personne concernée (accès, rectification, opposition —
     à exercer auprès du service RH).
  6. Durée de conservation : durée de la relation contractuelle + délais
     légaux applicables.
- Case à cocher : *"J'ai lu et j'accepte le traitement de mes données
  personnelles conformément à la Loi 18-07."* — le bouton "J'accepte" est
  désactivé tant qu'elle n'est pas cochée.
- Bouton **"J'accepte"** : `POST /api/auth/consent/`, puis redirection
  vers la page initialement demandée (ou route par défaut selon rôle si
  aucune n'était mémorisée).
- Bouton **"Refuser"** (secondaire) : `useConfirm()` ("Refuser entraînera
  votre déconnexion, continuer ?") → si confirmé, `POST /logout/` puis
  redirection `/login`.
- Erreur réseau sur `POST /consent/` : message d'erreur inline sous le
  bouton, pas de redirection tant que la réponse serveur n'est pas reçue
  avec succès.

### Garde de route

Dans `App.js` (ou un composant `RequireConsent` dédié, même emplacement
que la garde d'authentification existante) : si l'utilisateur est
authentifié et `user.needs_consent === true`, et que la route active
n'est pas `/consentement`, redirection forcée vers `/consentement`
(mémorisant la route demandée pour y revenir après acceptation).

### Intercepteur Axios

Un appel API renvoyant 403 avec le message de `HasConsented` (désync
cache côté client, ex. onglet resté ouvert) déclenche une redirection
globale vers `/consentement`, comme le fait déjà l'intercepteur existant
pour les 401.

## Audit

Nouveau type `AuditLog.Action.CONSENT` (`audit/models.py`), loggé à
chaque acceptation via `ConsentView`. Visible dans `/audit` comme les
autres actions.

## Tests

### Backend (`backend/tests/`)
- `HasConsented` bloque (403) une requête sur une route protégée
  existante (ex. `/api/employees/`) pour un utilisateur sans consentement.
- `HasConsented` n'affecte pas `/api/auth/login/`, `/api/auth/refresh/`,
  `/api/auth/logout/`, `/api/auth/me/`, `/api/auth/consent/`.
- `ConsentView` enregistre `consent_loi1807_accepted_at`, retourne 200,
  et crée une entrée `AuditLog` de type `CONSENT`.
- Un compte existant (migration, `consent_loi1807_accepted_at=None`) est
  bien bloqué au premier appel API post-migration.
- `LoginView`/`UserMeView` exposent correctement `needs_consent`.

### Frontend (`frontend/src/__tests__/`)
- `RequireConsent` redirige vers `/consentement` quand `needs_consent`
  est vrai, ne redirige pas sinon.
- Le bouton "J'accepte" est désactivé tant que la case n'est pas cochée,
  actif une fois cochée.
- Cliquer "J'accepte" appelle `POST /api/auth/consent/` puis redirige.
- Cliquer "Refuser" ouvre la modale de confirmation (`useConfirm`), et
  déclenche la déconnexion seulement si confirmé.

## Hors périmètre

- Pas de versionnage du texte de consentement (si le texte change plus
  tard, une politique de re-consentement devra être conçue séparément).
- Pas de validation juridique du texte affiché — à faire relire par un
  juriste avant mise en production si nécessaire.
