#!/usr/bin/env bash
# Sauvegarde SOMIZ : dump PostgreSQL + documents (volume media), chiffrés (GPG
# symétrique). À lancer depuis deploy/ ; copier ensuite le fichier .gpg HORS du
# serveur (poste local, autre hébergeur) — une sauvegarde sur le même VPS ne
# protège pas contre la perte du VPS.
#
#   BACKUP_PASSPHRASE='...' ./backup.sh
set -euo pipefail
cd "$(dirname "$0")"

: "${BACKUP_PASSPHRASE:?Définir BACKUP_PASSPHRASE}"
set -a; . ./.env; set +a

STAMP=$(date +%Y%m%d-%H%M%S)
OUT=backups
mkdir -p "$OUT"
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "[1/3] Dump PostgreSQL…"
$COMPOSE exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT/db-$STAMP.sql.gz"

echo "[2/3] Archive des documents…"
$COMPOSE exec -T web tar -C /app/media -czf - . > "$OUT/media-$STAMP.tar.gz"

echo "[3/3] Chiffrement…"
for f in "$OUT/db-$STAMP.sql.gz" "$OUT/media-$STAMP.tar.gz"; do
  gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
      --symmetric --cipher-algo AES256 -o "$f.gpg" "$f"
  rm -f "$f"
done

# Garde les 7 dernières sauvegardes de chaque type
ls -1t "$OUT"/db-*.gpg    2>/dev/null | tail -n +8 | xargs -r rm -f
ls -1t "$OUT"/media-*.gpg 2>/dev/null | tail -n +8 | xargs -r rm -f

echo "OK : $OUT/*-$STAMP.*.gpg"
