"""
ocr/models.py
Résultat d'analyse OCR d'un fichier employé — jamais d'écriture directe
sur Employee/EmployeeChampValeur, uniquement des suggestions à valider
(voir docs/superpowers/specs/2026-09-06-ocr-documents-design.md).
"""

from django.db import models


class OcrResult(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'En attente'
        DONE = 'done', 'Terminé'
        FAILED = 'failed', 'Échec'

    file = models.OneToOneField(
        'employees.EmployeeDocumentFile', on_delete=models.CASCADE,
        related_name='ocr_result', verbose_name="Fichier"
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    raw_text = models.TextField(blank=True, verbose_name="Texte extrait")
    page_texts = models.JSONField(
        default=list, blank=True, verbose_name="Texte extrait par page",
        help_text=(
            "Liste ordonnée du texte de chaque page physique du PDF (index 0 = "
            "EmployeeDocumentFilePage.ordre 1) — permet à la recherche globale de "
            "retrouver la page exacte d'un résultat, pas seulement le fichier. "
            "Vide pour un fichier non-PDF (une image est une page indivisible)."
        ),
    )
    confidence = models.FloatField(null=True, blank=True, verbose_name="Confiance")
    extracted_fields = models.JSONField(
        default=list, blank=True, verbose_name="Champs détectés",
        help_text="Liste de {champ_code, valeur, confiance, statut} — statut ∈ en_attente/appliquee/ignoree",
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        db_table = 'ocr_results'
        verbose_name = "Résultat OCR"

    def __str__(self):
        return f"OCR {self.file_id} — {self.status}"
