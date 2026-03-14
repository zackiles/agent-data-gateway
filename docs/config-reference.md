# Configuration Reference

All `SCRUBBER_*` environment variables. Env vars override values from `SCRUBBER_CONFIG` (JSON/YAML).

## Core

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SCRUBBER_ADAPTER` | string | - | yes | `no-auth`, `trusted-header`, `oidc-jwt`, or `api-key` |
| `SCRUBBER_INDEX` | string | - | yes | Path to classification index JSON |
| `SCRUBBER_POLICY` | string | - | yes | Path to policy JSON |
| `SCRUBBER_PORT` | number | 8080 | no | HTTP listen port |
| `SCRUBBER_CONFIG` | string | - | no | Path to optional config file (JSON or YAML) |

## Trusted-header adapter

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SCRUBBER_HEADER_USER` | string | `X-Forwarded-User` | no | Header for user ID |
| `SCRUBBER_HEADER_GROUPS` | string | `X-Forwarded-Groups` | no | Header for groups |
| `SCRUBBER_HEADER_GROUPS_SEPARATOR` | string | `,` | no | Groups delimiter |

## OIDC/JWT adapter

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SCRUBBER_JWT_ISSUER` | string | - | yes | JWT issuer |
| `SCRUBBER_JWT_AUDIENCE` | string | - | yes | Expected audience |
| `SCRUBBER_JWT_JWKS_URL` | string | - | yes | JWKS URL for verification |
| `SCRUBBER_JWT_USER_CLAIM` | string | `sub` | no | Claim for user ID |
| `SCRUBBER_JWT_GROUPS_CLAIM` | string | `groups` | no | Claim for groups |

## API-key adapter

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SCRUBBER_APIKEY_HEADER` | string | `X-API-Key` | no | Header for API key |
| `SCRUBBER_APIKEY_MAP_FILE` | string | - | yes | Path to key-to-identity JSON |

## No-auth adapter

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SCRUBBER_NOAUTH_USER` | string | `local-dev` | no | Static user ID |
| `SCRUBBER_NOAUTH_GROUPS` | string | (empty) | no | Comma-separated groups |

## Reasoning middleware

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SCRUBBER_REASONING_ENABLED` | boolean | false | no | Enable LLM-assisted classification |
| `SCRUBBER_REASONING_CLI` | string | `claude` | no | `claude` or `cursor` |
| `SCRUBBER_REASONING_MODEL` | string | (CLI default) | no | Model for CLI (e.g. `sonnet`, `opus`) |
| `SCRUBBER_REASONING_TIMEOUT` | number | 30000 | no | CLI timeout in ms |
| `SCRUBBER_REASONING_MIN_CONFIDENCE` | number | 0.5 | no | Min confidence to accept (0.0–1.0) |
| `SCRUBBER_REASONING_MAX_SAMPLES` | number | 50 | no | Max samples per invocation |
| `SCRUBBER_REASONING_COOLDOWN` | number | 60000 | no | Cooldown in ms after rate-limit |
| `SCRUBBER_REASONING_CLI_VERSION` | string | latest | no | CLI version for container build |
| `SCRUBBER_REASONING_PROMPT_FILE` | string | `src/core/system-prompt-agent-classifier.md` | no | Path to system prompt |

CLI credentials (set per chosen CLI):

- `ANTHROPIC_API_KEY` — required when `SCRUBBER_REASONING_CLI=claude`
- `CURSOR_API_KEY` — required when `SCRUBBER_REASONING_CLI=cursor`
