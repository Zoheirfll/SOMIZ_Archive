import { DEFAULT_SHORTCUTS } from "./keyboardShortcuts";

const isAdmin = (role) => ["ADMIN", "SUPERADMIN"].includes(role);

// Pages du menu "Administration" (Navbar.jsx#adminMenuLinks) — dupliquées
// ici plutôt qu'importées de Navbar.jsx pour ne pas coupler la palette de
// commandes au composant Navbar (éviter un import croisé components→config).
const ADMIN_MENU_PAGES = [
  { id: "page-import", label: "Import", path: "/import" },
  { id: "page-users", label: "Utilisateurs", path: "/users" },
  { id: "page-parametres", label: "Configuration", path: "/parametres" },
  { id: "page-audit", label: "Journal", path: "/audit" },
];

// Actions de création rapide — chacune avec sa propre règle de visibilité,
// identique aux boutons "+" déjà existants sur les pages concernées (voir
// Employees.jsx pour "Nouvel employé", Attestations.jsx/DossierTab.jsx pour
// "Nouvelle demande d'attestation").
const QUICK_ACTIONS = [
  {
    id: "action-new-employee",
    label: "Nouvel employé",
    path: "/employees/nouveau",
    isVisible: (user) => isAdmin(user?.role),
  },
  {
    id: "action-new-attestation",
    label: "Nouvelle demande d'attestation",
    path: "/attestations/nouvelle",
    isVisible: (user) => ["SUPERADMIN", "GESTIONNAIRE"].includes(user?.role),
  },
];

/**
 * Catalogue "Pages & actions" de la palette de commandes (CommandPalette.jsx)
 * — combine les raccourcis de navigation rapide déjà enregistrés
 * (DEFAULT_SHORTCUTS, catégorie "quick"), les pages du menu Administration,
 * et les actions de création rapide. Filtré une seule fois par rôle ; le
 * filtrage texte de la recherche est fait par l'appelant.
 */
export function getPageActions(user) {
  const admin = isAdmin(user?.role);

  const quickPages = DEFAULT_SHORTCUTS
    .filter((s) => s.category === "quick" && (!s.adminOnly || admin))
    .map((s) => ({ id: s.id, label: s.label, path: s.path }));

  const adminPages = admin
    ? ADMIN_MENU_PAGES.map((p) => ({ id: p.id, label: p.label, path: p.path }))
    : [];

  const actions = QUICK_ACTIONS
    .filter((a) => a.isVisible(user))
    .map((a) => ({ id: a.id, label: a.label, path: a.path }));

  return [...quickPages, ...adminPages, ...actions];
}
