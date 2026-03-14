# Agent Data Gateway

A service that automatically finds and removes sensitive data from JSON responses before they reach
your users.

## Why use it?

- Catches PII and secrets automatically via path, key, and pattern-based classification
- Works with any auth provider through pluggable adapters (no-auth, trusted-header, OIDC/JWT, API
  key)
- Deploys as a single container with no external runtime dependencies

## Quickstart

```bash
git clone https://github.com/zackiles/agent-data-gateway.git
cd agent-data-gateway
./scripts/run-local.sh
```

In another terminal:

```bash
curl -X POST http://localhost:8080/sanitize \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {"customer": {"email": "jane@example.com", "sin": "123-45-6789"}},
    "context": {"purpose": "ticket"}
  }'
```

The response shows `email` masked (e.g. `j***@example.com`) and `sin` dropped entirely, per the
example policy.

## Choose your auth

| Mode               | Use case                                                       |
| ------------------ | -------------------------------------------------------------- |
| **no-auth**        | Local development; static user and groups                      |
| **trusted-header** | Reverse proxy (Nginx, Envoy, ALB, IAP) sets user/group headers |
| **oidc-jwt**       | Bearer JWT validation with JWKS; Okta, Auth0, Azure AD, etc.   |
| **api-key**        | Service-to-service; static key-to-identity mapping             |

See [docs/auth-modes.md](docs/auth-modes.md) for config keys and when to use each.

## Deploy

- Docker: `docker build -f deploy/docker/Dockerfile . && docker run -p 8080:8080 ...`
- Docker Compose: `docker compose -f deploy/generic/docker-compose.yml up`
- Cloud Run: `deploy/cloud-run/service.yaml`
- ECS: `deploy/ecs/task-definition.json`

See [docs/deployment.md](docs/deployment.md) for copy-paste commands per platform.

## Advanced: LLM-assisted classification

The deterministic classifier handles most cases. For edge cases (unusual field names, ambiguous
values), enable the optional reasoning middleware. It shells out to Claude Code CLI or Cursor CLI to
classify unknowns, then merges results into the policy engine.

See [docs/reasoning-middleware.md](docs/reasoning-middleware.md) for setup, config, and
troubleshooting.

## Configuration reference

All `SCRUBBER_*` environment variables are documented in
[docs/config-reference.md](docs/config-reference.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR process. To add a
new identity adapter, follow [docs/adapter-authoring.md](docs/adapter-authoring.md).
