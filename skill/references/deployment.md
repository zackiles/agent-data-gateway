# Deployment Reference

## Docker

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

With reasoning (LLM-assisted classification):

```bash
docker build -f deploy/docker/Dockerfile.reasoning -t agent-data-gateway-reasoning .
docker run -p 8080:8080 \
  -e SCRUBBER_ADAPTER=no-auth \
  -e SCRUBBER_REASONING_ENABLED=true \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v $(pwd)/data:/data:ro \
  agent-data-gateway-reasoning
```

## Docker Compose

```bash
docker compose -f deploy/generic/docker-compose.yml up --build
```

Edit `deploy/generic/docker-compose.yml` to change auth adapter or add env vars.

## Cloud Run

Build and push:

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/agent-data-gateway .
```

Deploy:

```bash
gcloud run deploy agent-data-gateway \
  --image gcr.io/PROJECT_ID/agent-data-gateway \
  --platform managed \
  --region us-central1 \
  --set-env-vars "SCRUBBER_ADAPTER=oidc-jwt,SCRUBBER_INDEX=/data/example-index.json,SCRUBBER_POLICY=/data/example-policy.json,SCRUBBER_JWT_ISSUER=...,SCRUBBER_JWT_AUDIENCE=...,SCRUBBER_JWT_JWKS_URL=..."
```

Or use the declarative config at `deploy/cloud-run/service.yaml` (replace `IMAGE_PLACEHOLDER` and OIDC placeholders).

## ECS

1. Push image to ECR
2. Update `deploy/ecs/task-definition.json`:
   - Replace `IMAGE_PLACEHOLDER` with ECR image URI
   - Replace `EXECUTION_ROLE_ARN_PLACEHOLDER` with task execution role
3. Register and run:

```bash
aws ecs register-task-definition --cli-input-json file://deploy/ecs/task-definition.json
aws ecs create-service --cluster CLUSTER --service-name agent-data-gateway \
  --task-definition agent-data-gateway --desired-count 1
```

## Pre-built Container Images

Available from GitHub Container Registry after each tagged release:

- **Base:** `ghcr.io/zackiles/agent-data-gateway:<version>` or `:latest`
- **Reasoning:** `ghcr.io/zackiles/agent-data-gateway-reasoning:<version>` or `:latest`

Pull and run:

```bash
docker pull ghcr.io/zackiles/agent-data-gateway:latest
docker run -p 8080:8080 \
  -e SCRUBBER_ADAPTER=no-auth \
  -e SCRUBBER_INDEX=/data/example-index.json \
  -e SCRUBBER_POLICY=/data/example-policy.json \
  -v $(pwd)/data:/data:ro \
  ghcr.io/zackiles/agent-data-gateway:latest
```

## Local Development (from source)

```bash
git clone https://github.com/zackiles/agent-data-gateway.git
cd agent-data-gateway
./scripts/run-local.sh
```

Starts on port 8080 with no-auth, example index, and example policy.
