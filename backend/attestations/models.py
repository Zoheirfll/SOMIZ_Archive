import uuid
from django.conf import settings
from django.db import models


def attestation_scan_upload_path(instance, filename):
    return f"attestations/{instance.employee_id}/{uuid.uuid4()}_{filename}"


def attestation_logo_upload_path(instance, filename):
    return f"attestation_logo/{uuid.uuid4()}_{filename}"


class ReferenceCounter(models.Model):
    """Compteur annuel pour générer les références NNNNN/AA des demandes
    d'attestation — une ligne par année civile, incrémentée sous verrou."""
    annee = models.PositiveSmallIntegerField(unique=True)
    dernier_numero = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'attestation_reference_counters'


class DemandeAttestation(models.Model):
    class Statut(models.TextChoices):
        RECUE = 'recue', 'Reçue'
        PRETE = 'prete', 'Prête'
        RECUPEREE = 'recuperee', 'Récupérée'
        REJETEE = 'rejetee', 'Rejetée'

    class Importance(models.TextChoices):
        HAUTE = 'haute', 'Haute'
        MOYENNE = 'moyenne', 'Moyenne'
        FAIBLE = 'faible', 'Faible'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=20, unique=True, editable=False)
    # Urgence indiquée par le demandeur à la création — aide l'ADMIN à
    # prioriser le traitement, sans effet sur le workflow de statuts.
    importance = models.CharField(
        max_length=10, choices=Importance.choices, default=Importance.MOYENNE,
    )
    employee = models.ForeignKey(
        'employees.Employee', on_delete=models.PROTECT,
        related_name='demandes_attestation',
    )
    contrat = models.ForeignKey(
        'employees.Contrat', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_attestation',
    )
    motif = models.ForeignKey(
        'employees.MotifArchivage', on_delete=models.PROTECT,
        related_name='demandes_attestation',
        limit_choices_to={'categorie': 'attestation'},
    )
    commentaire = models.TextField(blank=True)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.RECUE)
    # Date de passage à chaque étape du stepper (voir AttestationDetail.jsx)
    # — `created_at` sert déjà de date "Reçue", pas besoin d'un 3e champ.
    # Renseignées automatiquement par DemandeAttestationStatutView.patch(),
    # jamais modifiables directement via l'API.
    date_prete = models.DateTimeField(null=True, blank=True)
    date_recuperee = models.DateTimeField(null=True, blank=True)
    # Date imprimée sur le document PDF lui-même ("Arzew le :"/"Édité le :",
    # voir attestations/pdf.py) — distincte de date_prete/date_recuperee qui
    # tracent le workflow de statut. Figée à la première génération du PDF
    # (AttestationApercuView.get) plutôt que recalculée à chaque aperçu :
    # entre l'impression et la signature effective, un jour ou deux peuvent
    # s'écouler (ex. imprimé le 23, signé le 24) — si la date changeait à
    # chaque réouverture de l'aperçu, un second aperçu le lendemain aurait
    # silencieusement affiché une date différente de celle réellement
    # imprimée/signée. Une régénération à une date différente de celle déjà
    # figée exige une confirmation explicite (voir needs_confirmation dans
    # la vue) avant d'être appliquée.
    date_document = models.DateField(null=True, blank=True)
    motif_rejet = models.TextField(blank=True)
    scan_document = models.FileField(
        upload_to=attestation_scan_upload_path, null=True, blank=True,
    )

    demandeur = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='demandes_attestation_faites',
    )
    traite_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_attestation_traitees',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'demandes_attestation'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.reference} — {self.employee} ({self.statut})"


class AttestationTemplateConfig(models.Model):
    """Singleton applicatif — un seul enregistrement pour toute la société,
    voir AttestationTemplateConfigView.get_object(). Les valeurs par défaut
    reprennent l'en-tête/pied de page du modèle papier SOMIZ en vigueur
    pour qu'une attestation soit imprimable sans configuration préalable ;
    un ADMIN peut les modifier dans /parametres."""
    societe_nom = models.CharField(max_length=100, default="SOMIZ")
    societe_soustitre = models.CharField(
        max_length=255, blank=True,
        default="SOCIÉTÉ DE MAINTENANCE INDUSTRIELLE D'ARZEW",
    )
    societe_capital = models.CharField(
        max_length=255, blank=True,
        default="SPA Au Capital Social de 3.700.000.000 DA",
    )
    holding = models.CharField(
        max_length=255, blank=True,
        default="Holding SONATRACH Services Parapétroliers Spa",
    )
    adresse = models.CharField(
        max_length=255, blank=True, default="BP 28 Route d'El Mohgoun 31200 Arzew",
    )
    ville = models.CharField(max_length=100, blank=True, default="Arzew")
    telephone = models.CharField(max_length=50, blank=True, default="213 (0) 41.68.01.00")
    fax = models.CharField(max_length=50, blank=True, default="213 (0) 41.68.01.63")
    telex = models.CharField(max_length=50, blank=True, default="12048 DZ")
    signataire_titre = models.CharField(
        max_length=150, blank=True,
        default="Chef de Département Administration du Personnel",
    )
    signataire_nom = models.CharField(max_length=150, blank=True, default="A.BOUSMAHA")
    # Signature "P.I" (Pour Intérim, 2026-09-23) — un cadre en intérim signe
    # temporairement à la place du signataire habituel ci-dessus. Réglage
    # global (comme le reste de cette config) plutôt que par demande : le
    # temps que dure l'intérim, toutes les attestations générées portent ce
    # nom ; un ADMIN désactive l'option pour revenir au signataire titulaire.
    signataire_interim = models.BooleanField(default=False)
    signataire_interim_nom = models.CharField(max_length=150, blank=True)
    logo = models.ImageField(upload_to=attestation_logo_upload_path, null=True, blank=True)
    # Mention "(mode test)" imprimée sur TOUTE attestation générée (aperçu ET
    # vraies demandes), tant que ce chantier n'a pas été validé en conditions
    # réelles — évite qu'un document généré pendant les tests soit confondu
    # avec une vraie attestation officielle. Activé par défaut ; un ADMIN le
    # désactive lui-même dans /parametres une fois les tests terminés, sans
    # repasser par du code.
    mode_test = models.BooleanField(default=True)

    class Meta:
        db_table = 'attestation_template_config'
