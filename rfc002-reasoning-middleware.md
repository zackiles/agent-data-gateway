RFC002: Reasoning Middleware for LLM-Assisted Classification

Status: Draft Target: POC Extends: rfc-aiw0013-auto-data-classifier-filter

1. Objective

Add an optional reasoning layer to the classifier defined in RFC-AIW0013 that catches sensitive data
the deterministic layers (path lookup, key lookup, seed detectors) miss. The middleware shells out
to Claude Code CLI or Cursor CLI in non-interactive mode, sending the absolute minimum data sample
needed to classify unknowns, and merges the results back into the standard classification pipeline.

This layer is opt-in. When disabled, classification behaves exactly as RFC-AIW0013 specifies. When
enabled, it acts as a final catch-all after deterministic classification, before policy evaluation.

2. Scope

This RFC defines: 1.	Where the reasoning layer sits in the classification pipeline. 2.	The schema
sampling and deduplication algorithm. 3.	The CLI invocation model for Claude Code and Cursor CLI.
4.	The system prompt contract and file format. 5.	The structured output contract. 6.	The
configuration model for the reasoning layer. 7.	The .env template requirements. 8.	The
build/container requirements for CLI tooling. 9.	Error handling for agent failures, quota limits,
and timeouts. 10.	README and documentation structure for progressive disclosure.

This RFC does not define: 1.	Changes to the core scrubber, policy engine, or transform engine.
2.	Direct API calls to LLM providers (the middleware uses CLI tools only). 3.	Training, fine-tuning,
or prompt optimization workflows.

3. Design decisions

3.1 The reasoning layer is a classification middleware, not a replacement

The deterministic classifier in RFC-AIW0013 (path, key, detector) runs first and handles all cases
it can. The reasoning layer only sees nodes that remain unknown after deterministic classification.
This keeps LLM calls to the absolute minimum and preserves the deterministic, auditable core.

3.2 Minimal data leaves the service

The middleware MUST NOT send the full payload to the CLI. It MUST extract a deduplicated set of
schema samples — one representative per unique leaf-key shape — so repeated structures are sent only
once. Values in samples MUST be truncated or replaced with type placeholders where the key name
alone carries enough signal for classification. The goal is to send the smallest possible data slice
that still allows accurate classification.

3.3 CLI tools are the execution boundary

The service shells out to Claude Code CLI or Cursor CLI rather than calling LLM APIs directly. This
keeps the service free of SDK dependencies, lets users bring their own credentials and model
preferences, and reuses CLI tooling the user already has.

3.4 The reasoning layer is opt-in

When SCRUBBER_REASONING_ENABLED is not set or is false, the reasoning layer does not run. The
service behaves identically to RFC-AIW0013. No CLI tools need to be installed, no credentials are
needed, and no external calls are made.

⸻

4. Classification pipeline integration

4.1 Where the reasoning layer runs

The classification algorithm in RFC-AIW0013 section 6 defines three stages: path lookup, key lookup,
and seed detectors. The reasoning layer adds a fourth stage that runs only on nodes that are still
unknown after all three:

    1.	exact normalized path lookup in path_classes
    2.	exact leaf-key lookup in key_classes
    3.	all fullmatch detectors against the scalar value
    4.	(if enabled) reasoning middleware for remaining unknowns

If a node receives a class from stages 1-3, the reasoning layer does not process it.

4.2 Output integration

The reasoning layer returns classifications in the same shape as the deterministic classifier: a
class string, a confidence score, and source = "reasoning". These classifications feed into the
existing policy engine unchanged. No special policy handling is needed for reasoning-sourced
classifications.

4.3 Inline findings

The reasoning layer MAY also return inline findings for string nodes, using the same shape defined
in RFC-AIW0013 section 6.3, with source = "reasoning-inline".

⸻

5. Schema sampling and deduplication

5.1 Goal

Minimize data sent to the CLI by identifying structurally unique subsets of unknown nodes.

5.2 Algorithm

    1.	Collect all leaf nodes classified as unknown after deterministic stages.
    2.	Group unknowns by their normalized path (with array indices as *).
    3.	For each unique normalized path, select one representative node.
    4.	For each representative, build a sample record containing:
    	•	path — the normalized path
    	•	key — the leaf key name
    	•	value_type — the JSON type of the value (string, number, boolean, null)
    	•	value_sample — for strings, the first 64 characters; for other types, the literal value
    	•	value_length — for strings, the full length
    5.	Deduplicate samples by (key, value_type) pair. If multiple paths share the same key name and value type, keep only one sample but record all original paths. This allows the classification to fan back out to every path that was collapsed during dedup.

