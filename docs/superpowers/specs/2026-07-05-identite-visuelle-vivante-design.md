# Identité visuelle plus vivante (palette enrichie + feedback de chargement)

## Contexte

Retour de la hiérarchie : l'app est perçue comme "morte" — pas assez attirante visuellement. Après investigation (validée via maquettes comparatives dans le compagnon visuel), deux axes concrets se dégagent :

1. **Palette perçue comme froide/plate** malgré le vert de marque — direction retenue : **A — vert SOMIZ + accent ambre chaleureux** (dégradés, touches dorées en décoration et sur les CTA secondaires), le vert restant l'identité dominante.
2. **Feedback de chargement statique** — le texte brut `"Chargement..."` partout tranche avec le reste de l'app qui a déjà des animations soignées (`card-lift`, `btn-lift`, cascades).

Périmètre retenu : toute l'app en une fois (pas de déploiement progressif page par page).

## 1. Nouveaux tokens (theme.js)

Ajout de tokens **additifs** (aucun token existant n'est renommé ni supprimé, pour ne pas casser les usages actuels) :

```js
// ─── Accent chaleureux (identité "vivante") ──────────────────────────────
accent: "#F59E0B",        // amber-500
accentLight: "#FBBF24",   // amber-400
accentBg: "#FFFBEB",      // amber-50
accentBorder: "#FDE68A",  // amber-200
```

Règle d'usage : le vert reste la couleur dominante partout (textes, structure, badges de statut existants inchangés). L'ambre n'apparaît **qu'en touches** :
- cercle décoratif flouté en fond des hero headers (vert → dégradé existant conservé, cercle ambre semi-transparent ajouté par-dessus, comme la maquette A validée)
- lueur de l'ombre au survol des cartes (`card-lift`, `hover-lift`) : passe d'une teinte neutre à `rgba(180,131,7,0.18)` (ambre chaud)
- couleur de fond des boutons d'action secondaire mis en avant (ex: "+ Nouveau", "+ Ajouter") — remplace le vert plein actuel par l'ambre sur ces CTA précis, pas sur les boutons primaires de soumission de formulaire (Enregistrer, Se connecter, etc. qui restent verts)

## 2. Application aux hero headers

Tous les hero headers à dégradé vert existants (`EmployeeDetail`, `ContratDetail`, `Employees`, `Dashboard`, `Login` — panneau de marque) reçoivent un cercle décoratif ambre semi-transparent superposé, selon le motif de la maquette A :

```jsx
<div style={{ ...heroStyle, position: "relative", overflow: "hidden" }}>
  <div style={{
    position: "absolute", top: -30, right: -30,
    width: 140, height: 140, borderRadius: "50%",
    background: "rgba(251,191,36,0.18)", pointerEvents: "none",
  }} />
  {/* contenu existant du hero, inchangé */}
</div>
```

Aucun changement de structure, de texte ou de comportement — uniquement l'ajout de cet élément décoratif en overlay.

## 3. Cards et boutons

- `animations.css` : `.card-lift:hover` et `.hover-lift:hover` — la couleur de `box-shadow` au survol passe de `rgba(26,122,60,...)` à un mélange chaud `rgba(180,131,7,0.18)` (ambre), en gardant la même intensité/durée de transition (aucun changement de timing).
- Boutons "+ Nouveau contrat", "+ Nouveau" (Employees), "+ Ajouter" (Parametres) : `background: theme.primary` → `background: theme.accent`, texte reste blanc ou `theme.text` selon contraste (vérifier 4.5:1, l'ambre `#F59E0B` avec texte blanc est à la limite → utiliser `theme.text` foncé sur ces boutons pour rester accessible, comme dans la maquette A).
- Les boutons de soumission de formulaire (Enregistrer, Se connecter, Créer, Importer) restent verts (`theme.primary`) — pas de changement, pour ne pas diluer le sens "action principale = vert".

## 4. Composant Skeleton (feedback de chargement)

Nouveau composant partagé `frontend/src/components/Skeleton.jsx` :

```jsx
const Skeleton = ({ width = "100%", height = 16, radius = 6, style = {} }) => (
  <div
    data-testid="skeleton"
    style={{
      width, height, borderRadius: radius,
      background: "linear-gradient(90deg, #E2E8F0 25%, #F1F5F9 50%, #E2E8F0 75%)",
      backgroundSize: "200% 100%",
      animation: "skeletonPulse 1.4s ease-in-out infinite",
      ...style,
    }}
  />
);
export default Skeleton;
```

Keyframe ajoutée à `animations.css` :
```css
@keyframes skeletonPulse {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

Remplace le texte `"Chargement..."` / `"Chargement des employés..."` dans les pages suivantes (confirmé par recherche dans le code) : `Employees.jsx`, `EmployeeDetail.jsx`, `ContratDetail.jsx`, `Dashboard.jsx`, `Parametres.jsx`, `AuditLogs.jsx`. Pour chaque page, le remplacement suit la forme existante : un bloc de 2-3 barres `<Skeleton />` de largeurs variables approximant la forme du contenu réel qui va apparaître (ex: une ligne large pour un titre, deux lignes plus courtes pour du texte), plutôt qu'un simple spinner générique — cohérent avec le contenu tabulaire/carte de l'app.

`Users.jsx` et `EmployeeForm.jsx` référencent un texte "Chargement..." dans leurs tests mais pas nécessairement dans un état de chargement plein-page équivalent aux autres pages (à vérifier dans le code au moment de l'implémentation) : si un état de chargement plein-page existe, il reçoit le même traitement `<Skeleton />` ; sinon, ces deux fichiers restent hors périmètre de ce chantier.

## Hors périmètre

- Pas de changement du vert primaire ni des couleurs de statut/hiérarchie (Direction/Département/Service) existantes.
- Pas d'animation de compteurs progressifs sur le Dashboard (écarté au profit du skeleton, priorité utilisateur).
- Pas de changement des boutons de soumission de formulaire (restent verts).
- Pas de changement backend.

## Fichiers concernés

- `frontend/src/styles/theme.js` — ajout des 4 tokens accent
- `frontend/src/styles/animations.css` — nouvelle keyframe `skeletonPulse`, couleur d'ombre hover ajustée sur `.card-lift`/`.hover-lift`
- `frontend/src/components/Skeleton.jsx` — nouveau composant
- `frontend/src/pages/Employees.jsx`, `EmployeeDetail.jsx`, `ContratDetail.jsx`, `Dashboard.jsx`, `Parametres.jsx`, `AuditLogs.jsx` — remplacement du texte de chargement par `<Skeleton />`, cercle décoratif ambre sur les hero headers, CTA secondaires en ambre
- `frontend/src/pages/Login.jsx` — cercle décoratif ambre sur le panneau de marque
- Tests correspondants (`__tests__/*.test.jsx`) : les tests qui assertent sur le texte `"Chargement..."` devront être mis à jour pour vérifier à la place l'absence de ce texte et la présence d'au moins un élément `data-testid="skeleton"` (attribut porté nativement par le composant `Skeleton`).
