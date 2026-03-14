#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export SCRUBBER_ADAPTER=no-auth
export SCRUBBER_INDEX=./data/example-index.json
export SCRUBBER_POLICY=./data/example-policy.json
export SCRUBBER_PORT=${SCRUBBER_PORT:-8080}
export SCRUBBER_NOAUTH_USER=local-dev
export SCRUBBER_NOAUTH_GROUPS=support,admin

echo "Starting Agent Data Gateway on port $SCRUBBER_PORT (no-auth mode)..."
deno run --allow-net --allow-read --allow-env --allow-run src/server/mod.ts