5.3 Sample file format

The deduped samples are written to a temporary JSON file:

{ "schema_version": 1, "sample_count": 5, "total_unknown_nodes": 23, "samples": [ { "path":
"/customer/middleName", "key": "middleName", "value_type": "string", "value_sample": "Alexandra",
"value_length": 9, "occurrences": 3, "all_paths": ["/customer/middleName", "/applicant/middleName",
"/contact/middleName"] }, { "path": "/order/internalCode", "key": "internalCode", "value_type":
"string", "value_sample": "XJ-4492-ALPHA", "value_length": 13, "occurrences": 1, "all_paths":
["/order/internalCode"] } ] }

5.4 Size limits

The sample file MUST NOT exceed 50 samples. If deduplication produces more than 50 unique samples,
the middleware MUST select the 50 with the highest occurrence count. The remaining unknowns receive
no reasoning classification and remain unknown.

⸻

6. CLI invocation

6.1 Supported CLI tools

The middleware supports two CLI tools:

Claude Code CLI — invoked as claude. Authenticated via ANTHROPIC_API_KEY environment variable.
Supports --system-prompt-file for loading the classification prompt from disk.

Cursor CLI — invoked as cursor. Authenticated via CURSOR_API_KEY environment variable. Does not
support --system-prompt-file. The system prompt content is embedded directly in the prompt argument.

6.2 Claude Code invocation

claude -p\
--system-prompt-file <prompt_path>\
--output-format json\
--max-turns 1\
--allowedTools "Read"\
"Classify the data samples in <sample_file_path>"

Flags: •	-p — non-interactive print mode, single query, exit on completion •	--system-prompt-file —
loads the classification system prompt from disk, replacing the default system prompt
•	--output-format json — returns structured JSON with result field containing the response
•	--max-turns 1 — prevents multi-turn agent loops; classification is a single-pass task
•	--allowedTools "Read" — only permits reading files, no writes or shell execution

6.3 Cursor CLI invocation

cursor -p\
--output-format json\
"<full_system_prompt_content>

Classify the data samples in <sample_file_path>"

Flags: •	-p — non-interactive print mode •	--output-format json — returns structured JSON with
result field containing the response

Because Cursor CLI does not support a --system-prompt-file flag, the middleware MUST prepend the
full system prompt content to the user prompt in a single string. The middleware MUST also place a
.cursorrules file in the working directory with the system prompt content as a fallback
reinforcement.

6.4 Working directory

The middleware MUST invoke the CLI from a temporary working directory containing: •	the sample JSON
file (named samples.json) •	for Cursor: a .cursorrules file with the system prompt content

All file path references in the prompt MUST use paths relative to this working directory so the CLI
can resolve them.

6.5 Model selection

The user MAY specify a model via config: •	For Claude Code: SCRUBBER_REASONING_MODEL (e.g. sonnet,
opus). Passed as --model flag. •	For Cursor: SCRUBBER_REASONING_MODEL. Passed as --model flag if
supported, otherwise omitted.

If not set, the CLI's default model is used.

⸻

7. System prompt

7.1 File location

The system prompt MUST live in the codebase at:

src/core/system-prompt-agent-classifier.md

The service loads this file once at startup and caches it in memory.

7.2 Prompt structure

The system prompt MUST contain these sections in order:

Section 1 — Role: You are a data classification agent. Your only job is to classify data fields by
their sensitivity.

Section 2 — Class vocabulary: The full list of supported class strings from RFC-AIW0013 section 5.2,
plus a note that the classifier may return any class string.

Section 3 — Input format: Description of the sample JSON file format (section 5.3 of this RFC).

Section 4 — Task: For each sample, determine whether the field contains sensitive data and if so,
assign a class from the vocabulary. Consider the key name, value type, value sample, and value
length. If uncertain, classify as unknown.

Section 5 — Output format: The exact JSON schema the response MUST conform to (section 7.3 of this
RFC).

Section 6 — Rules: •	Return ONLY the JSON output, no commentary. •	Every sample from the input MUST
appear in the output. •	Confidence MUST be between 0.0 and 1.0. •	If you cannot classify a field,
set class to "unknown" and confidence to 0.0. •	Do not invent class names outside the vocabulary
unless the data clearly represents a category not covered.

