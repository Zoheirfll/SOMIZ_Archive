# Notifications in-app (socle — 2026-10-06)

Spec de design : [`docs/superpowers/specs/2026-10-06-notifications-socle-design.md`](../superpowers/specs/2026-10-06-notifications-socle-design.md).

## Principe

Une **cloche** dans la Navbar (desktop et mobile) affiche les notifications du
compte connecté. Pas d'e-mail (décision : pas de fuite de données RH hors
SOMIZ, pas de SMTP à maintenir). Le socle est livré ; les **sources
d'événements** sont ajoutées par lots (voir « Reste à faire »).

## Backend — app `notifications`

- `Notification` : une ligne **par destinataire** (diffusion par rôle =
  N lignes), `read_at` nul = non lue. Table `notifications`.
- **Texte neutre** : jamais de nom d'employé dans `message` (ex. « Nouvelle
  demande d'attestation 00123/26 »). Le détail se lit sur la page cible, qui
  applique le scoping. `link` = chemin front relatif uniquement.
- **Toujours passer par `notifications/service.py`**, jamais
  `Notification.objects.create()` :
  - `notify(recipients, type, message, link, severity)` ;
  - `notify_role(roles, ..., employee=None, exclude=None)` — si `employee`
    est fourni, filtre par `can_access_employee()` (scoping
    CONSULTANT/GESTIONNAIRE) ; `exclude` ignore l'auteur de l'action.
  - Création dans `transaction.on_commit()` (pas de notification fantôme si
    la transaction est annulée) et exceptions **journalisées puis avalées** :
    une panne de notification ne fait jamais échouer l'action métier.
- API (`/api/notifications/`) : liste (`?non_lues=1`), `compteur/`,
  `<uuid>/lue/`, `tout-lire/`. Tout est filtré sur `recipient=request.user` ;
  la notification d'un autre compte renvoie **404**.
- Purge : `python manage.py purge_notifications [--jours 30] [--dry-run]`
  supprime les notifications **lues** de plus de 30 jours (jamais les non
  lues). À planifier (cron/tâche planifiée) en production. La traçabilité
  reste assurée par l'audit log, pas par les notifications.

## Frontend

- `components/NotificationBell.jsx` + `hooks/useNotifications.js`.
- Polling du compteur toutes les **45 s** (`NOTIFICATIONS_POLL_MS`), **en
  pause onglet caché**, rafraîchissement immédiat au retour sur l'onglet.
- Rafraîchissements silencieux (pas de `loading`), liste rechargée en
  silence si le compteur change panneau ouvert. Échap / clic extérieur ferment.
- Couleurs via tokens de `theme.js` (`primary`/`warning`/`danger` selon
  `severity`).

## Approches écartées

- **WebSocket/SSE** : Channels + ASGI + config Redis en plus, trop lourd pour
  un gain de quelques dizaines de secondes.
- **Notification partagée par rôle** (une ligne, lu global) : un ADMIN qui la
  lit la fait disparaître pour les autres, et le scoping est difficile à garantir.
- **E-mail** : voir ci-dessus ; pourrait être réétudié pour les seules alertes
  de sécurité.

## Piège de test

`transaction.on_commit()` ne s'exécute pas dans un test `django_db` ordinaire :
utiliser la fixture `django_capture_on_commit_callbacks(execute=True)` (voir
`backend/tests/test_notifications.py`).

## Sources d'événements branchées (2026-10-06)

| Lot | Événement | Destinataires | Code |
|---|---|---|---|
| Attestations | Nouvelle demande | Traiteurs (SUPERADMIN + ADMIN `charge_attestation`), hors auteur | `attestations/notifications.py`, appelé par `DemandeAttestationListCreateView.perform_create` |
| Attestations | Statut Prête / Rejetée | Le demandeur (pas l'auteur du changement). Récupérée : aucune notification | `DemandeAttestationStatutView.patch` + `BulkStatutView` |
| Sécurité | Compte verrouillé (5 échecs) | SUPERADMIN toujours ; ADMIN seulement si le compte verrouillé n'est ni ADMIN ni SUPERADMIN (même règle de visibilité que l'audit). Sévérité `critical`, une seule fois par verrouillage | `User.register_failed_login` → `notifications/alerts.py` |
| Employés | Changement de statut (archivage...) ou transfert organisationnel | ADMIN/SUPERADMIN + CONSULTANT/GESTIONNAIRE dont le périmètre couvre l'employé (scoping), hors auteur | `EmployeeDetailView.perform_update` |
| Import | Import d'employés terminé (≥1 créé) | Les autres ADMIN/SUPERADMIN | `EmployeeImportView.post` |
| Conformité | Compte actif sans consentement Loi 18-07 depuis > 7 jours | SUPERADMIN ; ADMIN seulement pour les comptes qu'il administre. Une seule alerte par compte, jamais renouvelée | `notifier_consentements_en_attente`, lancée par la même commande quotidienne |
| Contrats | Échéance dans ≤ 30 jours | ADMIN/SUPERADMIN, `warning` si ≤ 7 jours. Idempotent (une fois par contrat et par fenêtre) | `manage.py notifier_echeances_contrat` |

**Tâches planifiées à créer en production** (rien ne les lance automatiquement) :
`notifier_echeances_contrat` (quotidienne) et `purge_notifications` (quotidienne ou hebdomadaire).

Les messages restent neutres : référence d'attestation, matricule ou numéro de
contrat, jamais le nom de l'employé. Le « compte verrouillé » cite le
`username` (identifiant de connexion, que les admins voient déjà dans /users).

## Reste à faire

- Planifier en production (cron de l'hôte, comme `backup.sh` — pas de Celery
  beat dans la stack) : `docker compose exec -T web python manage.py
  notifier_echeances_contrat` et `purge_notifications`, chaque jour.
