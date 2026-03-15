# Configuration Reference

## Core (required)

| Variable | Type | Default | Description |
|---|---|---|---|
| `SCRUBBER_ADAPTER` | string | — | `no-auth`, `trusted-header`, `oidc-jwt`, or `api-key` |
| `SCRUBBER_INDEX` | string | — | Path to classification index JSON |
| `SCRUBBER_POLICY` | string | — | Path to policy JSON |
| `SCRUBBER_PORT` | number | 8080 | HTTP listen port |
| `SCRUBBER_CONFIG` | string | — | Optional path to config file (JSON/YAML) |

## no-auth adapter

| Variable | Type | Default | Description |
|---|---|---|---|
| `SCRUBBER_NOAUTH_USER` | string | `local-dev` | Static user ID |
| `SCRUBBER_NOAUTH_GROUPS` | string | (empty) | Comma-separated groups |

## trusted-header adapter

| Variable | Type | Default | Description |
|---|---|---|---|
| `SCRUBBER_HEADER_USER` | string | `X-Forwarded-User` | Header containing user ID |
| `SCRUBBER_HEADER_GROUPS` | string | `X-Forwarded-Groups` | Header containing groups |
| `SCRUBBER_HEADER_GROUPS_SEPARATOR` | string | `,` | Groups delimiter |

## oidc-jwt adapter

| Variable | Type | Default | Description |
|---|---|---|---|
| `SCRUBBER_JWT_ISSUER` | string | — | JWT issuer (required) |
| `SCRUBBER_JWT_AUDIENCE` | string | — | Expected audience (required) |
| `SCRUBBER_JWT_JWKS_URL` | string | — | JWKS URL for verification (required) |
| `SCRUBBER_JWT_USER_CLAIM` | string | `sub` | Claim for user ID |
| `SCRUBBER_JWT_GROUPS_CLAIM` | string | `groups` | Claim for groups |

## api-key adapter

| Variable | Type | Default | Description |
|---|---|---|---|
| `SCRUBBER_APIKEY_HEADER` | string | `X-API-Key` | Header containing the API key |
| `SCRUBBER_APIKEY_MAP_FILE` | string | — | Path to key-to-identity JSON (required) |

## Reasoning middleware (optional)

| Variable | Type | Default | Description |
|---|---|---|---|
| `SCRUBBER_REASONING_ENABLED` | boolean | false | Enable LLM-assisted classification |
| `SCRUBBER_REASONING_CLI` | string | `claude` | `claude` or `cursor` |
| `SCRUBBER_REASONING_MODEL` | string | (CLI default) | Model override |
| `SCRUBBER_REASONING_TIMEOUT` | number | 30000 | CLI timeout in ms |
| `SCRUBBER_REASONING_MIN_CONFIDENCE` | number | 0.5 | Min confidence threshold |
| `SCRUBBER_REASONING_MAX_SAMPLES` | number | 50 | Max samples per invocation |
| `SCRUBBER_REASONING_COOLDOWN` | number | 60000 | Rate-limit cooldown in ms |

CLI credentials:
- `ANTHROPIC_API_KEY` — when using `claude`
- `CURSOR_API_KEY` — when using `cursor`
