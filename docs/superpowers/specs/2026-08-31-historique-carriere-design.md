# Historique de carrière (Fonction / Catégorie / Échelle / Contrats)

## Contexte

L'utilisateur veut retrouver, sur la fiche d'un employé, la progression de
sa carrière dans le temps — exemple donné : recruté en 2000, Gestionnaire
de 2010 à 2015, Agent de 2016 à 2025, Cadre depuis 2026. Cette progression
doit couvrir 4 axes : **Fonction** (poste), **Catégorie**, **Échelle**
(nouveau champ, n'existe pas encore) et **Type de contrat** (déjà couvert
par le modèle `Contrat` existant, voir plus bas).

Beaucoup de ces périodes précèdent l'usage de SOMIZ (ex. 2000-2010) : le
système doit donc permettre la **saisie manuelle rétrospective**, en plus
de suivre automatiquement les changements faits depuis l'app.

## Décisions validées

- 4 axes suivis : Fonction, Catégorie, Échelle, Type de contrat.
- Fonction/Catégorie/Échelle : 3 nouveaux modèles d'historique dédiés
  (pas de `GenericForeignKey`), partageant un mixin abstrait commun.
- Type de contrat : **pas de nouveau modèle** — le modèle `Contrat`
  existant (`backend/employees/models.py:516`) a déjà `date_debut`,
  `date_fin`, `type_contrat` et supporte plusieurs contrats par employé
  (un renouvellement CDD = un nouveau `Contrat`). La vue Carrière réutilise
  directement `employee.contrats.all()`, triés par date — pas de double
  saisie.
- Échelle n'existe pas comme champ : nouveau référentiel CRUD `Echelle`
  (`nom`, `ordre`), même pattern que `Poste`/`Categorie`/`TypeContrat`
  (onglet dédié dans `/parametres`, import xlsx, CRUD `/ref/echelles/`).
  Pas de champ direct `Employee.echelle` — la valeur courante se déduit de
  la dernière période `HistoriqueEchelle` sans `date_fin` (voir
  "Modèles" ci-dessous, même logique que Fonction/Catégorie).
- Double mode de création des périodes :
  1. **Auto-tracking** : modifier Fonction/Catégorie/Échelle via
     `EmployeeForm.jsx` (édition employé) clôture automatiquement la
     période en cours à la date du jour et en ouvre une nouvelle à partir
     d'aujourd'hui — même mécanisme que le suivi des transferts
     Direction/Département/Service/Cellule/Section déjà en place
     (`EmployeeDetailView.TRANSFER_FIELDS`,
     `backend/employees/views.py:248`).
  2. **Saisie manuelle rétrospective** : un écran dédié sur la fiche
     employé permet à un ADMIN d'ajouter/corriger/supprimer librement des
     périodes passées (pour rattraper l'historique antérieur à SOMIZ),
     indépendamment de toute modification du formulaire employé.
- Lecture : ADMIN + CONSULTANT (respecte le scoping organisationnel
  existant, `can_access_employee`). Écriture (auto ou manuelle) : ADMIN
  uniquement.
- Chaque période a `date_debut` obligatoire et `date_fin` nullable
  (`null` = période en cours). Validation : `date_fin` ≥ `date_debut` si
  renseignée ; pas de chevauchement strict entre deux périodes d'un même
  axe pour un même employé.
- Toute action manuelle (créer/modifier/supprimer une période) est tracée
  dans l'audit log existant (`AuditLog.Action.MODIFY_EMP`, réutilise le
  mécanisme déjà en place plutôt qu'un nouveau type d'action).

## Modèles de données (`backend/employees/models.py`)

Mixin abstrait, à ajouter juste après `Categorie` :

```python
class HistoriquePeriode(models.Model):
    """
    Période dans le temps pour un axe de carrière donné (Fonction,
    Catégorie, Échelle). `date_fin=None` signifie période en cours.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee = models.ForeignKey(
        'Employee', on_delete=models.CASCADE, related_name='%(class)s_periodes'
    )
    date_debut = models.DateField(verbose_name="Date début")
    date_fin = models.DateField(null=True, blank=True, verbose_name="Date fin")
    commentaire = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True,
        on_delete=models.SET_NULL, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
        ordering = ['-date_debut']

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.date_fin and self.date_fin < self.date_debut:
            raise ValidationError("La date de fin doit être postérieure à la date de début.")


class HistoriqueFonction(HistoriquePeriode):
    poste = models.ForeignKey(Poste, on_delete=models.CASCADE, related_name='historiques')

    class Meta(HistoriquePeriode.Meta):
        db_table = 'historique_fonctions'
        verbose_name = "Historique — Fonction"


class HistoriqueCategorie(HistoriquePeriode):
    categorie = models.ForeignKey(Categorie, on_delete=models.CASCADE, related_name='historiques')

    class Meta(HistoriquePeriode.Meta):
        db_table = 'historique_categories'
        verbose_name = "Historique — Catégorie"


class Echelle(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=100, unique=True, verbose_name="Échelle")
    ordre = models.PositiveIntegerField(default=0)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'echelles'
        verbose_name = "Échelle"
        ordering = ['ordre', 'nom']

    def __str__(self):
        return self.nom


class HistoriqueEchelle(HistoriquePeriode):
    echelle = models.ForeignKey(Echelle, on_delete=models.CASCADE, related_name='historiques')

    class Meta(HistoriquePeriode.Meta):
        db_table = 'historique_echelles'
        verbose_name = "Historique — Échelle"
```

**Note sur `related_name='%(class)s_periodes'`** : avec l'héritage
abstrait Django résout ça par sous-classe concrète
(`historiquefonction_periodes`, `historiquecategorie_periodes`,
`historiqueechelle_periodes`) — utilisé côté `Employee` pour retrouver la
période en cours de chaque axe (`.filter(date_fin__isnull=True).first()`).

