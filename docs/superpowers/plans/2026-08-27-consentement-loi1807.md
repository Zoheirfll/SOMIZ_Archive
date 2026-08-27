# Écran de consentement Loi 18-07 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloquer l'accès à SOMIZ (backend + frontend) tant qu'un utilisateur n'a pas explicitement consenti au traitement de ses données personnelles, conformément à la Loi 18-07 (Algérie).

**Architecture:** Un champ `consent_loi1807_accepted_at` sur `User` (null = pas consenti). Une permission DRF `HasConsented` ajoutée au défaut global bloque toute l'API sauf une poignée de vues exemptées (login, refresh, logout, me, consent). Le frontend expose une page `/consentement` et redirige vers elle tant que `needs_consent` est vrai.

**Tech Stack:** Django 4.2 / DRF 3.15 (backend), React 19 + React Router 7 + Axios (frontend), pytest (backend tests), Jest + RTL (frontend tests).

## Global Constraints

- Consentement unique par compte, à vie (pas de versionnage du texte) — spec section "Objectif".
- S'applique à TOUS les rôles (ADMIN inclus), y compris les comptes existants (`null` par défaut, pas de backfill) — spec section "Backend > Modèle".
- Styles inline uniquement (`style={{}}`), tokens depuis `frontend/src/styles/theme.js`, jamais de hex en dur — `CLAUDE.md`.
- `window.confirm()`/`window.prompt()` interdits — utiliser `useConfirm()`/`usePrompt()` de `components/ConfirmDialog.jsx` — `CLAUDE.md`.
- Après toute modification touchant `accounts` (permissions, modèle) : lancer la suite complète backend avant de considérer la tâche terminée — `CLAUDE.md`.

---

### Task 1: Modèle `User.consent_loi1807_accepted_at` + migration + fixtures de test

**Files:**
- Modify: `backend/accounts/models.py` (ajout du champ, après `date_joined` ligne ~69)
- Create: `backend/accounts/migrations/0008_user_consent_loi1807_accepted_at.py`
- Modify: `backend/tests/conftest.py` (fixtures `admin_user`, `consultant_user`)
- Modify: `backend/tests/test_employee_scoping.py` (fixture `scoped_consultant`)
- Test: `backend/tests/test_accounts_models.py`

**Interfaces:**
- Produces: `User.consent_loi1807_accepted_at` (DateTimeField, null=True, blank=True) — utilisé par Task 2 (`HasConsented`) et Task 3 (`ConsentView`).

- [ ] **Step 1: Ajouter le champ au modèle**

Dans `backend/accounts/models.py`, juste après la ligne `date_joined = models.DateTimeField(default=timezone.now)` :

```python
    is_active = models.BooleanField(default=True, verbose_name="Compte actif")
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    # Loi 18-07 (Algérie) — consentement au traitement des données
    # personnelles, requis avant tout accès. null = jamais consenti.
    # Un seul consentement à vie par compte (pas de versionnage du texte).
    consent_loi1807_accepted_at = models.DateTimeField(
        null=True, blank=True, verbose_name="Consentement Loi 18-07 accepté le"
    )
```

- [ ] **Step 2: Générer la migration**

