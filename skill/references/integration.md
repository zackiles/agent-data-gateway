# Integration Reference

## Install

```bash
# Deno
deno add jsr:@agent-data-gateway/gateway

# Node
npx jsr add @agent-data-gateway/gateway
```

## Per-Framework Adapter Code

### Hono (Deno / Node / Bun / Cloudflare Workers)

```typescript
import { Gateway, noAuth } from "@agent-data-gateway/gateway";
import { adapter } from "@agent-data-gateway/gateway/hono";
import { Hono } from "hono";

const gateway = new Gateway({
  index: JSON.parse(await Deno.readTextFile("index.json")),
  policy: JSON.parse(await Deno.readTextFile("policy.json")),
  auth: noAuth({ user: "dev", groups: [] }),
});

const app = new Hono();
app.route("/gateway", adapter(gateway));
export default app;
```

### Oak (Deno / Node / Bun)

```typescript
import { Gateway, noAuth } from "@agent-data-gateway/gateway";
import { adapter } from "@agent-data-gateway/gateway/oak";
import { Application } from "@oak/oak";

const gateway = new Gateway({
  index: JSON.parse(await Deno.readTextFile("index.json")),
  policy: JSON.parse(await Deno.readTextFile("policy.json")),
  auth: noAuth({ user: "dev", groups: [] }),
});

const router = adapter(gateway);
const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());
app.listen({ port: 8000 });
```

### Express 5 (Node / Deno)

```typescript
import express from "express";
import { Gateway, noAuth } from "@agent-data-gateway/gateway";
import { adapter } from "@agent-data-gateway/gateway/express";

const gateway = new Gateway({
  index: JSON.parse(await readFile("index.json", "utf-8")),
  policy: JSON.parse(await readFile("policy.json", "utf-8")),
  auth: noAuth({ user: "dev", groups: [] }),
});

const app = express();
app.use("/gateway", adapter(gateway));
app.listen(8000);
```

### Fastify 5 (Node / Deno)

```typescript
import Fastify from "fastify";
import { Gateway, noAuth } from "@agent-data-gateway/gateway";
import { adapter } from "@agent-data-gateway/gateway/fastify";

const gateway = new Gateway({
  index: JSON.parse(await readFile("index.json", "utf-8")),
  policy: JSON.parse(await readFile("policy.json", "utf-8")),
  auth: noAuth({ user: "dev", groups: [] }),
});

const fastify = Fastify();
await fastify.register(adapter(gateway), { prefix: "/gateway" });
await fastify.listen({ port: 8000 });
```

### Next.js 15+ (App Router)

Catch-all route at `app/api/gateway/[...path]/route.ts`:

```typescript
import { handlers } from "@agent-data-gateway/gateway/nextjs";
import { gateway } from "@/lib/gateway";

export const { POST } = handlers(gateway, "/api/gateway");
```

Or per-route files:

```typescript
// app/api/sanitize/route.ts
import { sanitize } from "@agent-data-gateway/gateway/nextjs";
import { gateway } from "@/lib/gateway";
export const { POST } = sanitize(gateway);
```

### Standalone Deno.serve (no framework)

```typescript
import { Gateway, noAuth } from "@agent-data-gateway/gateway";

const gateway = new Gateway({
  index: JSON.parse(await Deno.readTextFile("index.json")),
  policy: JSON.parse(await Deno.readTextFile("policy.json")),
  auth: noAuth({ user: "dev", groups: [] }),
});

Deno.serve({ port: 8000 }, gateway.fetch);
```

## Auth Adapters

### noAuth (development only)

```typescript
import { noAuth } from "@agent-data-gateway/gateway";
const auth = noAuth({ user: "local-dev", groups: ["support", "admin"] });
```

### trustedHeader (behind reverse proxy)

```typescript
import { trustedHeader } from "@agent-data-gateway/gateway";
const auth = trustedHeader({
  userHeader: "X-Forwarded-User",
  groupsHeader: "X-Forwarded-Groups",
  groupsSeparator: ",",
});
```

### Custom adapter

```typescript
import type { Adapter } from "@agent-data-gateway/gateway";
const auth: Adapter = {
  extract(request: Request) {
    const token = request.headers.get("Authorization");
    return { user: "jane", groups: ["support"], attributes: {} };
  },
};
```

## Starter Data Files

Create minimal `index.json`:

```json
{
  "version": 1,
  "path_classes": {
    "/user/email": { "class": "pii.email", "confidence": 0.99, "count": 10 }
  },
  "key_classes": {},
  "detectors": []
}
```

Create minimal `policy.json`:

```json
{
  "version": 1,
  "default_rule": {
    "default_action": "allow",
    "unknown_action": "allow",
    "class_actions": { "pii.email": "mask" },
    "path_actions": {}
  },
  "rules": []
}
```

## Verification

```bash
curl -X POST http://localhost:8000/gateway/sanitize \
  -H "Content-Type: application/json" \
  -d '{"payload":{"user":{"email":"test@example.com"}},"context":{"purpose":"test"}}'
```
