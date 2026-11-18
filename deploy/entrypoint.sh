#!/bin/sh
set -eu
# Schema is versioned and locked by migrate.mjs. CLI invocations also see current schema.
node scripts/check-config.mjs
node scripts/migrate.mjs
exec "$@"