Section 7 — Input file placeholder:

The data samples to classify are in the file: {{SAMPLE_FILE_PATH}}

7.3 Expected output schema

The CLI MUST return (inside the JSON result field) a response that parses to this shape:

{ "classifications": [ { "path": "/customer/middleName", "key": "middleName", "class": "pii.name",
"confidence": 0.85, "reasoning": "Key name 'middleName' strongly suggests a person's name" }, {
"path": "/order/internalCode", "key": "internalCode", "class": "unknown", "confidence": 0.0,
"reasoning": "Appears to be an internal identifier, not sensitive" } ] }

    •	path and key echo back from the input sample.
    •	class is a class string from the vocabulary or "unknown".
    •	confidence is a float 0.0–1.0.
    •	reasoning is a short explanation (used for explain mode only).

7.4 Output parsing

The middleware MUST: 1.	Parse the CLI JSON envelope to extract the result string. 2.	Parse the
result string as JSON. 3.	Validate the classifications array against the expected schema. 4.	Discard
any classification where class is "unknown" or confidence is below a configurable threshold (default
0.5). 5.	Map remaining classifications back to all original unknown nodes. For deduped samples, use
the all_paths array from the sample record to fan the classification out to every path that was
collapsed during dedup. Each path receives the same class and confidence.

If the result string is not valid JSON or does not match the expected schema, the middleware MUST
treat it as a reasoning failure (see section 8).

⸻

8. Error handling

8.1 Failure modes

The middleware MUST handle these failure modes gracefully:

| Failure             | Behavior                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| CLI not installed   | Log error at startup. Disable reasoning layer. Service continues without it.                     |
| Credentials missing | Log error on first invocation. Skip reasoning for this request. Return unknowns as-is.           |
| CLI process timeout | Kill process after configurable timeout (default 30s). Skip reasoning. Return unknowns as-is.    |
| CLI non-zero exit   | Log stderr. Skip reasoning. Return unknowns as-is.                                               |
| Unparseable output  | Log raw output. Skip reasoning. Return unknowns as-is.                                           |
| Quota / rate limit  | Log error. Skip reasoning. Return unknowns as-is. Optionally back off for configurable cooldown. |
| Empty response      | Treat as no classifications. Return unknowns as-is.                                              |

8.2 Principle

Reasoning failure MUST NEVER cause a request to fail. The service MUST always return a valid
sanitized response. If reasoning fails, the response is identical to what it would be with reasoning
disabled — unknown nodes are handled by the policy engine's unknown_action.

8.3 Diagnostics

When explain mode is true on a request, the response decisions array MUST include entries for
reasoning-sourced classifications showing source = "reasoning" and the reasoning string from the LLM
output. If reasoning failed, the decisions array SHOULD include a single diagnostic entry indicating
the failure mode.

⸻

9. Configuration

9.1 Reasoning middleware config keys

| Key                  | Env var                           | Required     | Default                                    | Description                                   |
| -------------------- | --------------------------------- | ------------ | ------------------------------------------ | --------------------------------------------- |
| enabled              | SCRUBBER_REASONING_ENABLED        | No           | false                                      | Enable the reasoning middleware               |
| cli                  | SCRUBBER_REASONING_CLI            | When enabled | —                                          | Which CLI to use: claude or cursor            |
| model                | SCRUBBER_REASONING_MODEL          | No           | (CLI default)                              | Model to use for classification               |
| timeout              | SCRUBBER_REASONING_TIMEOUT        | No           | 30000                                      | CLI invocation timeout in ms                  |
| confidence threshold | SCRUBBER_REASONING_MIN_CONFIDENCE | No           | 0.5                                        | Minimum confidence to accept a classification |
| max samples          | SCRUBBER_REASONING_MAX_SAMPLES    | No           | 50                                         | Maximum samples per invocation                |
| cooldown             | SCRUBBER_REASONING_COOLDOWN       | No           | 60000                                      | Cooldown in ms after quota/rate-limit error   |
| cli version          | SCRUBBER_REASONING_CLI_VERSION    | No           | latest                                     | Version of CLI to install in container        |
| prompt file          | SCRUBBER_REASONING_PROMPT_FILE    | No           | src/core/system-prompt-agent-classifier.md | Path to system prompt file                    |

9.2 Credential env vars

These are NOT namespaced under SCRUBBER_ because they are standard credential variables consumed
directly by the CLI tools:

    •	ANTHROPIC_API_KEY — required when cli = claude
    •	CURSOR_API_KEY — required when cli = cursor

