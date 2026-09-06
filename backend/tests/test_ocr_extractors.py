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
    admin qui tape "NIN" au lieu de "nin" ne doit pas perdre l'extraction.
    Le champ_code renvoyé reprend la casse d'origine de champ_source (pas
    la version minuscule utilisée seulement pour la recherche dans le
    registre) — il doit correspondre exactement au ChampPersonnalise.code
    tel qu'il existe en base pour que l'application de la suggestion le
    résolve correctement (voir ocr/views.py::_appliquer_champ)."""
    text = "NIN: 123456789012345678"
    results_upper = extract_fields('NIN', text)
    results_lower = extract_fields('nin', text)
    assert len(results_upper) == len(results_lower) == 1
    assert results_upper[0]['champ_code'] == 'NIN'
    assert results_lower[0]['champ_code'] == 'nin'
    assert results_upper[0]['valeur'] == results_lower[0]['valeur']


def test_groupe_sanguin_extractor():
    text = "Groupe sanguin Rh: O+"
    results = extract_fields('groupe_sanguin', text)
    assert len(results) == 1
    assert results[0]['valeur'] == 'O+'


def test_num_secu_extractor_finds_15_digit_sequence():
    text = "N° Sécurité Sociale: 123456789012345"
    results = extract_fields('num_secu', text)
    assert len(results) == 1
    assert results[0]['valeur'] == '123456789012345'


def test_num_secu_does_not_match_18_digit_nin():
    text = "NIN: 123456789012345678"
    assert extract_fields('num_secu', text) == []


def test_rib_extractor_finds_20_digit_sequence():
    text = "RIB: 00799999001234567890"
    results = extract_fields('rib', text)
    assert len(results) == 1
    assert results[0]['valeur'] == '00799999001234567890'


def test_telephone_extractor_finds_algerian_mobile_number():
    text = "Tél: 0556123456"
    results = extract_fields('telephone', text)
    assert len(results) == 1
    assert results[0]['valeur'] == '0556123456'


def test_lieu_naissance_extractor_matches_wilaya_in_arabic():
    text = "مكان الميلاد: وهران"
    results = extract_fields('lieu_naissance', text)
    assert any(r['valeur'] == 'Oran' for r in results)


def test_lieu_naissance_extractor_matches_wilaya_in_french():
    text = "Né(e) à Constantine le 12/05/1990"
    results = extract_fields('lieu_naissance', text)
    assert any(r['valeur'] == 'Constantine' for r in results)
