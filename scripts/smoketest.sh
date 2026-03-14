#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=${SCRUBBER_PORT:-$(( (RANDOM % 10000) + 20000 ))}
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

export SCRUBBER_ADAPTER=no-auth
export SCRUBBER_INDEX=./data/example-index.json
export SCRUBBER_POLICY=./data/example-policy.json
export SCRUBBER_PORT=$PORT
export SCRUBBER_NOAUTH_USER=local-dev
export SCRUBBER_NOAUTH_GROUPS=support,admin

echo "Starting server on port $PORT..."
deno run --allow-net --allow-read --allow-env --allow-run src/server/mod.ts &
SERVER_PID=$!

for i in $(seq 1 30); do
  if curl -sf http://localhost:$PORT/sanitize -X POST \
    -H 'Content-Type: application/json' \
    -d '{"context":{},"payload":{}}' > /dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "FAIL: server did not start within 30 seconds"
    exit 1
  fi
  sleep 1
done
echo "Server ready."

PASS=0
FAIL=0

assert_contains() {
  local label="$1" response="$2" expected="$3"
  if echo "$response" | grep -qF "$expected"; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label — expected to contain: $expected"
    echo "  Got: $response"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local label="$1" response="$2" unexpected="$3"
  if echo "$response" | grep -qF "$unexpected"; then
    echo "  FAIL: $label — should NOT contain: $unexpected"
    echo "  Got: $response"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  fi
}

assert_status() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" -eq "$expected" ]; then
    echo "  PASS: $label (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label — expected HTTP $expected, got HTTP $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "=== POST /sanitize ==="

RESPONSE=$(curl -s -X POST http://localhost:$PORT/sanitize \
  -H 'Content-Type: application/json' \
  -d '{
    "context": {"purpose": "ticket"},
    "payload": {
      "customer": {
        "name": "Jane Doe",
        "email": "jane@example.com",
        "sin": "123-456-789",
        "notes": "Customer called from 416-555-0199"
      }
    },
    "explain": true
  }')

assert_contains "email is masked" "$RESPONSE" 'j***@example.com'
assert_not_contains "sin is dropped" "$RESPONSE" '123-456-789'
assert_contains "name passes through" "$RESPONSE" 'Jane Doe'
assert_contains "notes phone is inline-masked" "$RESPONSE" 'Customer called from ***'
assert_contains "decisions array present" "$RESPONSE" '"decisions"'
assert_contains "email classified as pii.email" "$RESPONSE" '"pii.email"'
assert_contains "sin classified as government.id" "$RESPONSE" '"government.id"'

echo ""
echo "=== POST /sanitize (no explain) ==="

RESPONSE=$(curl -s -X POST http://localhost:$PORT/sanitize \
  -H 'Content-Type: application/json' \
  -d '{"context":{"purpose":"ticket"},"payload":{"customer":{"email":"jane@example.com"}}}')

assert_contains "email masked" "$RESPONSE" 'j***@example.com'
assert_not_contains "decisions omitted" "$RESPONSE" '"decisions"'

echo ""
echo "=== POST /classify ==="

RESPONSE=$(curl -s -X POST http://localhost:$PORT/classify \
  -H 'Content-Type: application/json' \
  -d '{
    "payload": {
      "customer": {
        "emailAddress": "jane@example.com",
        "notes": "Customer called from 416-555-0199"
      }
    }
  }')

assert_contains "emailAddress classified" "$RESPONSE" '"pii.email"'
assert_contains "phone finding in notes" "$RESPONSE" '"pii.phone"'
assert_contains "inline finding has start/end" "$RESPONSE" '"start"'

echo ""
echo "=== POST /index/build ==="

RESPONSE=$(curl -s -X POST http://localhost:$PORT/index/build \
  -H 'Content-Type: application/json' \
  -d '{
    "samples": [
      {"payload": {"customer": {"email": "a@example.com"}}},
      {"payload": {"customer": {"email": "b@example.com"}}},
      {"payload": {"customer": {"email": "c@example.com"}}}
    ]
  }')

assert_contains "index has version" "$RESPONSE" '"version"'
assert_contains "path_classes inferred" "$RESPONSE" '/customer/email'
assert_contains "detectors carried forward" "$RESPONSE" '"detectors"'

echo ""
echo "=== Error handling ==="

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X GET http://localhost:$PORT/sanitize)
assert_status "GET returns 405" "$STATUS" 405

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:$PORT/nonexistent \
  -H 'Content-Type: application/json' -d '{}')
assert_status "unknown path returns 404" "$STATUS" 404

echo ""
echo "==============================="
echo "Results: $PASS passed, $FAIL failed"
echo "==============================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
