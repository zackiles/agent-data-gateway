#!/usr/bin/env bash
set -euo pipefail

REPO="zackiles/agent-data-gateway"
SKILL_NAME="agent-data-gateway"
GITHUB_RAW="https://raw.githubusercontent.com/${REPO}"
GITHUB_API="https://api.github.com/repos/${REPO}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { printf "${CYAN}[info]${NC}  %s\n" "$*"; }
ok()    { printf "${GREEN}[ok]${NC}    %s\n" "$*"; }
warn()  { printf "${YELLOW}[warn]${NC}  %s\n" "$*"; }
error() { printf "${RED}[error]${NC} %s\n" "$*" >&2; }

usage() {
  cat <<EOF
Agent Data Gateway — Skill Installer

Usage: curl -fsSL https://raw.githubusercontent.com/${REPO}/main/skill/scripts/install.sh | bash
       curl -fsSL ... | bash -s -- [OPTIONS]

Options:
  --target <claude|cursor|both>   Install target (default: auto-detect)
  --global                        Install globally (~/.claude/skills or ~/.cursor/skills)
  --version <tag>                 Install a specific release version (default: latest)
  --prompt                        After install, print a ready-to-paste prompt for the CLI
  --pipe                          After install, compile and pipe a setup prompt to the detected CLI
  --uninstall                     Remove the skill instead of installing
  -h, --help                      Show this help
EOF
}

TARGET=""
GLOBAL=false
VERSION="latest"
DO_PROMPT=false
DO_PIPE=false
UNINSTALL=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --target)    TARGET="$2"; shift 2 ;;
    --global)    GLOBAL=true; shift ;;
    --version)   VERSION="$2"; shift 2 ;;
    --prompt)    DO_PROMPT=true; shift ;;
    --pipe)      DO_PIPE=true; shift ;;
    --uninstall) UNINSTALL=true; shift ;;
    -h|--help)   usage; exit 0 ;;
    *)           error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

detect_claude() { command -v claude >/dev/null 2>&1; }
detect_cursor() { command -v cursor >/dev/null 2>&1; }

