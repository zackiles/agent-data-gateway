# JSR Package — Framework Adapters

The Agent Data Gateway can be imported as a library from [JSR](https://jsr.io), letting you embed
its API endpoints directly into an existing Deno or Node.js server instead of running a standalone
container. Every adapter provides the same three routes — `/sanitize`, `/classify`, and
`/index/build` — with full SSE and auth support.

## Package Exports

| Import Path | Description |
| --- | --- |
| `@agent-data-gateway/gateway` | `Gateway` class, types, identity helpers |
| `@agent-data-gateway/gateway/hono` | Hono adapter (Deno / Node / Bun / Cloudflare Workers) |
| `@agent-data-gateway/gateway/oak` | Oak adapter (Deno / Node / Bun) |
| `@agent-data-gateway/gateway/express` | Express v5 adapter (Node / Deno) |
| `@agent-data-gateway/gateway/fastify` | Fastify v5 adapter (Node / Deno) |
| `@agent-data-gateway/gateway/nextjs` | Next.js 15+ App Router adapter (Node) |

## Install

```bash
# Deno
deno add jsr:@agent-data-gateway/gateway

# Node (via npx)
npx jsr add @agent-data-gateway/gateway
```

## Create a Gateway

Every adapter starts from a `Gateway` instance. Provide an index (classification rules), a policy
(what action to take per data class), and an auth adapter (how to identify callers).

```typescript
import { Gateway, noAuth } from "@agent-data-gateway/gateway";

const gateway = new Gateway({
  index: {
    version: 1,
    path_classes: {
      "/user/email": { class: "pii.email", confidence: 0.99, count: 10 },
    },
    key_classes: {},
    detectors: [],
  },
  policy: {
    version: 1,
    default_rule: {
      default_action: "allow",
      unknown_action: "allow",
      class_actions: { "pii.email": "mask" },
      path_actions: {},
    },
    rules: [],
  },
  auth: noAuth({ user: "dev", groups: [] }),
});
```

> **Tip:** Load your index and policy from files at startup rather than inlining them.
> See [data/example-index.json](../data/example-index.json) and
> [data/example-policy.json](../data/example-policy.json) for the expected format.

## Mount on Your Framework

### Hono

```typescript
import { Hono } from "hono";
import { adapter } from "@agent-data-gateway/gateway/hono";

const app = new Hono();
app.route("/gateway", adapter(gateway));

export default app;
```

### Oak

```typescript
import { Application } from "@oak/oak";
import { adapter } from "@agent-data-gateway/gateway/oak";

const router = adapter(gateway);
const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());
app.listen({ port: 8000 });
```

### Express

Body parsing for JSON and SSE is handled internally by the adapter.

```typescript
import express from "express";
import { adapter } from "@agent-data-gateway/gateway/express";

const app = express();
app.use("/gateway", adapter(gateway));
app.listen(8000);
```

### Fastify

SSE content type parsing is handled automatically by the adapter.

```typescript
import Fastify from "fastify";
import { adapter } from "@agent-data-gateway/gateway/fastify";

const fastify = Fastify();
await fastify.register(adapter(gateway), { prefix: "/gateway" });
await fastify.listen({ port: 8000 });
```

### Next.js (App Router)

The Next.js adapter uses Web Standard Request/Response with zero framework dependency. There are
two approaches:

**Catch-all route** — a single `[...path]/route.ts` file handles all gateway endpoints:

```
app/api/gateway/[...path]/route.ts
```

```typescript
import { handlers } from "@agent-data-gateway/gateway/nextjs";
import { gateway } from "@/lib/gateway";

export const { POST } = handlers(gateway, "/api/gateway");
```

**Per-route files** — one route file per endpoint for more control:

```
app/api/sanitize/route.ts
app/api/classify/route.ts
app/api/index/build/route.ts
```

```typescript
// app/api/sanitize/route.ts
import { sanitize } from "@agent-data-gateway/gateway/nextjs";
import { gateway } from "@/lib/gateway";

export const { POST } = sanitize(gateway);
```

The `classify` and `build` exports follow the same pattern.

### Standalone (no framework)

The `Gateway` class can be used directly with `Deno.serve`:

```typescript
Deno.serve({ port: 8000 }, gateway.fetch);
```

## API Endpoints

Each adapter registers three `POST` routes:

| Route | Description |
| --- | --- |
| `/sanitize` | Sanitize a payload according to the policy |
| `/classify` | Classify nodes in a payload |
| `/index/build` | Build a classification index from sample payloads |

All endpoints accept `application/json` and `text/event-stream` (SSE) content types. These
endpoints behave identically whether accessed on a standalone service or through a framework
adapter.

### Seeding the classification index

The `/index/build` endpoint generates a classification index from sample payloads. This is useful
for bootstrapping — collect representative API responses from your system, POST them as samples, and
use the returned index as your starting point.

```bash
# Works the same whether the gateway is a standalone service or mounted on your framework
curl -X POST http://localhost:8000/gateway/index/build \
  -H "Content-Type: application/json" \
  -d '{"samples": [
    {"payload": {"user": {"email": "a@b.com"}}},
    {"payload": {"user": {"email": "c@d.com"}}},
    {"payload": {"user": {"email": "e@f.com"}}}
  ]}'
```

Or call it programmatically from within your application:

```typescript
const request = new Request("http://localhost/index/build", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ samples: yourSamplePayloads }),
});
const response = await gateway.build(request);
const { index } = await response.json();
```

## Gateway Options

```typescript
interface GatewayOptions {
  index: Index | CompiledIndex; // Classification index (raw or pre-compiled)
  policy: Policy;               // Sanitization policy rules
  auth: Adapter;                // Identity extraction adapter
  reasoning?: ReasoningMiddleware; // Optional LLM-based classification
  gitleaks?: boolean;           // Enable gitleaks secret detection patterns
}
```

### Identity Adapters

The package includes two built-in identity adapters:

**`noAuth`** — Returns a static identity. Use in development or trusted environments where auth is
handled upstream:

```typescript
import { noAuth } from "@agent-data-gateway/gateway";

const auth = noAuth({ user: "service-account", groups: ["admin"] });
```

**`trustedHeader`** — Extracts identity from request headers set by a reverse proxy:

```typescript
import { trustedHeader } from "@agent-data-gateway/gateway";

const auth = trustedHeader({
  userHeader: "X-Forwarded-User",
  groupsHeader: "X-Forwarded-Groups",
  groupsSeparator: ",",
});
```

**Custom adapters** — Implement the `Adapter` interface for any auth strategy:

```typescript
import type { Adapter } from "@agent-data-gateway/gateway";

const auth: Adapter = {
  extract(request: Request) {
    const token = request.headers.get("Authorization");
    // validate token, extract identity...
    return { user: "jane", groups: ["support"], attributes: {} };
  },
};
```

### Pre-compiled Index

Compile the index once at startup to avoid re-parsing on every request:

```typescript
import { compileIndex } from "@agent-data-gateway/gateway";

const raw = JSON.parse(await Deno.readTextFile("index.json"));
const compiled = compileIndex(raw);

const gateway = new Gateway({ index: compiled, policy, auth });
```

### Gitleaks Secret Detection

Enable built-in patterns for AWS keys, GitHub tokens, private keys, Stripe keys, and more:

```typescript
const gateway = new Gateway({ index, policy, auth, gitleaks: true });
```

## Publishing

Update the `name` field in `deno.json` to your JSR scope, then publish:

```bash
deno publish
```

## Framework Versions

| Framework | Version | Runtime |
| --- | --- | --- |
| [Hono](https://hono.dev) | 4.x | Deno, Node, Bun, Cloudflare Workers |
| [Oak](https://github.com/oakserver/oak) | 17.x | Deno, Node, Bun |
| [Express](https://expressjs.com) | 5.x | Node, Deno |
| [Fastify](https://fastify.dev) | 5.x | Node, Deno |
| [Next.js](https://nextjs.org) | 15+ | Node |
