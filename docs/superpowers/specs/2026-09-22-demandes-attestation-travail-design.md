# Demandes d'attestation de travail — design

Date : 2026-09-22

## Objectif

Permettre à un Gestionnaire/Secrétaire/Superviseur de terrain de demander,
depuis SOMIZ, une attestation de travail pour un employé de son périmètre,
sans avoir accès aux privilèges ADMIN. La demande transite par un workflow
de statuts jusqu'à ce que le document papier signé/tamponné soit prêt et
récupéré. SOMIZ génère un aperçu imprimable du document (fidèle au modèle
papier existant, voir photo de référence fournie le 2026-09-22) à partir
d'un modèle configurable, pour que l'ADMIN n'ait plus à le retaper
manuellement. Un journal d'audit et un reporting dédiés tracent qui a
demandé quoi, pour quel employé, et qui a traité chaque demande.

Contraintes actées avec l'utilisateur :
- Un seul rôle technique **GESTIONNAIRE** — "Secrétaire"/"Superviseur" ne
  sont que des libellés d'affichage différents pour le même rôle/mêmes
  permissions, jamais des variantes de droits.
- Périmètre organisationnel du Gestionnaire : **exactement** le même
  mécanisme que CONSULTANT (`scope_directions/poles/departements/
  services/cellules/sections`), y compris la règle "aucune sélection =
  aucun accès".
- Le Gestionnaire a un accès en lecture **complet type CONSULTANT** (fiche
  employé, documents, contrats) sur son périmètre, en plus de pouvoir
  créer des demandes d'attestation.
- Workflow à 6 statuts : Reçue → Imprimée → Signée → Prête → Récupérée,
  plus Rejetée (terminal). Seul un ADMIN/SUPERADMIN fait avancer les
  statuts, y compris Récupérée (le Gestionnaire n'est pas devant l'écran
  au moment où il vient chercher le papier).
- Le Gestionnaire peut annuler (supprimer) sa propre demande tant qu'elle
  est encore au statut Reçue.
- Le scan du document final signé est **optionnel** (aide-mémoire), jamais
  bloquant pour faire avancer les statuts.
- Numéro de référence (`NNNNN/AA`) généré automatiquement par SOMIZ à la
  création de la demande.
- SOMIZ **génère un aperçu imprimable** du document à partir d'un modèle
  configurable (adresse, ville, nom/titre du signataire, en-tête, pied de
  page, logo) — un seul modèle global pour toute la société, champs
  configurables sur une mise en page fixe (pas d'éditeur de mise en page
  libre). L'impression se fait via le navigateur (`window.print()`), même
  pattern que l'export PDF déjà en place sur `/statistiques` — pas de
  nouvelle dépendance PDF côté backend.
- Journal d'audit : réutilise `AuditLog` existant (nouveaux types
  d'action), pas de journal séparé.
- Reporting (nombre de demandes par gestionnaire, par employé) : section
  dédiée sur la page `/attestations` elle-même, pas dans `/statistiques`.

## Rôle & permissions

- Nouveau `User.Role.GESTIONNAIRE` (`accounts/models.py`, à côté de
  `SUPERADMIN`/`ADMIN`/`CONSULTANT`).
- Nouveau champ `User.libelle_role` (`CharField`, blank=True) : libellé
  d'affichage optionnel (ex. "Secrétaire", "Superviseur") qui remplace
  "Gestionnaire" dans l'UI quand renseigné — purement cosmétique, ne
  touche à aucune permission. Éditable dans le formulaire `/users`
  (visible seulement pour un compte de rôle GESTIONNAIRE).
- `User.is_admin`/`is_superadmin`/`is_consultant` inchangés. Pas de
  nouvelle property `is_gestionnaire` nécessaire au-delà de
  `role == User.Role.GESTIONNAIRE` utilisée ponctuellement.
- Scoping : les méthodes existantes (`employee_scope_q()`,
  `can_access_employee()`, `accessible_*_qs()`, `_scope_ids()`,
  `has_scope_restriction`) testent déjà `if self.is_admin` pour
  l'exemption — un GESTIONNAIRE tombe donc naturellement dans la même
  branche restreinte qu'un CONSULTANT, **aucune modification requise**
  dans `accounts/models.py` sur ces méthodes.