9.3 Config in the .env template

All reasoning config MUST be represented in the .env template (see section 10).

⸻

10. Environment file template

10.1 File location

The repo MUST include:

configs/.env.template

The user copies this file to .env (or to configs/.env) and edits it. The .env file MUST be
gitignored.

10.2 Precedence

    1.	OS environment variables and GitHub Actions secrets (highest)
    2.	.env file
    3.	Optional config file (lowest)

10.3 Template contents

The .env.template file MUST contain all configurable keys with descriptive comments, grouped by
section. The template MUST be structured as follows:

```
# ──────────────────────────────────────────────
# Scrubber — Core Configuration
# ──────────────────────────────────────────────

# Which identity adapter to use.
# Options: trusted-header, oidc-jwt, api-key, no-auth
SCRUBBER_ADAPTER=no-auth

# Path to the classification index JSON file.
SCRUBBER_INDEX=./data/example-index.json

# Path to the policy JSON file.
SCRUBBER_POLICY=./data/example-policy.json

# HTTP listen port (default: 8080).
# SCRUBBER_PORT=8080

# Path to optional config file (JSON or YAML).
# SCRUBBER_CONFIG=

# ──────────────────────────────────────────────
# Identity Adapter — Trusted Header
# ──────────────────────────────────────────────
# Only used when SCRUBBER_ADAPTER=trusted-header.

# SCRUBBER_HEADER_USER=X-Forwarded-User
# SCRUBBER_HEADER_GROUPS=X-Forwarded-Groups
# SCRUBBER_HEADER_GROUPS_SEPARATOR=,

# ──────────────────────────────────────────────
# Identity Adapter — OIDC/JWT
# ──────────────────────────────────────────────
# Only used when SCRUBBER_ADAPTER=oidc-jwt.

# SCRUBBER_JWT_ISSUER=
# SCRUBBER_JWT_AUDIENCE=
# SCRUBBER_JWT_JWKS_URL=
# SCRUBBER_JWT_USER_CLAIM=sub
# SCRUBBER_JWT_GROUPS_CLAIM=groups

# ──────────────────────────────────────────────
# Identity Adapter — API Key
# ──────────────────────────────────────────────
# Only used when SCRUBBER_ADAPTER=api-key.

# SCRUBBER_APIKEY_HEADER=X-API-Key
# SCRUBBER_APIKEY_MAP_FILE=

# ──────────────────────────────────────────────
# Identity Adapter — No Auth (local dev)
# ──────────────────────────────────────────────
# Only used when SCRUBBER_ADAPTER=no-auth.

# SCRUBBER_NOAUTH_USER=local-dev
# SCRUBBER_NOAUTH_GROUPS=

# ──────────────────────────────────────────────
# Reasoning Middleware (optional)
# ──────────────────────────────────────────────
# Enables LLM-assisted classification for fields the
# deterministic classifier cannot resolve. Requires
# Claude Code CLI or Cursor CLI installed in the container.

# Set to true to enable. Default: false.
# SCRUBBER_REASONING_ENABLED=false

# Which CLI to use: "claude" or "cursor".
# SCRUBBER_REASONING_CLI=claude

# Model to pass to the CLI. Leave blank for CLI default.
# SCRUBBER_REASONING_MODEL=

# Timeout for CLI invocation in milliseconds (default: 30000).
# SCRUBBER_REASONING_TIMEOUT=30000

# Minimum confidence to accept an LLM classification (0.0–1.0).
# SCRUBBER_REASONING_MIN_CONFIDENCE=0.5

# Max unique samples to send per invocation (default: 50).
# SCRUBBER_REASONING_MAX_SAMPLES=50

# Cooldown in ms after a quota or rate-limit error (default: 60000).
# SCRUBBER_REASONING_COOLDOWN=60000

# CLI version to install in the container. Default: latest.
# SCRUBBER_REASONING_CLI_VERSION=latest

# Path to classification system prompt file.
# SCRUBBER_REASONING_PROMPT_FILE=src/core/system-prompt-agent-classifier.md

# ──────────────────────────────────────────────
# CLI Credentials
# ──────────────────────────────────────────────
# These are standard env vars consumed by the CLI tools.
# Set the one matching your chosen SCRUBBER_REASONING_CLI.
# In CI, set these as GitHub Actions secrets.

# Required when SCRUBBER_REASONING_CLI=claude.
# ANTHROPIC_API_KEY=

# Required when SCRUBBER_REASONING_CLI=cursor.
# CURSOR_API_KEY=
```

