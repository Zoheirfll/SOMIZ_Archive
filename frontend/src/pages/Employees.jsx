import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import "../styles/animations.css";
import PageBackground from "../components/PageBackground";
import HeroDecor from "../components/HeroDecor";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";
import { usePaginationShortcuts } from "../hooks/useKeyboardShortcuts";
import { useKeyboardShortcutsHelp } from "../context/KeyboardShortcutsContext";
import useIsMobile from "../hooks/useIsMobile";
import { slugify } from "../utils/slugify";
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES } from "../config/notices";
import {
  IconUsers,
  IconArrowRight,
  IconImport,
  IconPlus,
} from "../components/employees/icons";
import HierarchyView from "../components/employees/HierarchyView";
import EmployeesTable from "../components/employees/EmployeesTable";
import Breadcrumb from "../components/employees/Breadcrumb";
import {
  COLUMN_OPTIONS_FIXED,
  COLUMNS_STORAGE_KEY,
  loadColumnOverrides,
  defaultColumnVisible,
} from "../config/employeesColumns";

// ─── Composant principal ──────────────────────────────────────────────────────

const Employees = () => {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();
  const [archivesCount, setArchivesCount] = useState(null);
  const [activeEmployeesCount, setActiveEmployeesCount] = useState(null);
  const [view, setView] = useState("directions");
  const [selectedDirection, setSelectedDirection] = useState(null);
  const [selectedPole, setSelectedPole] = useState(null);
  const [selectedDepartement, setSelectedDepartement] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  // Filtre Pôle/Cellule — arrivée depuis l'Organigramme uniquement, en
  // dehors du drill-down Direction>Département>Service existant.
  const [orgFilter, setOrgFilter] = useState(null);
  const [directions, setDirections] = useState([]);
  const [poles, setPoles] = useState([]);
  const [departements, setDepartements] = useState([]);
  const [departementsDePole, setDepartementsDePole] = useState([]);
  const [cellulesDirection, setCellulesDirection] = useState([]);
  const [sectionsDirection, setSectionsDirection] = useState([]);
  const [services, setServices] = useState([]);
  const [cellulesDepartement, setCellulesDepartement] = useState([]);
  const [sectionsDepartement, setSectionsDepartement] = useState([]);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [hierarchyKey, setHierarchyKey] = useState(0);

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState(null);
  const [columnOverrides, setColumnOverrides] = useState(loadColumnOverrides);
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  const [customFields, setCustomFields] = useState([]); // champs personnalisés actifs
  const [motifsArchivage, setMotifsArchivage] = useState([]);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveMotif, setArchiveMotif] = useState("");

  const isColumnVisible = (key) =>
    key in columnOverrides ? columnOverrides[key] : defaultColumnVisible(key);

  const toggleColumn = (key) => {
    setColumnOverrides((prev) => {
      const next = { ...prev, [key]: !isColumnVisible(key) };
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const setAllColumns = (visible) => {
    const next = { ...columnOverrides };
    COLUMN_OPTIONS.forEach((c) => {
      next[c.key] = visible;
    });
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next));
    setColumnOverrides(next);
  };

  const COLUMN_OPTIONS = [
    ...COLUMN_OPTIONS_FIXED,
    ...customFields.map((c) => ({ key: `custom_${c.code}`, label: c.nom })),
  ];

  useEffect(() => {
    api
      .get("/ref/motifs-archivage/")
      .then((r) => {
        const list = r.data.results || r.data;
        setMotifsArchivage(list.filter((m) => m.is_active));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get("/ref/champs-personnalises/")
      .then((r) => {
        const list = r.data.results || r.data;
        setCustomFields(list.filter((c) => c.is_active));
      })
      .catch(() => {});
  }, []);

  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("q") || "";
  const statut = searchParams.get("statut") || "";
  // Onglet "Organisation" (drill-down, Actif implicite) / "Archivés" (liste
  // à plat, Inactif/Archivé/Démobilisé) — voir CLAUDE.md section Archivage
  // employé.
  const vue = searchParams.get("vue") === "archives" ? "archives" : "organisation";
  const setVue = (val) =>
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (val === "archives") n.set("vue", "archives");
      else n.delete("vue");
      n.delete("statut");
      n.set("page", "1");
      return n;
    });
  const page = parseInt(searchParams.get("page") || "1", 10);
  const ordering = searchParams.get("ordering") || "nom";
  const dossierComplet = searchParams.get("dossier_complet");
  const typeManquant = searchParams.get("type_manquant") || "";
  const [typeManquantLabel, setTypeManquantLabel] = useState("");

  // Niveau du drill-down (Direction>Département>Service) synchronisé dans
  // l'URL — chaque clic pousse une entrée d'historique (pas de replace),
  // pour que le retour arrière navigateur / Alt+← redescende d'un niveau à
  // la fois au lieu de sortir directement de la page (voir pushDrillParams).
  // dir/dep/svc sont des slugs lisibles (nom, pas l'UUID interne) — ce ne
  // sont pas des données personnelles (contrairement à employeeSlug), donc
  // rien n'empêche de les afficher tels quels dans l'URL.
  const drillLevel = searchParams.get("lvl") || "directions";
  const drillDirSlug = searchParams.get("dir") || "";
  const drillDepSlug = searchParams.get("dep") || "";
  const drillSvcSlug = searchParams.get("svc") || "";

  const pushDrillParams = (next) =>
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      n.delete("lvl");
      n.delete("dir");
      n.delete("dep");
      n.delete("svc");
      if (next.lvl) n.set("lvl", next.lvl);
      if (next.dir) n.set("dir", next.dir);
      if (next.dep) n.set("dep", next.dep);
      if (next.svc) n.set("svc", next.svc);
      n.set("page", "1");
      return n;
    }); // pas de { replace: true } ici : on veut un empilement dans l'historique

  const clearCompletudeFilter = () =>
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("dossier_complet");
        n.delete("type_manquant");
        n.set("page", "1");
        return n;
      },
      { replace: true },
    );

  const setSearch = (val) =>
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (val) n.set("q", val);
        else n.delete("q");
        n.set("page", "1");
        return n;
      },
      { replace: true },
    );
  const setStatut = (val) =>
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (val) n.set("statut", val);
        else n.delete("statut");
        n.set("page", "1");
        return n;
      },
      { replace: true },
    );
  const setPage = (val) =>
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set("page", String(typeof val === "function" ? val(page) : val));
        return n;
      },
      { replace: true },
    );
  const setOrdering = (val) =>
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set("ordering", typeof val === "function" ? val(ordering) : val);
        n.set("page", "1");
        return n;
      },
      { replace: true },
    );

  const { overrides: shortcutOverrides } = useKeyboardShortcutsHelp();
  usePaginationShortcuts({
    page,
    totalPages,
    onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
    onPrev: () => setPage((p) => Math.max(1, p - 1)),
    comboNext: shortcutOverrides["pagination-next"] || "ArrowRight",
    comboPrev: shortcutOverrides["pagination-prev"] || "ArrowLeft",
  });

  // Champ de recherche du tableau : ne déclenche la recherche qu'à la validation
  // (submit), pas à chaque frappe — même comportement que la barre du haut.
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    setSearchInput(search);
  }, [search]);
  const handleTableSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const PAGE_SIZE = 25;

  useEffect(() => {
    setSelected(new Set());
  }, [search, statut, ordering]);

  // ─── Fetch hierarchy data ─────────────────────────────────────────────────

  useEffect(() => {
    const fetch = async () => {
      setHierarchyLoading(true);
      try {
        const res = await api.get("/ref/directions/");
        setDirections(res.data.results || res.data);
      } catch {
        setDirections([]);
      } finally {
        setHierarchyLoading(false);
      }
    };
    fetch();
  }, []);

  useEffect(() => {
    if (!selectedDirection) return;
    const fetch = async () => {
      setHierarchyLoading(true);
      try {
        const [deptRes, poleRes, celRes, secRes] = await Promise.all([
          api.get("/ref/departements/", {
            params: { direction: selectedDirection.id },
          }),
          api.get("/ref/poles/", {
            params: { direction: selectedDirection.id },
          }),
          api.get("/ref/cellules/", {
            params: { direction: selectedDirection.id },
          }),
          api.get("/ref/sections/", {
            params: { direction: selectedDirection.id },
          }),
        ]);
        setDepartements(deptRes.data.results || deptRes.data);
        setPoles(poleRes.data.results || poleRes.data);
        setCellulesDirection(celRes.data.results || celRes.data);
        setSectionsDirection(secRes.data.results || secRes.data);
      } catch {
        setDepartements([]);
        setPoles([]);
        setCellulesDirection([]);
        setSectionsDirection([]);
      } finally {
        setHierarchyLoading(false);
      }
    };
    fetch();
  }, [selectedDirection]);

  useEffect(() => {
    if (!selectedPole) return;
    const fetch = async () => {
      setHierarchyLoading(true);
      try {
        const res = await api.get("/ref/departements/", {
          params: { pole: selectedPole.id },
        });
        setDepartementsDePole(res.data.results || res.data);
      } catch {
        setDepartementsDePole([]);
      } finally {
        setHierarchyLoading(false);
      }
    };
    fetch();
  }, [selectedPole]);

  useEffect(() => {
    if (!selectedDepartement) return;
    const fetch = async () => {
      setHierarchyLoading(true);
      try {
        const [srvRes, celRes, secRes] = await Promise.all([
          api.get("/ref/services/", {
            params: { departement: selectedDepartement.id },
          }),
          api.get("/ref/cellules/", {
            params: { departement: selectedDepartement.id },
          }),
          api.get("/ref/sections/", {
            params: { departement: selectedDepartement.id },
          }),
        ]);
        setServices(srvRes.data.results || srvRes.data);
        setCellulesDepartement(celRes.data.results || celRes.data);
        setSectionsDepartement(secRes.data.results || secRes.data);
      } catch {
        setServices([]);
        setCellulesDepartement([]);
        setSectionsDepartement([]);
      } finally {
        setHierarchyLoading(false);
      }
    };
    fetch();
  }, [selectedDepartement]);

  // ─── Fetch employees ──────────────────────────────────────────────────────

  const fetchEmployees = useCallback(async () => {
    if (view !== "employees" && vue !== "archives") return;
    setLoading(true);
    try {
      const params = { page };
      if (search) params.q = search;
      if (ordering) params.ordering = ordering;
      if (vue === "archives") {
        // Liste à plat, tous périmètres organisationnels confondus — voir
        // CLAUDE.md section Archivage employé. Le filtre Statut, restreint
        // aux 3 valeurs non-Actif dans ce mode, affine côté serveur.
        params.vue = "archives";
        if (statut) params.statut = statut;
      } else {
        if (dossierComplet !== null) params.dossier_complet = dossierComplet;
        if (typeManquant) params.type_manquant = typeManquant;
        if (orgFilter) params[orgFilter.type] = orgFilter.id;
        else if (selectedService) params.service = selectedService.id;
        else if (selectedDepartement) params.departement = selectedDepartement.id;
        else if (selectedDirection) params.direction = selectedDirection.id;
      }
      const response = await api.get("/employees/", { params });
      setEmployees(response.data.results || response.data);
      setTotalCount(response.data.count || 0);
      setTotalPages(Math.ceil((response.data.count || 0) / PAGE_SIZE));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [
    view,
    vue,
    search,
    statut,
    page,
    ordering,
    dossierComplet,
    typeManquant,
    selectedService,
    selectedDepartement,
    selectedDirection,
    orgFilter,
  ]);

  const handleExportAll = async () => {
    try {
      const params = {};
      if (search) params.q = search;
      if (statut) params.statut = statut;
      if (vue === "archives") params.vue = "archives";
      if (orgFilter) params[orgFilter.type] = orgFilter.id;
      else if (selectedService) params.service = selectedService.id;
      else if (selectedDepartement) params.departement = selectedDepartement.id;
      else if (selectedDirection) params.direction = selectedDirection.id;
      const response = await api.get("/employees/export/", {
        params,
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "export_employes.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  // Arrivée depuis le dashboard (?dossier_complet=... ou ?type_manquant=...)
  // — bascule directement sur la liste, comme pour les liens Organigramme.
  useEffect(() => {
    if (dossierComplet !== null || typeManquant) setView("employees");
  }, [dossierComplet, typeManquant]);

  useEffect(() => {
    if (!typeManquant) {
      setTypeManquantLabel("");
      return;
    }
    api
      .get("/ref/types-documents/")
      .then((r) => {
        const list = r.data.results || r.data;
        const t = list.find((x) => x.code === typeManquant);
        setTypeManquantLabel(t ? t.nom : typeManquant);
      })
      .catch(() => setTypeManquantLabel(typeManquant));
  }, [typeManquant]);

  useEffect(() => {
    if (view !== "employees" && vue !== "archives") return;
    const delay = setTimeout(fetchEmployees, 300);
    return () => clearTimeout(delay);
  }, [fetchEmployees, view, vue]);

  // Une sélection faite dans un onglet n'a plus de sens dans l'autre
  // (ids potentiellement hors de la nouvelle liste affichée).
  useEffect(() => {
    setSelected(new Set());
  }, [vue]);

  const fetchArchivesCount = useCallback(() => {
    api
      .get("/employees/", { params: { vue: "archives", page: 1 } })
      .then((res) => setArchivesCount(res.data.count ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchArchivesCount();
    api
      .get("/employees/", { params: { page: 1 } })
      .then((res) => setActiveEmployeesCount(res.data.count ?? 0))
      .catch(() => {});
  }, [fetchArchivesCount]);

  // Arrivée depuis l'Organigramme (/employees?direction=<id> etc.) — bascule
  // directement sur la liste des employés filtrée, sans repasser par le
  // drill-down carte par carte.
  useEffect(() => {
    const directionId = searchParams.get("direction");
    const departementId = searchParams.get("departement");
    const serviceId = searchParams.get("service");
    const poleId = searchParams.get("pole");
    const celluleId = searchParams.get("cellule");
    const sectionId = searchParams.get("section");
    if (!directionId && !departementId && !serviceId && !poleId && !celluleId && !sectionId)
      return;
    (async () => {
      try {
        if (serviceId) {
          const res = await api.get(`/ref/services/${serviceId}/`);
          setSelectedService(res.data);
        } else if (celluleId) {
          const res = await api.get(`/ref/cellules/${celluleId}/`);
          setOrgFilter({ type: "cellule", id: celluleId, nom: res.data.nom });
        } else if (sectionId) {
          const res = await api.get(`/ref/sections/${sectionId}/`);
          setOrgFilter({ type: "section", id: sectionId, nom: res.data.nom });
        } else if (departementId) {
          const res = await api.get(`/ref/departements/${departementId}/`);
          setSelectedDepartement(res.data);
        } else if (poleId) {
          const res = await api.get(`/ref/poles/${poleId}/`);
          setOrgFilter({ type: "pole", id: poleId, nom: res.data.nom });
        } else if (directionId) {
          const res = await api.get(`/ref/directions/${directionId}/`);
          setSelectedDirection(res.data);
        }
        setView("employees");
      } catch (err) {
        console.error(err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconstruit l'état du drill-down (Direction>Département>Service) à
  // partir de l'URL — se déclenche sur retour arrière navigateur / Alt+←
  // (popstate change lvl/dir/dep/svc sans passer par selectDirection() etc.,
  // qui ont déjà mis à jour l'état local avant de pousser ces mêmes params —
  // dans ce cas les objets sélectionnés correspondent déjà et rien ne
  // refetch). Ignoré si on arrive via un lien Organigramme (params distincts
  // direction/departement/service/pole/cellule/section, gérés ci-dessus).
  useEffect(() => {
    if (
      searchParams.get("direction") ||
      searchParams.get("departement") ||
      searchParams.get("service") ||
      searchParams.get("pole") ||
      searchParams.get("cellule") ||
      searchParams.get("section")
    ) {
      return;
    }

    (async () => {
      try {
        let dirObj = selectedDirection;
        let depObj = selectedDepartement;
        let svcObj = selectedService;

        if (drillLevel === "directions") {
          dirObj = null;
          depObj = null;
          svcObj = null;
        } else {
          if (drillDirSlug && slugify(dirObj?.nom) !== drillDirSlug) {
            // La liste complète des directions est déjà chargée au montage
            // (voir fetch hierarchy ci-dessus) — pas d'appel réseau ici.
            if (directions.length === 0) return; // pas encore chargée, on réessaiera (directions en dépendance)
            dirObj = directions.find((d) => slugify(d.nom) === drillDirSlug) || null;
          }
          if (drillLevel === "departements" || !dirObj) {
            depObj = null;
            svcObj = null;
          } else {
            if (drillDepSlug && slugify(depObj?.nom) !== drillDepSlug) {
              const res = await api.get(`/ref/departements/?direction=${dirObj.id}`);
              const list = res.data.results || res.data;
              depObj = list.find((d) => slugify(d.nom) === drillDepSlug) || null;
            }
            if (drillLevel === "services" || !depObj) {
              svcObj = null;
            } else if (drillLevel === "employees") {
              if (drillSvcSlug) {
                if (slugify(svcObj?.nom) !== drillSvcSlug) {
                  const res = await api.get(`/ref/services/?departement=${depObj.id}`);
                  const list = res.data.results || res.data;
                  svcObj = list.find((s) => slugify(s.nom) === drillSvcSlug) || null;
                }
              } else {
                svcObj = null;
              }
            }
          }
        }

        if (
          view === drillLevel &&
          (dirObj?.id || null) === (selectedDirection?.id || null) &&
          (depObj?.id || null) === (selectedDepartement?.id || null) &&
          (svcObj?.id || null) === (selectedService?.id || null)
        ) {
          return; // déjà à jour (navigation vers l'avant via un clic)
        }

        setSelectedDirection(dirObj);
        setSelectedDepartement(depObj);
        setSelectedService(svcObj);
        setOrgFilter(null);
        setView(drillLevel);
        setHierarchyKey((k) => k + 1);
      } catch (err) {
        console.error(err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillLevel, drillDirSlug, drillDepSlug, drillSvcSlug, directions]);

  // ─── Navigation ───────────────────────────────────────────────────────────

  const goToDirections = () => {
    setView("directions");
    setSelectedDirection(null);
    setSelectedPole(null);
    setSelectedDepartement(null);
    setSelectedService(null);
    setOrgFilter(null);
    setHierarchyKey((k) => k + 1);
    pushDrillParams({ lvl: "directions" });
  };
  const selectDirection = (dir) => {
    setSelectedDirection(dir);
    setSelectedPole(null);
    setSelectedDepartement(null);
    setSelectedService(null);
    setOrgFilter(null);
    setView("departements");
    setHierarchyKey((k) => k + 1);
    pushDrillParams({ lvl: "departements", dir: slugify(dir.nom) });
  };
  const selectPole = (pole) => {
    setSelectedPole(pole);
    setSelectedDepartement(null);
    setSelectedService(null);
    setHierarchyKey((k) => k + 1);
  };
  const selectDepartement = (dept) => {
    setSelectedDepartement(dept);
    setSelectedService(null);
    setView("services");
    setHierarchyKey((k) => k + 1);
    pushDrillParams({
      lvl: "services",
      dir: slugify(selectedDirection?.nom),
      dep: slugify(dept.nom),
    });
  };
  const selectService = (svc) => {
    setSelectedService(svc);
    setView("employees");
    setPage(1);
    setHierarchyKey((k) => k + 1);
    pushDrillParams({
      lvl: "employees",
      dir: slugify(selectedDirection?.nom),
      dep: slugify(selectedDepartement?.nom),
      svc: slugify(svc.nom),
    });
  };
  const selectCellule = (cellule) => {
    setOrgFilter({ type: "cellule", id: cellule.id, nom: cellule.nom });
    setView("employees");
    setPage(1);
    setHierarchyKey((k) => k + 1);
  };
  const selectSection = (section) => {
    setOrgFilter({ type: "section", id: section.id, nom: section.nom });
    setView("employees");
    setPage(1);
    setHierarchyKey((k) => k + 1);
  };
  const goToAllEmployees = () => {
    setSelectedService(null);
    setOrgFilter(null);
    setView("employees");
    setPage(1);
    pushDrillParams({
      lvl: "employees",
      dir: slugify(selectedDirection?.nom),
      dep: slugify(selectedDepartement?.nom),
    });
  };

  // ─── Bulk actions ─────────────────────────────────────────────────────────

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleSelectAll = () =>
    selected.size === employees.length
      ? setSelected(new Set())
      : setSelected(new Set(employees.map((e) => e.id)));

  const handleBulkAction = async (action, motifArchivage = null) => {
    if (selected.size === 0) return;
    if (action === "delete") {
      // Suppression définitive et irréversible — confirmation renforcée
      // (voir CLAUDE.md section Archivage employé) : l'admin doit taper
      // le mot "SUPPRIMER" pour l'activer, en plus du garde-fou serveur
      // qui refuse tout employé encore Actif dans la sélection.
      const typed = await prompt(
        `Supprimer définitivement ${selected.size} employé(s), leurs contrats, documents et fichiers ? Cette action est IRRÉVERSIBLE.\n\nTapez SUPPRIMER pour confirmer :`,
      );
      if (typed !== "SUPPRIMER") return;
    } else if (action === "restaurer") {
      if (!(await confirm(`Restaurer ${selected.size} employé(s) (retour au statut Actif) ?`)))
        return;
    }
    // "archive" est déjà confirmé via la modale dédiée (choix du motif) —
    // pas de double confirmation ici.
    setDeleting(true);
    try {
      const response = await api.post("/employees/bulk-delete/", {
        ids: Array.from(selected),
        action,
        ...(action === "archive" && motifArchivage
          ? { motif_archivage: motifArchivage }
          : {}),
      });
      const nb =
        response.data.nb_supprimes ||
        response.data.nb_archives ||
        response.data.nb_restaures;
      setMessage({
        type: "success",
        text:
          action === "delete"
            ? `${nb} employé(s) supprimé(s) définitivement.`
            : action === "restaurer"
              ? `${nb} employé(s) restauré(s).`
              : `${nb} employé(s) archivé(s).`,
      });
      setSelected(new Set());
      fetchEmployees();
      fetchArchivesCount();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.error || "Erreur lors de l'opération.",
      });
    } finally {
      setDeleting(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const allSelected =
    employees.length > 0 && selected.size === employees.length;
  const someSelected = selected.size > 0;

  // ─── Recherche globale (visible sur toutes les vues) ──────────────────────
  const [globalInput, setGlobalInput] = useState("");

  const handleGlobalSearch = (e) => {
    e.preventDefault();
    const q = globalInput.trim();
    if (!q) return;
    setSelectedService(null);
    setView("employees");
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set("q", q);
        n.set("page", "1");
        return n;
      },
      { replace: true },
    );
    setHierarchyKey((k) => k + 1);
  };

  // ─── Breadcrumb items ─────────────────────────────────────────────────────

  const breadcrumbItems = [
    {
      label: "Toutes les directions",
      onClick: view !== "directions" ? goToDirections : null,
    },
    ...(selectedDirection
      ? [
          {
            label: selectedDirection.nom,
            onClick:
              view !== "departements" || selectedPole
                ? () => {
                    setView("departements");
                    setSelectedPole(null);
                    setSelectedDepartement(null);
                    setSelectedService(null);
                    setHierarchyKey((k) => k + 1);
                    pushDrillParams({ lvl: "departements", dir: slugify(selectedDirection.nom) });
                  }
                : null,
          },
        ]
      : []),
    ...(selectedPole
      ? [
          {
            label: selectedPole.nom,
            onClick:
              view !== "departements"
                ? () => {
                    setView("departements");
                    setSelectedDepartement(null);
                    setSelectedService(null);
                    setHierarchyKey((k) => k + 1);
                    pushDrillParams({ lvl: "departements", dir: slugify(selectedDirection?.nom) });
                  }
                : null,
          },
        ]
      : []),
    ...(selectedDepartement
      ? [
          {
            label: selectedDepartement.nom,
            onClick:
              view !== "services"
                ? () => {
                    setView("services");
                    setSelectedService(null);
                    setHierarchyKey((k) => k + 1);
                    pushDrillParams({
                      lvl: "services",
                      dir: slugify(selectedDirection?.nom),
                      dep: slugify(selectedDepartement.nom),
                    });
                  }
                : null,
          },
        ]
      : []),
    ...(selectedService ? [{ label: selectedService.nom, onClick: null }] : []),
    ...(orgFilter && (orgFilter.type === "cellule" || orgFilter.type === "section")
      ? [{ label: orgFilter.nom, onClick: null }]
      : []),
    ...(view === "employees" && !selectedService && !orgFilter
      ? [{ label: "Tous les employés", onClick: null }]
      : []),
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />

      {/* Hero header */}
      <div
        style={{
          background:
            "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
          padding: isMobile ? "20px 16px 24px" : "36px 32px 40px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <HeroDecor />
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 20,
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    borderRadius: 10,
                    padding: "8px 10px",
                    display: "flex",
                    color: "#fff",
                  }}
                >
                  <IconUsers size={22} color="#fff" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h1
                    style={{
                      color: "#FFFFFF",
                      margin: 0,
                      fontSize: 26,
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Dossiers Employés
                  </h1>
                  <InfoNotice text={PAGE_NOTICES.employees} />
                </div>
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.65)",
                  fontSize: 13,
                  paddingLeft: 52,
                }}
              >
                {view === "employees"
                  ? `${totalCount} employé(s)${selectedService ? ` — Service : ${selectedService.nom}` : " au total"}`
                  : "Naviguez par direction, département et service"}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {/* Barre de recherche globale */}
              <form
                onSubmit={handleGlobalSearch}
                style={{ display: "flex", gap: 0 }}
              >
                <div style={{ position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "rgba(255,255,255,0.5)",
                      pointerEvents: "none",
                      display: "flex",
                    }}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={globalInput}
                    onChange={(e) => setGlobalInput(e.target.value)}
                    placeholder="Matricule, N° contrat, nom, prénom..."
                    className="input-focus"
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.25)",
                      borderRight: "none",
                      borderRadius: "10px 0 0 10px",
                      padding: "10px 14px 10px 36px",
                      color: "#fff",
                      fontSize: 13,
                      outline: "none",
                      width: 260,
                      fontFamily: theme.fontFamily,
                    }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    background: "#fff",
                    border: "none",
                    borderRadius: "0 10px 10px 0",
                    padding: "10px 16px",
                    color: theme.primary,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Chercher
                </button>
              </form>
              {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                <>
                  <button
                    onClick={handleExportAll}
                    className="btn-lift"
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.25)",
                      color: "#fff",
                      borderRadius: 10,
                      padding: "10px 18px",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    <IconImport size={15} />
                    Exporter
                  </button>
                  <button
                    onClick={() => navigate("/import")}
                    className="btn-lift"
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.25)",
                      color: "#fff",
                      borderRadius: 10,
                      padding: "10px 18px",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    <IconImport size={15} />
                    Import CSV, XLSX
                  </button>
                  <button
                    onClick={() => navigate("/employees/nouveau")}
                    className="btn-lift"
                    style={{
                      background: theme.accent,
                      border: "none",
                      borderRadius: 10,
                      padding: "10px 20px",
                      color: theme.text,
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                    }}
                  >
                    <IconPlus size={15} />
                    Nouvel employé
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          padding: isMobile ? "16px" : "28px 32px",
          maxWidth: 1300,
          margin: "0 auto",
        }}
      >
        {/* Onglets Organisation / Archivés — voir CLAUDE.md section
            Archivage employé : un employé Inactif/Archivé/Démobilisé
            "sort" de l'organisation et vit dans une liste séparée. */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 20,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          {[
            { key: "organisation", label: "Organisation" },
            {
              key: "archives",
              label:
                archivesCount !== null
                  ? `Archivés (${archivesCount})`
                  : "Archivés",
            },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setVue(tab.key)}
              style={{
                background: "none",
                border: "none",
                borderBottom:
                  vue === tab.key
                    ? `2px solid ${theme.primary}`
                    : "2px solid transparent",
                color: vue === tab.key ? theme.primary : theme.textSecondary,
                fontWeight: vue === tab.key ? 700 : 600,
                fontSize: 14,
                padding: "8px 4px",
                marginBottom: -1,
                cursor: "pointer",
                fontFamily: theme.fontFamily,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Accès rapide "Voir tous les employés" — mis en avant en haut de
            page (racine du drill-down uniquement) plutôt qu'enfoui en bas
            de la grille des directions, pour un accès direct sans devoir
            d'abord parcourir l'arborescence. */}
        {vue === "organisation" && view === "directions" && (
          <button
            onClick={goToAllEmployees}
            className="btn-lift anim-fade-in"
            style={{
              width: "100%",
              background: theme.primaryBg,
              border: `1.5px solid ${theme.primaryBorder}`,
              borderRadius: 14,
              padding: "16px 20px",
              marginBottom: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              textAlign: "left",
              fontFamily: theme.fontFamily,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: theme.primary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <IconUsers size={20} color="#fff" />
              </div>
              <div>
                <div
                  style={{
                    color: theme.primary,
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  Voir tous les employés
                </div>
                <div
                  style={{
                    color: theme.textSecondary,
                    fontSize: 13,
                    marginTop: 1,
                  }}
                >
                  {activeEmployeesCount !== null
                    ? `${activeEmployeesCount} employé(s) actif(s), toutes directions confondues`
                    : "Liste complète, sans filtre par direction/service"}
                </div>
              </div>
            </div>
            <span style={{ color: theme.primary, display: "flex" }}>
              <IconArrowRight size={18} />
            </span>
          </button>
        )}

        {/* Breadcrumb */}
        {vue === "organisation" && breadcrumbItems.length > 1 && (
          <div
            className="anim-slide-down"
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              padding: "10px 16px",
              marginBottom: 24,
              boxShadow: theme.shadow,
            }}
          >
            <Breadcrumb items={breadcrumbItems} />
          </div>
        )}

        {/* Notification */}
        {message && (
          <div
            className="notif-banner"
            style={{
              background:
                message.type === "success" ? theme.primaryBg : theme.dangerBg,
              border: `1px solid ${message.type === "success" ? theme.primaryBorder : theme.dangerBorder}`,
              color: message.type === "success" ? theme.primary : theme.danger,
              borderRadius: 10,
              padding: "12px 18px",
              marginBottom: 20,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {message.text}
          </div>
        )}

        {vue === "archives" || view === "employees" ? (
          <EmployeesTable
            employees={employees}
            loading={loading}
            selected={selected}
            setSelected={setSelected}
            someSelected={someSelected}
            allSelected={allSelected}
            statut={statut}
            setStatut={setStatut}
            ordering={ordering}
            setOrdering={setOrdering}
            page={page}
            setPage={setPage}
            totalPages={totalPages}
            totalCount={totalCount}
            search={search}
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            colsMenuOpen={colsMenuOpen}
            setColsMenuOpen={setColsMenuOpen}
            orgFilter={orgFilter}
            setOrgFilter={setOrgFilter}
            selectedService={selectedService}
            vue={vue}
            deleting={deleting}
            customFields={customFields}
            isColumnVisible={isColumnVisible}
            dossierComplet={dossierComplet}
            typeManquant={typeManquant}
            typeManquantLabel={typeManquantLabel}
            isMobile={isMobile}
            user={user}
            setAllColumns={setAllColumns}
            toggleColumn={toggleColumn}
            toggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll}
            clearCompletudeFilter={clearCompletudeFilter}
            goToAllEmployees={goToAllEmployees}
            handleBulkAction={handleBulkAction}
            handleExportAll={handleExportAll}
            handleTableSearchSubmit={handleTableSearchSubmit}
            navigate={navigate}
            PAGE_SIZE={PAGE_SIZE}
            COLUMN_OPTIONS={COLUMN_OPTIONS}
            setArchiveMotif={setArchiveMotif}
            setArchiveModalOpen={setArchiveModalOpen}
          />
        ) : (
          <HierarchyView
            hierarchyLoading={hierarchyLoading}
            hierarchyKey={hierarchyKey}
            view={view}
            directions={directions}
            poles={poles}
            departements={departements}
            services={services}
            selectedDirection={selectedDirection}
            selectedPole={selectedPole}
            selectedDepartement={selectedDepartement}
            departementsDePole={departementsDePole}
            cellulesDirection={cellulesDirection}
            sectionsDirection={sectionsDirection}
            cellulesDepartement={cellulesDepartement}
            sectionsDepartement={sectionsDepartement}
            selectDirection={selectDirection}
            selectPole={selectPole}
            selectDepartement={selectDepartement}
            selectService={selectService}
            selectCellule={selectCellule}
            selectSection={selectSection}
          />
        )}
      </div>
      {ConfirmDialog}
      {PromptDialog}
      {archiveModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            backdropFilter: "blur(2px)",
          }}
          onClick={() => setArchiveModalOpen(false)}
        >
          <div
            style={{
              background: theme.surface,
              borderRadius: 16,
              padding: 28,
              width: 420,
              maxWidth: "90vw",
              boxShadow: "0 16px 48px rgba(15,23,42,0.25)",
              border: `1px solid ${theme.border}`,
              fontFamily: theme.fontFamily,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, marginBottom: 6 }}>
              Archiver {selected.size} employé(s) ?
            </div>
            <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 16 }}>
              Ils sortiront de l'organisation et rejoindront l'onglet
              "Archivés". Action réversible (bouton "Restaurer").
            </div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: theme.textSecondary,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                display: "block",
                marginBottom: 6,
              }}
            >
              Motif (optionnel)
            </label>
            <select
              value={archiveMotif}
              onChange={(e) => setArchiveMotif(e.target.value)}
              className="input-focus"
              style={{
                width: "100%",
                border: `1.5px solid ${theme.border}`,
                borderRadius: 10,
                padding: "10px 14px",
                color: theme.text,
                fontSize: 14,
                outline: "none",
                background: theme.bg,
                cursor: "pointer",
                fontFamily: theme.fontFamily,
                marginBottom: 20,
              }}
            >
              <option value="">-- Aucun --</option>
              {motifsArchivage.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setArchiveModalOpen(false)}
                style={{
                  background: "transparent",
                  border: `1px solid ${theme.border}`,
                  color: theme.textSecondary,
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: theme.fontFamily,
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setArchiveModalOpen(false);
                  handleBulkAction("archive", archiveMotif || null);
                }}
                style={{
                  background: "#FFFBEB",
                  border: `1px solid #FDE68A`,
                  color: "#92400E",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: theme.fontFamily,
                }}
              >
                Archiver
              </button>
            </div>
          </div>
        </div>
      )}
    </PageBackground>
  );
};

export default Employees;