- Lecture (fiche employé, documents, contrats) : `IsAdminOrConsultant`
  (`accounts/permissions.py`) ne teste que
  `is_authenticated and is_active and consent_loi1807_accepted_at` — un
  GESTIONNAIRE passe déjà cette permission sans modification. Son nom
  reste trompeur pour ce rôle mais renommer une permission partagée par
  toutes les vues métier est hors scope ici (risque de régression sans
  bénéfice fonctionnel) — un commentaire est ajouté rappelant qu'elle
  couvre aussi GESTIONNAIRE.
- Nouvelle permission `CanRequestAttestation`
  (`accounts/permissions.py`) : authentifié + actif + consenti + rôle
  ∈ {GESTIONNAIRE, ADMIN, SUPERADMIN} — utilisée sur les endpoints de
  création/annulation de demande (CONSULTANT ne peut jamais en créer).
- Les endpoints de traitement (changement de statut, config du modèle,
  aperçu/impression, reporting) restent `IsAdmin` (ADMIN/SUPERADMIN
  uniquement), comme le reste des vues de gestion SOMIZ.
- Consentement Loi 18-07 : s'applique à GESTIONNAIRE comme à tous les
  rôles (`IsAdminOrConsultant`/`IsAdmin`/`CanRequestAttestation` le
  vérifient toutes systématiquement, pas seulement le défaut global —
  même piège déjà documenté dans CLAUDE.md pour `HasConsented`).

## Données

Nouvelle app **`attestations`** (séparée de `employees`/`accounts` — le
workflow de demande est un domaine fonctionnel propre, pas un attribut de
l'employé ni du compte utilisateur).

### `DemandeAttestation`

```python
class DemandeAttestation(models.Model):
    class Statut(models.TextChoices):
        RECUE = 'recue', 'Reçue'
        IMPRIMEE = 'imprimee', 'Imprimée'
        SIGNEE = 'signee', 'Signée'
        PRETE = 'prete', 'Prête'
        RECUPEREE = 'recuperee', 'Récupérée'
        REJETEE = 'rejetee', 'Rejetée'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=20, unique=True, editable=False)
    employee = models.ForeignKey('employees.Employee', on_delete=models.PROTECT,
                                  related_name='demandes_attestation')
    contrat = models.ForeignKey('employees.Contrat', null=True, blank=True,
                                 on_delete=models.SET_NULL,
                                 related_name='demandes_attestation')
    motif = models.CharField(max_length=255)
    commentaire = models.TextField(blank=True)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.RECUE)
    motif_rejet = models.TextField(blank=True)
    scan_document = models.FileField(upload_to=attestation_scan_upload_path,
                                      null=True, blank=True)

    demandeur = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                   related_name='demandes_attestation_faites')
    traite_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL,
                                    related_name='demandes_attestation_traitees')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
```

- `employee` en `PROTECT` : empêche la suppression définitive d'un employé
  tant qu'il a des demandes d'attestation liées — cohérent avec le fait
  que la suppression employé est déjà bloquée tant qu'il est `actif`
  (voir CLAUDE.md section "Archivage employé") ; un employé archivé avec
  des demandes historiques doit garder cet historique, pas le perdre
  silencieusement en cascade.
- `contrat` optionnel (`SET_NULL`) : un employé n'a pas toujours plusieurs
  contrats, le champ ne s'affiche dans le formulaire que si l'employé
  choisi en a plus d'un.
- Pas de soft-delete : suppression pure autorisée uniquement au statut
  `RECUE` par le `demandeur` lui-même (annulation) — au-delà, seul
  `REJETEE` permet de clore une demande sans suite ; pas de `DELETE`
  possible une fois qu'un ADMIN a commencé le traitement.
- Validation modèle/serializer : `motif_rejet` obligatoire si
  `statut == REJETEE` ; transitions de statut restreintes à l'ordre
  `RECUE → IMPRIMEE → SIGNEE → PRETE → RECUPEREE`, ou vers `REJETEE`
  depuis n'importe quel statut avant `RECUPEREE`. Pas de retour en
  arrière.

### `ReferenceCounter`

```python
class ReferenceCounter(models.Model):
    annee = models.PositiveSmallIntegerField(unique=True)
    dernier_numero = models.PositiveIntegerField(default=0)
```

- À la création d'une `DemandeAttestation`, dans une transaction avec
  `select_for_update()` sur la ligne de l'année civile courante (créée si
  absente), incrémente `dernier_numero` et forme `reference =
  f"{dernier_numero:05d}/{annee % 100:02d}"` (ex. `"00001/26"`) — évite
  toute collision en cas de créations concurrentes, remise à zéro chaque
  nouvelle année civile.

