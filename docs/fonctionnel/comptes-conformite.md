# Comptes utilisateurs et consentement Loi 18-07

> À lire avant de toucher à la suppression de compte, aux permissions IsAdmin/IsAdminOrConsultant ou au flux de consentement.
>
> Extrait de `CLAUDE.md` (découpage du 2026-10-01) — contenu déplacé tel quel, sans réécriture.
> Les renvois « voir section X » peuvent pointer vers un autre fichier de `docs/fonctionnel/` ou vers `CLAUDE.md` : voir l'index de `CLAUDE.md`.

---

## Gestion des utilisateurs — suppression de compte (2026-07-24)

`UserUpdateView` (`accounts/admin_views.py`) est passée de `UpdateAPIView` à `RetrieveUpdateDestroyAPIView` — `DELETE /api/admin-users/{id}/` supprime définitivement un compte (hard delete, ADMIN only), avec garde-fous dans `perform_destroy` :
- Un ADMIN ne peut pas se supprimer lui-même.
- Impossible de supprimer le dernier compte ADMIN actif.
- Loggé en `AuditLog.Action.DELETE_USER`.
Le formulaire de création (`/users`) inclut directement la section "Périmètre d'accès" (visible si rôle CONSULTANT) — le périmètre est sauvegardé juste après la création du compte, plus besoin de rouvrir "Périmètre" après coup.

---

## Consentement Loi 18-07 (2026-08-27)

Tout accès à SOMIZ (ADMIN comme CONSULTANT, y compris les comptes créés
avant ce chantier) est bloqué tant que l'utilisateur n'a pas explicitement
consenti au traitement des données personnelles conformément à la Loi
n°18-07. Consentement unique à vie par compte (pas de versionnage du
texte) — spec complète : `docs/superpowers/specs/2026-08-27-consentement-loi1807-design.md`.

- `User.consent_loi1807_accepted_at` (`accounts/models.py`, `DateTimeField`
  `null=True`) — `null` = jamais consenti.
- `POST /api/auth/consent/` (`ConsentView`, `accounts/views.py`) enregistre
  la date et journalise `AuditLog.Action.CONSENT`. `LoginView`/`UserMeView`
  exposent `needs_consent: bool` dans leur réponse.
- **Le blocage réel est intégré dans `IsAdmin`/`IsAdminOrConsultant`**
  (`accounts/permissions.py`), pas seulement dans
  `REST_FRAMEWORK['DEFAULT_PERMISSION_CLASSES']` — piège identifié en
  cours d'implémentation : la quasi-totalité des vues métier déclarent
  `permission_classes` explicitement, ce qui **remplace** entièrement le
  défaut global DRF plutôt que de s'y ajouter. Une permission `HasConsented`
  ajoutée seulement au défaut global n'aurait donc protégé que les vues
  sans `permission_classes` propre (voir `securite.md` point 27). Toute
  nouvelle permission "transversale" censée s'appliquer à toute l'API doit
  être vérifiée de la même façon (test d'intégration sur une vraie route
  métier, pas seulement sur le défaut global).
- Frontend : page `/consentement` (`frontend/src/pages/Consentement.jsx`)
  — texte structuré comme un **engagement de confidentialité sur les
  données d'autrui** (et non "vos données personnelles") : la plupart des
  comptes consultent des données d'employés tiers (un directeur voit toute
  son équipe, un chef de département/service ses subordonnés, un cadre
  restreint à un type de document — ex. Sécurité Sociale — le voit pour
  l'ensemble du personnel indépendamment du périmètre organisationnel,
  voir section Scoping). `ProtectedRoute.jsx` redirige systématiquement
  vers `/consentement` si `user.needs_consent` est vrai (sauf sur la page
  elle-même) ; `AuthContext.refreshUser()` recharge `needs_consent` après
  acceptation.
