from dataclasses import dataclass
from datetime import date

from django.db.models import Count, Q
from django.utils import timezone

from consultations.models import DemandeConsultation
from employees.models import Contrat

from .models import MouvementArchive

ORIGINE_MANUEL = 'manuel'
ORIGINE_CONSULTATION = 'consultation'


@dataclass(frozen=True)
class LigneRegistre:
    reference: str
    origine: str
    date_depart: date
    date_retour: date | None
    beneficiaire: str
    employe: str
    matricule: str
    fonction: str
    service: str
    numero_contrat: str
    type_documents: str
    nombre_documents: int
    observation: str
    annulee: bool
    motif_annulation: str


def _numeros_contrat(employee_ids):
    """Numéro du contrat le plus récent (par date de début) de chaque employé,
    en une seule requête."""
    numeros = {}
    contrats = (
        Contrat.objects.filter(employee_id__in=employee_ids)
        .order_by('employee_id', '-date_debut')
        .values_list('employee_id', 'numero_contrat')
    )
    for employee_id, numero in contrats:
        numeros.setdefault(employee_id, numero)
    return numeros


def _nom_complet(personne):
    return f"{personne.nom} {personne.prenom}".strip()


def _lignes_manuelles(annee):
    qs = MouvementArchive.objects.select_related('employee').filter(date_depart__year=annee)
    lignes = []
    for m in qs:
        employe = _nom_complet(m.employee) if m.employee_id else m.nom_libre
        lignes.append(LigneRegistre(
            reference=m.reference, origine=ORIGINE_MANUEL,
            date_depart=m.date_depart, date_retour=m.date_retour,
            beneficiaire=m.beneficiaire, employe=employe,
            matricule=m.employee.matricule if m.employee_id else '',
            fonction=m.fonction, service=m.service, numero_contrat=m.numero_contrat,
            type_documents=m.type_documents, nombre_documents=m.nombre_documents,
            observation=m.observation, annulee=not m.is_active,
            motif_annulation=m.motif_annulation,
        ))
    return lignes


def _retour_consultation(demande, maintenant):
    if demande.statut == DemandeConsultation.Statut.REVOQUEE and demande.date_revocation:
        return timezone.localtime(demande.date_revocation).date()
    if demande.date_echeance and demande.date_echeance <= maintenant:
        return timezone.localtime(demande.date_echeance).date()
    return None


def _observation_consultation(demande):
    if demande.statut_effectif == DemandeConsultation.EXPIREE:
        return 'Expirée'
    return demande.get_statut_display()


def _lignes_consultations(user, annee):
    qs = (
        DemandeConsultation.objects
        .select_related('employee', 'employee__poste', 'employee__service', 'demandeur')
        .filter(
            statut__in=[DemandeConsultation.Statut.VALIDEE, DemandeConsultation.Statut.REVOQUEE],
            date_validation__year=annee,
        )
        .annotate(nb_fichiers=Count('fichiers'))
    )
    # Q() vide (ADMIN/SUPERADMIN) = aucune restriction ; `Q(a) | Q()` vaudrait
    # Q(a) et exclurait à tort les consultations sans employé : on ne combine
    # que si le périmètre est non vide.
    scope = user.employee_scope_q('employee__')
    if scope:
        qs = qs.filter(Q(employee__isnull=True) | scope)
    demandes = list(qs)
    contrats = _numeros_contrat({d.employee_id for d in demandes if d.employee_id})
    maintenant = timezone.now()
    lignes = []
    for d in demandes:
        e = d.employee
        lignes.append(LigneRegistre(
            reference=d.reference, origine=ORIGINE_CONSULTATION,
            date_depart=timezone.localtime(d.date_validation).date(),
            date_retour=_retour_consultation(d, maintenant),
            beneficiaire=_nom_complet(d.demandeur),
            employe=_nom_complet(e) if e else '',
            matricule=e.matricule if e else '',
            fonction=e.poste.nom if e and e.poste_id else '',
            service=e.service.nom if e and e.service_id else '',
            numero_contrat=contrats.get(d.employee_id, ''),
            type_documents=d.get_type_demande_display(),
            nombre_documents=d.nb_fichiers,
            observation=_observation_consultation(d),
            annulee=False, motif_annulation='',
        ))
    return lignes


def _correspond(ligne, q):
    if not q:
        return True
    cible = ' '.join([
        ligne.reference, ligne.beneficiaire, ligne.employe, ligne.matricule,
        ligne.fonction, ligne.service, ligne.numero_contrat, ligne.type_documents,
        ligne.observation,
    ]).lower()
    return q.lower() in cible


def registre_mouvements(user, annee, q='', statut=''):
    """Registre 01 d'une année : lignes manuelles + consultations validées ou
    révoquées, triées par date de départ croissante. `statut='en_cours'` ne
    garde que les dossiers non rendus (hors lignes annulées)."""
    lignes = _lignes_manuelles(annee) + _lignes_consultations(user, annee)
    lignes = [ligne for ligne in lignes if _correspond(ligne, q)]
    if statut == 'en_cours':
        lignes = [ligne for ligne in lignes if ligne.date_retour is None and not ligne.annulee]
    return sorted(lignes, key=lambda ligne: (ligne.date_depart, ligne.reference))


def annuler(obj, motif):
    """Soft-delete d'une ligne de registre (jamais de suppression physique :
    un registre est une pièce probante)."""
    motif = (motif or '').strip()
    if not motif:
        raise ValueError("Le motif d'annulation est obligatoire.")
    if not obj.is_active:
        raise ValueError("Cette ligne est déjà annulée.")
    obj.is_active = False
    obj.motif_annulation = motif
    obj.save(update_fields=['is_active', 'motif_annulation', 'updated_at'])
