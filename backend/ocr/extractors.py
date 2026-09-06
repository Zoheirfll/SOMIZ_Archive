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
        {'champ_code': 'nin', 'valeur': m.group(0), 'confiance': 90.0}
        for m in re.finditer(r'\b\d{18}\b', text)
    ]


def _extract_date(champ_code):
    def extractor(text):
        return [
            {'champ_code': champ_code, 'valeur': m.group(0), 'confiance': 75.0}
            for m in re.finditer(r'\b\d{2}/\d{2}/\d{4}\b', text)
        ]
    return extractor


CHAMP_SOURCE_EXTRACTORS = {
    'nin': _extract_nin,
    'date_naissance': _extract_date('date_naissance'),
    'date_embauche': _extract_date('date_embauche'),
}


def extract_fields(champ_source, text):
    # champ_source est un CharField libre (saisi dans /parametres) — la casse
    # n'est pas garantie (ex. "NIN" vs "nin") alors que le registre est
    # indexé en minuscules ; normaliser ici évite de perdre silencieusement
    # une extraction pour un simple écart de casse.
    extractor = CHAMP_SOURCE_EXTRACTORS.get((champ_source or '').lower())
    if extractor is None or not text:
        return []
    return extractor(text)
