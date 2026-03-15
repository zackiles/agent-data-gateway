# MCP Deployment

The Agent Data Gateway can run as an [MCP](https://modelcontextprotocol.io) server, letting AI
assistants (Claude Desktop, Cursor, Windsurf, or any MCP-compatible client) sanitize and classify
data through standard MCP tool calls. The MCP server wraps the existing gateway API — same index,
same policy, same auth adapters.

## Quick Start

### stdio (local, one-command)

Add to your MCP client config (e.g. `~/.cursor/mcp.json` or Claude Desktop settings):

```json
{
  "mcpServers": {
    "agent-data-gateway": {
      "command": "deno",
      "args": [
        "run", "--allow-net", "--allow-read", "--allow-env", "--allow-run",
        "src/mcp/mod.ts"
      ],
      "cwd": "/path/to/agent-data-gateway",
      "env": {
        "SCRUBBER_ADAPTER": "no-auth",
        "SCRUBBER_INDEX": "./data/example-index.json",
        "SCRUBBER_POLICY": "./data/example-policy.json",
        "SCRUBBER_NOAUTH_USER": "local-dev",
        "SCRUBBER_NOAUTH_GROUPS": "support,admin"
      }
    }
  }
}
```

Or run directly:

```bash
./scripts/run-mcp.sh
```

### Streamable HTTP (remote)

```bash
MCP_TRANSPORT=http MCP_PORT=8080 ./scripts/run-mcp.sh
```

Point your MCP client at `http://HOST:8080/mcp`.

### Docker

```bash
docker build -f deploy/docker/Dockerfile.mcp -t agent-data-gateway-mcp .
docker run -p 8080:8080 \
  -e SCRUBBER_ADAPTER=no-auth \
  -e SCRUBBER_INDEX=/data/example-index.json \
  -e SCRUBBER_POLICY=/data/example-policy.json \
  -e SCRUBBER_NOAUTH_USER=local-dev \
  -e SCRUBBER_NOAUTH_GROUPS=support,admin \
  -v $(pwd)/data:/data:ro \
  agent-data-gateway-mcp
```

### Docker Compose

```bash
docker compose -f deploy/mcp/docker-compose.yml up --build
```

### Deno tasks

```bash
deno task mcp          # stdio transport (default)
deno task mcp:http     # streamable HTTP transport
deno task build:mcp    # compile to single binary
```

## Tools

The MCP server exposes four tools that mirror the gateway REST API:

| Tool | Description | Maps to |
| --- | --- | --- |
| `sanitize` | Sanitize a JSON payload per policy — returns cleaned data + optional decisions | `POST /sanitize` |
| `classify` | Classify every leaf node — returns data class, source, and confidence | `POST /classify` |
| `build_index` | Build a classification index from sample payloads | `POST /index/build` |
| `reload` | Hot-reload index and/or policy from disk without restart | (new) |

### sanitize

```json
{
  "payload": { "customer": { "email": "jane@example.com", "sin": "123-45-6789" } },
  "context": { "purpose": "ticket" },
  "explain": true
}
```

Returns sanitized payload with email masked and sin dropped, plus a `decisions` array when
`explain` is true.

Optional `identity` parameter overrides the configured adapter identity:

```json
{
  "payload": { "data": "..." },
  "context": { "purpose": "investigation" },
  "identity": { "user": "analyst", "groups": ["risk", "fraud"] }
}
```

### classify

```json
{
  "payload": { "user": { "email": "a@b.com", "phone": "555-123-4567" } }
}
```

Returns classifications with class (`pii.email`), source (`path`, `key`, `detector`, `reasoning`),
and confidence score.

### build_index

```json
{
  "samples": [
    { "payload": { "user": { "email": "a@b.com" } } },
    { "payload": { "user": { "email": "c@d.com" } } },
    { "payload": { "user": { "email": "e@f.com" } } }
  ]
}
```

Returns a classification index ready to save and use at startup.

### reload

```json
{ "index": true, "policy": true }
```

Reloads the index and/or policy files from disk. Both default to `true`.

## Resources

The MCP server exposes three read-only resources:

| URI | Description |
| --- | --- |
| `gateway://policy` | Current active policy (JSON) |
| `gateway://index` | Current classification index (JSON) |
| `gateway://config` | Runtime config — adapter, paths, feature flags (JSON) |

## Configuration

The MCP server uses all the same `SCRUBBER_*` environment variables as the standalone server (see
[config-reference.md](config-reference.md)). Two additional variables control MCP-specific behavior:

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `MCP_TRANSPORT` | string | `stdio` | Transport mode: `stdio` or `http` |
| `MCP_PORT` | number | (SCRUBBER_PORT) | Port for streamable HTTP transport |

## Auth

The MCP server uses the same auth adapter system as the REST API. For local stdio usage, `no-auth`
is typical. For remote streamable HTTP deployments, use any supported adapter (`api-key`,
`trusted-header`, `oidc-jwt`).

When calling `sanitize`, you can optionally pass an `identity` parameter to override the adapter
identity. This lets MCP clients impersonate different users/groups for policy evaluation without
changing the server config.

## Transport Details

### stdio

The server reads JSON-RPC messages from stdin and writes responses to stdout. All log output goes to
stderr. This is the standard MCP local integration — the MCP client spawns the server as a
subprocess.

### Streamable HTTP

The server listens on a single endpoint (`/mcp`) and implements the MCP Streamable HTTP transport
(spec 2025-11-25). Sessions are managed with the `mcp-session-id` header. Supports both SSE
streaming and direct JSON responses.
