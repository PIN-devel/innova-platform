#!/usr/bin/env sh
set -e

GATEWAY_URL="${1:-http://localhost:8080}"
echo "==> [test-cookie-bridge] Testing Gateway at: $GATEWAY_URL"

# 1. Health check
echo "--> 1. Health check (/health)"
HEALTH_RESP=$(curl -s -w "\n%{http_code}" "$GATEWAY_URL/health")
HTTP_CODE=$(echo "$HEALTH_RESP" | tail -n1)
BODY=$(echo "$HEALTH_RESP" | head -n -1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL: Expected HTTP 200 from /health, got $HTTP_CODE"
  echo "$BODY"
  exit 1
fi
echo "SUCCESS: /health returned HTTP 200. Body: $BODY"

# 2. Cookie Bridge verification test
echo "--> 2. Testing __session Cookie propagation (/api/auth/me)"
COOKIE_TEST=$(curl -s -i -H "Cookie: __session=test-jwt-session-token-1234" "$GATEWAY_URL/api/auth/me" || true)
echo "$COOKIE_TEST" | head -n 15

# 3. Cookie Bridge expiration test (/api/auth/logout)
echo "--> 3. Testing __session Cookie expiration on logout (/api/auth/logout)"
LOGOUT_TEST=$(curl -s -i -X POST -H "Cookie: __session=test-jwt-session-token-1234" "$GATEWAY_URL/api/auth/logout" || true)
echo "$LOGOUT_TEST" | grep -i "set-cookie" || true

echo "==> [test-cookie-bridge] Completed."
