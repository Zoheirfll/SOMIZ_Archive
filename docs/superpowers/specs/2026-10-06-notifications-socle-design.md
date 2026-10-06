# Système de notifications — socle (spec de design)

Date : 2026-10-06 — Statut : à valider

## Contexte et découpage

Besoin : notifier les utilisateurs d'événements (attestations, sécurité/conformité,
employés/documents/contrats). Le périmètre est découpé en deux sous-projets :

1. **Socle** (cette spec) : modèle, helper `notify()`, API, cloche, purge.
2. **Sources d'événements**, par lots, chacun avec sa mini-spec : attestations,
   puis sécurité/conformité, puis employés/documents/contrats. Chaque lot se
   réduit à des appels à `notify()`/`notify_role()`.

## Décisions validées

| Sujet | Décision |
|---|---|
| Canal | Cloche dans l'application uniquement (pas d'e-mail) |
| Mise à jour | Polling du compteur toutes les 45 s, pause si onglet caché |
| Destinataires | Diffusion par rôle : une ligne `Notification` par compte, état lu/non-lu propre |
| Contenu | Texte neutre + lien relatif, jamais de nom d'employé stocké |
| Rétention | Purge automatique des notifications lues de plus de 30 jours |

## 1. Modèle de données

Nouvelle app Django `notifications`, modèle `Notification` :

| Champ | Détail |
|---|---|
| `id` | UUID |
| `recipient` | FK `User`, `on_delete=CASCADE` |
| `type` | `TextChoices` (ex. `ATTESTATION_NOUVELLE`, `ATTESTATION_PRETE`) |
| `message` | Texte neutre, sans donnée personnelle (ex. « Nouvelle demande d'attestation 00123/26 ») |
| `link` | Chemin front relatif (`/attestations/00123-26`), jamais d'URL absolue |
| `severity` | `info` / `warning` / `critical` |
| `created_at` | Auto |
| `read_at` | Nul = non lue |

Index sur `(recipient, read_at, -created_at)`.

## 2. Helper `notifications/service.py`

- `notify(recipients, type, message, link, severity)` : une ligne par compte (`bulk_create`).
- `notify_role(roles, ..., employee=None)` : résout les comptes actifs des rôles
  demandés ; si `employee` est fourni, ne garde que les comptes pour lesquels
  `can_access_employee(employee)` est vrai (scoping CONSULTANT/GESTIONNAIRE).
- Envoi dans `transaction.on_commit()` : pas de notification fantôme si la
  transaction est annulée.
- Toute exception est journalisée et avalée : une panne de notification ne
  fait jamais échouer l'action métier.
- Le `link` est une navigation seulement ; la page cible refait ses contrôles
  d'accès, une notification n'octroie aucun droit.

## 3. API (authentifiée, toujours filtrée sur `recipient=request.user`)

| Route | Rôle |
|---|---|
| `GET /api/notifications/` | Liste paginée, récentes d'abord, filtre `?non_lues=1` |
| `GET /api/notifications/compteur/` | `{ "non_lues": n }`, cible du polling |
| `POST /api/notifications/<id>/lue/` | Marque comme lue |
| `POST /api/notifications/tout-lire/` | Marque tout comme lu |

La notification d'un autre compte renvoie 404. Le throttle global `user`
(200/min) couvre le polling ; un test le vérifie.

## 4. Purge

Commande `purge_notifications` (planifiée) : supprime les notifications **lues**
de plus de 30 jours, conserve les non lues. Option `--dry-run` qui liste ce qui
serait supprimé sans rien effacer. La traçabilité reste assurée par l'audit log,
pas par les notifications.

## 5. Frontend

- `NotificationBell` dans la barre de navigation : badge de non-lues, panneau
  déroulant des 20 dernières, fermeture par Échap, `aria-label` avec le compteur.
- Hook `useNotifications` : interroge `/compteur/` toutes les 45 s, en pause si
  `document.visibilityState` est `hidden`, rafraîchit au retour sur l'onglet.
  Refresh silencieux (jamais de `setLoading(true)`), pour ne pas perdre scroll
  ou sélection dans le panneau ouvert.
- Clic sur une notification : marquage comme lue puis navigation vers `link`.
- Couleurs via les tokens de `theme.js` uniquement (ajout de tokens si besoin).

## 6. Tests

- Backend (via de vraies routes) : isolation entre comptes (404), scoping dans
  `notify_role`, comportement `on_commit`, exception avalée sans impact métier,
  purge et `--dry-run`, throttle du compteur.
- Frontend : badge, marquage comme lu, pause du polling onglet caché.

## 7. Documentation à produire

- `docs/fonctionnel/notifications.md` + entrée dans l'index de `CLAUDE.md`.
- Point dans `securite.md` : isolation par destinataire, texte neutre, scoping à la diffusion.

## Approches écartées

- **WebSocket/SSE** : ajoute Channels, ASGI et config Redis ; trop lourd pour un
  développeur seul face à un gain de quelques dizaines de secondes.
- **Notification partagée par rôle** : l'état lu global et le scoping sont difficiles à garantir.
- **E-mail** : risque de fuite de données RH et SMTP à maintenir ; pourra être
  réétudié pour les seules alertes de sécurité.
