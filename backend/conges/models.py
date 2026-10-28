import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


def conge_scan_upload_path(instance, filename):
    return f"conges/{instance.employee_id}/{uuid.uuid4()}_{filename}"


def conge_piece_upload_path(instance, filename):
    # Nom régénéré (UUID) : jamais le nom fourni par le client dans le chemin.
    extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'bin'
    if not extension.isalnum() or len(extension) > 8:
        extension = 'bin'
    return f"conges/pieces/{instance.demande.employee_id}/{uuid.uuid4()}.{extension}"


def conge_logo_upload_path(instance, filename):
    return f"conge_logo/{uuid.uuid4()}_{filename}"


class TypeConge(models.TextChoices):
    CP = 'CP', 'Congé payé'
    CE = 'CE', 'Congé exceptionnel'
    CS = 'CS', 'Congé sans solde'


class CategorieExercice(models.TextChoices):
    """Groupe d'un exercice relativement à l'exercice en cours. Calculé, jamais
    stocké sur le solde : il glisse tout seul au 1er juillet."""
    RELIQUAT = 'RELIQUAT', 'Reliquat'
    ACTUEL = 'ACTUEL', 'Actuel'
    ANTICIPE = 'ANTICIPE', 'Anticipé'


class MotifConge(models.Model):
    """Référentiel des motifs, propres à chaque type (géré dans /parametres).
    `nb_jours_fixe` : durée imposée (ex. CE Mariage = 3 j) ; la demande doit
    alors porter exactement ce nombre de jours."""
    nom = models.CharField(max_length=100)
    type_conge = models.CharField(max_length=2, choices=TypeConge.choices)
    nb_jours_fixe = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1)])
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'conge_motifs'
        ordering = ['type_conge', 'nom']
        constraints = [
            models.UniqueConstraint(fields=['nom', 'type_conge'], name='uniq_motif_conge_nom_type'),
        ]

    def __str__(self):
        return f"{self.type_conge} — {self.nom}"


class MotifPiece(models.Model):
    """Pièce justificative attendue pour un motif (ex. Mariage : acte de
    mariage). Facultative : la liste guide le demandeur, sans bloquer."""
    motif = models.ForeignKey(MotifConge, on_delete=models.CASCADE, related_name='pieces')
    libelle = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'conge_motif_pieces'
        ordering = ['motif', 'libelle']

    def __str__(self):
        return f"{self.motif} — {self.libelle}"


class ParametreConge(models.Model):
    """Singleton (pk=1) : paramètres globaux des congés."""
    droit_annuel_jours = models.PositiveSmallIntegerField(default=30)

    class Meta:
        db_table = 'conge_parametres'

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class ReferenceCounter(models.Model):
    """Compteur annuel des références NNNNN/AA — une ligne par année civile."""
    annee = models.PositiveSmallIntegerField(unique=True)
    dernier_numero = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'conge_reference_counters'


class SoldeConge(models.Model):
    """En-tête des soldes d'un employé : compteurs cumulés. Les jours sont
    suivis PAR EXERCICE (SoldeExercice). Ne se modifie QUE via conges.services
    (verrou + MouvementConge) : jamais directement."""
    employee = models.OneToOneField(
        'employees.Employee', on_delete=models.PROTECT, related_name='solde_conge',
    )
    droit_initial = models.IntegerField(default=0)
    cp_consomme = models.IntegerField(default=0)
    retrait_cs = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'conge_soldes'

    def __str__(self):
        return f"Solde {self.employee_id}"


class SoldeExercice(models.Model):
    """Jours d'un employé pour UN exercice (« 2025/2026 ») : restant = droit −
    consommé. Le groupe (reliquat/actuel/anticipé) se déduit de la date du jour ;
    au 1er juillet rien ne bouge en base, seuls les groupes glissent."""
    employee = models.ForeignKey(
        'employees.Employee', on_delete=models.PROTECT, related_name='soldes_exercice',
    )
    exercice = models.CharField(max_length=9)
    droit = models.IntegerField(default=0)
    consomme = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'conge_soldes_exercice'
        ordering = ['employee', 'exercice']
        constraints = [
            models.UniqueConstraint(fields=['employee', 'exercice'], name='uniq_solde_exercice'),
            models.CheckConstraint(condition=models.Q(consomme__gte=0), name='solde_exercice_consomme_pos'),
            models.CheckConstraint(condition=models.Q(consomme__lte=models.F('droit')), name='solde_exercice_consomme_max'),
        ]

    @property
    def restant(self):
        return self.droit - self.consomme

    def __str__(self):
        return f"{self.employee_id} {self.exercice} : {self.restant} j"


