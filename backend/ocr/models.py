"""
ocr/models.py
Résultat d'analyse OCR d'un fichier employé — texte brut indexé pour la
recherche plein texte uniquement (plus d'extraction de champs depuis le
2026-10-08, voir docs/fonctionnel/documents.md).
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
    processed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        db_table = 'ocr_results'
        verbose_name = "Résultat OCR"

    def __str__(self):
        return f"OCR {self.file_id} — {self.status}"
