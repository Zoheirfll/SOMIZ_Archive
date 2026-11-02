# backend/reporting/rh/commun.py
"""Outils partagés par les constructeurs de pages du reporting RH."""
from dataclasses import dataclass
from datetime import date, timedelta

from django.conf import settings
from django.utils import timezone

from employees.models import Employee
from reporting.rh.definitions import definition

STATUTS_SORTIE = ('inactif', 'archive', 'demobilise')
CLE_SEXE = {'M': 'hommes', 'F': 'femmes'}


class ParametreInvalide(ValueError):
    pass


@dataclass(frozen=True)
class Parametres:
    date_debut: date
    date_fin: date
    echeance_jours: int = 90
    horizon: int = 5

    @property
    def periode_precedente(self):
        duree = (self.date_fin - self.date_debut).days + 1
        return self.date_debut - timedelta(days=duree), self.date_debut - timedelta(days=1)

    def as_dict(self):
        return {'debut': self.date_debut.isoformat(), 'fin': self.date_fin.isoformat()}


def lire_parametres(query):
    def _date(nom):
        valeur = query.get(nom)
        if not valeur:
            return None
        try:
            return date.fromisoformat(valeur)
        except ValueError as exc:
            raise ParametreInvalide(nom) from exc

    def _entier(nom, defaut, mini, maxi):
        valeur = query.get(nom)
        if valeur in (None, ''):
            return defaut
        try:
            n = int(valeur)
        except ValueError as exc:
            raise ParametreInvalide(nom) from exc
        if not mini <= n <= maxi:
            raise ParametreInvalide(nom)
        return n

    fin = _date('date_fin') or timezone.localdate()
    debut = _date('date_debut') or fin - timedelta(days=365)
    if debut > fin:
        raise ParametreInvalide('date_debut')
    return Parametres(debut, fin, _entier('echeance_jours', 90, 1, 365), _entier('horizon', 5, 1, 10))


def actifs():
    return Employee.objects.filter(statut=Employee.Statut.ACTIF)


def annees_revolues(depuis, ref):
    return ref.year - depuis.year - ((ref.month, ref.day) < (depuis.month, depuis.day))


def ajouter_annees(d, n):
    try:
        return d.replace(year=d.year + n)
    except ValueError:                      # 29 février → 28 février
        return d.replace(year=d.year + n, day=28)


def tranche(annees, tranches):
    for mini, maxi, libelle in tranches:
        if mini <= annees <= maxi:
            return libelle
    return ''


def taux(n, total):
    return round(n / total * 100, 1) if total else None


def variation_pct(valeur, precedente):
    if not precedente or valeur is None:
        return None
    return round((valeur - precedente) / precedente * 100, 1)


def seuil_petits_effectifs():
    return getattr(settings, 'REPORTING_SEUIL_PETITS_EFFECTIFS', 2)


def age_retraite(sexe):
    ages = getattr(settings, 'REPORTING_AGE_RETRAITE', {'M': 60, 'F': 55})
    return ages.get(sexe, ages['M'])


def masquer(lignes, cles):
    """Ligne dont le `total` est sous le seuil (et non nul) : valeurs `cles`
    remplacées par None et `masque=True`. Le total reste affiché."""
    seuil = seuil_petits_effectifs()
    for ligne in lignes:
        ligne['masque'] = 0 < ligne['total'] < seuil
        if ligne['masque']:
            for cle in cles:
                ligne[cle] = None
    return lignes


def kpi(code, valeur, unite='', precedente=None, variation=None):
    if variation is None and precedente is not None:
        variation = variation_pct(valeur, precedente)
    return {**definition(code), 'valeur': valeur, 'unite': unite, 'variation_pct': variation}


def table(titre, colonnes, lignes):
    return {'titre': titre, 'colonnes': colonnes, 'lignes': lignes}


def table_kpis(kpis):
    return table('Indicateurs', ['Indicateur', 'Valeur', 'Unité', 'Variation (%)', 'Définition'], [
        [k['libelle'], k['valeur'], k['unite'], k['variation_pct'], k['definition']] for k in kpis
    ])
