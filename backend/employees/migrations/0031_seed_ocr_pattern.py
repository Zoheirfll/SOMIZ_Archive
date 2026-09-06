from django.db import migrations

# Préremplit ocr_pattern pour les champs déjà associés à un extracteur
# codé en dur avant l'introduction de ce mécanisme configurable — évite
# une régression silencieuse des suggestions OCR déjà en place.
SEED = {
    'NIN': 'NIN',
    'GROUPE_SANGUIN': 'GROUPE_SANGUIN',
    'NUM_SECU': 'NUM_SECU',
    'RIB': 'RIB',
    'TELEPHONE': 'TELEPHONE',
    'LIEU_NAISSANCE': 'LIEU_NAISSANCE',
    'date_naissance': 'DATE',
    'date_embauche': 'DATE',
}


def seed_ocr_pattern(apps, schema_editor):
    ChampPersonnalise = apps.get_model('employees', 'ChampPersonnalise')
    for code, pattern in SEED.items():
        ChampPersonnalise.objects.filter(code__iexact=code).update(ocr_pattern=pattern)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('employees', '0030_champpersonnalise_ocr_pattern'),
    ]

    operations = [
        migrations.RunPython(seed_ocr_pattern, noop),
    ]
