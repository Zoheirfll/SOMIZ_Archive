from ocr.extractors import extract_fields


def test_nin_extractor_finds_18_digit_sequence():
    text = "Nom: DUPONT\nNIN: 123456789012345678\nAutre texte"
    results = extract_fields('nin', text)
    assert len(results) == 1
    assert results[0]['champ_code'] == 'nin'
    assert results[0]['valeur'] == '123456789012345678'
    assert results[0]['confiance'] == 90.0


def test_date_naissance_extractor_finds_date_pattern():
    text = "Né le 15/03/1985 à Alger"
    results = extract_fields('date_naissance', text)
    assert len(results) == 1
    assert results[0]['valeur'] == '15/03/1985'


def test_date_naissance_extractor_finds_multiple_candidates():
    text = "Délivré le 01/01/2020, né le 15/03/1985"
    results = extract_fields('date_naissance', text)
    assert len(results) == 2


def test_unknown_champ_source_returns_empty_list():
    assert extract_fields('champ_inconnu', "peu importe") == []


def test_no_match_returns_empty_list():
    assert extract_fields('nin', "aucun numéro ici") == []


def test_champ_source_lookup_is_case_insensitive():
    """champ_source est un champ texte libre saisi dans /parametres — un
    admin qui tape "NIN" au lieu de "nin" ne doit pas perdre l'extraction."""
    text = "NIN: 123456789012345678"
    assert extract_fields('NIN', text) == extract_fields('nin', text)
    assert len(extract_fields('NIN', text)) == 1