### `AttestationTemplateConfig`

```python
class AttestationTemplateConfig(models.Model):
    societe_nom = models.CharField(max_length=100, default="SOMIZ")
    societe_soustitre = models.CharField(max_length=255, blank=True)
    societe_capital = models.CharField(max_length=255, blank=True)
    holding = models.CharField(max_length=255, blank=True)
    adresse = models.CharField(max_length=255, blank=True)
    ville = models.CharField(max_length=100, blank=True)
    telephone = models.CharField(max_length=50, blank=True)
    fax = models.CharField(max_length=50, blank=True)
    telex = models.CharField(max_length=50, blank=True)
    signataire_titre = models.CharField(max_length=150, blank=True)
    signataire_nom = models.CharField(max_length=150, blank=True)
    texte_intro = models.TextField(blank=True)
    logo = models.ImageField(upload_to='attestation_logo/', null=True, blank=True)
```

- Singleton applicatif : `AttestationTemplateConfig.objects.first()` crée
  l'enregistrement avec les valeurs par défaut du modèle papier de
  référence s'il n'existe pas encore (pas de fixture/migration de
  données requise) ; `PUT` le met à jour en place, jamais de deuxième
  ligne créée.

## Workflow des statuts

```
RECUE → IMPRIMEE → SIGNEE → PRETE → RECUPEREE
  │         │          │       │
  └─────────┴──────────┴───────┴──→ REJETEE (motif obligatoire)
```

- Transition déclenchée par `PATCH /api/attestations/<id>/statut/`
  (`IsAdmin`), body `{statut, motif_rejet?}`. Le serializer valide la
  transition autorisée depuis le statut courant. `traite_par` mis à jour
  à chaque transition (dernier ADMIN à avoir touché la demande).
- Suppression (`DELETE /api/attestations/<id>/`, `CanRequestAttestation`)
  : autorisée uniquement si `request.user == demandeur` **et**
  `statut == RECUE`.
- Chaque transition + suppression tracée dans `AuditLog` (voir plus bas).

## Génération du document (aperçu imprimable)

- `GET /api/attestations/<id>/apercu/` (`IsAdmin`) — retourne une page
  HTML autonome (pas de fragment React) reproduisant le modèle papier :
  logo + en-tête société (nom, sous-titre, capital, holding), cadre
  "ATTESTATION DE TRAVAIL", bloc Réf N°/Matricule/Contrat N°, texte
  d'introduction ("Nous soussigné(e)s : {signataire_titre}"), phrase
  "Attestons que M(r)(elle)(me) : {employé} Né(e) le {date_naissance} à
  {lieu_naissance} Exerce au sein de la Société du {date_embauche} à ce
  jour Et occupe le poste de : {poste} Motif : {motif}", formule "La
  présente Attestation lui est délivrée pour servir et valoir ce que de
  droit.", date/lieu du jour ("{ville} le {date_generation}"), bloc
  signature ("LE {signataire_titre}" / "{signataire_nom}"), pied de page
  (adresse, tél/fax/télex).
- Ouvert dans un nouvel onglet depuis `/attestations/:id`, impression via
  `window.print()` côté frontend — même approche que l'export PDF déjà en
  place sur `/statistiques` (CLAUDE.md, "impression navigateur"), aucune
  nouvelle dépendance PDF backend (pas de WeasyPrint/wkhtmltopdf).
