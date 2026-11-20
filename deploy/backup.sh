#!/usr/bin/env bash
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
# Use the same installation directory lock for backup and restore.
exec 9<.
flock -n 9 || { echo 'Another backup or restore is running.' >&2; exit 1; }
backup_root="${SMEE_BACKUP_DIR:-$PWD/backups}"
mkdir -p -- "$backup_root"
chmod 700 -- "$backup_root"
backup_path="$(mktemp -d "$backup_root/.partial-smee-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
app_was_running="$(docker compose ps --status running --services | awk '$0 == "app" {print}')"
resume_app() {
  if [[ "$app_was_running" == "app" ]]; then docker compose start --wait --wait-timeout 180 app; fi
}
trap resume_app EXIT
# Pause writes so database metadata and files represent the same point in time.
docker compose stop app
if ! docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl -Fc' > "$backup_path/database.dump"; then
  printf 'Backup failed. Incomplete directory: %s\n' "$backup_path" >&2
  exit 1
fi
docker compose run --rm -T --no-deps --entrypoint tar app -C /app/data/uploads -czf - . > "$backup_path/uploads.tar.gz"
# Both captures are complete. Resume service before doing the offline integrity checks.
resume_app
trap - EXIT
printf '{"format":"smee-vps-backup","version":1,"createdAt":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$backup_path/manifest.json"
(cd -- "$backup_path" && sha256sum database.dump uploads.tar.gz manifest.json > SHA256SUMS)
python3 deploy/verify-backup.py "$backup_path"
docker compose exec -T postgres pg_restore --file=/dev/null < "$backup_path/database.dump"
final_path="$backup_root/${backup_path##*/.partial-}"
mv -T -- "$backup_path" "$final_path"
printf 'Backup complete: %s\nContains private data. Copy to encrypted off-server storage.\n' "$final_path"
