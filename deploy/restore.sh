#!/usr/bin/env bash
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
if [[ $# != 1 || "${SMEE_RESTORE_CONFIRM:-}" != "ERASE_CURRENT_DATA" ]]; then
  printf 'Usage: SMEE_RESTORE_CONFIRM=ERASE_CURRENT_DATA bash deploy/restore.sh /absolute/backup-directory\nThis REPLACES current PostgreSQL data and uploaded files. Make a fresh backup first.\n' >&2
  exit 2
fi
backup_path="$(cd -- "$1" && pwd -P)"
exec 9<.
flock -n 9 || { echo 'Another backup or restore is running.' >&2; exit 1; }
python3 deploy/verify-backup.py "$backup_path"
# Read the entire dump with PostgreSQL's decoder before interrupting live service.
docker compose exec -T postgres pg_restore --file=/dev/null < "$backup_path/database.dump"
docker compose stop app
# Keep the app stopped on any failure. Inspect logs and restore a known-good backup.
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --single-transaction' < "$backup_path/database.dump"
docker compose run --rm --no-deps --entrypoint sh app -c 'find /app/data/uploads -mindepth 1 -maxdepth 1 -type f -delete'
docker compose run --rm -T --no-deps --entrypoint tar app --no-same-owner --no-same-permissions --no-overwrite-dir -C /app/data/uploads -xzf - < "$backup_path/uploads.tar.gz"
docker compose run --rm -T --no-deps app node --import tsx scripts/check-restored-files.ts
# Auth sessions and invitation links are invalidated by the recovery CLI.
docker compose run --rm --no-deps app node scripts/revoke-restored-sessions.mjs
docker compose up -d --wait --wait-timeout 180 app
printf 'Restore completed. Existing login sessions and setup links have been revoked.\nVerify login, customer permissions and attachments before resuming work.\n'
