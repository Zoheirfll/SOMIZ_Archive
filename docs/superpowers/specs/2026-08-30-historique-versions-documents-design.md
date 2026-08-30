# Historique des versions de document (ne plus écraser automatiquement)

## Contexte

Aujourd'hui, ré-uploader un document du même type pour un employé (ou un
contrat) — via "Ajouter un document" ou "Scanner un dossier" — désactive
automatiquement l'ancienne version (`EmployeeDocument.save()`,
`backend/employees/models.py:657-685`, mécanisme de versioning). Une fois
désactivée (`is_active=False`), l'ancienne version disparaît de la
sidebar "Documents" et n'est plus consultable que via l'audit log
(snapshot texte, pas le fichier).

L'utilisateur veut que l'ancienne version **reste visible et consultable**
après un nouvel upload, jusqu'à suppression manuelle explicite — plus de
remplacement silencieux.

## Décisions validées

- Affichage groupé : la version la plus récente reste la ligne
  principale de la sidebar (comportement inchangé pour l'usage courant) ;
  les versions antérieures sont accessibles via un lien "Historique (N)"
  repliable sous la ligne principale.
- Le taux de complétude (`dossier_complet`/`taux_completude`) ne change
  pas de mode de calcul — un type avec plusieurs versions actives compte
  toujours pour 1 (déjà le cas, `Count(..., distinct=True)` sur
  `type_doc`).
- Suppression : reste manuelle, document par document, via le mécanisme
  de suppression définitive déjà existant (`DocumentDeleteView`, ADMIN
  only, hard delete) — aucun nouvel endpoint.
- Pas de restauration d'une ancienne version comme version courante, pas
  de limite de rétention — hors scope.

## Backend

Dans `EmployeeDocument.save()`, supprimer uniquement la ligne qui
désactive l'ancien document actif :

```python
EmployeeDocument.objects.filter(
    employee=self.employee,
    contrat=self.contrat,
    type_doc=self.type_doc,
    is_active=True
).update(is_active=False)
```

Le reste de la méthode (transaction atomique, `select_for_update()`,
calcul du numéro de `version` à partir du document actif le plus
récent) est conservé à l'identique — il continue de garantir que chaque
nouvel upload reçoit un numéro de version strictement croissant, même en
cas d'uploads concurrents.

**Aucun autre changement backend n'est nécessaire** :
- `nb_types_presents`/`nb_types_obligatoires_presents`
  (`EmployeeListCreateView.get_queryset`) utilisent déjà
  `Count('documents__type_doc', filter=..., distinct=True)` — distinct
  sur le type, donc plusieurs versions actives du même type ne comptent
  toujours que pour 1.
- `EmployeeDetailSerializer.get_documents_manquants` déduit les types
  déjà présents via `set(...values_list('type_doc_id', flat=True))` —
  même déduplication naturelle.
- `EmployeeDocumentSerializer` expose déjà `version` et `uploaded_at` —
  suffisant pour que le frontend détermine côté client quelle version
  est la plus récente par groupe.
- `DocumentDeleteView` opère déjà sur un `EmployeeDocument` précis par
  id — fonctionne sans changement pour supprimer n'importe quelle
  version, courante ou historique.

## Frontend

Même traitement dans `EmployeeDetail.jsx` et `ContratDetail.jsx` (deux
fichiers séparés, même pattern dupliqué que le reste de ces deux pages —
cohérent avec l'existant, ex. `stripExt`/`formatSizeMo`).

- Nouvelle fonction locale `groupDocsByVersion(docs)` : regroupe les
  documents reçus par clé `(type_doc, contrat)`, garde la version la
  plus haute (`version` décroissant) comme document principal, attache
  les autres triées décroissant dans un champ `__history` sur ce
  document principal. Le reste du pipeline existant
  (`buildDocOrder`/`groupDocsByParent` selon le fichier, tri par ordre
  configuré du type) continue de s'appliquer **uniquement aux documents
  principaux** — l'historique ne participe pas à l'ordre d'affichage
  des catégories/types.
- Sélection automatique du premier document à l'ouverture (effet actuel
  qui prend `filtered[0]`) : doit lire la liste **groupée** (documents
  principaux seulement), jamais une entrée d'historique, pour ne pas
  ouvrir par défaut une version obsolète.
- UI : sous chaque ligne de document ayant `__history?.length > 0`, un
  lien texte discret `Historique (N version{s})` — replié par défaut,
  toggle un état local (`Set` d'ids de documents dépliés). Une fois
  déplié, affiche chaque version antérieure comme une sous-ligne
  compacte (date d'upload, taille, boutons voir/renommer/supprimer déjà
  existants — `handleSelectDoc`/`handleDeleteDoc` réutilisés tels quels,
  ils opèrent déjà sur un objet document précis).

## Migration des données existantes

Aucune — les documents déjà désactivés par l'ancien comportement restent
`is_active=False` (perdus de la vue, comme aujourd'hui). Seuls les
uploads **futurs**, après ce changement, conservent leurs anciennes
versions actives. Pas de script de réactivation rétroactive (les
fichiers physiques des anciennes versions purgées avant ce chantier ne
sont de toute façon plus nécessairement présents sur disque selon
l'historique du projet — voir `securite.md`, incident de purge
`media/` du 2026-07-22).

## Hors scope

- Pas de restauration d'une version d'historique comme version courante.
- Pas de limite de rétention / purge automatique de l'historique.
- Pas de changement du calcul de complétude.
- Pas de nouvel endpoint de suppression — réutilise `DocumentDeleteView`.
