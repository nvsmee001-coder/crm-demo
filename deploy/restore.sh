#!/usr/bin/env bash
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
if [[ $# != 1 || "${SMEE_RESTORE_CONFIRM:-}" != "ERASE_CURRENT_DATA" ]]; then
  printf 'Usage: SMEE_RESTORE_CONFIRM=ERASE_CURRENT_DATA bash deploy/restore.sh /absolute/backup-directory\nThis REPLACES current PostgreSQL data and uploaded files. Make a fresh backup first.\n' >&2
  exit 2
fi
backup_path="$(cd -- "$1" && pwd -P)"
(cd -- "$backup_path" && sha256sum --check SHA256SUMS)
# Refuse unsafe archive paths/symlinks before touching the live volume.
python3 - "$backup_path/uploads.tar.gz" "$backup_path/manifest.json" <<'PY'
import sys,tarfile,re,json
with open(sys.argv[2]) as f: m=json.load(f)
assert m.get('format')=='smee-vps-backup' and m.get('version')==1, 'Unsupported backup format'
pattern=re.compile(r'(?:\./)?(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|\.[0-9a-f-]{36}\.tmp)')
with tarfile.open(sys.argv[1],'r:gz') as t:
 for member in t:
  if member.isdir() and member.name in ('.','./'): continue
  assert member.isfile() and pattern.fullmatch(member.name), 'Unsafe backup file entry'
  assert 0 <= member.size <= 10*1024*1024, 'Unexpected upload size'
PY
docker compose stop app
# Keep the app stopped on any failure. Inspect logs and restore a known-good backup.
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --single-transaction' < "$backup_path/database.dump"
docker compose run --rm --no-deps --entrypoint sh app -c 'find /app/data/uploads -mindepth 1 -maxdepth 1 -type f -delete'
docker compose run --rm -T --no-deps --entrypoint tar app -C /app/data/uploads -xzf - < "$backup_path/uploads.tar.gz"
# Auth sessions and invitation links are invalidated by the recovery CLI.
docker compose run --rm --no-deps app node scripts/revoke-restored-sessions.mjs
docker compose up -d app
printf 'Restore completed. Existing login sessions and setup links have been revoked.\nVerify login, customer permissions and attachments before resuming work.\n'
