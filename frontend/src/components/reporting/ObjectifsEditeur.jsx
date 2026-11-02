import { useEffect, useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { useConfirm } from "../ConfirmDialog";
import TableauSimple from "./TableauSimple";

// Objectifs DRH : une cible par indicateur, affichée sur chaque tuile KPI.
// `onChange` : rafraîchissement silencieux de la page (cibles et écarts).
// `lectureSeule` : consultant autorisé aux statistiques (modification réservée aux ADMIN, vérifiée côté serveur).
export default function ObjectifsEditeur({ onChange, lectureSeule = false }) {
  const theme = useTheme();
  const { confirm, ConfirmDialog } = useConfirm();
  const [donnees, setDonnees] = useState({ objectifs: [], indicateurs: [] });
  const [form, setForm] = useState({ code: "", cible: "", sens: "au_moins" });
  const [erreur, setErreur] = useState("");

  const charger = () =>
    api.get("/reporting/objectifs/")
      .then((r) => setDonnees({ objectifs: r.data?.objectifs || [], indicateurs: r.data?.indicateurs || [] })).catch(() => setErreur("Impossible de charger les objectifs."));
  useEffect(() => { charger(); }, []);

  const enregistrer = async (e) => {
    e.preventDefault();
    setErreur("");
    try {
      await api.put("/reporting/objectifs/", { ...form, cible: Number(form.cible) });
      setForm({ code: "", cible: "", sens: "au_moins" });
      await charger();
      onChange?.();
    } catch {
      setErreur("Objectif refusé : vérifiez l'indicateur et la valeur.");
    }
  };

  const supprimer = async (o) => {
    if (!(await confirm(`Supprimer l'objectif « ${o.libelle} » ?`))) return;
    await api.delete(`/reporting/objectifs/${o.code}/`);
    await charger();
    onChange?.();
  };

  const champ = { border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 12, fontFamily: theme.fontFamily, background: theme.surface, color: theme.text };
  return (
    <>
      {ConfirmDialog}
      <TableauSimple
        colonnes={[
          { cle: "libelle", libelle: "Indicateur" },
          { cle: "sens", libelle: "Cible", format: (v, l) => `${v === "au_plus" ? "au plus" : "au moins"} ${l.cible}` },
          { cle: "modifie_par_nom", libelle: "Fixé par" },
        ]}
        lignes={donnees.objectifs}
        onLigne={lectureSeule ? undefined : supprimer}
        vide="Aucun objectif fixé. Une cible s'affiche sur la tuile de l'indicateur, avec l'écart."
      />
      {!lectureSeule && donnees.objectifs.length > 0 && (
        <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>Cliquer sur un objectif pour le supprimer.</div>
      )}
      {!lectureSeule && (
      <form onSubmit={enregistrer} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14, alignItems: "center" }}>
        <select aria-label="Indicateur" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={champ}>
          <option value="">Indicateur…</option>
          {donnees.indicateurs.map((i) => <option key={i.code} value={i.code}>{i.libelle}</option>)}
        </select>
        <select aria-label="Sens" value={form.sens} onChange={(e) => setForm({ ...form, sens: e.target.value })} style={champ}>
          <option value="au_moins">au moins</option>
          <option value="au_plus">au plus</option>
        </select>
        <input aria-label="Valeur cible" type="number" step="0.1" required value={form.cible}
          onChange={(e) => setForm({ ...form, cible: e.target.value })} style={{ ...champ, width: 90 }} />
        <button type="submit" style={{ background: theme.primary, color: theme.surface, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: theme.fontFamily }}>
          Enregistrer
        </button>
      </form>
      )}
      {erreur && <div style={{ color: theme.danger, fontSize: 12, marginTop: 8 }}>{erreur}</div>}
    </>
  );
}
