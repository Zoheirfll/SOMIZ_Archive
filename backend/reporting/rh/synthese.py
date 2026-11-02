# backend/reporting/rh/synthese.py
"""Synthèse DRH : indicateurs clés, points d'attention et faits marquants.
Les faits marquants sont calculés par des règles fixes et paramétrées ici
(pas d'IA) ; chacun cite ses chiffres et renvoie à la page concernée."""
from dataclasses import replace

from reporting.rh import contrats, demographie, effectifs, mouvements, parite, qualite
from reporting.rh.commun import table, table_kpis

# Seuils des faits marquants.
VARIATION_NOTABLE_PCT = 50       # entrées/sorties : hausse ou baisse d'au moins 50 % vs période précédente
SORTIES_MIN_UNITE = 2            # une unité n'est signalée qu'à partir de 2 sorties
FACTEUR_SORTIES_UNITE = 2        # … et si ses sorties ont au moins doublé


def _par_code(resultat):
    return {k['code']: k for k in resultat['kpis']}


def _faits_marquants(params, k_mou, mou, mou_prec):
    faits = []
    for code, nom in (('entrees', 'Les entrées'), ('sorties_reelles', 'Les sorties')):
        v = k_mou[code]['variation_pct']
        if v is not None and abs(v) >= VARIATION_NOTABLE_PCT:
            sens = 'augmenté' if v > 0 else 'diminué'
            faits.append({'texte': f"{nom} ont {sens} de {abs(v)} % par rapport à la période précédente "
                                   f"({k_mou[code]['valeur']} sur la période).", 'lien': '/statistiques/mouvements'})
    precedentes = {l['nom']: l['sorties'] for l in mou_prec['par_direction']}
    for ligne in mou['par_direction']:
        avant = precedentes.get(ligne['nom'], 0)
        if ligne['sorties'] >= SORTIES_MIN_UNITE and ligne['sorties'] >= FACTEUR_SORTIES_UNITE * max(avant, 1):
            faits.append({'texte': f"{ligne['nom']} : {ligne['sorties']} sortie(s) contre {avant} sur la période "
                                   f"précédente.", 'lien': '/statistiques/mouvements'})
    return faits


def construire(params, user):
    eff = effectifs.construire(params, user)
    par = parite.construire(params, user)
    dem = demographie.construire(params, user)
    con = contrats.construire(replace(params, echeance_jours=30), user)
    qua = qualite.construire(params, user)
    mou = mouvements.construire(params, user)
    debut_prec, fin_prec = params.periode_precedente
    mou_prec = mouvements.construire(replace(params, date_debut=debut_prec, date_fin=fin_prec), user)
    k_eff, k_par, k_dem, k_con, k_qua, k_mou = map(_par_code, (eff, par, dem, con, qua, mou))

    kpis = [
        k_eff['effectif_actif'], k_mou['entrees'], k_mou['sorties_reelles'], k_mou['turnover'],
        k_par['taux_feminisation'], k_dem['age_moyen'], k_dem['anciennete_moyenne'],
        k_dem['departs_retraite_12m'], k_con['contrats_echeance'], k_qua['completude'],
    ]

    alertes = []

    def alerte(nombre, niveau, texte, lien):
        if nombre:
            alertes.append({'niveau': niveau, 'texte': texte, 'lien': lien})

    n = len(con['contrats_echus'])
    alerte(n, 'danger', f"{n} contrat(s) échu(s) encore au statut Actif", '/statistiques/contrats')
    n = len(con['contrats_echeance'])
    alerte(n, 'danger', f"{n} contrat(s) arrivent à échéance dans les 30 jours", '/statistiques/contrats')
    n = len(dem['postes_a_risque'])
    alerte(n, 'attention', f"{n} poste(s) à risque : tous les titulaires partent à la retraite d'ici "
                           f"{params.horizon} ans", '/statistiques/demographie')
    n = len(eff['unites_sans_responsable'])
    alerte(n, 'attention', f"{n} unité(s) sans responsable actif", '/statistiques/effectifs')
    n = k_mou['sorties_non_datees']['valeur']
    alerte(n, 'info', f"{n} employé(s) sorti(s) sans date de sortie : turnover sous-estimé",
           '/statistiques/qualite')
    n = k_par['sexe_non_renseigne']['valeur']
    alerte(n, 'info', f"{n} actif(s) sans sexe renseigné : les taux de parité sont partiels",
           '/employees?sexe=non_renseigne')
    n = k_qua['fiches_incompletes']['valeur']
    alerte(n, 'info', f"{n} fiche(s) d'actifs incomplète(s)", '/statistiques/qualite')
    n = k_qua['incoherences']['valeur']
    alerte(n, 'info', f"{n} incohérence(s) de données à vérifier", '/statistiques/qualite')

    faits = _faits_marquants(params, k_mou, mou, mou_prec)
    return {
        'kpis': kpis, 'alertes': alertes, 'faits_marquants': faits,
        'exports': [
            table_kpis(kpis),
            table('Alertes', ['Niveau', 'Alerte'], [[a['niveau'], a['texte']] for a in alertes]),
            table('Faits marquants', ['Fait'], [[f['texte']] for f in faits]),
        ],
    }