class MouvementConge(models.Model):
    """Ligne d'historique IMMUABLE : toute variation de solde en écrit une.
    Une ligne touche au plus UN exercice (`exercice`, `d_droit`, `d_consomme`)
    et/ou les compteurs de l'en-tête. Invariant : chaque valeur en base égale
    la somme des variations correspondantes."""

    class Nature(models.TextChoices):
        INITIAL = 'INITIAL', 'Saisie initiale'
        OUVERTURE = 'OUVERTURE', "Ouverture d'exercice"
        DEBIT = 'DEBIT', 'Débit (validation CP)'
        RETRAIT_CS = 'RETRAIT_CS', 'Congé sans solde'
        RESTITUTION_ANNULATION = 'RESTITUTION_ANNULATION', 'Restitution (annulation/rejet)'
        RESTITUTION_INTERRUPTION = 'RESTITUTION_INTERRUPTION', 'Restitution (interruption)'
        CORRECTION = 'CORRECTION', 'Correction manuelle'

    employee = models.ForeignKey(
        'employees.Employee', on_delete=models.PROTECT, related_name='mouvements_conge',
    )
    demande = models.ForeignKey(
        'conges.DemandeConge', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='mouvements',
    )
    nature = models.CharField(max_length=30, choices=Nature.choices)
    exercice = models.CharField(max_length=9, blank=True)
    d_droit = models.IntegerField(default=0)
    d_consomme = models.IntegerField(default=0)
    d_droit_initial = models.IntegerField(default=0)
    d_cp_consomme = models.IntegerField(default=0)
    d_retrait_cs = models.IntegerField(default=0)
    avant = models.JSONField(default=dict, blank=True)
    apres = models.JSONField(default=dict, blank=True)
    motif = models.TextField(blank=True)
    auteur = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='mouvements_conge_faits',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'conge_mouvements'
        ordering = ['-created_at', '-id']

    def save(self, *args, **kwargs):
        if self.pk:
            raise RuntimeError("Un mouvement de congé est immuable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Un mouvement de congé ne se supprime jamais.")


def aujourdhui():
    """Date du jour pour `conge_termine` — point unique, figé dans les tests
    (tests/conftest.py) pour qu'ils ne dépendent pas de l'horloge réelle."""
    return timezone.localdate()


class DemandeConge(models.Model):
    class Statut(models.TextChoices):
        RECUE = 'recue', 'Reçue'
        PRETE = 'prete', 'Prête'
        RECUPEREE = 'recuperee', 'Récupérée'
        REJETEE = 'rejetee', 'Rejetée'
        ANNULEE = 'annulee', 'Annulée'
        INTERROMPUE = 'interrompue', 'Interrompue'

    class Importance(models.TextChoices):
        HAUTE = 'haute', 'Haute'
        MOYENNE = 'moyenne', 'Moyenne'
        FAIBLE = 'faible', 'Faible'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=20, unique=True)
    importance = models.CharField(max_length=10, choices=Importance.choices, default=Importance.MOYENNE)
    employee = models.ForeignKey('employees.Employee', on_delete=models.PROTECT, related_name='demandes_conge')
    contrat = models.ForeignKey(
        'employees.Contrat', null=True, blank=True, on_delete=models.SET_NULL, related_name='demandes_conge',
    )

    # Saisi par le demandeur, corrigeable par le traiteur à la validation.
    # Période = [date_depart, date_retour[ : date_retour = date de REPRISE.
    type_conge = models.CharField(max_length=2, choices=TypeConge.choices, blank=True)
    motif = models.ForeignKey(MotifConge, null=True, blank=True, on_delete=models.PROTECT, related_name='demandes')
    # Exercice de DÉPART (imprimé) ; le débit peut déborder sur les suivants.
    exercice = models.CharField(max_length=9, blank=True)
    date_depart = models.DateField()
    date_retour = models.DateField()
    nb_jours = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    adresse_conge = models.CharField(max_length=255)
    commentaire = models.TextField(blank=True)

    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.RECUE)
    motif_rejet = models.TextField(blank=True)

    # Renseigné par le traiteur à la validation.
    date_etablissement = models.DateField(null=True, blank=True)
    observations = models.TextField(blank=True)
    # Ventilation du débit CP : [{"exercice": "2024/2025", "jours": 13}, ...],
    # restituée vers les mêmes exercices en cas d'annulation/interruption.
    ventilation = models.JSONField(default=list, blank=True)
    # Groupe de l'exercice de départ AU MOMENT de la validation (sous-titre imprimé).
    categorie_exercice = models.CharField(max_length=10, choices=CategorieExercice.choices, blank=True)
    # Signataire figé à la validation.
    signataire_nom = models.CharField(max_length=150, blank=True)
    signataire_titre = models.CharField(max_length=150, blank=True)
    signataire_interim = models.BooleanField(default=False)
    validateur_nom = models.CharField(max_length=150, blank=True)

    motif_annulation = models.TextField(blank=True)
    annulee_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_conge_annulees',
    )
    date_annulation = models.DateTimeField(null=True, blank=True)

    date_rappel = models.DateField(null=True, blank=True)
    jours_effectifs = models.PositiveSmallIntegerField(null=True, blank=True)
    motif_interruption = models.TextField(blank=True)
    interrompue_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_conge_interrompues',
    )
    date_interruption = models.DateTimeField(null=True, blank=True)

    date_prete = models.DateTimeField(null=True, blank=True)
    date_recuperee = models.DateTimeField(null=True, blank=True)
    # Date imprimée sur le titre, figée au premier aperçu (voir CongeApercuView).
    date_document = models.DateField(null=True, blank=True)
    scan_document = models.FileField(upload_to=conge_scan_upload_path, null=True, blank=True)

    demandeur = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='demandes_conge_faites',
    )
    traite_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_conge_traitees',
    )

    # Soft-delete : l'annulation par le demandeur ne supprime jamais la ligne.
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'demandes_conge'
        ordering = ['-created_at']

    @property
    def conge_termine(self) -> bool:
        """Date de reprise atteinte : le congé est consommé, le titre est figé
        (plus d'annulation, d'interruption ni de rejet d'un titre établi)."""
        return self.date_retour <= aujourdhui()

    def __str__(self):
        return f"{self.reference} — {self.employee} ({self.statut})"


