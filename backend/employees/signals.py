# apps/employees/signals.py
"""
Déclenche la synchronisation sortante vers plateforme-sps (voir
webhook_client.py) à chaque création/modification/archivage d'un `Employee`,
et à chaque modification d'un `Contrat` qui n'affecte pas le statut de
l'employé (celles qui l'affectent sont déjà couvertes par le signal Employee
lui-même — voir _contrat_post_save ci-dessous pour le détail de la
déduplication).
"""
import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from employees.models import Contrat, Employee
from employees.webhook_client import envoyer_webhook_employe

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=Employee)
def _employee_pre_save(sender, instance, **kwargs):
    """
    Stocke le statut de l'employé tel qu'il est actuellement en base (avant
    ce save), pour que le post_save puisse détecter une transition vers
    'archive'. `instance._statut_avant_save` n'est pas un champ du modèle —
    juste un attribut Python éphémère, propre à cette instance en mémoire.
    """
    if instance.pk and Employee.objects.filter(pk=instance.pk).exists():
        instance._statut_avant_save = Employee.objects.only('statut').get(pk=instance.pk).statut
    else:
        instance._statut_avant_save = None


@receiver(post_save, sender=Employee)
def _employee_post_save(sender, instance, created, **kwargs):
    if created:
        envoyer_webhook_employe(instance, 'employee.created')
        return

    statut_avant = getattr(instance, '_statut_avant_save', None)
    if statut_avant != Employee.Statut.ARCHIVE and instance.statut == Employee.Statut.ARCHIVE:
        envoyer_webhook_employe(instance, 'employee.archived')
    else:
        envoyer_webhook_employe(instance, 'employee.updated')


@receiver(post_save, sender=Contrat)
def _contrat_post_save(sender, instance, created, **kwargs):
    """
    Un contrat créé/modifié peut faire varier le statut/la date de fin de
    contrat de l'employé (voir Employee.sync_statut_from_dernier_contrat,
    déjà appelée inconditionnellement par Contrat.save() après super().save()
    — donc APRÈS que ce signal se déclenche, puisque post_save est envoyé
    depuis l'intérieur de super().save()).

    Pour éviter d'envoyer deux webhooks pour un seul changement de contrat,
    ce signal appelle lui-même sync_statut_from_dernier_contrat() en premier
    (l'appel fait ensuite par Contrat.save() ne trouvera alors plus rien à
    changer — sync_statut_from_dernier_contrat() est idempotente, ce n'est
    donc pas un problème de l'appeler deux fois) :
    - si ça déclenche un employee.save() (statut ou date_fin_contrat a
      changé), le signal post_save d'Employee ci-dessus s'en charge déjà
      (envoie 'employee.updated' ou 'employee.archived' selon la
      transition) — on ne renvoie alors PAS de webhook ici, ce serait un
      doublon.
    - sinon (le contrat a changé sans affecter le statut/la date de fin de
      l'employé — ex. notes, dates internes du contrat), on envoie
      nous-mêmes 'employee.updated' : un changement de contrat n'est jamais
      un événement d'archivage à lui seul, toujours 'updated'.
    """
    employee = instance.employee
    statut_avant = employee.statut
    date_fin_avant = employee.date_fin_contrat

    employee.sync_statut_from_dernier_contrat()

    a_change = (
        employee.statut != statut_avant
        or employee.date_fin_contrat != date_fin_avant
    )
    if not a_change:
        envoyer_webhook_employe(employee, 'employee.updated')