⸻

11. Build and container requirements

11.1 CLI installation in the container

When the reasoning middleware is enabled, the container image MUST include the configured CLI tool.

The Dockerfile MUST support a build argument for CLI selection and version:

    •	BUILD_REASONING_CLI — which CLI to install (claude, cursor, both, none). Default: none.
    •	BUILD_REASONING_CLI_VERSION — version to install. Default: latest.

Installation commands:

Claude Code CLI: curl -fsSL https://claude.ai/install.sh | bash

Cursor CLI: curl -fsSL https://cursor.com/install | bash

After installation, the CLI binary MUST be on the container's PATH so the service can invoke it by
name.

11.2 Version pinning

If SCRUBBER_REASONING_CLI_VERSION is set to a specific version string, the build process MUST
install that version. If set to latest, the build installs whatever the installer provides at build
time.

The installed version MUST be logged during container startup for diagnostics.

11.3 Build without CLI

When BUILD_REASONING_CLI is none (the default), no CLI is installed and the image stays minimal. If
a user enables reasoning at runtime without the CLI installed, the service MUST log a clear error
naming the missing binary and continue without reasoning.

11.4 CI workflows

The build workflow defined in RFC-AIW0013 section 23 MUST be extended: •	The publish workflow SHOULD
produce two image variants: base (no CLI) and reasoning (with both CLIs installed). •	Alternatively,
a single image with both CLIs is acceptable if size impact is small. •	The reasoning image variant
MUST be tested with the smoke test extended to include a reasoning classification call using the
no-auth adapter and a mock/stubbed CLI response.

In CI, ANTHROPIC_API_KEY or CURSOR_API_KEY MUST be provided as GitHub Actions secrets for any
integration tests that invoke real CLI calls.

⸻

12. Repo structure additions

The following files and directories extend the repo structure defined in RFC-AIW0013 section 18:

```
src/
├── core/
│   └── system-prompt-agent-classifier.md   # Classification system prompt
├── reasoning/                              # Reasoning middleware module
│   ├── sampler.{ext}                       # Schema sampling and deduplication
│   ├── invoker.{ext}                       # CLI invocation and output parsing
│   └── middleware.{ext}                     # Pipeline integration
configs/
└── .env.template                           # Environment file template
deploy/
└── docker/
    └── Dockerfile.reasoning                # Dockerfile variant with CLI tools
docs/
└── reasoning-middleware.md                 # Reasoning middleware guide
```

12.1 Module responsibilities

src/reasoning/sampler — Collects unknown nodes, groups by normalized path, selects representatives,
deduplicates by (key, value_type), writes sample JSON to temp file.

src/reasoning/invoker — Loads system prompt from disk (once at startup), injects sample file path
into prompt, builds CLI command, executes via child process, parses JSON output, validates against
expected schema, returns classifications or error.

src/reasoning/middleware — Integrates with the classification pipeline. After deterministic
classification, collects unknowns, calls sampler, calls invoker, merges results back into the
classification output.

src/core/system-prompt-agent-classifier.md — The classification prompt loaded at startup. Structure
defined in section 7 of this RFC.

⸻

13. Documentation requirements

13.1 Additional docs

The following docs extend the requirements in RFC-AIW0013 section 22:

docs/reasoning-middleware.md — what the reasoning layer does, when to enable it, how to configure
it, which CLI to choose, how to provide credentials, and how to verify it works.

The README MUST link to this doc from the "Advanced" section (see section 14).

13.2 Golden path and progressive disclosure

The README and docs MUST follow a progressive disclosure structure. The person reading may not know
what this service is or why they need it.

README structure, in order:

    1.	What is this? — One short paragraph. No jargon. "A service that automatically finds and removes sensitive data from JSON responses before they reach your users."

    2.	Why use it? — Three bullet points: catches PII/secrets automatically, works with any auth provider, deploys as a single container.

    3.	Quickstart — Copy-paste path to a running local instance. Uses no-auth adapter, example index/policy, docker run or local script. Under 5 minutes. No reasoning middleware, no real auth. Just: run it, curl it, see sanitized output.

    4.	Choose your auth — Brief section linking to docs/auth-modes.md. One sentence per mode. "If you use Okta, see OIDC/JWT adapter."

    5.	Deploy — Brief section linking to docs/deployment.md. One example command per platform.

    6.	Advanced: LLM-assisted classification — Brief section explaining the reasoning middleware for users who want to catch what regex misses. Links to docs/reasoning-middleware.md. This section MUST NOT appear before the quickstart or auth sections.

    7.	Configuration reference — Link to docs/config-reference.md.

    8.	Contributing — Link to CONTRIBUTING.md and docs/adapter-authoring.md.

