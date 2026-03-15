# Agent Data Gateway

Automatic PII and secret detection for JSON payloads. Classifies fields by path, key name, and regex
pattern, then applies policy-driven transforms (mask, drop, hash, last4, etc.) before data leaves
your backend.

## Two ways to use it

### 1. Standalone service

Deploy as a container (Docker, Cloud Run, ECS) that sits between your backend and consumers. Send
JSON payloads to `/sanitize` and get scrubbed responses back.

```bash
git clone https://github.com/zackiles/agent-data-gateway.git && cd agent-data-gateway
./scripts/run-local.sh
```

```bash
curl -X POST http://localhost:8080/sanitize \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {"customer": {"email": "jane@example.com", "sin": "123-45-6789"}},
    "context": {"purpose": "ticket"}
  }'
```

The response masks `email` (`j***@example.com`) and drops `sin` entirely per the example policy.

### 2. Framework middleware (JSR package)

Import into your existing Deno or Node.js API and mount the gateway endpoints directly on your
server. No sidecar container needed.

```bash
deno add jsr:@agent-data-gateway/gateway   # Deno
npx jsr add @agent-data-gateway/gateway    # Node
```

```typescript
import { Gateway, noAuth } from '@agent-data-gateway/gateway';
import { adapter } from '@agent-data-gateway/gateway/hono'; // or /oak, /express, /fastify, /nextjs
import { Hono } from 'hono';

const gateway = new Gateway({
  index: JSON.parse(await Deno.readTextFile('index.json')),
  policy: JSON.parse(await Deno.readTextFile('policy.json')),
  auth: noAuth({ user: 'dev', groups: ['support'] }),
  gitleaks: true,
});

const app = new Hono();
app.route('/gateway', adapter(gateway));
export default app;
```

See [docs/jsr-package.md](docs/jsr-package.md) for all supported frameworks and full API reference.

## API endpoints

All three endpoints accept `POST` with `application/json` or `text/event-stream` (SSE).

| Endpoint       | Purpose                                                                             |
| -------------- | ----------------------------------------------------------------------------------- |
| `/sanitize`    | Scrub a payload per policy — returns cleaned JSON + optional `decisions` array      |
| `/classify`    | Classify every leaf node — returns `classifications` with class, source, confidence |
| `/index/build` | Build a classification index from sample payloads for bootstrapping                 |

### Seeding your index

The classification index tells the gateway which JSON paths and keys map to which data classes
(`pii.email`, `government.id`, etc.). You can author it by hand, or bootstrap it from real data:

```bash
curl -X POST http://localhost:8080/index/build \
  -H "Content-Type: application/json" \
  -d '{"samples": [
    {"payload": {"user": {"email": "a@b.com"}}},
    {"payload": {"user": {"email": "c@d.com"}}},
    {"payload": {"user": {"email": "e@f.com"}}}
  ]}'
```

This works identically whether you're calling a deployed service or hitting a framework-mounted
endpoint. Save the returned index JSON to a file and pass it to the gateway at startup. See
[data/example-index.json](data/example-index.json) for the expected format.

## Auth modes

| Mode               | Use case                                                       |
| ------------------ | -------------------------------------------------------------- |
| **no-auth**        | Local development; static user and groups                      |
| **trusted-header** | Reverse proxy (Nginx, Envoy, ALB, IAP) sets user/group headers |
| **oidc-jwt**       | Bearer JWT validation with JWKS; Okta, Auth0, Azure AD, etc.   |
| **api-key**        | Service-to-service; static key-to-identity mapping             |

When running as a standalone service, the auth mode is set via `SCRUBBER_ADAPTER` env var. When
using the library, pass an auth adapter to the `Gateway` constructor — `noAuth` and `trustedHeader`
are included, or implement the `Adapter` interface for custom auth. See
[docs/auth-modes.md](docs/auth-modes.md) for details.

## Deploy (standalone service)

| Platform       | Command / Config                                         |
| -------------- | -------------------------------------------------------- |
| Local          | `./scripts/run-local.sh`                                 |
| Docker         | `docker build -f deploy/docker/Dockerfile .`             |
| Docker Compose | `docker compose -f deploy/generic/docker-compose.yml up` |
| Cloud Run      | `deploy/cloud-run/service.yaml`                          |
| ECS            | `deploy/ecs/task-definition.json`                        |

See [docs/deployment.md](docs/deployment.md) for per-platform copy-paste commands.

## Supported frameworks (library)

| Framework                               | Version | Import                                |
| --------------------------------------- | ------- | ------------------------------------- |
| [Hono](https://hono.dev)                | 4.x     | `@agent-data-gateway/gateway/hono`    |
| [Oak](https://github.com/oakserver/oak) | 17.x    | `@agent-data-gateway/gateway/oak`     |
| [Express](https://expressjs.com)        | 5.x     | `@agent-data-gateway/gateway/express` |
| [Fastify](https://fastify.dev)          | 5.x     | `@agent-data-gateway/gateway/fastify` |
| [Next.js](https://nextjs.org)           | 15+     | `@agent-data-gateway/gateway/nextjs`  |

See [docs/jsr-package.md](docs/jsr-package.md) for complete usage and configuration reference.

## Advanced: LLM-assisted classification

The deterministic classifier handles most cases. For edge cases (unusual field names, ambiguous
values), enable the optional reasoning middleware. It shells out to Claude Code CLI or Cursor CLI to
classify unknowns, then merges results into the policy engine.

See [docs/reasoning-middleware.md](docs/reasoning-middleware.md) for setup and configuration.

## Agent skill (Claude Code / Cursor)

Install the Agent Data Gateway skill to let an AI agent handle setup, configuration, and deployment
for you. Works with Claude Code, Cursor, and any agent supporting the
[Agent Skills](https://agentskills.io/) standard.

```bash
curl -fsSL https://raw.githubusercontent.com/zackiles/agent-data-gateway/main/skill/scripts/install.sh | bash
```

Then ask your agent:

```
Use the agent-data-gateway skill to add PII sanitization to this project
```

Or do both in a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/zackiles/agent-data-gateway/main/skill/scripts/install.sh | bash && claude "Use the agent-data-gateway skill to add PII sanitization to this project using the best framework adapter for my stack, then verify it works"
```

Remove the skill:

```bash
curl -fsSL https://raw.githubusercontent.com/zackiles/agent-data-gateway/main/skill/scripts/uninstall.sh | bash
```

See [docs/skill.md](docs/skill.md) for all options, environment-aware prompts, and registry install
via `npx add-skill`.

## Configuration reference

All `SCRUBBER_*` environment variables are documented in
[docs/config-reference.md](docs/config-reference.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR process. To add a
new identity adapter, follow [docs/adapter-authoring.md](docs/adapter-authoring.md).
