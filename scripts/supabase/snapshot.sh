#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# snapshot.sh — dump a full pg_dump backup of the target DB.
#
# Usage:
#   DATABASE_URL="postgres://..." ./scripts/supabase/snapshot.sh [label]
#
# Writes to: scripts/supabase/backups/<label>-<timestamp>.sql.gz
# Default label: "snapshot"
# ─────────────────────────────────────────────────────────────
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL is required" >&2
  exit 1
fi

LABEL="${1:-snapshot}"
TS="$(date +%Y%m%d-%H%M%S)"
DIR="$(cd "$(dirname "$0")" && pwd)/backups"
mkdir -p "$DIR"
OUT="$DIR/${LABEL}-${TS}.sql.gz"

echo "📸 Dumping to $OUT ..."
pg_dump --no-owner --no-privileges --clean --if-exists "$DATABASE_URL" | gzip -9 > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "✅ Done — $SIZE"
echo "   Restore:  gunzip -c $OUT | psql \$DATABASE_URL"