The key principle: a user who just wants to deploy and use the service should never have to read
about the reasoning middleware. A user who wants the extra classification power discovers it after
they are already running.

13.3 Reasoning middleware doc structure

docs/reasoning-middleware.md MUST follow this order:

    1.	What it does — one paragraph
    2.	When to use it — the deterministic classifier handles most cases; this catches edge cases
    3.	Prerequisites — Claude Code CLI or Cursor CLI, API key
    4.	Enable it — set SCRUBBER_REASONING_ENABLED=true and SCRUBBER_REASONING_CLI
    5.	Provide credentials — ANTHROPIC_API_KEY or CURSOR_API_KEY
    6.	Verify — curl example showing a field that would be unknown without reasoning, now classified
    7.	Configuration reference — table of all SCRUBBER_REASONING_* keys
    8.	How it works — brief architecture explanation referencing this RFC
    9.	Troubleshooting — common errors (CLI not found, bad credentials, timeout)

⸻

14. Invocation flow summary

End-to-end flow for a single /sanitize request with reasoning enabled:

    1.	http-api receives request, extracts identity via adapter.
    2.	classifier runs deterministic stages (path, key, detector) on all leaf nodes.
    3.	Nodes with a class proceed to policy evaluation as normal.
    4.	Remaining unknown nodes are collected by the reasoning middleware.
    5.	sampler groups unknowns by normalized path, selects representatives, deduplicates.
    6.	sampler writes sample JSON to a temp file in a temp working directory.
    7.	invoker loads the cached system prompt, injects the sample file path into the placeholder.
    8.	invoker builds the CLI command (Claude or Cursor, per config).
    9.	invoker spawns the CLI as a child process with the temp dir as cwd.
    10.	invoker waits for the process to exit (subject to timeout).
    11.	invoker parses the JSON output, extracts the result, validates the schema.
    12.	invoker returns classifications or an error.
    13.	middleware maps classifications back to original unknown nodes by (path, key).
    14.	middleware merges reasoning classifications into the full classification set.
    15.	policy-engine evaluates all nodes (deterministic + reasoning) using the same rules.
    16.	transform-engine applies actions. Response is returned.
    17.	Temp files are cleaned up.

If any step 4–12 fails, the middleware skips reasoning and steps 15–16 proceed with unknowns handled
by unknown_action.

⸻

Changelog

Sections added (relative to RFC-AIW0013): •	This entire RFC is new. It extends RFC-AIW0013 with the
reasoning middleware layer. •	RFC-AIW0013 section 2 should be updated to reference this extension.
•	RFC-AIW0013 section 6.4 (Unknowns) should note that unknowns may be further processed by the
reasoning middleware if enabled.

Key design choices: •	CLI shell-out instead of SDK integration — avoids LLM SDK dependencies in the
service. •	Schema deduplication before sending — minimizes data exposure and token usage.
•	Single-turn invocation (--max-turns 1) — prevents agent loops; classification is a pure function.
•	Graceful degradation on all failure modes — the service never fails because reasoning failed.
•	Progressive disclosure in docs — reasoning is discovered after the user is already running the
core service.

⸻

Assumptions •	Claude Code CLI and Cursor CLI will continue to support non-interactive print mode
with JSON output format. The specific flags documented here are based on current (2026) CLI
versions. •	Cursor CLI does not support --system-prompt-file. If this flag is added in a future
version, the invocation model should be updated to use it instead of prompt inlining. •	The
--max-turns 1 flag on Claude Code CLI prevents multi-turn agent behavior. If the flag is unavailable
or behaves differently, the timeout serves as a hard backstop. •	String value samples truncated to
64 characters are sufficient for LLM classification in most cases. This limit can be tuned via
config if needed in the future. •	The native CLI installers (curl-based) are the supported
installation method. npm-based installation of Claude Code CLI is no longer recommended. •	A known
Claude Code CLI bug causes silent zero-exit when combining --disallowedTools with large system
prompts. The RFC avoids --disallowedTools and uses --allowedTools "Read" instead, which restricts to
a safe tool set without triggering this issue.
