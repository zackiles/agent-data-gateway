#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="agent-data-gateway"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { printf "${CYAN}[info]${NC}  %s\n" "$*"; }
ok()    { printf "${GREEN}[ok]${NC}    %s\n" "$*"; }

echo ""
echo "  Removing agent-data-gateway skill..."
echo ""

removed=0

for cli in claude cursor; do
  for base in "${HOME}/.${cli}/skills" ".${cli}/skills"; do
    dir="${base}/${SKILL_NAME}"
    if [[ -d "$dir" ]]; then
      rm -rf "$dir"
      ok "Removed ${dir}"
      removed=$((removed + 1))
    fi
  done
done

if [[ $removed -eq 0 ]]; then
  info "No skill installations found."
else
  ok "Removed ${removed} installation(s)."
fi
