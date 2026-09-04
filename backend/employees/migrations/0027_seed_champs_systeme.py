from django.db import migrations

SYSTEM_FIELDS = [
    ("matricule", "Matricule"),
    ("numero_contrat", "N° Contrat"),
    ("nom", "Nom"),
    ("prenom", "Prénom"),
    ("statut", "Statut"),
    ("direction", "Direction"),
    ("pole", "Pôle"),
    ("departement", "Département"),
    ("section", "Section"),
    ("service", "Service"),
    ("cellule", "Cellule"),
    ("poste", "Fonction"),
    ("type_contrat", "Type de contrat"),
    ("categorie", "Catégorie"),
    ("echelle", "Échelle"),
    ("date_naissance", "Date de naissance"),
    ("date_embauche", "Date de recrutement"),
    ("date_debut_contrat", "Date de début de contrat"),
    ("date_fin_contrat", "Date de fin de contrat"),
]
PERSONNEL_SYSTEM_CODES = {"date_naissance"}
PERSONNEL_CUSTOM_CODES = {"RIB", "NUM_SECU", "GROUPE_SANGUIN", "NIN"}


def seed_forward(apps, schema_editor):
    ChampPersonnalise = apps.get_model('employees', 'ChampPersonnalise')
    for idx, (code, nom) in enumerate(SYSTEM_FIELDS):
        ChampPersonnalise.objects.update_or_create(
            code=code,
            defaults={
                'nom': nom,
                'type_champ': 'texte',
                'ordre': idx * 10,
                'is_active': True,
                'is_systeme': True,
                'categorie': 'PERSONNEL' if code in PERSONNEL_SYSTEM_CODES else 'ADMINISTRATIF',
            },
        )
    ChampPersonnalise.objects.filter(code__in=PERSONNEL_CUSTOM_CODES).update(categorie='PERSONNEL')


def seed_backward(apps, schema_editor):
    ChampPersonnalise = apps.get_model('employees', 'ChampPersonnalise')
    ChampPersonnalise.objects.filter(is_systeme=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('employees', '0026_champpersonnalise_categorie_is_systeme'),
    ]
    operations = [
        migrations.RunPython(seed_forward, seed_backward),
    ]
