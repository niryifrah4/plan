#!/bin/bash
# Smoke test — run against a deployed environment to verify the basics.
#
# Usage:
#   BASE_URL=https://app.your-domain.co.il ./scripts/smoke-test.sh
#
# Pass criteria (all 4 must succeed):
#   ✓ /api/health returns {"ok":true}
#   ✓ / redirects to /login
#   ✓ /privacy renders (200 + has Hebrew title)
#   ✓ /terms renders (200 + has Hebrew title)

set -e
BASE_URL=${BASE_URL:-http://localhost:3000}

echo "▶ Smoke testing $BASE_URL"
echo

ok() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; exit 1; }

# 1. Health endpoint
echo "1. /api/health"
RESP=$(curl -fsS "$BASE_URL/api/health")
echo "$RESP" | grep -q '"ok":true' && ok "returned ok=true" || fail "unexpected response: $RESP"

# 2. Root redirects to login
echo "2. / → /login"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
[[ "$CODE" == "307" || "$CODE" == "302" || "$CODE" == "200" ]] \
  && ok "got $CODE (login or redirect)" \
  || fail "got $CODE"

# 3. Privacy page
echo "3. /privacy"
HTML=$(curl -fsS "$BASE_URL/privacy")
echo "$HTML" | grep -q "מדיניות פרטיות" && ok "Hebrew title found" || fail "missing title"

# 4. Terms page
echo "4. /terms"
HTML=$(curl -fsS "$BASE_URL/terms")
echo "$HTML" | grep -q "תנאי שימוש" && ok "Hebrew title found" || fail "missing title"

echo
echo "✅ All smoke tests passed."
