// Règles de visibilité des sections « chargées de… », source unique pour la
// navbar, la palette de commandes (Ctrl+K) et son catalogue d'actions.
// Elles reflètent les permissions backend (User.can_manage_*) : masquer un
// lien n'est jamais une protection, l'API reste le garde-fou.

// Droit de CRÉER une demande (SUPERADMIN, ou GESTIONNAIRE/CONSULTANT auquel un
// ADMIN a attribué le droit — User.can_request_*, voir /users).
export const canRequestAttestations = (user) => !!user?.can_request_attestations;
export const canRequestConsultations = (user) => !!user?.can_request_consultations;
export const canRequestConges = (user) => !!user?.can_request_conges;

// Attestations : demandeur autorisé, ou traiteur (SUPERADMIN / ADMIN chargé).
export const canSeeAttestations = (user) =>
  canRequestAttestations(user) || !!user?.can_manage_attestations;

// Consultations d'archives : demandeurs autorisés et traiteurs.
export const canSeeConsultations = (user) =>
  canRequestConsultations(user) || !!user?.can_manage_consultations;

// Congés : demandeurs autorisés (peut_demander_conge) et traiteurs (SUPERADMIN /
// ADMIN charge_conge) — User.can_request_conges / can_manage_conges côté backend.
export const canSeeConges = (user) =>
  canRequestConges(user) || !!user?.can_manage_conges;

// Registres : le SUPERADMIN toujours (testé sur le rôle, pas seulement sur le
// drapeau : robuste à une session ouverte avant l'ajout du champ), sinon un
// ADMIN porteur de can_manage_registres.
export const canSeeRegistres = (user) =>
  user?.role === "SUPERADMIN" || !!user?.can_manage_registres;
