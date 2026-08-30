# Périmètre CONSULTANT — employés spécifiques (grants ponctuels)

## Contexte

Le scoping CONSULTANT existant (voir `CLAUDE.md`, section "Scoping
organisation-wide") restreint un compte par unité organisationnelle
(Direction/Pôle/Département/Service/Cellule) et/ou par type de document
(périmètre global, en ET avec le précédent). Cas non couvert : donner
accès à un CONSULTANT à un ou plusieurs employés précis, en dehors de son
périmètre organisationnel, éventuellement pour un seul type de document
(ex. un cadre RH qui a besoin du contrat de travail d'un agent spécifique
hors de son service, sans lui ouvrir tout son dossier ni tout le service
de cet agent).

## Décisions validées

- Le nouveau périmètre par employé se **combine en OU** avec le périmètre
  organisationnel existant (un compte garde son périmètre normal, plus les
  employés ajoutés individuellement).
- Granularité fine : un grant peut porter sur le **dossier complet** d'un
  employé, ou sur **un type de document précis** pour cet employé.
- Géré depuis la modale "Périmètre" existante (`/users`), en 3ᵉ section.
- La recherche d'employé dans la modale est **libre sur toute la base**
  (pas de restriction par le périmètre du compte ADMIN qui édite — un
  ADMIN n'est de toute façon jamais scopé).
- Un grant ne peut pas référencer un `TypeDocument` qui est une catégorie
  (`is_categorie` — a des sous-types), même cohérence que le reste du
  système vis-à-vis des catégories non uploadables.

## Modèle de données

Nouveau modèle `EmployeeAccessGrant` (`backend/employees/models.py`, à
côté des autres modèles de scoping — ou `backend/accounts/models.py` si
plus cohérent avec le reste des `scope_*` déjà sur `User` ; à trancher en
plan selon les imports circulaires) :

```python
class EmployeeAccessGrant(models.Model):
    user = models.ForeignKey(
        'accounts.User', on_delete=models.CASCADE,
        related_name='employee_grants'
    )
    employee = models.ForeignKey(
        'employees.Employee', on_delete=models.CASCADE,
        related_name='access_grants'
    )
    # None = accès au dossier complet de cet employé.
    # Renseigné = accès uniquement à ce type de document pour cet employé.
    type_doc = models.ForeignKey(
        'employees.TypeDocument', null=True, blank=True,
        on_delete=models.CASCADE
    )
    granted_by = models.ForeignKey(
        'accounts.User', null=True, on_delete=models.SET_NULL,
        related_name='+'
    )
    granted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'employee', 'type_doc')
```

`unique_together` avec `type_doc` nullable : Postgres autorise plusieurs
lignes `(user, employee, NULL)` (NULL n'est jamais égal à NULL dans une
contrainte unique standard) — accepté, un doublon `(user, employee,
None)` est inoffensif (redondant mais sans effet sur la logique
d'accès), pas la peine d'ajouter une contrainte partielle pour ce cas.

## Logique d'accès

Deux besoins distincts, donc deux méthodes sur `User` (en plus de
l'existant, qui reste inchangé) :

### 1. Visibilité de l'employé (liste, fiche, recherche)

`employee_scope_q()` et `can_access_employee()` sont **étendus** (pas
remplacés) : un employé est visible si le périmètre organisationnel
matche **OU** s'il existe au moins une ligne `EmployeeAccessGrant` pour
cet utilisateur et cet employé (peu importe `type_doc`).

```python
def employee_scope_q(self, prefix=''):
    ...  # logique existante inchangée
    granted_ids = set(self.employee_grants.values_list('employee_id', flat=True))
    if granted_ids:
        q |= Q(**{f'{prefix}id__in': granted_ids})  # ou pk selon prefix
    return q
```

Un employé visible uniquement via un grant partiel (ex. seulement son
contrat de travail) apparaît donc dans `/employees` et sa fiche est
accessible — mais son dossier de documents affichera uniquement ce que
la règle ci-dessous autorise (potentiellement rien dans "Documents" si
le grant ne porte que sur les contrats).

### 2. Visibilité d'un document précis

Nouvelle méthode `document_access_q(employee_prefix='', type_doc_prefix='type_doc_id')`
utilisée à la place de la combinaison actuelle
`employee_scope_q(prefix) & document_type_scope_q(prefix2)` dans les vues
listant des `EmployeeDocument`/`EmployeeDocumentFile` :

```
accès = (org_scope_q(employee) AND global_type_doc_scope_q(type_doc))
        OR (existe un grant plein dossier pour cet employé)
        OR (existe un grant type_doc précis pour (employé, type_doc))
```

Traduit en Q object combinant les trois branches par OR. Les grants
**ignorent** le périmètre global "types de documents" (`scope_types_documents`)
— un grant ponctuel donne accès même si ce type n'est pas dans le
périmètre global de l'utilisateur (cas d'usage : le cadre RH n'a peut-être
aucun périmètre "types de documents" du tout).

### Vues impactées

Mêmes vues que celles listées dans `CLAUDE.md` pour le scoping actuel :
`EmployeeListCreateView`, `EmployeeDetailView`, `FileViewerView`,
`DocumentViewerView`, `ContratListCreateView`, `ContratDetailView`,
`ContratDocumentListUploadView`, `employee_search`,
`DocumentListUploadView`. Chacune remplace son couple
`employee_scope_q + document_type_scope_q` (là où les deux s'appliquent
ensemble, sur des vues de documents) par `document_access_q`, et garde
`employee_scope_q` seul (étendu) là où seule la visibilité de l'employé
compte (liste employés, fiche, recherche).

**Contrats** : un grant `type_doc` précis ne s'applique qu'aux documents
du **dossier général** de l'employé (`EmployeeDocument`), pas aux
documents de contrat (`ContratDocument`, structure séparée) — un grant
plein dossier (`type_doc=None`), lui, couvre tout (dossier général +
tous les contrats), cohérent avec "dossier complet". Un grant portant sur
un type de document de contrat spécifique n'est pas couvert par ce
chantier (hors scope — les contrats n'ont pas la même hiérarchie de
types).

## Validation

`EmployeeAccessGrantSerializer.validate_type_doc()` : refuse un
`type_doc` dont `is_categorie` est vrai (même garde-fou que
`TypeDocumentSerializer`/l'import CSV vis-à-vis des catégories non
uploadables).

## API

`PUT /api/admin-users/<id>/employee-grants/` (ADMIN only) — remplace en
une requête l'ensemble des grants de cet utilisateur (même pattern que la
mise à jour du périmètre organisationnel actuel : l'ADMIN envoie l'état
complet souhaité, le backend fait la diff en DB). Payload :

```json
[
  {"employee": "<uuid>", "type_doc": null},
  {"employee": "<uuid2>", "type_doc": "<uuid-type>"}
]
```

`GET /api/admin-users/<id>/employee-grants/` — liste les grants actuels
(ADMIN only), avec les libellés employé/type resolved pour l'affichage.

Recherche employé dans la modale : réutilise `employee_search` existant,
appelé sans passer par le scoping du compte ADMIN connecté (déjà le cas,
un ADMIN n'est jamais restreint).

## UI

3ᵉ section de la modale "Périmètre" (`/users`, `UserScopeModal` ou
équivalent) : **"Employés spécifiques"**, sous les sections Organisation
et Types de documents existantes.

- Champ de recherche (autocomplete, debounce, réutilise `employee_search`)
  pour ajouter un employé à la liste des grants.
- Chaque ligne de la liste : nom + matricule de l'employé, puis un
  toggle/select "Dossier complet" vs "Types de documents spécifiques" —
  ce second choix ouvre une liste à cocher des types actifs non-catégorie
  (même source que la section "Types de documents" globale, mais
  multi-select **par ligne**, pas globale).
- Bouton retirer (✕) par ligne.
- Pas de cascade ni de "Tout/Aucun" ici (liste potentiellement courte,
  contrairement au périmètre organisationnel).

## Hors scope

- Pas de grant sur les types de documents de contrat (voir plus haut).
- Pas de date d'expiration sur un grant (accès permanent jusqu'à retrait
  manuel) — non demandé, ajoutable plus tard si besoin.
- Pas de notification à l'employé concerné ni à son responsable quand un
  grant est créé.
