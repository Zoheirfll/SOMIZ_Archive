"""
ocr/extractors.py
Règles d'extraction de champs structurés à partir du texte OCR brut,
indexées par le même code `champ_source` que TypeDocument.champ_source
(voir section "Champs cliquables vers le document source" de CLAUDE.md).
Volontairement pas de règles génériques appliquées à tout document —
seuls les champ_source enregistrés ici déclenchent une extraction.
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


# Clé = champ_source en minuscules (voir extract_fields) — ce sont les
# mêmes codes que TypeDocument.champ_source / ChampPersonnalise.code,
# insensibles à la casse.
CHAMP_SOURCE_EXTRACTORS = {
    'nin': _extract_nin,
    'date_naissance': _extract_date,
    'date_embauche': _extract_date,
    'groupe_sanguin': _extract_groupe_sanguin,
    'num_secu': _extract_num_secu,
    'rib': _extract_rib,
    'telephone': _extract_telephone,
    'lieu_naissance': _extract_lieu_naissance,
}


def extract_fields(champ_source, text):
    # champ_source est un CharField libre (saisi dans /parametres) — la casse
    # n'est pas garantie (ex. "NIN" vs "nin") alors que le registre est
    # indexé en minuscules ; normaliser ici évite de perdre silencieusement
    # une extraction pour un simple écart de casse. Le champ_code renvoyé
    # dans chaque résultat reprend en revanche la valeur ORIGINALE de
    # champ_source (pas la version minuscule) — c'est ce code qui sera
    # utilisé ensuite pour résoudre le champ cible réel (voir
    # ocr/views.py::_appliquer_champ), et il doit donc correspondre
    # exactement au ChampPersonnalise.code tel qu'il existe en base.
    extractor = CHAMP_SOURCE_EXTRACTORS.get((champ_source or '').lower())
    if extractor is None or not text:
        return []
    return [
        {'champ_code': champ_source, **candidate}
        for candidate in extractor(text)
    ]
