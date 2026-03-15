#!/usr/bin/env bash
set -euo pipefail

os_name="$(uname -s) $(uname -m)"
shell_name="${SHELL:-unknown}"
cwd="$(pwd)"

deno_installed="no"; deno_version=""
if command -v deno >/dev/null 2>&1; then
  deno_installed="yes"
  deno_version="$(deno --version 2>/dev/null | head -1 || echo 'unknown')"
fi

node_installed="no"; node_version=""
if command -v node >/dev/null 2>&1; then
  node_installed="yes"
  node_version="$(node --version 2>/dev/null || echo 'unknown')"
fi

docker_installed="no"; docker_version=""
if command -v docker >/dev/null 2>&1; then
  docker_installed="yes"
  docker_version="$(docker --version 2>/dev/null | head -1 || echo 'unknown')"
fi

claude_installed="no"
command -v claude >/dev/null 2>&1 && claude_installed="yes"

cursor_installed="no"
command -v cursor >/dev/null 2>&1 && cursor_installed="yes"

has_package_json="no"
[[ -f "package.json" ]] && has_package_json="yes"

has_deno_json="no"
[[ -f "deno.json" || -f "deno.jsonc" ]] && has_deno_json="yes"

detected_framework="none"
if [[ -f "package.json" ]]; then
  if grep -q '"hono"' package.json 2>/dev/null; then detected_framework="hono";
  elif grep -q '"express"' package.json 2>/dev/null; then detected_framework="express";
  elif grep -q '"fastify"' package.json 2>/dev/null; then detected_framework="fastify";
  elif grep -q '"next"' package.json 2>/dev/null; then detected_framework="nextjs";
  fi
fi
if [[ -f "deno.json" ]]; then
  if grep -q '"hono"' deno.json 2>/dev/null; then detected_framework="hono";
  elif grep -q '"@oak/oak"' deno.json 2>/dev/null; then detected_framework="oak";
  fi
fi

is_git_repo="no"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && is_git_repo="yes"

to_bool() { [[ "$1" == "yes" ]] && echo "true" || echo "false"; }

cat <<EOF
{
  "os": "${os_name}",
  "shell": "${shell_name}",
  "cwd": "${cwd}",
  "deno": { "installed": $(to_bool "$deno_installed"), "version": "${deno_version}" },
  "node": { "installed": $(to_bool "$node_installed"), "version": "${node_version}" },
  "docker": { "installed": $(to_bool "$docker_installed"), "version": "${docker_version}" },
  "claude_cli": $(to_bool "$claude_installed"),
  "cursor_cli": $(to_bool "$cursor_installed"),
  "project": {
    "package_json": $(to_bool "$has_package_json"),
    "deno_json": $(to_bool "$has_deno_json"),
    "framework": "${detected_framework}",
    "git_repo": $(to_bool "$is_git_repo")
  }
}
EOF
