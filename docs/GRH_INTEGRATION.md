# Intégration GRH → SOMIZ (synchronisation employés)

Document de référence complet pour l'intégration entrante depuis le GRH de
l'entreprise. Le GRH notifie SOMIZ à la création/mise à jour d'un employé,
qui apparaît alors automatiquement dans `/employees`, sans saisie manuelle.

Voir aussi [`docs/GRH_INTEGRATION_SPEC.md`](docs/GRH_INTEGRATION_SPEC.md) —
la spec à proprement parler, celle qui a été/doit être transmise à l'équipe
GRH pour qu'elle implémente l'appel sortant de son côté.

Date d'implémentation : 2026-08-27.

---

## Périmètre fonctionnel

- **Crée/met à jour uniquement la fiche employé** (`employees.Employee`) —
  dossier RH, rattachement organisationnel (Direction/Département/
  Service/Poste/Type de contrat/Catégorie).
- **Ne crée pas de compte utilisateur SOMIZ** (`accounts.User`, accès
  `/users`) — décision explicite pour ne pas donner d'accès applicatif
  automatique à quiconque est enregistré dans le GRH. La création de
  comptes reste manuelle, faite par un ADMIN dans `/users`.
- **Ne crée aucun document** — l'employé synchronisé depuis le GRH a un
  dossier vide (`taux_completude` à 0%), à compléter manuellement dans
  SOMIZ (upload PDF/scan comme pour un employé créé à la main).
- **Ne supprime jamais d'employé** — un `DELETE` GRH n'a aucun équivalent
  ici ; la suppression d'un employé SOMIZ reste une action manuelle ADMIN
  (voir section "Documents employés — suppression définitive" de
  `CLAUDE.md`, hors-sujet mais même philosophie : pas d'automatisation
  destructive depuis un système externe).

## Endpoint

```
POST /api/employees/grh-sync/
```
- Route publique dans `employees/urls.py` (`name='employee-grh-sync'`),
  **avant** `employees/<str:pk>/` dans `urlpatterns` pour ne pas être
  capturée par ce pattern générique.
- Vue : `employees.grh_integration.GRHEmployeeSyncView`
  (`AllowAny` + `throttle_classes = []` — c'est un appel serveur-à-serveur
  authentifié par HMAC, pas un client anonyme public ; le throttle `anon`
  global (10/min) bloquerait un import en rafale légitime côté GRH).

## Authentification — signature HMAC

- Secret partagé : `settings.GRH_WEBHOOK_SECRET` (variable d'env, défaut
  dev uniquement `dev-only-change-me` — **doit être changé en prod**,
  échangé avec l'équipe GRH via un canal sécurisé, jamais par email en
  clair).
- Header attendu : `X-GRH-Signature: sha256=<hex(hmac_sha256(secret, corps_json_brut))>`
- Comparaison en temps constant (`hmac.compare_digest`) — jamais `==` sur
  une signature, pour éviter une attaque par timing.
- Requête sans signature valide → `401 Unauthorized`, aucune donnée créée.

## Résolution des référentiels — politique de rejet strict

`GRHEmployeeSyncView._resolve_referentiels()` mappe les champs du payload
vers les FK `Employee` :

| Champ payload | FK `Employee` | Lookup | Modèle |
|---|---|---|---|
| `direction_code` | `direction` | `code` | `Direction` |
| `departement_code` | `departement` | `code` | `Departement` |
| `service_code` | `service` | `code` | `Service` |
| `poste_code` | `poste` | `code` | `Poste` |
| `type_contrat` | `type_contrat` | `nom` (exact) | `TypeContrat` |
| `categorie` | `categorie` | `nom` (exact) | `Categorie` |

**Décision explicite (2026-08-27)** : si un champ est présent dans le
payload mais ne correspond à aucun enregistrement en base, la requête est
**rejetée en bloc** (`400`, corps `{"errors": {"<champ>": "..."}}`) —
**aucun employé créé ou modifié**, plutôt que de créer un employé avec un
rattachement organisationnel silencieusement vide (`null`). Un champ
**absent** du payload, en revanche, est simplement ignoré (le
rattachement existant, s'il y en a un, n'est pas touché lors d'une mise à
jour).

`Departement` et `Service` avaient déjà un champ `code` en base (pas de
migration nécessaire) — seuls `TypeContrat`/`Categorie` n'en ont pas,
matchés par `nom` exact à la place (listes courtes et stables — "CDI",
"CDD", "Cadre" — jugé suffisant, pas de `code` ajouté pour eux).

## Idempotence — upsert sur `matricule`

```python
Employee.objects.update_or_create(matricule=matricule, defaults={...})
```
- `matricule` est la clé d'upsert : un appel répété avec le même
  `matricule` **met à jour** l'employé existant (pas de doublon).
- Réponse `201` si création, `200` si mise à jour — permet au GRH de
  distinguer les deux cas sans logique supplémentaire.
- Le même endpoint gère donc `employee.created` et `employee.updated` côté
  GRH — un seul contrat, pas deux endpoints séparés.

## Audit

Chaque appel réussi (création ou mise à jour) est loggé :
```python
AuditLog.log(
    request, AuditLog.Action.CREATE_EMP  # ou MODIFY_EMP
    target=employee,
    details={'matricule': matricule, 'source': 'GRH_SYNC'},
)
```
Le `details.source = 'GRH_SYNC'` permet de distinguer dans `/audit` un
employé créé via l'intégration GRH d'un employé créé manuellement par un
ADMIN — utile en cas d'incident ou d'audit de conformité (voir
`securite.md`).

## Fichiers concernés

- `backend/employees/grh_integration.py` — vue `GRHEmployeeSyncView`
- `backend/employees/urls.py` — route `grh-sync/`
- `backend/config/settings.py` — `GRH_WEBHOOK_SECRET`
- `backend/tests/test_grh_integration.py` — 6 tests (signature manquante/
  invalide, champ obligatoire manquant, référentiel inconnu rejeté,
  création avec référentiels résolus, upsert sans doublon)
- `docs/GRH_INTEGRATION_SPEC.md` — spec destinée à l'équipe GRH

## Ce qui reste à faire avant mise en production

1. **Confirmer le format réel du payload avec l'équipe GRH** — tout ce qui
   précède (noms de champs JSON, `direction_code` vs autre convention) est
   un contrat proposé par SOMIZ, pas encore validé côté GRH tant que
   `docs/GRH_INTEGRATION_SPEC.md` ne leur a pas été transmis et confirmé.
2. **Aligner les référentiels** — vérifier que les `code` Direction/
   Département/Service/Poste côté SOMIZ correspondent à ceux que le GRH
   compte envoyer (ou construire une table de correspondance si les deux
   systèmes divergent).
3. **Échanger le secret HMAC** via un canal sécurisé (pas d'email en
   clair), puis définir `GRH_WEBHOOK_SECRET` dans le `.env` de production
   (actuellement seule la valeur de dev `dev-only-change-me` existe par
   défaut).
4. **Test croisé en staging** — le GRH déclenche 2-3 créations + 1 mise à
   jour vers l'endpoint de staging SOMIZ ; vérifier dans `/employees` que
   le rattachement organisationnel est correct avant bascule prod.
5. Décider si un accès HTTPS interne suffit ou si l'appel doit passer par
   un VPN/réseau interne dédié (pas traité par ce chantier — question
   infra à trancher séparément).