detect_target() {
  if [[ -n "$TARGET" ]]; then return; fi
  local found=()
  if detect_claude; then found+=(claude); fi
  if detect_cursor; then found+=(cursor); fi
  if [[ ${#found[@]} -eq 0 ]]; then
    error "Neither 'claude' nor 'cursor' CLI found in PATH."
    error "Install Claude Code: https://docs.claude.com/en/docs/claude-code"
    error "Install Cursor: https://cursor.com"
    exit 1
  fi
  if [[ ${#found[@]} -eq 2 ]]; then
    TARGET="both"
  else
    TARGET="${found[0]}"
  fi
  info "Detected target: ${TARGET}"
}

resolve_version() {
  if [[ "$VERSION" == "latest" ]]; then
    info "Fetching latest release..."
    VERSION=$(curl -fsSL "${GITHUB_API}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"tag_name":\s*"([^"]+)".*/\1/')
    if [[ -z "$VERSION" ]]; then
      warn "Could not fetch latest release tag. Falling back to main branch."
      VERSION="main"
    else
      ok "Latest release: ${VERSION}"
    fi
  fi
}

skill_dir_for() {
  local cli="$1"
  if $GLOBAL; then
    echo "${HOME}/.${cli}/skills/${SKILL_NAME}"
  else
    echo ".${cli}/skills/${SKILL_NAME}"
  fi
}

download_skill() {
  local dest="$1"
  local ref="$VERSION"
  [[ "$ref" == "main" ]] || ref="${ref}"

  info "Downloading skill to ${dest}..."
  mkdir -p "${dest}/references" "${dest}/scripts" "${dest}/assets"

  local base
  if [[ "$ref" == "main" ]]; then
    base="${GITHUB_RAW}/main/skill"
  else
    base="${GITHUB_RAW}/${ref}/skill"
  fi

  curl -fsSL "${base}/SKILL.md" -o "${dest}/SKILL.md"
  for f in integration.md deployment.md config.md developer.md; do
    curl -fsSL "${base}/references/${f}" -o "${dest}/references/${f}" 2>/dev/null || true
  done
  curl -fsSL "${base}/assets/prompt-template.md" -o "${dest}/assets/prompt-template.md" 2>/dev/null || true
  curl -fsSL "${base}/scripts/detect-env.sh" -o "${dest}/scripts/detect-env.sh" 2>/dev/null || true
  chmod +x "${dest}/scripts/"*.sh 2>/dev/null || true
}

install_for() {
  local cli="$1"
  local dest
  dest=$(skill_dir_for "$cli")

  if [[ -d "$dest" ]]; then
    info "Existing skill found at ${dest}. Updating..."
    rm -rf "$dest"
  fi

  download_skill "$dest"
  ok "Skill installed for ${cli} at ${dest}"
}

uninstall_for() {
  local cli="$1"
  local dest
  dest=$(skill_dir_for "$cli")

  if [[ -d "$dest" ]]; then
    rm -rf "$dest"
    ok "Skill removed from ${dest}"
  else
    warn "No skill found at ${dest}"
  fi
}

detect_env() {
  local os_name shell_name cwd deno_installed="" deno_version="" node_installed="" node_version=""
  local docker_installed="" docker_version="" claude_installed="" cursor_installed=""
  local has_package_json="" has_deno_json="" detected_framework="" is_git_repo=""

  os_name="$(uname -s) $(uname -m)"
  shell_name="${SHELL:-unknown}"
  cwd="$(pwd)"

  if command -v deno >/dev/null 2>&1; then
    deno_installed="yes"
    deno_version="$(deno --version 2>/dev/null | head -1 || echo 'unknown')"
  else
    deno_installed="no"
  fi

  if command -v node >/dev/null 2>&1; then
    node_installed="yes"
    node_version="$(node --version 2>/dev/null || echo 'unknown')"
  else
    node_installed="no"
  fi

  if command -v docker >/dev/null 2>&1; then
    docker_installed="yes"
    docker_version="$(docker --version 2>/dev/null | head -1 || echo 'unknown')"
  else
    docker_installed="no"
  fi

  detect_claude && claude_installed="yes" || claude_installed="no"
  detect_cursor && cursor_installed="yes" || cursor_installed="no"

  [[ -f "package.json" ]] && has_package_json="yes" || has_package_json="no"
  [[ -f "deno.json" || -f "deno.jsonc" ]] && has_deno_json="yes" || has_deno_json="no"

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

  git rev-parse --is-inside-work-tree >/dev/null 2>&1 && is_git_repo="yes" || is_git_repo="no"

  printf "OS=%s\nSHELL=%s\nCWD=%s\nDENO_INSTALLED=%s\nDENO_VERSION=%s\nNODE_INSTALLED=%s\nNODE_VERSION=%s\nDOCKER_INSTALLED=%s\nDOCKER_VERSION=%s\nCLAUDE_INSTALLED=%s\nCURSOR_INSTALLED=%s\nHAS_PACKAGE_JSON=%s\nHAS_DENO_JSON=%s\nDETECTED_FRAMEWORK=%s\nIS_GIT_REPO=%s\n" \
    "$os_name" "$shell_name" "$cwd" "$deno_installed" "$deno_version" "$node_installed" "$node_version" \
    "$docker_installed" "$docker_version" "$claude_installed" "$cursor_installed" \
    "$has_package_json" "$has_deno_json" "$detected_framework" "$is_git_repo"
}

compile_prompt() {
  local template="$1"
  local env_data
  env_data=$(detect_env)

  local result="$template"
  while IFS='=' read -r key value; do
    result="${result//\{\{${key}\}\}/${value}}"
  done <<< "$env_data"

  echo "$result"
}

build_prompt() {
  local skill_dir="$1"
  local template_file="${skill_dir}/assets/prompt-template.md"

  if [[ ! -f "$template_file" ]]; then
    error "Prompt template not found at ${template_file}"
    exit 1
  fi

  local template
  template=$(<"$template_file")
  compile_prompt "$template"
}

print_prompt() {
  local cli="$1"
  local dest
  dest=$(skill_dir_for "$cli")
  echo ""
  echo "────────────────────────────────────────────"
  echo "Copy and paste this into ${cli}:"
  echo "────────────────────────────────────────────"
  echo ""
  build_prompt "$dest"
  echo ""
  echo "────────────────────────────────────────────"
}

pipe_to_cli() {
  local cli="$1"
  local dest
  dest=$(skill_dir_for "$cli")
  local prompt
  prompt=$(build_prompt "$dest")

  info "Piping setup prompt to ${cli}..."
  echo "$prompt" | "$cli" --prompt -
}

main() {
  echo ""
  echo "  ╔══════════════════════════════════════════════╗"
  echo "  ║       Agent Data Gateway — Skill Setup       ║"
  echo "  ╚══════════════════════════════════════════════╝"
  echo ""

  detect_target

  if $UNINSTALL; then
    case "$TARGET" in
      claude) uninstall_for claude ;;
      cursor) uninstall_for cursor ;;
      both)   uninstall_for claude; uninstall_for cursor ;;
    esac
    ok "Done."
    exit 0
  fi

  resolve_version

  case "$TARGET" in
    claude) install_for claude ;;
    cursor) install_for cursor ;;
    both)   install_for claude; install_for cursor ;;
  esac

  echo ""
  ok "Installation complete!"
  echo ""
  info "The skill is now available. Start a conversation and ask about:"
  info "  - Installing the gateway as middleware in your project"
  info "  - Deploying the gateway as a standalone container"
  info "  - Contributing to the project"
  echo ""

  if $DO_PROMPT; then
    case "$TARGET" in
      claude) print_prompt claude ;;
      cursor) print_prompt cursor ;;
      both)   print_prompt claude ;;
    esac
  fi

  if $DO_PIPE; then
    local pipe_target="$TARGET"
    [[ "$pipe_target" == "both" ]] && pipe_target="claude"
    pipe_to_cli "$pipe_target"
  fi

  if ! $DO_PROMPT && ! $DO_PIPE; then
    echo "  Quick start examples:"
    echo ""
    echo "    # Install gateway as middleware in current project:"
    echo "    claude \"Use the agent-data-gateway skill to add PII sanitization middleware to this project\""
    echo ""
    echo "    # Deploy as a standalone container:"
    echo "    claude \"Use the agent-data-gateway skill to deploy the gateway with Docker Compose\""
    echo ""
    echo "    # Get a compiled prompt with environment detection:"
    echo "    curl -fsSL https://raw.githubusercontent.com/${REPO}/main/skill/scripts/install.sh | bash -s -- --prompt"
    echo ""
  fi
}

main