`Employee.poste`/`Employee.categorie` restent les champs actuels
(source de vérité pour la valeur *courante*, comme aujourd'hui) —
l'historique est un journal parallèle, pas un remplacement. Pas de
`Employee.echelle` : la valeur courante d'Échelle se lit uniquement via la
période `HistoriqueEchelle` sans `date_fin` (exposée par
`EmployeeDetailSerializer.echelle_actuelle`, lecture seule, calculée).

## Auto-tracking (`backend/employees/views.py`)

- `EmployeeDetailView.TRANSFER_FIELDS` (ligne 248) reste dédié aux champs
  organisationnels (Direction/Département/Service/Cellule/Section).
- Nouvelle logique séparée dans `perform_update` : pour `poste` et
  `categorie`, si la valeur change, clôturer la période en cours
  (`date_fin = today`) et créer une nouvelle `HistoriqueFonction`/
  `HistoriqueCategorie` (`date_debut = today`). Ajouté au même dict
  `details['transfer']` de l'entrée d'audit `MODIFY_EMP` existante (même
  format `{champ: {de, vers}}`) pour rester visible dans `AuditLogs.jsx`
  sans nouveau type d'action.
- Échelle n'étant pas un champ direct de `Employee`, son changement passe
  uniquement par l'écran de gestion manuelle (voir ci-dessous) — pas
  d'auto-tracking depuis `EmployeeForm.jsx` pour cet axe tant qu'il n'a
  pas de champ propre sur `Employee`.
- `EmployeeForm.jsx` : la modale de confirmation de transfert (pattern
  `useConfirm()` déjà en place pour Direction/Département/Service) inclut
  désormais aussi Fonction et Catégorie dans son récapitulatif si elles
  ont changé.

## Gestion manuelle (nouveau)

- Backend : `HistoriqueViewSet`-like, un jeu d'endpoints par axe :
  - `GET/POST /api/employees/<id>/historique/fonctions/`
  - `PATCH/DELETE /api/employees/<id>/historique/fonctions/<periode_id>/`
  - Idem pour `/historique/categories/` et `/historique/echelles/`.
  - Toutes en écriture réservées ADMIN (`IsAdmin`), lecture
    `IsAdminOrConsultant` + `can_access_employee(employee)` (scoping
    existant).
  - Validation chevauchement : au save, vérifier qu'aucune autre période
    du même axe pour cet employé ne recouvre l'intervalle
    `[date_debut, date_fin ou +∞[`.
  - Chaque création/modification/suppression logge
    `AuditLog.Action.MODIFY_EMP` avec `details={'action': 'historique_<axe>', ...}`.
- Référentiel Échelle : `/ref/echelles/`, `/ref/echelles/<uuid:pk>/`
  (`EchelleSerializer`/`EchelleListCreateView`/`EchelleDetailView`, copie
  conforme du pattern `Categorie`), ajouté à
  `ReferentielImportView.MODELS`/`ReferentielImportTemplateView.TEMPLATES`
  et à `ReferentielBulkDeleteView`.

## Frontend

- **`EmployeeDetail.jsx`** : nouvel onglet "Carrière" (à côté des onglets
  existants Informations/Documents/Contrats). Affiche 4 timelines
  verticales (Fonction, Catégorie, Échelle, Contrats) — chaque ligne :
  libellé + `date_debut` → `date_fin` (ou "en cours"), période en cours
  mise en évidence (style `theme.primaryBg`/`theme.primaryBorder`). La
  section Contrats de cette timeline liste `employee.contrats` (déjà
  chargés), triés par `date_debut` décroissant, chaque ligne cliquable
  vers `/contrats/:id`.
- Bouton "Gérer l'historique" (ADMIN only) ouvre une modale par axe
  (Fonction/Catégorie/Échelle) listant les périodes avec édition inline
  (ajouter une ligne, modifier dates, supprimer — `useConfirm()` pour la
  suppression), même style que les modales `ConfirmDialog.jsx`/listes à
  cases à cocher déjà utilisées ailleurs (ex. modale "Périmètre" de
  `/users`).
- **`Parametres.jsx`** : nouvel onglet "Échelles", copie exacte du pattern
  `Categorie`/`TypeContrat` (CRUD, import xlsx, tri, suppression en
  masse).
- **`EmployeeForm.jsx`** : la modale de confirmation de transfert
  (`useConfirm()`) récapitule aussi les changements de Fonction/Catégorie
  quand ils sont modifiés en même temps que l'affectation organisationnelle
  (ou seuls).
- **`AuditLogs.jsx`** : `formatTransfer()` étendu pour afficher les entrées
  `poste`/`categorie` du même dict `transfer` (déjà générique par champ,
  juste ajouter leurs libellés FR : "Fonction", "Catégorie").

## Hors scope

- Pas de champ `Employee.echelle` direct — uniquement dérivé de
  l'historique (évite un double état à synchroniser).
- Pas d'auto-tracking d'Échelle depuis `EmployeeForm.jsx` (pas de champ
  source) — uniquement via l'écran de gestion manuelle de l'historique.
- Pas de nouveau modèle pour l'historique des contrats — réutilisation
  pure du modèle `Contrat` existant.
- Pas de détection/import en masse de l'historique passé (ex. CSV) dans
  ce chantier — la saisie rétrospective se fait période par période via
  l'écran de gestion manuelle. Un import en masse pourra être ajouté
  plus tard si le volume de rattrapage (employés anciens) le justifie.
- Pas de changement au calcul du taux de complétude documentaire ni au
  scoping CONSULTANT existant (Fonction/Catégorie/Échelle restent hors du
  périmètre organisationnel/type de document).
