# Deployment

This page covers deploying the gateway as a **standalone service**. If you want to embed the gateway
directly into your own application as middleware, see
[jsr-package.md](jsr-package.md) instead.

## Standalone service deployment

## Docker

Build and run:

```bash
docker build -f deploy/docker/Dockerfile -t agent-data-gateway .
docker run -p 8080:8080 \
  -e SCRUBBER_ADAPTER=no-auth \
  -e SCRUBBER_INDEX=/data/example-index.json \
  -e SCRUBBER_POLICY=/data/example-policy.json \
  -e SCRUBBER_NOAUTH_USER=local-dev \
  -e SCRUBBER_NOAUTH_GROUPS=support,admin \
  -v $(pwd)/data:/data:ro \
  agent-data-gateway
```

The image expects index and policy at `/data/` by default. Mount your data directory or bake files into a custom image.

## Docker Compose

```bash
docker compose -f deploy/generic/docker-compose.yml up --build
```

Uses `deploy/docker/Dockerfile`, mounts `data/` as a volume, and sets no-auth env vars. Edit `deploy/generic/docker-compose.yml` to switch adapters or add env vars.

## Cloud Run

1. Build and push:

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/agent-data-gateway .
```

2. Deploy using `deploy/cloud-run/service.yaml`. Replace placeholders:

- `IMAGE_PLACEHOLDER` with your image URL
- `ISSUER_PLACEHOLDER`, `AUDIENCE_PLACEHOLDER`, `JWKS_URL_PLACEHOLDER` with your OIDC values

3. Or deploy via gcloud:

```bash
gcloud run deploy agent-data-gateway \
  --image gcr.io/PROJECT_ID/agent-data-gateway \
  --platform managed \
  --region us-central1 \
  --set-env-vars "SCRUBBER_ADAPTER=oidc-jwt,SCRUBBER_INDEX=/data/example-index.json,SCRUBBER_POLICY=/data/example-policy.json,SCRUBBER_JWT_ISSUER=...,SCRUBBER_JWT_AUDIENCE=...,SCRUBBER_JWT_JWKS_URL=..."
```

## ECS

1. Build and push your image to ECR.

2. Update `deploy/ecs/task-definition.json`:
   - Replace `IMAGE_PLACEHOLDER` with your ECR image URI
   - Replace `EXECUTION_ROLE_ARN_PLACEHOLDER` with your task execution role
   - Adjust env vars for your adapter (default: trusted-header with `X-Amzn-Oidc-Data`)

3. Register and run:

```bash
aws ecs register-task-definition --cli-input-json file://deploy/ecs/task-definition.json
aws ecs create-service --cluster CLUSTER --service-name agent-data-gateway \
  --task-definition agent-data-gateway --desired-count 1
```

Ensure the task has access to index and policy files (baked into image or mounted from EFS/Secrets Manager).

## MCP server

The gateway can run as an MCP (Model Context Protocol) server, letting AI assistants call
sanitize, classify, and index-build as standard MCP tools. See [mcp.md](mcp.md) for the full
guide.

### Local (stdio)

```bash
./scripts/run-mcp.sh
```

Add the stdio config to your MCP client (Claude Desktop, Cursor, etc.) — see
[deploy/mcp/mcp-config.json](../deploy/mcp/mcp-config.json) for a ready-to-use template.

### Remote (streamable HTTP)

```bash
MCP_TRANSPORT=http MCP_PORT=8080 ./scripts/run-mcp.sh
```

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

## Library deployment (alternative)

Instead of running a separate container, you can embed the gateway into your existing application.
Install the JSR package and mount it on your framework of choice (Hono, Oak, Express, Fastify,
Next.js). The API endpoints, index format, and policy format are identical — the only difference is
how the gateway starts (as a `Gateway` constructor call instead of a container entrypoint) and where
auth is configured (constructor options instead of environment variables).

See [jsr-package.md](jsr-package.md) for setup instructions.
