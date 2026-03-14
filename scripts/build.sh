#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Building agent-data-gateway..."
deno compile --allow-net --allow-read --allow-env --allow-run --allow-write --output agent-data-gateway src/server/mod.ts
echo "Build complete: ./agent-data-gateway"
