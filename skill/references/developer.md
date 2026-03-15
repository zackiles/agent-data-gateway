# Developer Guide

## Repository Overview

Agent Data Gateway is a Deno 2.x TypeScript project that detects PII and secrets in JSON payloads and applies policy-driven transforms.

**Source:** https://github.com/zackiles/agent-data-gateway

## Key Documentation

| Document | Path | Purpose |
|---|---|---|
| README | `README.md` | Project overview, quick examples |
| Contributing | `CONTRIBUTING.md` | Dev setup, code style, PR process |
| Quickstart | `docs/quickstart.md` | Step-by-step local setup |
| JSR Package | `docs/jsr-package.md` | Library API, framework adapters |
| Deployment | `docs/deployment.md` | Container deployment guides |
| Auth Modes | `docs/auth-modes.md` | Identity adapter details |
| Config Reference | `docs/config-reference.md` | All SCRUBBER_* env vars |
| Adapter Authoring | `docs/adapter-authoring.md` | Writing custom identity adapters |
| Reasoning | `docs/reasoning-middleware.md` | LLM-assisted classification |
| Provider Catalog | `docs/provider-catalog.md` | Supported auth providers |

## Source Layout

```
src/
├── server/       Standalone HTTP server entry point
├── pkg/          Library exports (Gateway class, framework adapters)
├── core/         Classifier, policy engine, transforms, gitleaks patterns
├── adapters/     Identity adapters (no-auth, trusted-header, oidc-jwt, api-key)
├── identity/     Identity types and helpers
├── loaders/      Config and data file loaders
├── config/       Configuration parsing
└── reasoning/    LLM-assisted classification middleware
```

## Development Commands

```bash
deno task dev      # Run with --watch
deno task test     # Run all tests
deno task lint     # Lint
deno task fmt      # Format
deno task check    # Type-check
deno task build    # Compile binary
```

## Release Process

Releases are tag-driven. Run `./scripts/release.sh <version>` (e.g., `0.1.0`), which creates a git tag `v<version>` and pushes it. GitHub Actions then:

1. **publish.yml** — Builds and pushes Docker images to GHCR (base + reasoning)
2. **release.yml** — Creates a GitHub Release with changelog and attached artifacts (skill bundle, example data, env template)

## Forking and Contributing

To contribute back to the public repository:

```bash
# Fork the repo to your account
gh repo fork zackiles/agent-data-gateway --clone
cd agent-data-gateway

# Create a feature branch
git checkout -b feat/my-change

# Make changes, then test
deno task test
deno task lint

# Push and create a PR
git push -u origin feat/my-change
gh pr create --title "feat: my change" --body "Description of the change"
```

## Code Style

- No inline comments unless documenting a hidden bug, critical warning, TODO, or complex rationale
- Simple idiomatic names; no shorthand (`Messages` not `Msgs`)
- Inline single-caller methods when the logic is simple and not reused
- Strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
