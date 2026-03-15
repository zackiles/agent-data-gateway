# Agent Skill

Agent Data Gateway ships as an [Agent Skills](https://agentskills.io/) compatible skill that works
with **Claude Code**, **Cursor**, and any agent that supports the open SKILL.md standard. The skill
gives an AI agent the context it needs to install, configure, deploy, or contribute to this project
on your behalf.

## One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/zackiles/agent-data-gateway/main/skill/scripts/install.sh | bash
```

The installer auto-detects whether you have Claude Code, Cursor, or both installed and places the
skill in the correct directory. It also fetches the latest release version by default.

### Options

```
--target <claude|cursor|both>   Install for a specific CLI (default: auto-detect)
--global                        Install to ~/.claude/skills or ~/.cursor/skills instead of project-local
--version <tag>                 Pin to a specific release (e.g. v0.1.0)
--prompt                        Print a ready-to-paste setup prompt after install
--pipe                          Compile an environment-aware prompt and pipe it to the CLI
```

### Install via npx add-skill

If you prefer the `npx add-skill` registry approach:

```bash
npx add-skill zackiles/agent-data-gateway
```

This also supports selective install (`--skill agent-data-gateway`) and global scope (`-g`).

## One-Line Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/zackiles/agent-data-gateway/main/skill/scripts/uninstall.sh | bash
```

Or with the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/zackiles/agent-data-gateway/main/skill/scripts/install.sh | bash -s -- --uninstall
```

## What the Skill Does

Once installed, the skill provides an AI agent with:

- **Integration guides** — per-framework adapter code for Hono, Oak, Express, Fastify, Next.js, and
  standalone Deno
- **Deployment references** — Docker, Docker Compose, Cloud Run, and ECS steps
- **Configuration reference** — all `SCRUBBER_*` environment variables and auth adapter options
- **Developer onboarding** — source layout, documentation index, fork/PR workflow, and release process
- **Environment detection** — a script that detects installed runtimes, frameworks, Docker, and CLI
  tools so the agent can make informed decisions

## Example Prompts

### Simplest Install-and-Use (single command)

Install the skill and immediately ask the agent to configure the gateway in your current project:

**Claude Code:**

```bash
curl -fsSL https://raw.githubusercontent.com/zackiles/agent-data-gateway/main/skill/scripts/install.sh | bash && claude "Use the agent-data-gateway skill to add PII sanitization to this project using the best framework adapter for my stack, then verify it works"
```

**Cursor:**

```bash
curl -fsSL https://raw.githubusercontent.com/zackiles/agent-data-gateway/main/skill/scripts/install.sh | bash -s -- --target cursor && cursor "Use the agent-data-gateway skill to add PII sanitization to this project using the best framework adapter for my stack, then verify it works"
```

### Deploy as a Container (single command)

```bash
curl -fsSL https://raw.githubusercontent.com/zackiles/agent-data-gateway/main/skill/scripts/install.sh | bash && claude "Use the agent-data-gateway skill to scaffold and deploy the gateway as a Docker Compose service in this directory with the minimum required configuration"
```

### Scaffold from Source Locally

```bash
curl -fsSL https://raw.githubusercontent.com/zackiles/agent-data-gateway/main/skill/scripts/install.sh | bash && claude "Use the agent-data-gateway skill to clone the repo and run the gateway locally from source for evaluation"
```

### Environment-Aware Prompt (compiled from template)

The `--prompt` flag compiles a setup prompt with your detected environment (OS, shell, installed
runtimes, frameworks, Docker, git status) so the agent has full context:

```bash
curl -fsSL https://raw.githubusercontent.com/zackiles/agent-data-gateway/main/skill/scripts/install.sh | bash -s -- --prompt
```

This prints a ready-to-paste prompt. Use `--pipe` instead to send it directly to the CLI.

## Skill Structure

```
skill/
├── SKILL.md                      Main skill definition (Agent Skills spec)
├── references/
│   ├── integration.md            Per-framework adapter code
│   ├── deployment.md             Container deployment guides
│   ├── config.md                 All SCRUBBER_* environment variables
│   └── developer.md              Source layout, docs index, contribution guide
├── scripts/
│   ├── install.sh                Installer (one-line curl | bash)
│   ├── uninstall.sh              Uninstaller
│   └── detect-env.sh             Environment detection (JSON output)
└── assets/
    └── prompt-template.md        Meta-template compiled with environment data
```

## How the Release Process Works

When a new version is tagged and pushed (`./scripts/release.sh <version>`), GitHub Actions:

1. Bundles the skill directory into `agent-data-gateway-skill.tar.gz`
2. Attaches the tarball plus standalone `install-skill.sh` and `uninstall-skill.sh` to the GitHub
   Release
3. Users who install via `curl | bash` automatically get the latest release
4. Users who installed previously can re-run the installer to update to the new version
