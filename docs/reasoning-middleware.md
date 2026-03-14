# Reasoning Middleware

Optional LLM-assisted classification for fields the deterministic classifier cannot resolve.

## What it does

The reasoning layer runs after path lookup, key lookup, and pattern detectors. It collects leaf nodes still classified as unknown, builds a minimal deduplicated sample, shells out to Claude Code CLI or Cursor CLI, and merges the LLM classifications back into the pipeline. Policy evaluation then treats reasoning-sourced classifications the same as deterministic ones.

## When to use it

The deterministic classifier handles most cases via path rules, key rules, and regex detectors. Enable reasoning when you have unusual field names, ambiguous values, or domain-specific data that regex cannot reliably match. It acts as a catch-all for unknowns.

## Prerequisites

- **Claude Code CLI** or **Cursor CLI** installed and on PATH
- **API key**: `ANTHROPIC_API_KEY` (for Claude) or `CURSOR_API_KEY` (for Cursor)

Install Claude Code CLI:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Install Cursor CLI:

```bash
curl -fsSL https://cursor.com/install | bash
```

## Enable it

```bash
export SCRUBBER_REASONING_ENABLED=true
export SCRUBBER_REASONING_CLI=claude
```

Or for Cursor:

```bash
export SCRUBBER_REASONING_ENABLED=true
export SCRUBBER_REASONING_CLI=cursor
```

## Provide credentials

Set the env var for your chosen CLI before starting the service:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export CURSOR_API_KEY=...
```

In containers, pass these as secrets or env vars. Never commit keys to the repo.

## Verify

With reasoning enabled and no-auth, send a payload with a field the index does not classify (e.g. an unusual key like `internalReference`):

```bash
curl -X POST http://localhost:8080/classify \
  -H "Content-Type: application/json" \
  -d '{"payload": {"order": {"internalReference": "REF-2024-001"}}}'
```

If reasoning classifies it, you will see `"source": "reasoning"` in the response. Without reasoning, such fields remain unclassified.

## Configuration reference

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SCRUBBER_REASONING_ENABLED` | boolean | false | Enable reasoning |
| `SCRUBBER_REASONING_CLI` | string | `claude` | `claude` or `cursor` |
| `SCRUBBER_REASONING_MODEL` | string | (CLI default) | Model (e.g. `sonnet`, `opus`) |
| `SCRUBBER_REASONING_TIMEOUT` | number | 30000 | CLI timeout in ms |
| `SCRUBBER_REASONING_MIN_CONFIDENCE` | number | 0.5 | Min confidence (0.0–1.0) |
| `SCRUBBER_REASONING_MAX_SAMPLES` | number | 50 | Max samples per invocation |
| `SCRUBBER_REASONING_COOLDOWN` | number | 60000 | Cooldown in ms after rate-limit |
| `SCRUBBER_REASONING_CLI_VERSION` | string | latest | CLI version for container |
| `SCRUBBER_REASONING_PROMPT_FILE` | string | `src/core/system-prompt-agent-classifier.md` | System prompt path |

Credentials: `ANTHROPIC_API_KEY` or `CURSOR_API_KEY` per chosen CLI.

## How it works

1. Deterministic classification runs first (path, key, detectors).
2. Unknown nodes are collected and deduplicated by (key, value_type).
3. A sample JSON file is written to a temp directory.
4. The invoker spawns the CLI with the sample path and system prompt.
5. The CLI returns JSON classifications; the invoker parses and validates.
6. Classifications are mapped back to original paths and merged.
7. Policy evaluation runs on the full classification set.
8. Temp files are cleaned up.

On any failure (CLI not found, timeout, bad output), the middleware skips reasoning and unknowns are handled by `unknown_action` in the policy. The service never fails a request because of reasoning.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| CLI not found | Binary not on PATH | Install Claude/Cursor CLI; in Docker, use `Dockerfile.reasoning` with `BUILD_REASONING_CLI` |
| Bad credentials | Missing or invalid API key | Set `ANTHROPIC_API_KEY` or `CURSOR_API_KEY` |
| Timeout | CLI took too long | Increase `SCRUBBER_REASONING_TIMEOUT` or reduce `SCRUBBER_REASONING_MAX_SAMPLES` |
| Rate limit / quota | Provider throttled | Cooldown applies; check provider limits; consider `SCRUBBER_REASONING_COOLDOWN` |
| Invalid JSON output | CLI returned malformed JSON | Check CLI version; reasoning skips and unknowns use `unknown_action` |

Reasoning errors are logged. The service continues without reasoning for that request.
