from django.db import migrations

PALETTE = [
    '#166534', '#1e40af', '#6d28d9', '#b45309', '#be123c',
    '#0f766e', '#a16207', '#4338ca', '#15803d', '#c2410c',
]


def backfill_couleur(apps, schema_editor):
    TypeDocument = apps.get_model('employees', 'TypeDocument')
    for i, t in enumerate(TypeDocument.objects.order_by('created_at')):
        if not t.couleur:
            t.couleur = PALETTE[i % len(PALETTE)]
            t.save(update_fields=['couleur'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('employees', '0019_typedocument_couleur'),
    ]

    operations = [
        migrations.RunPython(backfill_couleur, noop),
    ]
