#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# restore.sh — restore a pg_dump snapshot into the target DB.
#
# ⚠️  DESTRUCTIVE — the dump was made with `--clean --if-exists`,
#    so running this WILL drop and recreate every object.
#
# Usage:
#   DATABASE_URL="postgres://..." ./scripts/supabase/restore.sh <path-to-dump.sql.gz>
# ─────────────────────────────────────────────────────────────
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL is required" >&2
  exit 1
fi
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <dump-file.sql.gz>" >&2
  exit 1
fi

DUMP="$1"
if [[ ! -f "$DUMP" ]]; then
  echo "❌ File not found: $DUMP" >&2
  exit 1
fi

echo "⚠️  About to restore $DUMP into:"
echo "   $(echo "$DATABASE_URL" | sed -E 's#(://[^:]+:)[^@]+(@)#\1****\2#')"
read -r -p "Proceed? (type 'yes' to continue) " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted."
  exit 1
fi

echo "♻️  Restoring..."
if [[ "$DUMP" == *.gz ]]; then
  gunzip -c "$DUMP" | psql "$DATABASE_URL"
else
  psql "$DATABASE_URL" < "$DUMP"
fi
echo "✅ Restore complete."
