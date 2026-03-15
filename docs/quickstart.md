# Quickstart

Step-by-step guide to get the gateway running locally. Choose either approach — the API is
identical.

## Prerequisites

- [Deno 2.x](https://deno.land/)

## Option A: Run as a standalone service

```bash
git clone https://github.com/zackiles/agent-data-gateway.git
cd agent-data-gateway
./scripts/run-local.sh
```

The service starts on port 8080 with the no-auth adapter, example index, and example policy. The
`SCRUBBER_*` environment variables in `scripts/run-local.sh` control the configuration.

## Option B: Mount as framework middleware

```bash
deno add jsr:@agent-data-gateway/gateway
```

```typescript
import { Gateway, noAuth } from "@agent-data-gateway/gateway";
import { Hono } from "hono";
import { adapter } from "@agent-data-gateway/gateway/hono";

const gateway = new Gateway({
  index: JSON.parse(await Deno.readTextFile("data/example-index.json")),
  policy: JSON.parse(await Deno.readTextFile("data/example-policy.json")),
  auth: noAuth({ user: "local-dev", groups: ["support", "admin"] }),
});

const app = new Hono();
app.route("/", adapter(gateway));
Deno.serve({ port: 8080 }, app.fetch);
```

See [jsr-package.md](jsr-package.md) for other frameworks (Oak, Express, Fastify, Next.js).

## Sanitize a payload

```bash
curl -X POST http://localhost:8080/sanitize \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "customer": {
        "email": "jane@example.com",
        "phone": "555-123-4567",
        "sin": "123-45-6789"
      }
    },
    "context": {"purpose": "ticket"}
  }'
```

**Response:** The `payload` in the response has `email` and `phone` masked (e.g.
`j***@example.com`, `***-***-4567`) and `sin` dropped. The policy matches the `support` group (from
no-auth) and `ticket` purpose.

Add `"explain": true` to the request body to see per-field decisions:

```bash
curl -X POST http://localhost:8080/sanitize \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {"customer": {"email": "jane@example.com", "sin": "123-45-6789"}},
    "context": {"purpose": "ticket"},
    "explain": true
  }'
```

The response includes a `decisions` array with `path`, `class`, `action` for each field.

## Classify a payload

```bash
curl -X POST http://localhost:8080/classify \
  -H "Content-Type: application/json" \
  -d '{"payload": {"customer": {"email": "jane@example.com", "notes": "VIP"}}}'
```

**Response:** Each leaf node gets a classification or inline findings:

```json
{
  "classifications": [
    {"path": "/customer/email", "class": "pii.email", "source": "path", "confidence": 1},
    {"path": "/customer/notes", "findings": []}
  ]
}
```

## Build an index

Bootstrap a classification index from real API responses. Collect representative samples and POST
them — the gateway infers path and key classes from patterns in the data.

```bash
curl -X POST http://localhost:8080/index/build \
  -H "Content-Type: application/json" \
  -d '{
    "samples": [
      {"payload": {"user": {"email": "a@b.com"}}},
      {"payload": {"user": {"email": "c@d.com"}}},
      {"payload": {"user": {"email": "e@f.com"}}}
    ]
  }'
```

**Response:** An index with `path_classes` and `key_classes` derived from the samples. Save this to
a file and load it at startup. The same endpoint works whether you are calling a standalone service
or a framework-mounted adapter — just adjust the base URL.
