import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import EmployeeAvatar from "../components/EmployeeAvatar";
import { IMPORTANCES } from "../components/attestations/ImportanceBadge";
import ExerciceSelect from "../components/conges/ExerciceSelect";
import { formatDateFR } from "../utils/formatDate";
import { TYPES_CONGE, ajouterJours, exerciceParDefaut, joursEntre, refVersUrl } from "../utils/conges";

const premiereErreur = (d) =>
  d?.error || d?.type_conge?.[0] || d?.motif?.[0] || d?.exercice?.[0] || d?.date_depart?.[0] ||
  d?.date_retour?.[0] || d?.nb_jours?.[0] || d?.adresse_conge?.[0] || d?.employee?.[0] ||
  d?.non_field_errors?.[0];

export default function CongeNouvelle() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [contrats, setContrats] = useState([]);
  const [contratId, setContratId] = useState("");
  const [motifs, setMotifs] = useState([]);
  const [typeConge, setTypeConge] = useState("CP");
  const [motifId, setMotifId] = useState("");
  // Solde de l'employé (null = non initialisé) : sert à proposer l'exercice.
  const [solde, setSolde] = useState(null);
  const [exercice, setExercice] = useState("");
  const [dateDepart, setDateDepart] = useState("");
  const [dateRetour, setDateRetour] = useState("");
  const [nbJours, setNbJours] = useState("");
  // Vrai dès que l'utilisateur corrige le nombre de jours à la main (week-ends,
  // jours fériés, demi-journées…) : le calcul automatique ne l'écrase plus.
  const [nbJoursSaisi, setNbJoursSaisi] = useState(false);
  const [adresse, setAdresse] = useState("");
  const [importance, setImportance] = useState("moyenne");
  const [commentaire, setCommentaire] = useState("");
  // Pièces jointes facultatives : une par pièce attendue du motif + une libre.
  const [fichiers, setFichiers] = useState({});
  const [autreFichier, setAutreFichier] = useState(null);
  const [autreLibelle, setAutreLibelle] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/conges/motifs/")
      .then((res) => setMotifs((res.data?.results || res.data || []).filter((m) => m.is_active)))
      .catch(() => setError("Impossible de charger les motifs de congé."));
  }, []);

  useEffect(() => {
    const employeeId = location.state?.employeeId;
    if (!employeeId) return;
    api.get(`/employees/${employeeId}/`).then((res) => setEmployee(res.data));
  }, [location.state]);

  useEffect(() => {
    if (!employee) { setContrats([]); setContratId(""); setSolde(null); setExercice(""); return; }
    api.get(`/employees/${employee.id}/contrats/`).then((res) => {
      setContrats(res.data?.results || res.data || []);
    });
    api.get(`/conges/soldes/${employee.matricule}/`)
      .then((res) => {
        const etat = res.data?.initialise ? res.data.solde : null;
        setSolde(etat);
        setExercice(exerciceParDefaut(etat?.exercices));
      })
      .catch(() => { setSolde(null); setExercice(""); });
  }, [employee]);

  const motifsDuType = useMemo(() => motifs.filter((m) => m.type_conge === typeConge), [motifs, typeConge]);
  const motif = motifs.find((m) => String(m.id) === String(motifId));
  const dureeFixe = motif?.nb_jours_fixe || null;
  const piecesAttendues = (motif?.pieces || []).filter((p) => p.is_active);

  const handleSearch = async (value) => {
    setQuery(value);
    setEmployee(null);
    if (value.trim().length < 2) { setSuggestions([]); return; }
    const res = await api.get("/employees/search/", { params: { q: value } });
    setSuggestions(res.data || []);
  };

  const changerType = (valeur) => {
    setTypeConge(valeur);
    setMotifId("");
    setFichiers({});
  };

  // Durée fixe : le nombre de jours est imposé et la date de retour en découle.
  const changerMotif = (valeur) => {
    setMotifId(valeur);
    setFichiers({});
    const choisi = motifs.find((m) => String(m.id) === String(valeur));
    if (choisi?.nb_jours_fixe) {
      setNbJours(String(choisi.nb_jours_fixe));
      setDateRetour(ajouterJours(dateDepart, choisi.nb_jours_fixe));
    }
  };

  const changerDepart = (e) => {
    const valeur = e.target.value;
    setDateDepart(valeur);
    if (dureeFixe) { setDateRetour(ajouterJours(valeur, dureeFixe)); return; }
    if (!nbJoursSaisi) setNbJours(String(joursEntre(valeur, dateRetour)));
  };

  const changerRetour = (e) => {
    const valeur = e.target.value;
    setDateRetour(valeur);
    if (!nbJoursSaisi) setNbJours(String(joursEntre(dateDepart, valeur)));
  };

  // Téléversement après création : un échec n'annule pas la demande, il est signalé.
  const deposerPieces = async (reference) => {
    const envois = [
      ...piecesAttendues.filter((p) => fichiers[p.id]).map((p) => ({ fichier: fichiers[p.id], piece: p.id })),
      ...(autreFichier ? [{ fichier: autreFichier, libelle: autreLibelle.trim() || "Autre justificatif" }] : []),
    ];
    const echecs = [];
    for (const envoi of envois) {
      const form = new FormData();
      form.append("fichier", envoi.fichier);
      if (envoi.piece) form.append("piece", envoi.piece);
      if (envoi.libelle) form.append("libelle", envoi.libelle);
      try {
        await api.post(`/conges/demandes/${refVersUrl(reference)}/pieces/`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } catch (err) {
        const d = err.response?.data;
        echecs.push(`${envoi.fichier.name} : ${d?.fichier?.[0] || premiereErreur(d) || "échec de l'envoi"}`);
      }
    }
    return echecs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!employee) { setError("Sélectionnez un employé dans la liste."); return; }
    if (!motifId) { setError("Choisissez un motif."); return; }
    setSubmitting(true);
    try {
      const payload = {
        employee: employee.id,
        type_conge: typeConge,
        motif: Number(motifId),
        date_depart: dateDepart,
        date_retour: dateRetour,
        nb_jours: Number(nbJours),
        adresse_conge: adresse.trim(),
        commentaire,
        importance,
      };
      if (typeConge === "CP" && exercice) payload.exercice = exercice;
      if (contratId) payload.contrat = contratId;
      const res = await api.post("/conges/demandes/", payload);
      const echecs = await deposerPieces(res.data.reference);
      navigate(`/conges/${refVersUrl(res.data.reference)}`, echecs.length ? {
        state: { avertissement: `Demande créée, mais certaines pièces n'ont pas pu être jointes — ${echecs.join(" ; ")}` },
      } : undefined);
    } catch (err) {
      setError(premiereErreur(err.response?.data) || "Impossible de créer la demande.");
    } finally {
      setSubmitting(false);
    }
  };

  const champ = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 12, fontSize: 14 };
  const champVerrouille = { ...champ, background: theme.bg, color: theme.textSecondary };
  const etiquette = { fontSize: 12, fontWeight: 700, color: theme.text };
  const note = { color: theme.textMuted, fontSize: 11, marginTop: -8, marginBottom: 12 };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: heroPadding(isMobile) }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Link to="/conges" style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
            ← Retour aux demandes
          </Link>
          <h1 style={{ color: "#fff", fontSize: 24, margin: "8px 0 0", fontWeight: 800 }}>Nouvelle demande de congé</h1>
        </div>
      </div>
      <div style={{ padding: contentPadding(isMobile), maxWidth: 560, margin: "0 auto" }}>
        <form onSubmit={handleSubmit} style={{
          background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`,
          boxShadow: theme.shadowMd, padding: 24,
        }}>
          <label htmlFor="employe-search" style={etiquette}>Employé</label>
          <div style={{ position: "relative" }}>
            <input
              id="employe-search"
              className="input-focus"
              value={employee ? `${employee.prenom} ${employee.nom}` : query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Nom, prénom ou matricule..."
              autoComplete="off"
              style={{ ...champ, marginBottom: 8, border: `1px solid ${employee ? theme.primaryBorder : theme.border}`, background: employee ? theme.primaryBg : theme.bg }}
            />
            {suggestions.length > 0 && !employee && (
              <div style={{
                position: "absolute", zIndex: 10, left: 0, right: 0, top: "100%", background: theme.surface,
                border: `1px solid ${theme.border}`, borderRadius: 8, boxShadow: theme.shadowLg, marginTop: -4,
                maxHeight: 280, overflowY: "auto",
              }}>
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => { setEmployee(s); setSuggestions([]); }}
                    style={{ padding: "9px 12px", cursor: "pointer", borderBottom: `1px solid ${theme.borderLight}`, fontSize: 13 }}
                  >
                    <span style={{ fontWeight: 600, color: theme.text }}>{s.prenom} {s.nom}</span>
                    <span style={{ color: theme.textMuted }}> — {s.matricule}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {employee && (
            <div style={{
              display: "flex", alignItems: "center", gap: 14, background: theme.primaryBg,
              border: `1px solid ${theme.primaryBorder}`, borderRadius: 10, padding: "12px 14px", marginBottom: 16,
            }}>
              <EmployeeAvatar employee={employee} size={48} shape="square" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: theme.text, fontSize: 14, fontWeight: 700 }}>{employee.prenom} {employee.nom}</div>
                <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                  {employee.matricule}{employee.poste_nom && <> · {employee.poste_nom}</>}
                </div>
                <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>
                  {[employee.direction_nom, employee.departement_nom, employee.service_nom].filter(Boolean).join(" › ")}
                </div>
                {employee.date_embauche && (
                  <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 3 }}>
                    Recruté(e) le {formatDateFR(employee.date_embauche)}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => { setEmployee(null); setQuery(""); }} title="Changer d'employé"
                style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Changer
              </button>
            </div>
          )}

          {contrats.length > 1 && (
            <>
              <label htmlFor="contrat" style={etiquette}>Contrat concerné</label>
              <select id="contrat" value={contratId} onChange={(e) => setContratId(e.target.value)} style={champ}>
                <option value="">-- Sélectionner --</option>
                {contrats.map((c) => <option key={c.id} value={c.id}>{c.numero_contrat}</option>)}
              </select>
            </>
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="type-conge" style={etiquette}>Type de congé</label>
              <select id="type-conge" className="input-focus" value={typeConge} onChange={(e) => changerType(e.target.value)} style={champ}>
                {TYPES_CONGE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="motif" style={etiquette}>Motif</label>
              <select id="motif" className="input-focus" required value={motifId} onChange={(e) => changerMotif(e.target.value)} style={champ}>
                <option value="">-- Sélectionner --</option>
                {motifsDuType.map((m) => (
                  <option key={m.id} value={m.id}>{m.nom}{m.nb_jours_fixe ? ` (${m.nb_jours_fixe} j)` : ""}</option>
                ))}
              </select>
            </div>
          </div>

          {typeConge === "CP" && employee && (
            solde ? (
              <>
                <label htmlFor="exercice" style={etiquette}>Exercice</label>
                <ExerciceSelect id="exercice" exercices={solde.exercices} value={exercice} onChange={setExercice} style={champ} />
                <div style={note}>
                  Le reliquat le plus ancien se consomme d'abord ; au-delà, les jours débordent sur les exercices suivants.
                </div>
              </>
            ) : (
              <div style={{ ...note, marginTop: 0 }}>
                Soldes de cet employé non encore initialisés : le chargé des congés choisira l'exercice à la validation.
              </div>
            )
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="date-depart" style={etiquette}>Date de départ</label>
              <input id="date-depart" type="date" className="input-focus" required value={dateDepart} onChange={changerDepart} style={champ} />
            </div>
            <div>
              <label htmlFor="date-retour" style={etiquette}>Date de retour</label>
              <input id="date-retour" type="date" className="input-focus" required min={dateDepart} value={dateRetour}
                onChange={changerRetour} readOnly={Boolean(dureeFixe)} style={dureeFixe ? champVerrouille : champ} />
            </div>
          </div>

          <label htmlFor="nb-jours" style={etiquette}>Nombre de jours</label>
          <input
            id="nb-jours" type="number" min="1" required className="input-focus" value={nbJours}
            readOnly={Boolean(dureeFixe)}
            onChange={(e) => { setNbJours(e.target.value); setNbJoursSaisi(true); }}
            style={dureeFixe ? champVerrouille : champ}
          />
          {dureeFixe && <div style={note}>Durée fixée par le motif « {motif.nom} » : {dureeFixe} jour(s).</div>}

          <label htmlFor="adresse" style={etiquette}>Adresse durant le congé</label>
          <input id="adresse" className="input-focus" required value={adresse} onChange={(e) => setAdresse(e.target.value)} style={champ} />

          <label htmlFor="importance" style={etiquette}>Importance</label>
          <select id="importance" className="input-focus" value={importance} onChange={(e) => setImportance(e.target.value)} style={champ}>
            {IMPORTANCES.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>

          <label htmlFor="commentaire" style={etiquette}>Commentaire (optionnel)</label>
          <textarea id="commentaire" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={3}
            style={{ ...champ, marginBottom: 16, resize: "vertical" }} />

          {motif && (
            <fieldset style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 14px 4px", marginBottom: 16 }}>
              <legend style={{ ...etiquette, padding: "0 6px" }}>Pièces justificatives (facultatives)</legend>
              {piecesAttendues.map((p) => (
                <div key={p.id}>
                  <label htmlFor={`piece-${p.id}`} style={{ ...etiquette, fontWeight: 600 }}>{p.libelle}</label>
                  <input id={`piece-${p.id}`} type="file"
                    onChange={(e) => setFichiers({ ...fichiers, [p.id]: e.target.files[0] || null })} style={champ} />
                </div>
              ))}
              <label htmlFor="piece-autre-libelle" style={{ ...etiquette, fontWeight: 600 }}>Autre pièce (nature)</label>
              <input id="piece-autre-libelle" value={autreLibelle} onChange={(e) => setAutreLibelle(e.target.value)}
                placeholder="ex. Certificat médical" style={champ} />
              <label htmlFor="piece-autre" style={{ ...etiquette, fontWeight: 600 }}>Autre pièce (fichier)</label>
              <input id="piece-autre" type="file" onChange={(e) => setAutreFichier(e.target.files[0] || null)} style={champ} />
              <div style={note}>PDF ou image, 20 Mo maximum par fichier.</div>
            </fieldset>
          )}

          {error && (
            <div role="alert" style={{ color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-lift" style={{
            background: theme.primary, color: "#fff", border: "none", borderRadius: 9, padding: "11px 22px",
            fontWeight: 700, fontSize: 13, cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1, width: isMobile ? "100%" : "auto",
          }}>
            {submitting ? "Envoi..." : "Envoyer la demande"}
          </button>
        </form>
      </div>
    </PageBackground>
  );
}
