# backend/reporting/rh/definitions.py
"""Libellé et mode de calcul de chaque indicateur du reporting — seule
source : l'API renvoie la définition avec la valeur, l'UI l'affiche en
info-bulle. Ne jamais réécrire une formule dans une page."""

DEFINITIONS = {
    'effectif_actif': ("Effectif actif", "Employés au statut Actif à ce jour."),
    'effectif_sorti': ("Effectif sorti", "Employés au statut Inactif, Archivé ou Démobilisé."),
    'recrutements': ("Recrutements", "Employés dont la date de recrutement tombe dans la période."),
    'sorties': ("Sorties (date d'archivage)",
                "Passages à un statut de sortie enregistrés dans la période, datés par le journal d'audit "
                "(jour de l'archivage, pas du départ réel) en attendant la date de sortie."),
    'part_cdi': ("Part des contrats à durée indéterminée",
                 "Actifs dont le type de contrat est à durée indéterminée, sur les actifs ayant un type de contrat."),
    'taux_encadrement': ("Taux d'encadrement",
                         "Responsables d'unité actifs (comptés une fois) rapportés à l'effectif actif."),
    'unites_sans_responsable': ("Unités sans responsable",
                                "Unités actives (direction à section) sans responsable au statut Actif."),
    'taux_feminisation': ("Taux de féminisation",
                          "Femmes / (hommes + femmes) parmi les actifs dont le sexe est renseigné."),
    'sexe_non_renseigne': ("Sexe non renseigné", "Actifs dont le sexe n'est pas saisi : exclus des taux de parité."),
    'feminisation_encadrement': ("Féminisation de l'encadrement",
                                 "Femmes parmi les responsables d'unité actifs dont le sexe est renseigné."),
    'feminisation_recrutements': ("Féminisation des recrutements",
                                  "Femmes parmi les recrutés de la période dont le sexe est renseigné."),
    'age_moyen': ("Âge moyen", "Moyenne des âges (années révolues) des actifs dont la date de naissance est connue."),
    'age_median': ("Âge médian", "Âge qui partage en deux moitiés les actifs dont la date de naissance est connue."),
    'anciennete_moyenne': ("Ancienneté moyenne",
                           "Moyenne des années révolues depuis le recrutement, actifs dont la date est connue."),
    'part_55_plus': ("Part des 55 ans et plus", "Actifs de 55 ans et plus, sur les actifs d'âge connu."),
    'naissance_inconnue': ("Date de naissance inconnue",
                           "Actifs sans date de naissance : absents des pyramides et des prévisions."),
    'departs_retraite_12m': ("Départs à la retraite (12 mois)",
                             "Actifs atteignant l'âge de retraite (60 ans hommes, 55 ans femmes, 60 ans si sexe non "
                             "renseigné) dans les 12 prochains mois, y compris ceux qui l'ont déjà dépassé."),
    'retraite_incertaine': ("Prévisions incertaines",
                            "Actifs comptés dans les prévisions de retraite sans sexe renseigné (âge de 60 ans appliqué)."),
    'postes_a_risque': ("Postes à risque",
                        "Fonctions dont tous les titulaires actifs atteignent l'âge de retraite dans l'horizon choisi."),
    'contrats_echeance': ("Contrats à échéance", "Contrats actifs dont la date de fin tombe dans le seuil choisi."),
    'contrats_echus': ("Contrats échus non traités", "Contrats encore au statut Actif dont la date de fin est passée."),
    'cdd_actifs': ("Contrats à durée déterminée actifs", "Contrats actifs d'un type à durée déterminée."),
    'duree_moyenne_cdd': ("Durée moyenne d'un contrat à durée déterminée",
                          "Moyenne, en mois, de la date de début à la date de fin des contrats à durée déterminée datés."),
    'cdd_enchaines': ("Agents en contrats successifs",
                      "Actifs ayant eu au moins deux contrats à durée déterminée."),
    'completude': ("Complétude des dossiers",
                   "Actifs possédant tous les types de documents obligatoires, sur l'effectif actif."),
    'fiches_incompletes': ("Fiches incomplètes",
                           "Actifs auxquels manque au moins une donnée suivie (naissance, recrutement, sexe, "
                           "direction, fonction, type de contrat, catégorie)."),
    'incoherences': ("Incohérences", "Total des anomalies détectées (dates, motifs, doublons probables)."),
    'mes_actions': ("Mes actions", "Actions enregistrées par votre compte sur la période."),
    # Mouvements (sur la date de sortie réelle)
    'entrees': ("Entrées", "Employés dont la date de recrutement tombe dans la période."),
    'sorties_reelles': ("Sorties", "Employés sortis dont la date de sortie (départ réel) tombe dans la période."),
    'solde_net': ("Solde net", "Entrées moins sorties sur la période."),
    'turnover': ("Taux de rotation (turnover)",
                 "((entrées + sorties) / 2) / effectif moyen, l'effectif moyen étant la moyenne des effectifs "
                 "présents au premier et au dernier jour de la période."),
    'taux_depart': ("Taux de départ", "Sorties / effectif moyen de la période."),
    'anciennete_au_depart': ("Ancienneté moyenne au départ",
                             "Années révolues entre recrutement et sortie, pour les sorties de la période."),
    'departs_precoces': ("Départs de moins d'un an", "Sorties de la période survenues moins d'un an après le recrutement."),
    'sorties_non_datees': ("Sorties non datées",
                           "Employés sortis sans date de sortie : absents des taux, à compléter depuis leur fiche."),
    # Carrière
    'changements_fonction': ("Changements de fonction", "Nouvelles périodes de fonction ouvertes dans la période (hors affectation initiale)."),
    'changements_categorie': ("Changements de catégorie", "Nouvelles périodes de catégorie ouvertes dans la période (hors affectation initiale)."),
    'changements_echelle': ("Changements d'échelle", "Nouvelles périodes d'échelle ouvertes dans la période (hors affectation initiale)."),
    'transferts': ("Transferts entre unités", "Modifications d'affectation organisationnelle enregistrées dans la période."),
    'sans_evolution': ("Agents sans évolution",
                       "Actifs sans changement de fonction, catégorie ou échelle depuis 5 ans ou plus (à défaut : depuis leur recrutement)."),
    # Comparaison des unités
    'departs_horizon': ("Départs à la retraite (horizon)", "Actifs atteignant l'âge de retraite dans l'horizon choisi."),
    # Congés
    'jours_conge_pris': ("Jours de congé pris", "Jours des congés accordés (jours effectifs si interrompus) dont le départ tombe dans la période."),
    'agents_partis_conge': ("Agents partis en congé", "Agents ayant au moins un congé accordé débutant dans la période."),
    'demandes_deposees': ("Demandes déposées", "Demandes de congé créées dans la période."),
    'demandes_en_attente': ("Demandes en attente", "Demandes de congé en attente de visa ou de traitement, à ce jour."),
    'taux_rejet': ("Taux de rejet", "Demandes rejetées / demandes traitées (accordées, interrompues ou rejetées) de la période."),
    'delai_moyen_conge': ("Délai moyen de traitement", "Jours entre la demande et la date d'établissement du titre."),
    'solde_restant': ("Solde restant", "Somme des jours restants (droit − consommé) sur tous les exercices."),
    # Demandes
    'attestations_deposees': ("Attestations demandées", "Demandes d'attestation créées dans la période."),
    'attestations_en_retard': ("Attestations en retard", "Demandes en attente depuis plus de 7 jours, à ce jour."),
    'attestations_delai_moyen': ("Délai moyen (attestations)", "Jours entre la demande et la mise à disposition."),
    'attestations_delai_median': ("Délai médian (attestations)", "Délai qui partage en deux moitiés les demandes traitées."),
    'attestations_taux_rejet': ("Taux de rejet (attestations)", "Rejetées / traitées (prêtes, récupérées ou rejetées)."),
    'consultations_deposees': ("Consultations demandées", "Demandes de consultation créées dans la période."),
    'consultations_en_retard': ("Consultations en retard", "Demandes en cours de validation depuis plus de 7 jours, à ce jour."),
    'consultations_delai_moyen': ("Délai moyen (consultations)", "Jours entre la demande et la validation."),
    'consultations_delai_median': ("Délai médian (consultations)", "Délai qui partage en deux moitiés les demandes validées."),
    'consultations_taux_rejet': ("Taux de rejet (consultations)", "Rejetées / traitées (validées, rejetées ou révoquées)."),
    # Documents
    'documents_actifs': ("Documents archivés", "Documents actifs dans les dossiers des employés."),
    'fichiers_actifs': ("Fichiers", "Fichiers actifs rattachés à ces documents."),
    'volume_stockage': ("Volume de stockage", "Taille cumulée des fichiers actifs."),
    'documents_uploades_periode': ("Documents ajoutés", "Documents actifs ajoutés dans la période (hors documents supprimés depuis)."),
    'documents_supprimes_periode': ("Documents supprimés", "Suppressions de documents enregistrées au journal d'audit dans la période."),
}


def definition(code):
    libelle, texte = DEFINITIONS[code]
    return {'code': code, 'libelle': libelle, 'definition': texte}
