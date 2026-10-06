# Déploiement SOMIZ — VPS Octenium (1 vCore / 2 Go) + domaine mzeducation.online

Architecture : Caddy (HTTPS auto) → gunicorn/Django (sert aussi le build React) →
PostgreSQL + Redis. Tout tourne en Docker. Les documents RH ne sont jamais
servis directement : uniquement via l'API authentifiée (`/media-internal/` n'est
exposé nulle part).

## 0. Avant de commencer (non technique)

- Accord écrit du DRH (email suffisant) précisant périmètre et durée des tests.
- Consentement des personnes dont les données seront chargées (trace minimale).
- Contrat Octenium : demander par écrit que le datacenter est en Algérie.

## 1. DNS (Dreamhost → zone du domaine)

Panel Dreamhost → *Domains → Manage Domains → DNS* de `mzeducation.online` :
- Enregistrement **A**, nom vide (domaine racine), valeur = IP publique du VPS.
- Supprimer tout autre A/AAAA existant sur la racine (ex. hébergement parking
  Dreamhost) pour éviter qu'ils entrent en conflit. S'il y a un AAAA (IPv6) que
  tu ne maîtrises pas, le supprimer aussi.
- Vérifier : `nslookup mzeducation.online` doit renvoyer l'IP du VPS (la
  propagation peut prendre de quelques minutes à quelques heures). Caddy ne
  pourra obtenir le certificat HTTPS qu'une fois le DNS correct.

## 2. Préparer le VPS (Ubuntu/Debian, en root puis utilisateur dédié)

```bash
# Utilisateur non-root + SSH par clé uniquement
adduser somiz && usermod -aG sudo somiz
# (copier ta clé publique dans /home/somiz/.ssh/authorized_keys, puis dans
#  /etc/ssh/sshd_config : PasswordAuthentication no, PermitRootLogin no ;
#  systemctl restart ssh — tester une 2e session AVANT de fermer la première)

# Pare-feu : SSH + web uniquement
ufw default deny incoming && ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# Swap 2 Go (indispensable avec 2 Go de RAM)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Docker
curl -fsSL https://get.docker.com | sh && usermod -aG docker somiz
apt-get install -y gnupg git
```

## 3. Récupérer le code et configurer

```bash
git clone <URL-du-dépôt> /opt/somiz && cd /opt/somiz/deploy
cp .env.production.example .env && chmod 600 .env
nano .env     # renseigner SECRET_KEY et DB_PASSWORD (voir commandes en tête du fichier)
```

Le dépôt contient déjà `backend/frontend_build/` (build React). Si tu modifies le
front : `cd frontend && npm run build`, copier le build dans
`backend/frontend_build/`, commiter, puis `git pull` sur le serveur.

## 4. Lancer

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f web    # attendre "Listening at"
docker compose -f docker-compose.prod.yml exec web python manage.py shell
#   → créer le premier ADMIN (voir CLAUDE.md : les SUPERADMIN ne se créent que par shell)
```

Ouvrir https://mzeducation.online → page de login. Le cadenas HTTPS doit être valide.

OCR (optionnel, consomme de la RAM — surveiller avec `docker stats`) :
`docker compose -f docker-compose.prod.yml --profile ocr up -d`

## 5. Sauvegardes (obligatoire avant d'y mettre de vraies données)

```bash
BACKUP_PASSPHRASE='phrase-longue-et-secrète' ./backup.sh
```
Copier ensuite `deploy/backups/*.gpg` **hors du VPS** (poste local, autre
hébergeur). Planifier avec `cron` (ex. chaque nuit). Tester une restauration au
moins une fois : une sauvegarde jamais restaurée n'est pas une sauvegarde.

### Tâches quotidiennes des notifications

Pas de Celery beat dans la stack : deux commandes à planifier avec `cron` sur
l'hôte (adapter le chemin du dépôt) :

```cron
# Échéances de contrats + comptes sans consentement (idempotent)
0 7 * * * cd /opt/somiz/deploy && docker compose -f docker-compose.prod.yml exec -T web python manage.py notifier_echeances_contrat
# Purge des notifications lues depuis plus de 30 jours
30 3 * * * cd /opt/somiz/deploy && docker compose -f docker-compose.prod.yml exec -T web python manage.py purge_notifications
```
Voir `docs/fonctionnel/notifications.md`. Tester d'abord `purge_notifications
--dry-run`.

## 6. Fin des tests — purge

Jamais de purge sans : (1) sauvegarde, (2) liste précise validée de ce qui est
supprimé. Pour tout effacer : `docker compose -f docker-compose.prod.yml down -v`
(supprime base ET documents), puis le noter dans `securite.md`.

## Limites connues de cette configuration

- 2 Go de RAM : 2 workers gunicorn, PostgreSQL bridé, Redis à 64 Mo ; l'OCR
  (Celery + Tesseract) peut saturer la mémoire → désactivé par défaut.
- `SECURE_SSL_REDIRECT=False` : la redirection HTTP→HTTPS est faite par Caddy
  (sans `SECURE_PROXY_SSL_HEADER`, l'activer côté Django provoquerait une boucle).
- Pas de monitoring ni de mises à jour auto : `apt upgrade` et `docker compose
  pull` à faire à la main régulièrement.
