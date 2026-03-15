---
name: agent-data-gateway
description: >
  Install, configure, and deploy Agent Data Gateway — a PII and secret detection
  middleware for JSON payloads. Use this skill when a user asks to add data
  sanitization, PII masking, secret detection, or policy-driven transforms to
  their project, or when deploying the gateway as a standalone container service.
  Covers JSR library integration, Docker/Cloud Run/ECS deployment, environment
  configuration, and developer onboarding for contributors to the public repo.
license: MIT
version: "1.0.0"
compatibility:
  system:
    - curl
    - git
  network: true
metadata:
  repository: https://github.com/zackiles/agent-data-gateway
  registry: https://jsr.io/@agent-data-gateway/gateway
  container: ghcr.io/zackiles/agent-data-gateway
---

# Agent Data Gateway

You are an agent helping a user install, configure, deploy, or contribute to **Agent Data Gateway** — automatic PII and secret detection for JSON payloads. The gateway classifies fields by path, key name, and regex, then applies policy-driven transforms (mask, drop, hash, last4, etc.) before data leaves the backend.

## Decision Tree

Determine the user's intent and follow the appropriate path:

### Path A — Install the JSR library as middleware

The user wants to add the gateway to an **existing** project as a dependency.

1. Detect the project's runtime (Deno or Node) and framework (Hono, Oak, Express, Fastify, Next.js, or standalone Deno.serve)
2. Install the package:
   - **Deno:** `deno add jsr:@agent-data-gateway/gateway`
   - **Node:** `npx jsr add @agent-data-gateway/gateway`
3. Create or locate the user's server entry point
4. Add the adapter mount — see `references/integration.md` for per-framework code
5. Create starter `index.json` and `policy.json` files from the examples (or run `/index/build` with the user's sample data)
6. Set up the auth adapter appropriate for the environment:
   - Local dev → `noAuth`
   - Behind reverse proxy → `trustedHeader`
   - Production → `oidc-jwt` or `api-key` (requires additional config)
7. Verify with a test curl to `/sanitize`

### Path B — Deploy as a standalone container service

The user wants to run the gateway as a separate service.

1. Ask which platform: **Docker**, **Docker Compose**, **Cloud Run**, or **ECS**
2. Clone the repository if needed: `git clone https://github.com/zackiles/agent-data-gateway.git`
3. Copy and configure `.env` from `configs/.env.template` — mandatory settings:
   - `SCRUBBER_ADAPTER` — auth mode (`no-auth`, `trusted-header`, `oidc-jwt`, `api-key`)
   - `SCRUBBER_INDEX` — path to classification index JSON
   - `SCRUBBER_POLICY` — path to policy JSON
4. Follow platform-specific steps in `references/deployment.md`
5. Verify the service is running with a health check or test sanitize call

### Path C — Scaffold from source locally

The user wants to pull the source and run it locally for development or evaluation.

1. `git clone https://github.com/zackiles/agent-data-gateway.git && cd agent-data-gateway`
2. Ensure Deno 2.x is installed
3. Run `./scripts/run-local.sh` (starts on port 8080 with example data and no-auth)
4. Walk the user through a test request to `/sanitize`
5. Explain how to customize `data/example-index.json` and `data/example-policy.json`

### Path D — Contributor / developer onboarding

The user wants to contribute to the project or understand its internals.

1. Point them to key documentation:
   - `CONTRIBUTING.md` — development setup, code style, PR process
   - `docs/adapter-authoring.md` — how to add new identity adapters
   - `docs/config-reference.md` — all `SCRUBBER_*` environment variables
   - `docs/reasoning-middleware.md` — LLM-assisted classification
   - `docs/jsr-package.md` — library API and framework adapters
   - `docs/deployment.md` — per-platform deployment guides
2. For collaboration via pull request:
   - Fork: `gh repo fork zackiles/agent-data-gateway --clone`
   - Branch: `git checkout -b feat/my-change`
   - Test: `deno task test && deno task lint`
   - Push and open PR against `main`
3. Summarize the release process: tag-driven via `./scripts/release.sh <version>`, which triggers GitHub Actions to build Docker images (GHCR) and create a GitHub Release

## Mandatory Configuration

These environment variables (or constructor options) must always be set:

| Variable | Description |
|---|---|
| `SCRUBBER_ADAPTER` | Auth mode: `no-auth`, `trusted-header`, `oidc-jwt`, `api-key` |
| `SCRUBBER_INDEX` | Path to classification index JSON file |
| `SCRUBBER_POLICY` | Path to policy JSON file |

For a minimal local setup, use `no-auth` with the included example files:

```
SCRUBBER_ADAPTER=no-auth
SCRUBBER_INDEX=./data/example-index.json
SCRUBBER_POLICY=./data/example-policy.json
SCRUBBER_NOAUTH_USER=local-dev
SCRUBBER_NOAUTH_GROUPS=support,admin
```

See `references/config.md` for all available variables per adapter.

## Important Constraints

- The JSR package name is `@agent-data-gateway/gateway`
- Container images are at `ghcr.io/zackiles/agent-data-gateway` (base) and `ghcr.io/zackiles/agent-data-gateway-reasoning` (with LLM CLI)
- The gateway requires a classification index and policy file — it will not start without them
- When deploying to production, never use `no-auth`; use `oidc-jwt` or `api-key`
- The reasoning middleware is optional and requires a separate API key (`ANTHROPIC_API_KEY` or `CURSOR_API_KEY`)
