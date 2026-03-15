# Agent Data Gateway — Setup Prompt

You have the **agent-data-gateway** skill installed. Use it to help the user.

## Detected Environment

- **OS:** {{OS}}
- **Shell:** {{SHELL}}
- **Working Directory:** {{CWD}}
- **Deno Installed:** {{DENO_INSTALLED}} {{DENO_VERSION}}
- **Node Installed:** {{NODE_INSTALLED}} {{NODE_VERSION}}
- **Docker Installed:** {{DOCKER_INSTALLED}} {{DOCKER_VERSION}}
- **Claude CLI Installed:** {{CLAUDE_INSTALLED}}
- **Cursor CLI Installed:** {{CURSOR_INSTALLED}}
- **Existing Project:** {{HAS_PACKAGE_JSON}} {{HAS_DENO_JSON}}
- **Detected Framework:** {{DETECTED_FRAMEWORK}}
- **Git Repo:** {{IS_GIT_REPO}}

## Task

Based on the user's request and the detected environment above, determine the best approach:

1. **If the user has an existing project** (package.json or deno.json detected), integrate the gateway as middleware using the appropriate framework adapter.

2. **If no existing project is detected**, either:
   - Scaffold a new project with the gateway configured
   - Deploy the gateway as a standalone container service (if Docker is available)
   - Clone and run from source (if Deno is available)

3. **Always:**
   - Use the detected runtime and tools (prefer what's already installed)
   - Create minimal starter index.json and policy.json if none exist
   - Configure with `no-auth` for local development unless the user specifies otherwise
   - Verify the setup works with a test request

Refer to the skill's references for detailed integration code, deployment steps, and configuration options.
