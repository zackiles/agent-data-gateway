# Quickstart

Step-by-step guide from clone to a running local instance.

## Prerequisites

- [Deno 2.x](https://deno.land/)

## Run locally

```bash
git clone https://github.com/zackiles/agent-data-gateway.git
cd agent-data-gateway
./scripts/run-local.sh
```

The service starts on port 8080 with the no-auth adapter, example index, and example policy.

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

**Response:** The `payload` in the response has `email` and `phone` masked (e.g. `j***@example.com`, `***-***-4567`) and `sin` dropped. The policy matches the `support` group (from no-auth) and `ticket` purpose.

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

```bash
curl -X POST http://localhost:8080/index/build \
  -H "Content-Type: application/json" \
  -d '{
    "samples": [
      {"payload": {"user": {"email": "a@b.com"}}},
      {"payload": {"order": {"internalCode": "XJ-4492"}}}
    ]
  }'
```

**Response:** An index with `path_classes` and `key_classes` derived from the samples. Use this to bootstrap or extend your classification index.
