from ocr.extractors import extract_fields


def test_nin_pattern_finds_18_digit_sequence():
    text = "Nom: DUPONT\nNIN: 123456789012345678\nAutre texte"
    results = extract_fields('NIN', text)
    assert len(results) == 1
    assert results[0]['valeur'] == '123456789012345678'
    assert results[0]['confiance'] == 90.0


def test_date_pattern_finds_date_pattern():
    text = "Né le 15/03/1985 à Alger"
    results = extract_fields('DATE', text)
    assert len(results) == 1
    assert results[0]['valeur'] == '15/03/1985'


def test_date_pattern_finds_multiple_candidates():
    text = "Délivré le 01/01/2020, né le 15/03/1985"
    results = extract_fields('DATE', text)
    assert len(results) == 2


def test_unknown_pattern_returns_empty_list():
    assert extract_fields('CHAMP_INCONNU', "peu importe") == []


def test_empty_pattern_returns_empty_list():
    assert extract_fields('', "NIN: 123456789012345678") == []


def test_no_match_returns_empty_list():
    assert extract_fields('NIN', "aucun numéro ici") == []


def test_pattern_lookup_is_case_insensitive():
    """ChampPersonnalise.ocr_pattern est stocké en majuscules (choices),
    mais un appel accidentel en minuscules ne doit pas perdre l'extraction."""
    text = "NIN: 123456789012345678"
    assert extract_fields('nin', text) == extract_fields('NIN', text)


def test_groupe_sanguin_pattern():
    text = "Groupe sanguin Rh: O+"
    results = extract_fields('GROUPE_SANGUIN', text)
    assert len(results) == 1
    assert results[0]['valeur'] == 'O+'


def test_num_secu_pattern_finds_15_digit_sequence():
    text = "N° Sécurité Sociale: 123456789012345"
    results = extract_fields('NUM_SECU', text)
    assert len(results) == 1
    assert results[0]['valeur'] == '123456789012345'


def test_num_secu_does_not_match_18_digit_nin():
    text = "NIN: 123456789012345678"
    assert extract_fields('NUM_SECU', text) == []


def test_rib_pattern_finds_20_digit_sequence():
    text = "RIB: 00799999001234567890"
    results = extract_fields('RIB', text)
    assert len(results) == 1
    assert results[0]['valeur'] == '00799999001234567890'


def test_telephone_pattern_finds_algerian_mobile_number():
    text = "Tél: 0556123456"
    results = extract_fields('TELEPHONE', text)
    assert len(results) == 1
    assert results[0]['valeur'] == '0556123456'


def test_lieu_naissance_pattern_matches_wilaya_in_arabic():
    text = "مكان الميلاد: وهران"
    results = extract_fields('LIEU_NAISSANCE', text)
    assert any(r['valeur'] == 'Oran' for r in results)


def test_lieu_naissance_pattern_matches_wilaya_in_french():
    text = "Né(e) à Constantine le 12/05/1990"
    results = extract_fields('LIEU_NAISSANCE', text)
    assert any(r['valeur'] == 'Constantine' for r in results)
