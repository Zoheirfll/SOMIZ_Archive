from django.db import migrations


def create_champ_telephone(apps, schema_editor):
    ChampPersonnalise = apps.get_model('employees', 'ChampPersonnalise')
    ChampPersonnalise.objects.get_or_create(
        code='TELEPHONE',
        defaults={'nom': 'Téléphone', 'type_champ': 'texte', 'ordre': 0, 'is_active': True},
    )


def remove_champ_telephone(apps, schema_editor):
    ChampPersonnalise = apps.get_model('employees', 'ChampPersonnalise')
    ChampPersonnalise.objects.filter(code='TELEPHONE').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('employees', '0015_employeeaccessgrant'),
    ]

    operations = [
        migrations.RunPython(create_champ_telephone, remove_champ_telephone),
    ]
