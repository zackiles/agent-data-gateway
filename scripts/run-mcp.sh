#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export SCRUBBER_ADAPTER=no-auth
export SCRUBBER_INDEX=./data/example-index.json
export SCRUBBER_POLICY=./data/example-policy.json
export SCRUBBER_PORT=${SCRUBBER_PORT:-8080}
export SCRUBBER_NOAUTH_USER=local-dev
export SCRUBBER_NOAUTH_GROUPS=support,admin

export MCP_TRANSPORT=${MCP_TRANSPORT:-stdio}
export MCP_PORT=${MCP_PORT:-$SCRUBBER_PORT}

echo "Starting Agent Data Gateway MCP (${MCP_TRANSPORT} transport)..." >&2
deno run --allow-net --allow-read --allow-env --allow-run src/mcp/mod.ts