class PieceJointeConge(models.Model):
    """Pièce justificative jointe à une demande (facultative). Servie
    uniquement par l'API (droits revérifiés), jamais par une URL directe."""
    demande = models.ForeignKey(DemandeConge, on_delete=models.CASCADE, related_name='pieces_jointes')
    piece = models.ForeignKey(MotifPiece, null=True, blank=True, on_delete=models.SET_NULL, related_name='fichiers')
    libelle = models.CharField(max_length=150)
    fichier = models.FileField(upload_to=conge_piece_upload_path)
    nom_fichier = models.CharField(max_length=255)
    taille = models.PositiveIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='pieces_conge_deposees',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'conge_pieces_jointes'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.demande.reference} — {self.libelle}"


class CongeTemplateConfig(models.Model):
    """Singleton (pk=1) — modèle du titre de congé. Mêmes champs que
    AttestationTemplateConfig (attestations.pdf lit ces attributs par nom) ;
    seul le fax par défaut diffère (valeur relevée sur le papier de congé)."""
    societe_nom = models.CharField(max_length=100, default="SOMIZ")
    societe_soustitre = models.CharField(
        max_length=255, blank=True, default="SOCIÉTÉ DE MAINTENANCE INDUSTRIELLE D'ARZEW",
    )
    societe_capital = models.CharField(
        max_length=255, blank=True, default="SPA Au Capital Social de 3.700.000.000 DA",
    )
    holding = models.CharField(
        max_length=255, blank=True, default="Holding SONATRACH Services Parapétroliers Spa",
    )
    adresse = models.CharField(max_length=255, blank=True, default="BP 28 Route d'El Mohgoun 31200 Arzew")
    ville = models.CharField(max_length=100, blank=True, default="Arzew")
    telephone = models.CharField(max_length=50, blank=True, default="213 (0) 41.68.01.00")
    fax = models.CharField(max_length=50, blank=True, default="213 (0) 41.68.01.03")
    telex = models.CharField(max_length=50, blank=True, default="12048 DZ")
    signataire_titre = models.CharField(
        max_length=150, blank=True, default="Chef de Département Administration du Personnel",
    )
    signataire_nom = models.CharField(max_length=150, blank=True, default="A.BOUSMAHA")
    signataire_interim = models.BooleanField(default=False)
    signataire_interim_nom = models.CharField(max_length=150, blank=True)
    logo = models.ImageField(upload_to=conge_logo_upload_path, null=True, blank=True)
    # « (mode test) » imprimé sur TOUT titre tant que la case n'est pas décochée.
    mode_test = models.BooleanField(default=True)

    class Meta:
        db_table = 'conge_template_config'
