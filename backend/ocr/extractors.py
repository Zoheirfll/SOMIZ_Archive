"""
ocr/extractors.py
Règles d'extraction de champs structurés à partir du texte OCR brut,
indexées par un MOTIF fixe (ChampPersonnalise.OcrPattern) — pas par le
code du champ lui-même. Ce découplage est volontaire : associer un motif
existant à un nouveau champ personnalisé (ex. dans 6 mois) se fait
entièrement depuis /parametres (choix dans un menu déroulant), sans
jamais toucher à ce fichier. Seul l'ajout d'un motif réellement nouveau
(un format qu'aucun des motifs ci-dessous ne couvre) nécessite du code —
voir ChampPersonnalise.OcrPattern et
docs/superpowers/specs/2026-09-06-ocr-documents-design.md.
"""

import re


def _extract_nin(text):
    return [
        {'valeur': m.group(0), 'confiance': 90.0}
        for m in re.finditer(r'\b\d{18}\b', text)
    ]


def _extract_date(text):
    return [
        {'valeur': m.group(0), 'confiance': 75.0}
        for m in re.finditer(r'\b\d{2}/\d{2}/\d{4}\b', text)
    ]


def _extract_groupe_sanguin(text):
    return [
        {'valeur': m.group(0).upper().replace(' ', ''), 'confiance': 80.0}
        for m in re.finditer(r'\b(A|B|AB|O)\s*[+\-−]', text, re.IGNORECASE)
    ]


def _extract_num_secu(text):
    # Numéro de Sécurité Sociale algérien : 15 chiffres — distinct du NIN
    # (18 chiffres) par la longueur, \b\d{15}\b ne matche jamais une
    # sous-séquence d'un nombre plus long.
    return [
        {'valeur': m.group(0), 'confiance': 80.0}
        for m in re.finditer(r'\b\d{15}\b', text)
    ]


def _extract_rib(text):
    # RIB algérien : 20 chiffres (banque 3 + agence 5 + compte 11 + clé 2),
    # parfois affiché avec des espaces/tirets entre groupes.
    results = []
    for m in re.finditer(r'\b(?:\d[ \-]?){20}\b', text):
        digits = re.sub(r'\D', '', m.group(0))
        if len(digits) == 20:
            results.append({'valeur': digits, 'confiance': 75.0})
    return results


def _extract_telephone(text):
    results = [
        {'valeur': m.group(0), 'confiance': 70.0}
        for m in re.finditer(r'\b0[1-9]\d{8}\b', text)
    ]
    results += [
        {'valeur': re.sub(r'\s', '', m.group(0)), 'confiance': 70.0}
        for m in re.finditer(r'\+213\s?\d{9}\b', text)
    ]
    return results


# (nom français, nom arabe) des 58 wilayas algériennes — heuristique de
# correspondance pour "Lieu de naissance", qui n'a pas de format fixe
# contrairement à un NIN ou une date.
_WILAYAS = [
    ("Adrar", "أدرار"), ("Chlef", "الشلف"), ("Laghouat", "الأغواط"),
    ("Oum El Bouaghi", "أم البواقي"), ("Batna", "باتنة"), ("Béjaïa", "بجاية"),
    ("Biskra", "بسكرة"), ("Béchar", "بشار"), ("Blida", "البليدة"),
    ("Bouira", "البويرة"), ("Tamanrasset", "تمنراست"), ("Tébessa", "تبسة"),
    ("Tlemcen", "تلمسان"), ("Tiaret", "تيارت"), ("Tizi Ouzou", "تيزي وزو"),
    ("Alger", "الجزائر"), ("Djelfa", "الجلفة"), ("Jijel", "جيجل"),
    ("Sétif", "سطيف"), ("Saïda", "سعيدة"), ("Skikda", "سكيكدة"),
    ("Sidi Bel Abbès", "سيدي بلعباس"), ("Annaba", "عنابة"), ("Guelma", "قالمة"),
    ("Constantine", "قسنطينة"), ("Médéa", "المدية"), ("Mostaganem", "مستغانم"),
    ("M'Sila", "المسيلة"), ("Mascara", "معسكر"), ("Ouargla", "ورقلة"),
    ("Oran", "وهران"), ("El Bayadh", "البيض"), ("Illizi", "إليزي"),
    ("Bordj Bou Arréridj", "برج بوعريريج"), ("Boumerdès", "بومرداس"),
    ("El Tarf", "الطارف"), ("Tindouf", "تندوف"), ("Tissemsilt", "تيسمسيلت"),
    ("El Oued", "الوادي"), ("Khenchela", "خنشلة"), ("Souk Ahras", "سوق أهراس"),
    ("Tipaza", "تيبازة"), ("Mila", "ميلة"), ("Aïn Defla", "عين الدفلى"),
    ("Naâma", "النعامة"), ("Aïn Témouchent", "عين تموشنت"), ("Ghardaïa", "غرداية"),
    ("Relizane", "غليزان"), ("Timimoun", "تيميمون"),
    ("Bordj Badji Mokhtar", "برج باجي مختار"), ("Ouled Djellal", "أولاد جلال"),
    ("Béni Abbès", "بني عباس"), ("In Salah", "عين صالح"),
    ("In Guezzam", "عين قزام"), ("Touggourt", "تقرت"), ("Djanet", "جانت"),
    ("El M'Ghair", "المغير"), ("El Meniaa", "المنيعة"),
]


def _extract_lieu_naissance(text):
    results = []
    for fr_name, ar_name in _WILAYAS:
        if re.search(r'\b' + re.escape(ar_name) + r'\b', text):
            results.append({'valeur': fr_name, 'confiance': 65.0})
        elif re.search(r'\b' + re.escape(fr_name) + r'\b', text, re.IGNORECASE):
            results.append({'valeur': fr_name, 'confiance': 60.0})
    return results


# Clé = ChampPersonnalise.OcrPattern (ex. 'NIN', 'DATE'...) — catalogue
# fixe de motifs, indépendant du code ou du nom du champ personnalisé qui
# le référence (voir ChampPersonnalise.ocr_pattern).
PATTERN_EXTRACTORS = {
    'NIN': _extract_nin,
    'DATE': _extract_date,
    'GROUPE_SANGUIN': _extract_groupe_sanguin,
    'NUM_SECU': _extract_num_secu,
    'RIB': _extract_rib,
    'TELEPHONE': _extract_telephone,
    'LIEU_NAISSANCE': _extract_lieu_naissance,
}


def extract_fields(pattern, text):
    """
    pattern : une valeur de ChampPersonnalise.OcrPattern (ex. 'NIN'), ou
    toute chaîne vide/inconnue — retourne alors [] sans erreur (c'est le
    cas normal d'un champ dont `ocr_pattern` n'a pas été configuré).
    """
    extractor = PATTERN_EXTRACTORS.get((pattern or '').upper())
    if extractor is None or not text:
        return []
    return extractor(text)