Run: `cd backend && python manage.py makemigrations accounts`
Expected: crée `accounts/migrations/0008_user_consent_loi1807_accepted_at.py` (le nom exact peut varier légèrement selon Django — vérifier qu'un seul fichier de migration est créé, avec `AddField` sur `consent_loi1807_accepted_at`, `null=True`).

- [ ] **Step 3: Mettre à jour les fixtures de test pour rester "déjà consenties"**

Ces fixtures représentent des comptes qui utilisent déjà SOMIZ dans des tests qui ne portent pas sur le consentement — sans ce correctif, l'ajout de `HasConsented` (Task 2) ferait échouer une grande partie de la suite existante (403 partout). Dans `backend/tests/conftest.py` :

```python
@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="admin_test",
        password="AdminPass123!",
        nom="Admin",
        prenom="Test",
        role="ADMIN",
        consent_loi1807_accepted_at=timezone.now(),
    )


@pytest.fixture
def consultant_user(db):
    return User.objects.create_user(
        username="consultant_test",
        password="ConsultPass123!",
        nom="Consultant",
        prenom="Test",
        role="CONSULTANT",
        consent_loi1807_accepted_at=timezone.now(),
    )
```

Ajouter l'import en haut du fichier si absent : `from django.utils import timezone`.

Dans `backend/tests/test_employee_scoping.py`, fixture `scoped_consultant` :

```python
@pytest.fixture
def scoped_consultant(db):
    """Consultant sans périmètre assigné par défaut (affecté dans chaque test)."""
    return User.objects.create_user(
        username="scoped_consultant",
        password="ScopedPass123!",
        nom="Scope",
        prenom="Test",
        role="CONSULTANT",
        consent_loi1807_accepted_at=timezone.now(),
    )
```

Ajouter l'import en haut du fichier si absent : `from django.utils import timezone`.

- [ ] **Step 4: Écrire le test du modèle**

Dans `backend/tests/test_accounts_models.py`, ajouter :

```python
class TestConsentLoi1807:
    def test_new_user_has_no_consent_by_default(self, db):
        user = User.objects.create_user(
            username="nouveau", password="Pass1234!", nom="N", prenom="N",
        )
        assert user.consent_loi1807_accepted_at is None

    def test_consent_can_be_recorded(self, db):
        from django.utils import timezone
        user = User.objects.create_user(
            username="nouveau2", password="Pass1234!", nom="N", prenom="N",
        )
        now = timezone.now()
        user.consent_loi1807_accepted_at = now
        user.save(update_fields=["consent_loi1807_accepted_at"])
        user.refresh_from_db()
        assert user.consent_loi1807_accepted_at is not None
```

(Vérifier en tête de `test_accounts_models.py` que `User` est déjà importé via `get_user_model()` — sinon ajouter `User = get_user_model()` au niveau module, pattern déjà utilisé dans les autres fichiers de tests.)

- [ ] **Step 5: Appliquer la migration et lancer les tests**

Run: `cd backend && python manage.py migrate accounts && pytest tests/test_accounts_models.py -v`
Expected: migration appliquée sans erreur, tests `TestConsentLoi1807` PASS.

- [ ] **Step 6: Lancer la suite complète pour vérifier l'absence de régression**

Run: `cd backend && pytest -q`
Expected: tous les tests passent (les fixtures `admin_user`/`consultant_user`/`scoped_consultant` sont maintenant "consenties" donc aucune régression liée à ce champ — `HasConsented` n'existe pas encore à ce stade donc rien ne devrait de toute façon être bloqué).

- [ ] **Step 7: Commit**

```bash
git add backend/accounts/models.py backend/accounts/migrations/ backend/tests/conftest.py backend/tests/test_employee_scoping.py backend/tests/test_accounts_models.py
git commit -m "feat(accounts): ajoute le champ consent_loi1807_accepted_at sur User"
```

---

### Task 2: Permission `HasConsented` + branchement global + exemptions

**Files:**
- Modify: `backend/accounts/permissions.py` (ajout de `HasConsented`)
- Modify: `backend/config/settings.py` (`DEFAULT_PERMISSION_CLASSES`)
- Modify: `backend/accounts/views.py` (`LogoutView`, `UserMeView` — exemption explicite)
- Test: `backend/tests/test_permissions.py`

**Interfaces:**
- Consumes: `User.consent_loi1807_accepted_at` (Task 1).
- Produces: `accounts.permissions.HasConsented` — classe de permission DRF réutilisable, message `"Consentement au traitement des données personnelles requis (Loi 18-07)."`.

- [ ] **Step 1: Écrire le test de la permission (échec attendu)**

Dans `backend/tests/test_permissions.py`, regarder d'abord la fin du fichier pour respecter le style existant, puis ajouter :

```python
class TestHasConsented:
    def test_blocks_user_without_consent(self, db):
        from accounts.permissions import HasConsented
        from django.contrib.auth import get_user_model
        from unittest.mock import Mock

        User = get_user_model()
        user = User.objects.create_user(
            username="sans_consent", password="Pass1234!", nom="N", prenom="N",
        )
        request = Mock(user=user)
        assert HasConsented().has_permission(request, None) is False

    def test_allows_user_with_consent(self, db):
        from accounts.permissions import HasConsented
        from django.contrib.auth import get_user_model
        from django.utils import timezone
        from unittest.mock import Mock

        User = get_user_model()
        user = User.objects.create_user(
            username="avec_consent", password="Pass1234!", nom="N", prenom="N",
            consent_loi1807_accepted_at=timezone.now(),
        )
        request = Mock(user=user)
        assert HasConsented().has_permission(request, None) is True
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd backend && pytest tests/test_permissions.py::TestHasConsented -v`
Expected: FAIL avec `ImportError: cannot import name 'HasConsented'`.

- [ ] **Step 3: Implémenter `HasConsented`**

Dans `backend/accounts/permissions.py`, ajouter à la fin du fichier :

```python
class HasConsented(BasePermission):
    """Bloque toute requête tant que l'utilisateur n'a pas donné son
    consentement au traitement de ses données personnelles (Loi 18-07,
    Algérie). Un consentement unique à vie par compte — voir
    accounts.models.User.consent_loi1807_accepted_at."""
    message = "Consentement au traitement des données personnelles requis (Loi 18-07)."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.consent_loi1807_accepted_at)
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `cd backend && pytest tests/test_permissions.py::TestHasConsented -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Brancher `HasConsented` dans les permissions par défaut**

Dans `backend/config/settings.py`, remplacer :

```python
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
```

par :

```python
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
        'accounts.permissions.HasConsented',
    ),
```

- [ ] **Step 6: Exempter `LogoutView` et `UserMeView`**

Dans `backend/accounts/views.py`, ajouter l'import en haut du fichier :

```python
from rest_framework.permissions import AllowAny, IsAuthenticated
```
(déjà présent — vérifier qu'il l'est). Puis modifier les deux classes :

```python
class LogoutView(APIView):
    """POST /api/auth/logout/ — Blackliste le refresh token et efface les cookies.
    Reste accessible même sans consentement Loi 18-07 (un utilisateur bloqué
    doit pouvoir se déconnecter)."""
    permission_classes = [IsAuthenticated]
```

(inchangé en fait — `LogoutView` a déjà `permission_classes = [IsAuthenticated]` explicitement, donc il **écrase** déjà le défaut global et n'hérite pas de `HasConsented`. Vérifier que c'est bien le cas en relisant le fichier avant de modifier quoi que ce soit — ne toucher que le commentaire pour documenter l'intention.)

```python
class UserMeView(APIView):
    """GET /api/auth/me/ — Infos de l'utilisateur connecté.
    Reste accessible même sans consentement Loi 18-07 (le frontend doit
    pouvoir lire needs_consent sans être lui-même bloqué par un 403)."""
    permission_classes = [IsAuthenticated]
```

(Idem — `UserMeView` a déjà `permission_classes = [IsAuthenticated]` explicite. Confirmer via lecture du fichier avant modification ; si par erreur ce n'était pas le cas, l'ajouter explicitement.)

- [ ] **Step 7: Écrire les tests d'intégration du blocage global**

Dans `backend/tests/test_accounts_views.py`, ajouter (après les classes existantes) :

```python
class TestHasConsentedIntegration:
    def test_unconsented_user_blocked_on_protected_route(self, db):
        user = User.objects.create_user(
            username="bloque_test", password="Pass1234!", nom="N", prenom="N", role="ADMIN",
        )
        client = auth_client(user)
        resp = client.get("/api/employees/")
        assert resp.status_code == 403

    def test_unconsented_user_can_still_call_me(self, db):
        user = User.objects.create_user(
            username="bloque_me", password="Pass1234!", nom="N", prenom="N",
        )
        client = auth_client(user)
        resp = client.get(ME_URL)
        assert resp.status_code == 200

    def test_unconsented_user_can_still_logout(self, db):
        user = User.objects.create_user(
            username="bloque_logout", password="Pass1234!", nom="N", prenom="N",
        )
        client = auth_client(user)
        resp = client.post(LOGOUT_URL)
        assert resp.status_code == 200

    def test_consented_admin_not_blocked(self, admin_user):
        client = auth_client(admin_user)
        resp = client.get("/api/employees/")
        assert resp.status_code == 200
```

- [ ] **Step 8: Lancer les nouveaux tests**

Run: `cd backend && pytest tests/test_accounts_views.py::TestHasConsentedIntegration -v`
Expected: 4 tests PASS.

- [ ] **Step 9: Lancer la suite complète backend**

Run: `cd backend && pytest -q`
Expected: tous les tests passent (grâce aux fixtures corrigées en Task 1). Si des tests échouent avec 403 inattendu, c'est qu'un fixture ou un `User.objects.create_user(...)` direct dans un autre fichier de test crée un utilisateur non consenti utilisé sur une route protégée — l'identifier et lui ajouter `consent_loi1807_accepted_at=timezone.now()`, au même titre que Task 1 Step 3.

- [ ] **Step 10: Commit**

```bash
git add backend/accounts/permissions.py backend/config/settings.py backend/accounts/views.py backend/tests/test_permissions.py backend/tests/test_accounts_views.py
git commit -m "feat(accounts): bloque l'API pour tout utilisateur sans consentement Loi 18-07"
```

---

### Task 3: `ConsentView` + route + audit + exposition `needs_consent`

**Files:**
- Modify: `backend/accounts/views.py` (nouvelle `ConsentView`, `LoginView.post`, `UserMeView.get`)
- Modify: `backend/accounts/urls.py`
- Modify: `backend/audit/models.py` (nouveau choix `Action.CONSENT`)
- Modify: `backend/audit/migrations/` (nouvelle migration si `choices` est validé en DB — sinon aucune migration nécessaire, `TextChoices` n'affecte pas le schéma ; vérifier avant d'en créer une)
- Test: `backend/tests/test_accounts_views.py`, `backend/tests/test_audit_models.py`

**Interfaces:**
- Consumes: `User.consent_loi1807_accepted_at` (Task 1), `AuditLog.log()` (existant).
- Produces: `POST /api/auth/consent/` → `{'message': 'Consentement enregistré.'}` (200) ; `LoginView`/`UserMeView` exposent désormais `needs_consent: bool` — consommé par le frontend (Task 4, Task 5).

- [ ] **Step 1: Ajouter le choix d'audit `CONSENT`**

Lire `backend/audit/models.py` autour de `class Action(models.TextChoices)` pour confirmer le format exact, puis ajouter une ligne :

```python
        DELETE_USER = 'DELETE_USER', 'Suppression utilisateur'
        CONSENT = 'CONSENT', 'Consentement Loi 18-07 accepté'
```

`TextChoices` avec un `CharField` de longueur suffisante ne nécessite pas de migration Django (aucune contrainte DB générée depuis les choix) — vérifier que le champ `action` dans `AuditLog` n'a pas de contrainte `choices` répercutée en DB (`max_length` doit être ≥ 7 pour `"CONSENT"`, déjà le cas puisque `"LOGIN_FAIL"` fait 10 caractères). Ne pas générer de migration pour ce seul ajout.

- [ ] **Step 2: Écrire le test d'audit pour le nouveau choix**

Dans `backend/tests/test_audit_models.py`, ajouter :

```python
def test_consent_action_choice_exists():
    from audit.models import AuditLog
    assert AuditLog.Action.CONSENT == 'CONSENT'
```

- [ ] **Step 3: Lancer ce test**

Run: `cd backend && pytest tests/test_audit_models.py::test_consent_action_choice_exists -v`
Expected: PASS.

- [ ] **Step 4: Écrire le test de `ConsentView` (échec attendu)**

Dans `backend/tests/test_accounts_views.py`, ajouter :

```python
CONSENT_URL = "/api/auth/consent/"


class TestConsentView:
    def test_records_consent_and_logs_audit(self, db):
        from audit.models import AuditLog
        user = User.objects.create_user(
            username="consent_flow", password="Pass1234!", nom="N", prenom="N",
        )
        client = auth_client(user)
        resp = client.post(CONSENT_URL)
        assert resp.status_code == 200
        user.refresh_from_db()
        assert user.consent_loi1807_accepted_at is not None
        assert AuditLog.objects.filter(action=AuditLog.Action.CONSENT, user=user).exists()

    def test_consent_then_protected_route_allowed(self, db):
        user = User.objects.create_user(
            username="consent_then_access", password="Pass1234!", nom="N", prenom="N", role="ADMIN",
        )
        client = auth_client(user)
        client.post(CONSENT_URL)
        resp = client.get("/api/employees/")
        assert resp.status_code == 200
```

- [ ] **Step 5: Lancer le test pour vérifier l'échec**

Run: `cd backend && pytest tests/test_accounts_views.py::TestConsentView -v`
Expected: FAIL avec 404 (route inexistante).

- [ ] **Step 6: Implémenter `ConsentView`**

Dans `backend/accounts/views.py`, ajouter après `UserMeView` :

```python
class ConsentView(APIView):
    """
    POST /api/auth/consent/
    Enregistre le consentement Loi 18-07 de l'utilisateur connecté.
    Accessible même sans consentement préalable (sinon impossible de
    jamais consentir).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.consent_loi1807_accepted_at = timezone.now()
        request.user.save(update_fields=['consent_loi1807_accepted_at'])
        AuditLog.log(request, AuditLog.Action.CONSENT, target=request.user)
        return Response({'message': 'Consentement enregistré.'})
```

- [ ] **Step 7: Ajouter la route**

Dans `backend/accounts/urls.py` :

```python
from accounts.views import (
    LoginView, LogoutView, UserMeView, ChangePasswordView,
    CookieTokenRefreshView, ConsentView,
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('refresh/', CookieTokenRefreshView.as_view(), name='auth-refresh'),
    path('me/', UserMeView.as_view(), name='auth-me'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('consent/', ConsentView.as_view(), name='auth-consent'),
]
```

- [ ] **Step 8: Lancer les tests de `ConsentView`**

Run: `cd backend && pytest tests/test_accounts_views.py::TestConsentView -v`
Expected: 2 tests PASS.

- [ ] **Step 9: Écrire les tests d'exposition `needs_consent`**

Dans `backend/tests/test_accounts_views.py` :

```python
class TestNeedsConsentExposed:
    def test_login_exposes_needs_consent_true(self, db):
        User.objects.create_user(
            username="besoin_consent", password="Pass1234!", nom="N", prenom="N",
        )
        client = APIClient()
        resp = client.post(LOGIN_URL, {"username": "besoin_consent", "password": "Pass1234!"})
        assert resp.data["user"]["needs_consent"] is True

    def test_login_exposes_needs_consent_false(self, admin_user):
        client = APIClient()
        resp = client.post(LOGIN_URL, {"username": "admin_test", "password": "AdminPass123!"})
        assert resp.data["user"]["needs_consent"] is False

    def test_me_exposes_needs_consent(self, admin_user):
        client = auth_client(admin_user)
        resp = client.get(ME_URL)
        assert resp.data["needs_consent"] is False
```

- [ ] **Step 10: Lancer ces tests pour vérifier l'échec**

Run: `cd backend && pytest tests/test_accounts_views.py::TestNeedsConsentExposed -v`
Expected: FAIL (`KeyError: 'needs_consent'`).

- [ ] **Step 11: Exposer `needs_consent` dans `LoginView` et `UserMeView`**

Dans `LoginView.post`, modifier le dict `user` de la réponse :

```python
        response = Response({
            'user': {
                'id': str(user.id),
                'username': user.username,
                'nom': user.nom,
                'prenom': user.prenom,
                'role': user.role,
                'needs_consent': not bool(user.consent_loi1807_accepted_at),
            }
        })
```

Dans `UserMeView.get` :

```python
    def get(self, request):
        user = request.user
        return Response({
            'id': str(user.id),
            'username': user.username,
            'full_name': user.full_name,
            'role': user.role,
            'is_admin': user.is_admin,
            'needs_consent': not bool(user.consent_loi1807_accepted_at),
        })
```

- [ ] **Step 12: Lancer les tests pour vérifier le succès**

Run: `cd backend && pytest tests/test_accounts_views.py::TestNeedsConsentExposed -v`
Expected: 3 tests PASS.

- [ ] **Step 13: Lancer la suite complète backend**

Run: `cd backend && pytest -q`
Expected: tous les tests passent.

- [ ] **Step 14: Commit**

```bash
git add backend/accounts/views.py backend/accounts/urls.py backend/audit/models.py backend/tests/test_accounts_views.py backend/tests/test_audit_models.py
git commit -m "feat(accounts): endpoint de consentement Loi 18-07 + exposition needs_consent"
```

---

### Task 4: Page frontend `/consentement`

**Files:**
- Create: `frontend/src/pages/Consentement.jsx`
- Test: `frontend/src/__tests__/Consentement.test.jsx`

**Interfaces:**
- Consumes: `api` (`frontend/src/services/api.js`, instance axios par défaut, `POST /auth/consent/`), `logout` (`frontend/src/services/auth.js`), `useAuth()` (`logoutSuccess`), `useConfirm()` (`frontend/src/components/ConfirmDialog.jsx`), `theme` (`frontend/src/styles/theme.js`), `useIsMobile` (`frontend/src/hooks/useIsMobile.js`).
- Produces: composant `Consentement` (default export) monté sur la route `/consentement` — consommé par Task 5 (`App.js`) et Task 6 (`ProtectedRoute`).

- [ ] **Step 1: Écrire le test du rendu et de l'état initial**

Créer `frontend/src/__tests__/Consentement.test.jsx` :

```jsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Consentement from "../pages/Consentement";
import api from "../services/api";

jest.mock("../services/api");

const renderPage = () =>
  render(
    <MemoryRouter>
      <Consentement />
    </MemoryRouter>
  );

describe("Consentement", () => {
  it("désactive le bouton J'accepte tant que la case n'est pas cochée", () => {
    renderPage();
    const acceptButton = screen.getByRole("button", { name: /j'accepte/i });
    expect(acceptButton).toBeDisabled();
  });

  it("active le bouton J'accepte une fois la case cochée", () => {
    renderPage();
    fireEvent.click(screen.getByRole("checkbox"));
    const acceptButton = screen.getByRole("button", { name: /j'accepte/i });
    expect(acceptButton).not.toBeDisabled();
  });

  it("appelle POST /auth/consent/ quand on clique sur J'accepte", async () => {
    api.post.mockResolvedValueOnce({ data: { message: "ok" } });
    renderPage();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /j'accepte/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/consent/"));
  });

  it("affiche une erreur si l'appel échoue, sans rediriger", async () => {
    api.post.mockRejectedValueOnce(new Error("network"));
    renderPage();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /j'accepte/i }));
    await waitFor(() =>
      expect(screen.getByText(/erreur/i)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd frontend && npx jest Consentement.test.jsx`
Expected: FAIL (le module `../pages/Consentement` n'existe pas).

- [ ] **Step 3: Implémenter `Consentement.jsx`**

Créer `frontend/src/pages/Consentement.jsx` :

```jsx
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../services/api";
import { logout } from "../services/auth";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import { theme } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";

const Consentement = () => {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { logoutSuccess, user, refreshUser } = useAuth() || {};
  const { confirm, ConfirmDialog } = useConfirm();
  const isMobile = useIsMobile();

  const handleAccept = async () => {
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/consent/");
      if (refreshUser) await refreshUser();
      const redirectTo = location.state?.from || "/employees";
      navigate(redirectTo, { replace: true });
    } catch {
      setError("Une erreur est survenue, merci de réessayer.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefuse = async () => {
    if (!(await confirm("Refuser entraînera votre déconnexion, continuer ?"))) return;
    await logout();
    logoutSuccess && logoutSuccess();
    navigate("/login", { replace: true });
  };

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, fontFamily: theme.fontFamily }}>
      <div
        style={{
          background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
          padding: isMobile ? "28px 20px 24px" : "40px 32px 32px",
        }}
      >
        <h1 style={{ color: "#fff", fontWeight: 800, fontSize: 24, margin: 0, letterSpacing: "-0.02em" }}>
          Protection de vos données personnelles
        </h1>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 6 }}>
          Loi n°18-07 du 10 juin 2018 (Algérie)
        </div>
      </div>

      <div style={{ padding: isMobile ? "20px" : "32px", maxWidth: 720, margin: "0 auto" }}>
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 16,
            padding: isMobile ? 20 : 28,
            boxShadow: theme.shadowMd,
            color: theme.text,
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          <p>
            Conformément à la Loi n°18-07 du 10 juin 2018 relative à la protection des
            personnes physiques dans le traitement des données à caractère personnel,
            nous vous informons des éléments suivants avant tout accès à votre compte SOMIZ.
          </p>
          <p>
            <strong>Responsable du traitement :</strong> votre organisme employeur, via
            l'application SOMIZ (Système d'Archivage des Dossiers RH).
          </p>
          <p>
            <strong>Finalités :</strong> gestion administrative de votre dossier des
            ressources humaines (archivage de documents, contrats, informations relatives
            à votre situation professionnelle).
          </p>
          <p>
            <strong>Données concernées :</strong> vos données d'identité, vos documents
            administratifs et les données relatives à votre contrat de travail.
          </p>
          <p>
            <strong>Vos droits :</strong> vous disposez d'un droit d'accès, de rectification
            et d'opposition sur vos données, à exercer auprès du service des ressources
            humaines de votre organisme.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Durée de conservation :</strong> vos données sont conservées pendant
            la durée de votre relation contractuelle, puis selon les délais légaux
            applicables.
          </p>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            marginTop: 20,
            cursor: "pointer",
            fontSize: 14,
            color: theme.text,
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: 3, width: 16, height: 16, cursor: "pointer", accentColor: theme.primary }}
          />
          J'ai lu et j'accepte le traitement de mes données personnelles conformément à la
          Loi 18-07.
        </label>

        {error && (
          <div
            style={{
              background: theme.dangerBg,
              border: `1px solid ${theme.dangerBorder}`,
              borderRadius: 10,
              padding: "10px 14px",
              color: theme.danger,
              fontSize: 13,
              marginTop: 14,
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleAccept}
            disabled={!checked || loading}
            style={{
              background: !checked || loading ? `${theme.primary}88` : theme.primary,
              border: "none",
              borderRadius: 10,
              padding: "12px 22px",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: !checked || loading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {loading ? "Enregistrement..." : "J'accepte"}
          </button>
          <button
            type="button"
            onClick={handleRefuse}
            style={{
              background: "transparent",
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: "12px 22px",
              color: theme.textSecondary,
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Refuser
          </button>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
};

export default Consentement;
```

Note : `useAuth()` n'expose pas encore `refreshUser` — Task 5 l'ajoute. Le `&&` défensif (`refreshUser &&`) évite un crash si le contexte n'est pas encore mis à jour au moment où ce fichier est créé ; Task 5 le rendra pleinement fonctionnel.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd frontend && npx jest Consentement.test.jsx`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Consentement.jsx frontend/src/__tests__/Consentement.test.jsx
git commit -m "feat(frontend): page de consentement Loi 18-07"
```

---

### Task 5: `AuthContext` — exposer `needs_consent` et `refreshUser`

**Files:**
- Modify: `frontend/src/context/AuthContext.js`
- Test: `frontend/src/__tests__/AuthContext.test.jsx` (créer si aucun test existant ne couvre déjà ce contexte — vérifier d'abord avec Glob/Grep avant de créer un doublon)

**Interfaces:**
- Consumes: `api.get("/auth/me/")` (existant).
- Produces: `useAuth()` retourne désormais aussi `refreshUser: () => Promise<void>` — consommé par Task 4 (`Consentement.jsx`) et Task 6 (`ProtectedRoute`, via `user.needs_consent`).

- [ ] **Step 1: Vérifier l'absence de test existant sur `AuthContext`**

Run: `cd frontend && ls src/__tests__ | grep -i auth`
Expected: aucun fichier `AuthContext.test.jsx` (sinon, adapter les steps suivants pour étendre ce fichier plutôt que d'en créer un nouveau).

- [ ] **Step 2: Écrire le test de `refreshUser`**

Créer `frontend/src/__tests__/AuthContext.test.jsx` :

```jsx
import { render, screen, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../context/AuthContext";
import api from "../services/api";

jest.mock("../services/api");

const Probe = () => {
  const { user, refreshUser } = useAuth();
  return (
    <div>
      <span data-testid="needs-consent">{String(user?.needs_consent)}</span>
      <button onClick={() => refreshUser()}>refresh</button>
    </div>
  );
};

describe("AuthContext refreshUser", () => {
  it("recharge l'utilisateur depuis /auth/me/ et met à jour needs_consent", async () => {
    api.get.mockResolvedValue({ data: { id: "1", role: "ADMIN", needs_consent: true } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await screen.findByText("true");

    api.get.mockResolvedValueOnce({ data: { id: "1", role: "ADMIN", needs_consent: false } });
    await act(async () => {
      screen.getByText("refresh").click();
    });
    expect(await screen.findByText("false")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Lancer le test pour vérifier l'échec**

Run: `cd frontend && npx jest AuthContext.test.jsx`
Expected: FAIL (`refreshUser is not a function`).

- [ ] **Step 4: Ajouter `refreshUser` à `AuthContext`**

Remplacer le contenu de `frontend/src/context/AuthContext.js` :

```jsx
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = sessionStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const refreshUser = useCallback(() => {
    return api.get("/auth/me/")
      .then((res) => {
        setUser(res.data);
        setAuthenticated(true);
        sessionStorage.setItem("user", JSON.stringify(res.data));
      })
      .catch(() => {
        setUser(null);
        setAuthenticated(false);
        sessionStorage.removeItem("user");
      });
  }, []);

  useEffect(() => {
    // Vérifier la session via le cookie (invisible JS)
    refreshUser().finally(() => setAuthChecked(true));
  }, [refreshUser]);

  const loginSuccess = (userData) => {
    setUser(userData);
    setAuthenticated(true);
  };

  const logoutSuccess = () => {
    setUser(null);
    setAuthenticated(false);
    sessionStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider value={{ user, authenticated, authChecked, loginSuccess, logoutSuccess, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
```

- [ ] **Step 5: Lancer le test pour vérifier le succès**

Run: `cd frontend && npx jest AuthContext.test.jsx`
Expected: PASS.

- [ ] **Step 6: Lancer toute la suite frontend pour vérifier l'absence de régression**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: tous les tests passent (aucun composant existant ne dépendait d'une forme figée du contexte qui empêcherait l'ajout de `refreshUser`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/context/AuthContext.js frontend/src/__tests__/AuthContext.test.jsx
git commit -m "feat(frontend): AuthContext expose refreshUser pour rafraîchir needs_consent"
```

---

### Task 6: Route `/consentement` + garde dans `ProtectedRoute` + mise à jour `Login.jsx`

**Files:**
- Modify: `frontend/src/App.js`
- Modify: `frontend/src/components/ProtectedRoute.jsx`
- Modify: `frontend/src/pages/Login.jsx`
- Test: `frontend/src/__tests__/ProtectedRoute.test.jsx` (créer si aucun test existant ne couvre déjà ce composant — vérifier d'abord)

**Interfaces:**
- Consumes: `Consentement` (Task 4), `user.needs_consent` exposé par `AuthContext` (Task 5, propagé depuis le payload backend Task 3).
- Produces: comportement de navigation — toute route protégée redirige vers `/consentement` si `needs_consent` est vrai.

- [ ] **Step 1: Vérifier l'absence de test existant sur `ProtectedRoute`**

Run: `cd frontend && ls src/__tests__ | grep -i protected`
Expected: aucun fichier existant (sinon étendre ce fichier plutôt que d'en créer un nouveau).

- [ ] **Step 2: Écrire le test de la garde de consentement**

Créer `frontend/src/__tests__/ProtectedRoute.test.jsx` :

```jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import { AuthContext } from "../context/AuthContext";

const renderWithAuth = (authValue, initialPath = "/employees") =>
  render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/consentement" element={<div>Page Consentement</div>} />
          <Route
            path="/employees"
            element={
              <ProtectedRoute>
                <div>Page Employés</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

describe("ProtectedRoute — garde de consentement", () => {
  it("redirige vers /consentement si needs_consent est vrai", () => {
    renderWithAuth({
      user: { role: "ADMIN", needs_consent: true },
      authenticated: true,
      authChecked: true,
    });
    expect(screen.getByText("Page Consentement")).toBeInTheDocument();
  });

  it("affiche la page si needs_consent est faux", () => {
    renderWithAuth({
      user: { role: "ADMIN", needs_consent: false },
      authenticated: true,
      authChecked: true,
    });
    expect(screen.getByText("Page Employés")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Exporter `AuthContext` depuis `context/AuthContext.js`**

Ajouter `export` devant la déclaration existante :

```jsx
export const AuthContext = createContext(null);
```

(Cette ligne remplace `const AuthContext = createContext(null);` — seul le mot-clé `export` change, nécessaire pour que le test Task 6 puisse fournir un `AuthContext.Provider` de test sans passer par un vrai appel API.)

- [ ] **Step 4: Lancer le test pour vérifier l'échec**

Run: `cd frontend && npx jest ProtectedRoute.test.jsx`
Expected: le premier test FAIL (`Page Consentement` introuvable — `ProtectedRoute` ne connaît pas encore `needs_consent`).

- [ ] **Step 5: Implémenter la garde dans `ProtectedRoute.jsx`**

Remplacer `frontend/src/components/ProtectedRoute.jsx` :

```jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, authenticated, authChecked } = useAuth();
  const location = useLocation();
  if (!authChecked) return null; // Attendre la vérification cookie avant de rediriger
  if (!authenticated) return <Navigate to="/login" replace />;
  if (user?.needs_consent && location.pathname !== "/consentement") {
    return <Navigate to="/consentement" state={{ from: location.pathname }} replace />;
  }
  if (adminOnly && user?.role !== "ADMIN") return <Navigate to="/employees" replace />;
  return children;
};

export default ProtectedRoute;
```

- [ ] **Step 6: Lancer le test pour vérifier le succès**

Run: `cd frontend && npx jest ProtectedRoute.test.jsx`
Expected: 2 tests PASS.

- [ ] **Step 7: Ajouter la route `/consentement` dans `App.js`**

Dans `frontend/src/App.js`, ajouter l'import :

```jsx
import Consentement from "./pages/Consentement";
```

Et une route protégée (l'utilisateur doit être authentifié pour y accéder, mais elle n'a pas `adminOnly` et n'est jamais elle-même redirigée puisque `ProtectedRoute` exclut explicitement `/consentement` de sa propre garde) :

```jsx
          <Route
            path="/consentement"
            element={
              <ProtectedRoute>
                <Consentement />
              </ProtectedRoute>
            }
          />
```

Ajouter cette route avant la route catch-all `<Route path="*" ... />` (ligne 87 actuelle), au même niveau que les autres routes protégées.

- [ ] **Step 8: Mettre à jour `Login.jsx` pour rediriger vers `/consentement` si nécessaire**

Dans `frontend/src/pages/Login.jsx`, modifier `handleSubmit` :

```jsx
    try {
      const data = await login(username, password);
      // Les tokens JWT sont dans les cookies httpOnly — on stocke uniquement les infos user
      sessionStorage.setItem("user", JSON.stringify(data.user));
      loginSuccess(data.user);
      navigate(data.user.needs_consent ? "/consentement" : "/employees");
    } catch (err) {
```

- [ ] **Step 9: Lancer toute la suite frontend**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: tous les tests passent, y compris les tests existants de `Login.jsx` (vérifier qu'aucun ne fait une assertion stricte sur `navigate` appelé uniquement avec `"/employees"` sans jamais fournir `needs_consent` dans le mock — si un test échoue pour cette raison, ajouter `needs_consent: false` au mock de connexion existant plutôt que de changer le composant).

- [ ] **Step 10: Test manuel de bout en bout**

Lancer le backend (`cd backend && python manage.py runserver`) et le frontend (`cd frontend && npm start`), puis :
1. Se connecter avec un compte existant (créé avant cette fonctionnalité, donc `consent_loi1807_accepted_at=None`) → vérifier la redirection automatique vers `/consentement`.
2. Cliquer "J'accepte" sans cocher la case → vérifier que le bouton reste désactivé.
3. Cocher la case, cliquer "J'accepte" → vérifier la redirection vers `/employees` et l'apparition d'une entrée dans `/audit` (ADMIN) de type "Consentement Loi 18-07 accepté".
4. Se déconnecter, se reconnecter avec le même compte → vérifier qu'on n'est plus redirigé vers `/consentement`.
5. Avec un nouveau compte, cliquer "Refuser" → vérifier la modale de confirmation puis la déconnexion effective.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/App.js frontend/src/components/ProtectedRoute.jsx frontend/src/pages/Login.jsx frontend/src/context/AuthContext.js frontend/src/__tests__/ProtectedRoute.test.jsx
git commit -m "feat(frontend): redirige vers /consentement tant que l'utilisateur n'a pas consenti"
```

---

## Self-Review Notes

- **Couverture spec :** modèle (Task 1), permission globale + exemptions (Task 2), endpoint + audit + `needs_consent` (Task 3), page de consentement (Task 4), propagation de l'état côté client (Task 5), garde de route + flux login (Task 6). Le hors-périmètre (versionnage du texte, relecture juridique) n'est pas traité — conforme à la spec.
- **Fixtures existantes :** Task 1 corrige explicitement `admin_user`/`consultant_user`/`scoped_consultant` pour éviter une régression massive de la suite backend ; Task 2/3 Step 9/13 exigent de relancer la suite complète pour attraper tout autre fixture oubliée.
- **Cohérence des types :** `needs_consent` est un booléen partout (backend `bool(...)`, frontend `user?.needs_consent`) ; `refreshUser` (Task 5) est bien la fonction que `Consentement.jsx` (Task 4) appelle après acceptation.
- **Intercepteur Axios 403 :** volontairement hors périmètre (YAGNI) — `ProtectedRoute` revérifie `needs_consent` à chaque navigation, ce qui couvre le flux normal ; le cas d'un onglet resté ouvert pendant qu'un autre onglet consent/refuse n'est pas traité par cette plan.