- Champs manquants dans `AttestationTemplateConfig` (ex. logo non encore
  uploadé) : affichés vides sur l'aperçu plutôt que de bloquer la
  génération — l'ADMIN reste responsable de compléter la config avant
  la première utilisation réelle, un aperçu incomplet le signale
  visuellement sans lever d'erreur 500.

## Audit & reporting

### Journal d'audit

Nouvelles valeurs `AuditLog.Action` :
- `CREATE_ATTESTATION` — création d'une demande (`target` = la demande,
  `details = {employee, motif}`)
- `CHANGE_STATUT_ATTESTATION` — chaque transition (`details = {de, vers,
  motif_rejet?}`)
- `DELETE_ATTESTATION` — annulation par le demandeur (`details =
  {employee, motif}`)

Visibilité `/audit` (`audit/views.py`, `AuditLogListView`) : la règle
existante qui donne à un ADMIN la visibilité sur ses propres actions +
celles de tous les comptes `CONSULTANT` est étendue pour inclure aussi
`role='GESTIONNAIRE'` — un ADMIN doit pouvoir vérifier l'activité des
gestionnaires qu'il administre, exactement comme pour les CONSULTANT
aujourd'hui (`Q(user=request.user) | Q(user__role__in=['CONSULTANT',
'GESTIONNAIRE'])`).

### Reporting

Nouvel onglet "Statistiques" sur `/attestations` (ADMIN/SUPERADMIN),
alimenté par `GET /api/attestations/stats/?date_debut=&date_fin=`
(`IsAdmin`) — calculé directement sur `DemandeAttestation` (pas besoin de
reparser le journal d'audit) :
- Nombre de demandes par gestionnaire demandeur (`demandeur`), avec
  répartition par statut.
- Nombre de demandes par employé concerné.
- Total par statut sur la période, délai moyen `RECUE → RECUPEREE`.

## Pages / UI

| Route | Contenu | Accès |
|---|---|---|
| `/attestations` | Liste des demandes (filtres statut/gestionnaire/employé/date), badge navbar "N en attente" | ADMIN : toutes · GESTIONNAIRE : les siennes |
| `/attestations/nouvelle` | Formulaire (employé scopé, contrat si >1, motif, commentaire) | GESTIONNAIRE, ADMIN |
| `/attestations/:id` | Détail, actions de changement de statut, lien aperçu/impression, upload scan optionnel | ADMIN (lecture seule pour le demandeur sur sa propre demande) |
| `/attestations` → onglet "Statistiques" | Reporting par gestionnaire/employé | ADMIN, SUPERADMIN |
| `/parametres` → onglet "Attestation de travail" | Configuration du modèle (adresse, ville, signataire, en-tête, pied de page, logo) + aperçu live | ADMIN |

- Badge navbar "N en attente" : compte les demandes `statut != RECUPEREE
  et != REJETEE`, visible pour tout ADMIN/SUPERADMIN (même endpoint que
  la liste, `?count_pending=1` ou champ dédié dans la réponse).
- `EmployeeDetail.jsx` : un GESTIONNAIRE voit un bouton "Demander une
  attestation" dans la sidebar (raccourci pré-remplissant l'employé sur
  `/attestations/nouvelle`), visible aussi pour ADMIN.
- Formulaire `/users` : section "Périmètre" (déjà existante pour
  CONSULTANT) rendue visible aussi pour un compte GESTIONNAIRE — pas de
  nouvelle UI de scoping à construire, réutilisation directe du composant
  existant.

## Hors scope (explicitement exclu)

- Envoi d'email/notification push à l'ADMIN — seul le badge compteur
  in-app est prévu (SOMIZ n'a pas d'infra email aujourd'hui).
- Génération du PDF final signé par SOMIZ — le document signé/tamponné
  reste un objet physique, le scan est un aide-mémoire optionnel, pas un
  document RH permanent versé au dossier de l'employé.
- Plusieurs modèles de document selon le département — un seul modèle
  global, un seul signataire pour toute la société.
- Éditeur de mise en page libre — les champs du modèle sont configurables,
  la disposition reste fixe (fidèle à la photo de référence).
