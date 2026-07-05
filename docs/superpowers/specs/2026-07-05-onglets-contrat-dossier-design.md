# Onglets par contrat dans le Dossier employé

## Contexte

Sur `EmployeeDetail.jsx`, l'onglet "Dossier" affiche aujourd'hui une liste plate de tous les documents de l'employé (dossier général + documents liés à un contrat), avec un simple badge indiquant le numéro de contrat sur les documents concernés. Quand un employé a plusieurs contrats, il n'y a aucun moyen de filtrer par contrat.

## Objectif

Ajouter, dans la colonne de gauche de l'onglet "Dossier", un sélecteur (onglets) permettant de basculer entre les contrats de l'employé. La liste de documents affichée = dossier général + documents du contrat sélectionné. Le dernier contrat (le plus récent) est sélectionné par défaut.

## Comportement détaillé

### Onglets de contrat
- Affichés uniquement si `contrats.length > 0`.
- Un onglet par contrat, libellé = `numero_contrat`, ordonnés du plus ancien au plus récent (ordre croissant par `date_debut`, puis `id`).
- Sélection par défaut : le contrat le plus récent (dernier de la liste triée).
- L'état de sélection est un nouveau state `selectedContratId` dans `EmployeeDetail.jsx`, initialisé après le chargement de `contrats` (dans `fetchContrats`, une fois les contrats reçus, si `selectedContratId` n'est pas encore défini).

### Filtrage des documents affichés
- Documents affichés = `employee.documents.filter(d => !d.contrat || d.contrat === selectedContratId)`.
- Le dossier général (documents sans `contrat`) apparaît toujours en premier, suivi des documents du contrat sélectionné, dans l'ordre déjà retourné par l'API.
- Le compteur d'en-tête "Documents (N)" reflète le nombre de documents filtrés (visibles), pas le total employé.
- Le badge numéro de contrat déjà présent sur chaque document (ligne ~982-993 actuelle) reste inchangé — il n'est visible que sur les documents qui ont un `contrat`.

### Upload de nouveau document
- Le bloc "Ajouter un document" (réservé ADMIN) cible :
  - `POST /employees/{id}/documents/` si aucun contrat n'est sélectionné (cas 0 contrat, comportement actuel inchangé)
  - `POST /contrats/{selectedContratId}/documents/` si un contrat est sélectionné
- Après upload réussi, rafraîchir à la fois `employee` (fetchEmployee) et `contrats` (fetchContrats) pour mettre à jour les compteurs `nb_documents` affichés dans l'onglet "Contrats".

### Documents manquants (quick-upload)
- Inchangé : reste basé sur `employee.documents_manquants`, affiché sous la liste filtrée, indépendamment du contrat sélectionné (le backend calcule ce champ au niveau employé, pas par contrat).
- Le quick-upload continue de poster sur `/employees/{id}/documents/` (dossier général), comme aujourd'hui.

### Cas particuliers
- 0 contrat : pas d'onglets, comportement actuel (upload général uniquement, tous les documents affichés — de toute façon ils sont tous sans contrat dans ce cas).
- 1 contrat : un seul onglet, sélectionné par défaut, pas vraiment de "bascule" mais cohérent avec le design.

## Hors périmètre
- Aucun changement backend (les endpoints `/employees/{id}/documents/` et `/contrats/{id}/documents/` existent déjà et suffisent).
- Le calcul de `documents_manquants` reste global (pas de version par contrat).
- L'onglet "Contrats" (tableau des contrats) n'est pas modifié.

## Fichiers concernés
- `frontend/src/pages/EmployeeDetail.jsx` : ajout du state `selectedContratId`, du composant d'onglets, du filtrage de la liste de documents, et de la logique de choix d'endpoint pour l'upload.
- Tests : `frontend/src/__tests__/EmployeeDetail.test.jsx` à mettre à jour/compléter pour couvrir la sélection de contrat, le filtrage et le routage de l'upload.
