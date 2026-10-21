import datetime
import inspect
from types import SimpleNamespace

import pytest

from conges.models import CongeTemplateConfig
from conges.pdf import build_conge_pdf, sous_titre

pytestmark = pytest.mark.django_db


def _employe(**extra):
    base = dict(
        matricule="009890", nom="NACER", prenom="SID AHMED",
        date_embauche=datetime.date(2015, 1, 1), poste_id=1,
        poste=SimpleNamespace(nom="Peintre industriel"),
        direction=SimpleNamespace(nom="DAT"), departement=SimpleNamespace(nom="GMO"),
        service=SimpleNamespace(nom="GL3/Z"),
    )
    base.update(extra)
    return SimpleNamespace(**base)


def _titre(**extra):
    base = dict(
        reference="04512/26", employee=_employe(), type_conge='CP',
        categorie_exercice='RELIQUAT', nb_jours=13,
        date_depart=datetime.date(2026, 8, 10), date_retour=datetime.date(2026, 8, 23),
        adresse_conge="ALGERIE", exercice="2024/2025", date_etablissement=datetime.date(2026, 8, 9),
        signataire_nom="A.BOUSMAHA", signataire_titre="Chef de Département Administration du Personnel",
        signataire_interim=False, statut='prete',
    )
    base.update(extra)
    return SimpleNamespace(**base)


@pytest.mark.parametrize('champs,attendu', [
    (dict(type_conge='CP', categorie_exercice='RELIQUAT'), '- RELIQUAT -'),
    (dict(type_conge='CP', categorie_exercice='ACTUEL'), '- ANNUEL -'),
    (dict(type_conge='CP', categorie_exercice='ANTICIPE'), '- ANTICIPE -'),
    (dict(type_conge='CP', categorie_exercice=''), ''),
    (dict(type_conge='CE', categorie_exercice=''), '- CONGE EXCEPTIONNEL -'),
    (dict(type_conge='CS', categorie_exercice=''), '- CONGE SANS SOLDE -'),
])
def test_sous_titre_selon_le_type_et_le_groupe_de_l_exercice(champs, attendu):
    assert sous_titre(_titre(**champs)) == attendu


def test_build_conge_pdf_renvoie_un_pdf():
    pdf = build_conge_pdf(_titre(), CongeTemplateConfig(), datetime.date(2026, 8, 9), contrat_numero="020528")
    assert pdf.startswith(b'%PDF') and len(pdf) > 1500


def test_build_conge_pdf_tolere_un_employe_incomplet():
    titre = _titre(employee=_employe(poste_id=None, poste=None, direction=None, departement=None, service=None, date_embauche=None))
    assert build_conge_pdf(titre, CongeTemplateConfig(), datetime.date(2026, 8, 9)).startswith(b'%PDF')


def test_build_conge_pdf_mode_test_et_annule_changent_le_contenu():
    cfg, jour = CongeTemplateConfig(), datetime.date(2026, 8, 9)
    normal = build_conge_pdf(_titre(), cfg, jour)
    assert build_conge_pdf(_titre(), cfg, jour, mention="(mode test)") != normal
    assert build_conge_pdf(_titre(statut='annulee'), cfg, jour) != normal  # filigrane ANNULE


def test_build_conge_pdf_interim_et_signataire_figes_changent_le_contenu():
    cfg, jour = CongeTemplateConfig(), datetime.date(2026, 8, 9)
    assert build_conge_pdf(_titre(signataire_interim=True, signataire_nom='INTERIMAIRE'), cfg, jour) != build_conge_pdf(_titre(), cfg, jour)


def _textes_dessines(titre, monkeypatch):
    """Rend le titre en interceptant drawString : renvoie [(x_pt, texte, police, taille)]."""
    from reportlab.pdfgen.canvas import Canvas
    dessines, original = [], Canvas.drawString

    def espion(self, x, y, texte, *args, **kwargs):
        dessines.append((x, str(texte), self._fontname, self._fontsize))
        return original(self, x, y, texte, *args, **kwargs)

    monkeypatch.setattr(Canvas, 'drawString', espion)
    build_conge_pdf(titre, CongeTemplateConfig(), datetime.date(2026, 8, 9))
    return dessines


def test_structure_et_affectation_impriment_les_abreviations(monkeypatch):
    employe = _employe(
        direction=SimpleNamespace(nom="DIRECTION DES RESSOURCES HUMAINES", code="DRH"),
        departement=SimpleNamespace(nom="DEPARTEMENT ADMINISTRATION DU PERSONNEL", code="DAP"),
        service=SimpleNamespace(nom="SERVICE PAIE", code="SPA"),
    )
    textes = [t for _, t, _, _ in _textes_dessines(_titre(employee=employe), monkeypatch)]
    assert "DRH / DAP" in textes and "SPA" in textes
    assert not any("RESSOURCES HUMAINES" in t for t in textes)


def test_sans_code_le_nom_complet_est_imprime(monkeypatch):
    employe = _employe(service=SimpleNamespace(nom="Service Paie", code=""))
    textes = [t for _, t, _, _ in _textes_dessines(_titre(employee=employe), monkeypatch)]
    assert "SERVICE PAIE" in textes


@pytest.mark.parametrize('type_conge,imprime', [('CP', True), ('CE', False), ('CS', False)])
def test_la_ligne_exercice_n_est_imprimee_que_pour_un_conge_paye(type_conge, imprime, monkeypatch):
    textes = [t for _, t, _, _ in _textes_dessines(_titre(type_conge=type_conge), monkeypatch)]
    assert ("Exercice" in textes) is imprime
    assert ("2024/2025" in textes) is imprime


def test_une_structure_longue_ne_deborde_pas_et_affectation_a_sa_propre_ligne(monkeypatch):
    from reportlab.lib.units import mm
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from conges import pdf as conge_pdf
    employe = _employe(
        direction=SimpleNamespace(nom="DIRECTION DES RESSOURCES HUMAINES"),
        departement=SimpleNamespace(nom="DEPARTEMENT ADMINISTRATION DU PERSONNEL ET PAIE"),
    )
    dessines = _textes_dessines(_titre(employee=employe), monkeypatch)
    valeurs = [(x, t, f, s) for x, t, f, s in dessines if x == conge_pdf.X_VALEUR_CONGE * mm]
    for x, texte, police, taille in valeurs:
        assert x + stringWidth(texte, police, taille) <= conge_pdf.X_MAX_VALEUR * mm + 0.01, texte
    structure = " ".join(t for _, t, _, _ in valeurs if "DIRECTION" in t or "ADMINISTRATION" in t)
    assert "DEPARTEMENT ADMINISTRATION DU PERSONNEL ET PAIE" in structure  # rien n'est tronqué
    assert "Affectation" in [t for _, t, _, _ in dessines]


def test_le_titre_du_cadre_est_bien_celui_du_conge_et_pas_celui_de_l_attestation():
    """Garde-fou : le paramètre `titre` de _draw_title doit être honoré (il ne
    doit pas être écrasé par la valeur par défaut dans le corps de la fonction)."""
    from attestations import pdf as att_pdf
    source = inspect.getsource(att_pdf._draw_title)
    assert 'titre = "ATTESTATION DE TRAVAIL"' not in source


def test_attestation_pdf_garde_son_titre_par_defaut():
    from attestations import pdf as att_pdf
    assert inspect.signature(att_pdf._draw_title).parameters['titre'].default == "ATTESTATION DE TRAVAIL"
