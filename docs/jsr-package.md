# JSR Package — Framework Adapters

The Agent Data Gateway can be published to [JSR](https://jsr.io) as a package, allowing you to embed its API endpoints directly into your existing Deno or Node.js server instead of running a standalone container.

## Package Exports

| Import Path | Description |
|---|---|
| `@agent-data-gateway/gateway` | `Gateway` class, types, identity helpers |
| `@agent-data-gateway/gateway/hono` | Hono adapter (Deno / Node / Bun / Cloudflare) |
| `@agent-data-gateway/gateway/oak` | Oak adapter (Deno / Node / Bun) |
| `@agent-data-gateway/gateway/express` | Express v5 adapter (Node / Deno) |
| `@agent-data-gateway/gateway/fastify` | Fastify v5 adapter (Node / Deno) |

## Quick Start

### 1. Install

```bash
# Deno
deno add jsr:@agent-data-gateway/gateway

# Node (via npx)
npx jsr add @agent-data-gateway/gateway
```

### 2. Create a Gateway

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

### 3. Mount on Your Framework

#### Hono

```typescript
import { Hono } from "hono";
import { adapter } from "@agent-data-gateway/gateway/hono";

const app = new Hono();
app.route("/gateway", adapter(gateway));

export default app;
```

#### Oak

```typescript
import { Application } from "@oak/oak";
import { adapter } from "@agent-data-gateway/gateway/oak";

const router = adapter(gateway);
const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());
app.listen({ port: 8000 });
```

#### Express

```typescript
import express from "express";
import { adapter } from "@agent-data-gateway/gateway/express";

const app = express();
app.use(express.json());
app.use("/gateway", adapter(gateway));
app.listen(8000);
```

#### Fastify

```typescript
import Fastify from "fastify";
import { adapter } from "@agent-data-gateway/gateway/fastify";

const fastify = Fastify();
await fastify.register(adapter(gateway), { prefix: "/gateway" });
await fastify.listen({ port: 8000 });
```

## API Endpoints

Each adapter registers three `POST` routes:

| Route | Description |
|---|---|
| `/sanitize` | Sanitize a payload according to the policy |
| `/classify` | Classify nodes in a payload |
| `/index/build` | Build a classification index from sample payloads |

All endpoints accept `application/json` and `text/event-stream` (SSE) content types.

## Gateway Options

```typescript
interface GatewayOptions {
  index: Index | CompiledIndex; // Classification index (raw or pre-compiled)
  policy: Policy;               // Sanitization policy
  auth: Adapter;                // Identity extraction adapter
  reasoning?: ReasoningMiddleware; // Optional LLM-based classification
  gitleaks?: boolean;           // Enable gitleaks secret detection
}
```

### Identity Adapters

The package includes two built-in identity adapters:

**`noAuth`** — Returns a static identity (useful for development or trusted environments):

```typescript
import { noAuth } from "@agent-data-gateway/gateway";

const auth = noAuth({ user: "service-account", groups: ["admin"] });
```

**`trustedHeader`** — Extracts identity from request headers:

```typescript
import { trustedHeader } from "@agent-data-gateway/gateway";

const auth = trustedHeader({
  userHeader: "X-Forwarded-User",
  groupsHeader: "X-Forwarded-Groups",
  groupsSeparator: ",",
});
```

**Custom adapters** — Implement the `Adapter` interface:

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

If you load index data from a file, compile it once at startup:

```typescript
import { compileIndex } from "@agent-data-gateway/gateway";

const raw = JSON.parse(await Deno.readTextFile("index.json"));
const compiled = compileIndex(raw);

const gateway = new Gateway({ index: compiled, policy, auth });
```

### Gitleaks Secret Detection

Enable built-in secret detection patterns (AWS keys, GitHub tokens, private keys, etc.):

```typescript
const gateway = new Gateway({
  index,
  policy,
  auth,
  gitleaks: true,
});
```

## Standalone Usage

The `Gateway` class can be used directly with `Deno.serve` without any framework:

```typescript
const gateway = new Gateway({ index, policy, auth });
Deno.serve({ port: 8000 }, gateway.fetch);
```

Or call individual handlers:

```typescript
const request = new Request("http://localhost/sanitize", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ context: { purpose: "audit" }, payload: data }),
});

const response = await gateway.sanitize(request);
const result = await response.json();
```

## Publishing

```bash
deno publish
```

Update the `name` field in `deno.json` to your JSR scope before publishing:

```json
{
  "name": "@your-scope/gateway",
  "version": "0.1.0"
}
```

## Framework Versions

| Framework | Version | Runtime |
|---|---|---|
| [Hono](https://hono.dev) | 4.x | Deno, Node, Bun, Cloudflare Workers |
| [Oak](https://github.com/oakserver/oak) | 17.x | Deno, Node, Bun |
| [Express](https://expressjs.com) | 5.x | Node, Deno |
| [Fastify](https://fastify.dev) | 5.x | Node, Deno |
