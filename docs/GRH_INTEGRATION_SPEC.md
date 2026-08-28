# Spécification — Synchronisation Employé GRH → SOMIZ

Document à transmettre à l'équipe GRH pour qu'elle implémente l'appel
sortant de son côté. SOMIZ fournit et héberge l'endpoint ; le GRH doit
l'appeler selon ce contrat exact.

## 1. Endpoint

```
POST https://somiz.entreprise.dz/api/employees/grh-sync/
Content-Type: application/json
```

À appeler à chaque **création** ou **mise à jour** d'un employé côté GRH.
Le même endpoint gère les deux cas (upsert sur `matricule`).

## 2. Authentification

Un secret partagé (`GRH_WEBHOOK_SECRET`) est échangé une fois hors-bande
(jamais par email en clair — canal sécurisé type coffre-fort de secrets).
Chaque requête doit inclure une signature HMAC-SHA256 du corps brut :

```
X-GRH-Signature: sha256=<hex(hmac_sha256(secret, corps_json_brut))>
```

Une requête sans signature valide reçoit `401 Unauthorized`.

## 3. Format du payload (JSON)

```json
{
  "matricule": "EMP-4521",
  "nom": "Bensalem",
  "prenom": "Yasmine",
  "date_naissance": "1994-03-12",
  "date_embauche": "2026-08-25",
  "direction_code": "DIR-RH",
  "departement_code": "DEV-RH",
  "service_code": "RECRUT",
  "poste_code": "CHG-RECRUT",
  "type_contrat": "CDI",
  "categorie": "Cadre"
}
```

| Champ | Obligatoire | Type | Notes |
|---|---|---|---|
| `matricule` | oui | string | identifiant unique, sert de clé d'upsert |
| `nom` | oui | string | |
| `prenom` | oui | string | |
| `date_naissance` | non | string `YYYY-MM-DD` | |
| `date_embauche` | non | string `YYYY-MM-DD` | |
| `direction_code` | non | string | doit correspondre à un `code` Direction existant côté SOMIZ |
| `departement_code` | non | string | doit correspondre à un `code` Département existant côté SOMIZ |
| `service_code` | non | string | doit correspondre à un `code` Service existant côté SOMIZ |
| `poste_code` | non | string | doit correspondre à un `code` Poste existant côté SOMIZ |
| `type_contrat` | non | string | doit correspondre au **nom exact** d'un Type de contrat SOMIZ (ex. "CDI", "CDD") |
| `categorie` | non | string | doit correspondre au **nom exact** d'une Catégorie SOMIZ (ex. "Cadre", "Agent de maîtrise") |

**Important** : les codes Direction/Département/Service/Poste sont ceux du
référentiel SOMIZ, pas ceux du GRH. Une table de correspondance
GRH ↔ SOMIZ doit être établie une fois (voir §6) si les deux systèmes
utilisent des codes différents.

## 4. Réponses

| Code | Cas | Corps |
|---|---|---|
| `201` | employé créé | `{"detail": "Créé", "id": "<uuid>"}` |
| `200` | employé mis à jour (matricule déjà connu) | `{"detail": "Mis à jour", "id": "<uuid>"}` |
| `400` | champ obligatoire manquant ou référentiel (`*_code`, `type_contrat`, `categorie`) introuvable côté SOMIZ | `{"detail": "...", "errors": {"direction_code": "Aucune direction avec code='XXX'"}}` |
| `401` | signature absente ou invalide | `{"detail": "Signature invalide"}` |

**Le GRH doit gérer le cas 400** : c'est un rejet volontaire (pas de
création partielle) tant que le référentiel n'est pas aligné entre les
deux systèmes — à surveiller/alerter côté GRH plutôt qu'ignorer.

## 5. Idempotence

Rejouer le même payload plusieurs fois est sans danger : `matricule` est
la clé d'upsert, un appel répété met simplement à jour les mêmes champs
(pas de doublon créé).

## 6. Étapes de mise en place (aller-retour de validation)

1. Le GRH partage la liste de ses codes Direction/Département/Service/Poste
   actuels → l'équipe SOMIZ vérifie qu'ils correspondent (ou construit une
   table de correspondance si les deux référentiels divergent).
2. Échange du secret HMAC via un canal sécurisé.
3. Le GRH implémente l'appel sortant sur son environnement de recette.
4. Test d'intégration croisé : le GRH déclenche 2-3 créations et 1 mise à
   jour vers l'endpoint de **staging** SOMIZ ; l'équipe SOMIZ confirme que
   les employés apparaissent correctement dans `/employees` avec le bon
   rattachement organisationnel.
5. Bascule en production une fois le test de staging validé des deux côtés.

## 7. Portée volontairement exclue

- Pas de suppression d'employé via cet endpoint (le hard-delete SOMIZ est
  une action manuelle ADMIN, jamais automatisée depuis un système externe).
- Pas de création de compte utilisateur SOMIZ (accès `/users`) — seulement
  la fiche employé (dossier RH). La création de comptes reste manuelle par
  un ADMIN SOMIZ.
- Pas d'upload de documents — l'employé créé via GRH a un dossier vide
  (`taux_completude` à 0%), à compléter manuellement dans SOMIZ.
