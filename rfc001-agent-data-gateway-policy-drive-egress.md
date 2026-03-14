RFC: Agent Data Gateway Policy-Driven Egress Filter

Status: Draft Target: POC Artifact types: JSON payloads only

1. Objective

Build a single HTTP service that receives a JSON payload that is about to be returned to a client,
classifies sensitive content in that payload, applies a JSON policy using caller identity and
request context, and returns a sanitized payload. It's called "agent data gateway" as it will used
to front agent tool paypals or agent responses so they don't leak data accidentally.

The service is a response-time egress filter, not a query layer, not a source-of-truth data store,
and not a producer-side validator.

The service MUST be portable across container platforms and identity providers. It MUST NOT depend
on any single vendor's auth product at the core layer.

2. Scope

This RFC defines: 1.	The service API. 2.	The classification index format. 3.	The policy format.
4.	The classification algorithm. 5.	The policy evaluation algorithm. 6.	The transform semantics.
7.	The index builder. 8.	The identity adapter architecture. 9.	The auth configuration model. 10.	The
repo structure and module layout. 11.	The release, packaging, and deployment requirements. 12.	The
documentation and CI/CD requirements.

This RFC does not define: 1.	Performance targets. 2.	Logging, metrics, tracing, or alerting.
3.	Multi-region behavior. 4.	UI or admin tooling. 5.	Full implementations of vendor-specific
adapters beyond the initial set. 6.	The optional LLM-assisted reasoning middleware (see
RFC-AIW0013a).

3. Design decisions

3.1 The service filters outgoing payloads, not queries

Earlier designs assumed a query gateway. That is the wrong abstraction for this POC. The cleaner
abstraction is: the payload already exists; sanitize it before it leaves.

Result: the only required runtime input is: •	identity from the configured adapter •	request context
•	outgoing JSON payload

3.2 Policy is class-based, not schema-based

Policies written against raw field names do not survive heterogeneous data. The service MUST apply
policy primarily on classes such as pii.email or government.id, not on source field names.

Result: field names vary, policy remains stable.

3.3 Paths use normalized JSON pointer syntax with array wildcards

Dot-paths are ambiguous when keys contain dots. Standard JSON Pointer does not cover repeated array
structure elegantly. This RFC uses normalized paths: •	object field: /customer/email •	array element
field: /orders/*/email

Numeric array indices MUST be normalized to * for classification lookups.

3.4 Policy selection is first-match-wins

Merging multiple rules is harder to reason about and harder to debug. The engine MUST evaluate rules
in order and apply the first rule whose match block passes. If none match, it MUST apply
default_rule.

3.5 The runtime classifier is simple and deterministic

The runtime MUST use only: 1.	normalized path classification 2.	leaf-key classification 3.	seed
detectors

The runtime MUST NOT learn new detectors. Learning belongs in the offline index builder.

3.6 The API surface stays minimal

The service MUST expose exactly these endpoints: •	POST /sanitize •	POST /classify •	POST
/index/build

No additional endpoint is required for the POC.

3.7 Identity is adapter-sourced and vendor-neutral

The core scrubber engine MUST NOT contain any vendor-specific auth logic. All identity extraction
and normalization MUST be delegated to a pluggable adapter layer that produces a normalized identity
object. The core service depends only on that normalized object.

Result: adding a new auth provider means adding a new adapter, not modifying the scrubber.

⸻

4. External API

4.1 Authentication model

The service receives caller identity through a configured identity adapter. Identity MUST NOT be
supplied in the request body.

The active adapter extracts external auth context from the inbound HTTP request and normalizes it
into an internal identity object with this shape:

{ "user": "jane@example.com", "groups": ["support", "tier-2"], "attributes": { "department":
"customer-success", "region": "CA" } }

The identity contract: •	user — required string identifying the caller •	groups — optional array of
group/role strings •	attributes — optional map of additional key-value claims

The scrubber and policy engine MUST depend only on this normalized identity object. They MUST NOT
reference adapter internals or vendor-specific token fields.

Which adapter is active is determined by configuration (see section 17). If groups are not available
from the external auth source, the service MAY resolve groups via static local mapping keyed by
authenticated user.

4.2 POST /sanitize

Sanitize an outgoing payload.

Request

{ "context": { "resource": "customer_profile", "purpose": "ticket", "region": "CA" }, "payload": {
"customer": { "name": "Jane Doe", "emailAddress": "jane@example.com", "sin": "123-456-789", "notes":
"Customer called from 416-555-0199" } }, "explain": true }

Response

{ "payload": { "customer": { "name": "Jane Doe", "emailAddress": "j***@example.com", "notes":
"Customer called from ***" } }, "decisions": [ { "path": "/customer/emailAddress", "class":
"pii.email", "source": "key", "confidence": 0.98, "action": "mask" }, { "path": "/customer/sin",
"class": "government.id", "source": "key", "confidence": 0.96, "action": "drop" }, { "path":
"/customer/notes", "class": "pii.phone", "source": "detector-inline", "confidence": 0.92, "action":
"mask_inline" } ] }

Behavior 1.	payload MUST be valid JSON. 2.	context MUST be an object. 3.	If explain is omitted, it
defaults to false. 4.	If explain is false, decisions MAY be omitted.

4.3 POST /classify

Classify a payload without transforming it.

Request

{ "payload": { "customer": { "emailAddress": "jane@example.com", "notes": "Customer called from
416-555-0199" } } }

Response

{ "classifications": [ { "path": "/customer/emailAddress", "class": "pii.email", "source": "key",
"confidence": 0.98 }, { "path": "/customer/notes", "findings": [ { "class": "pii.phone", "source":
"detector-inline", "confidence": 0.92, "start": 21, "end": 33 } ] } ] }

4.4 POST /index/build

Build a candidate index from sample payloads.

Request

{ "samples": [ { "payload": { "customer": { "emailAddress": "jane@example.com", "phone":
"416-555-0199" } } }, { "payload": { "customer": { "email": "john@example.com", "phone":
"647-555-0123" } } } ] }

Response

{ "index": { "version": 1, "path_classes": { "/customer/emailAddress": { "class": "pii.email",
"confidence": 0.99, "count": 1 }, "/customer/email": { "class": "pii.email", "confidence": 0.99,
"count": 1 }, "/customer/phone": { "class": "pii.phone", "confidence": 0.99, "count": 2 } },
"key_classes": { "phone": { "class": "pii.phone", "confidence": 0.99, "count": 2 } }, "detectors": [
{ "id": "email.full", "class": "pii.email", "mode": "fullmatch", "pattern":
"(?i)^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$", "confidence": 0.98 }, { "id": "phone.contains",
"class": "pii.phone", "mode": "contains", "pattern": "(?i)\\b(?:\\+?1[-. ]?)?\\(?\\d{3}\\)?[-.
]?\\d{3}[-. ]?\\d{4}\\b", "confidence": 0.92 } ] } }

⸻

5. Data model

5.1 Supported JSON node types

The service MUST support: •	object •	array •	string •	number •	boolean •	null

Classification and transformation apply only to leaf scalar nodes and string substring findings.

Composite nodes MUST NOT be assigned classes in the POC.

5.2 Class vocabulary

Class names are opaque strings. The POC SHOULD start with: •	pii.email •	pii.phone •	pii.birthdate
•	government.id •	payment.card.pan •	network.ip •	credentials.secret

The implementation MUST permit arbitrary class strings in index and policy files.

5.3 Classification index format

The index file MUST be JSON with this shape:

{ "version": 1, "path_classes": { "/customer/email": { "class": "pii.email", "confidence": 0.99,
"count": 120 } }, "key_classes": { "emailAddress": { "class": "pii.email", "confidence": 0.97,
"count": 340 } }, "detectors": [ { "id": "email.full", "class": "pii.email", "mode": "fullmatch",
"pattern": "(?i)^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$", "confidence": 0.98 }, { "id":
"phone.contains", "class": "pii.phone", "mode": "contains", "pattern": "(?i)\\b(?:\\+?1[-.
]?)?\\(?\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}\\b", "confidence": 0.92 } ] }

Semantics 1.	path_classes maps normalized paths to classes. 2.	key_classes maps leaf keys to
classes. 3.	detectors contains regex-based seed detectors. 4.	mode MUST be either: •	fullmatch: the
entire scalar value matches the pattern •	contains: one or more substrings inside a string match the
pattern

5.4 Policy file format

The policy file MUST be JSON with this shape:

{ "version": 1, "default_rule": { "default_action": "allow", "unknown_action": "allow",
"class_actions": { "government.id": "drop", "payment.card.pan": "drop", "credentials.secret": "drop"
}, "path_actions": {} }, "rules": [ { "match": { "groups_any": ["support"], "purposes_any":
["ticket"] }, "default_action": "allow", "unknown_action": "allow", "class_actions": { "pii.email":
"mask", "pii.phone": "mask", "government.id": "drop", "payment.card.pan": "drop",
"credentials.secret": "drop" }, "path_actions": { "/customer/notes": "mask_inline" } }, { "match": {
"groups_any": ["risk", "fraud"], "purposes_any": ["investigation"] }, "default_action": "allow",
"unknown_action": "allow", "class_actions": { "pii.email": "allow", "pii.phone": "allow",
"government.id": "last4", "payment.card.pan": "drop", "credentials.secret": "drop" },
"path_actions": {} } ] }

Match predicates

The POC MUST support these predicates: •	users_any •	groups_any •	resources_any •	purposes_any
•	regions_any

Every present predicate in match MUST pass. If match is omitted or empty, the rule matches all
requests.

Action precedence

For a given node, action MUST resolve in this order: 1.	path_actions[path] 2.	class_actions[class]
3.	unknown_action if no class or findings exist 4.	default_action

⸻

6. Classification algorithm

6.1 Traversal

The service MUST recursively traverse the JSON payload and emit leaf nodes with: •	path •	key
•	value

Array indices MUST be normalized to * for path classification lookup.

Example:

{ "orders": [ { "email": "a@example.com" }, { "email": "b@example.com" } ] }

produces normalized paths: •	/orders/*/email

6.2 Whole-field classification

For each leaf scalar node, classification MUST run in this order: 1.	exact normalized path lookup in
path_classes 2.	exact leaf-key lookup in key_classes 3.	all fullmatch detectors against the scalar
value

The first successful source MUST win only if it is unique. If multiple fullmatch detectors hit with
different classes, the implementation MUST select the class with the highest detector confidence. If
still tied, it MUST classify as unknown.

6.3 Inline findings

If a leaf string node does not receive a whole-field class, the classifier MUST run all contains
detectors and record substring findings.

Each finding MUST include: •	class •	start •	end •	confidence •	source = detector-inline

A node may have multiple findings.

6.4 Unknowns

If no whole-field class and no inline findings exist, the node is unknown.

If the optional reasoning middleware is enabled (see RFC-AIW0013a), unknown nodes are passed to an
LLM-assisted classification layer before policy evaluation. If reasoning is disabled or unavailable,
unknowns proceed directly to the policy engine and are handled by unknown_action.

⸻

7. Policy evaluation algorithm

7.1 Rule selection 1.	Build runtime context from: •	normalized identity object produced by the
active adapter (user, groups, attributes) •	request context 2.	Evaluate rules in array order.
3.	Select the first rule whose match block passes. 4.	If none pass, use default_rule.

7.2 Node evaluation

For each leaf node: 1.	If the node has a whole-field class, resolve action using precedence rules.
2.	Else if the node has inline findings: •	evaluate each finding class using precedence rules
•	apply inline transforms to the string 3.	Else: •	apply unknown_action

7.3 Conflict behavior

If multiple inline findings overlap: 1.	sort findings by start ascending, then end descending
2.	merge overlapping spans 3.	apply the most restrictive action among overlapping findings using
this order:

drop > null > mask_inline > mask > last4 > year_only > hash > allow

For inline findings, mask, last4, year_only, and hash MUST behave as mask_inline.

7.4 Root behavior

If action resolution produces drop for the root payload, the service MUST return:

{ "payload": null }

⸻

8. Transform semantics

The POC MUST implement these actions: •	allow •	drop •	null •	mask •	mask_inline •	last4 •	year_only
•	hash

8.1 allow

Return the value unchanged.

8.2 drop

Remove the field from its parent object. If the parent is an array, remove the element. If the node
is root, return null payload.

8.3 null

Replace the value with null.

8.4 mask

Apply class-specific masking where defined, otherwise generic string masking.

Email masking

jane@example.com → j***@example.com

Phone masking

Preserve non-digit separators and last 4 digits.

416-555-0199 → _**-**_-0199

Generic string masking •	if length < 4: *** •	else: first character + *** + last character

Examples: •	secret → s***t •	AB → ***

For numbers and booleans, mask MUST return null.

8.5 mask_inline

Replace each matched span with ***.

Example:

"Call me at 416-555-0199" → "Call me at ***"

8.6 last4

Replace all alphanumeric characters except the last 4 with *. Non-alphanumeric separators MAY be
preserved.

Examples: •	123-45-6789 → ***-**-6789 •	4111111111111111 → ************1111

If the value is not a string, cast to string first.

8.7 year_only

If the value is a string parseable as a date, return YYYY. Otherwise return null.

Examples: •	1988-07-20 → 1988 •	1988/07/20 → 1988

8.8 hash

Return lowercase hexadecimal SHA-256 of the UTF-8 string form of the value.

⸻

9. Index builder

9.1 Purpose

The builder generates path_classes and key_classes from sample payloads. It does not invent detector
regexes. Detector regexes are seed knowledge.

9.2 Inputs

The builder MUST accept an array of sample payloads.

9.3 Builder algorithm

For each sample: 1.	flatten payload into leaf nodes using normalized paths 2.	run whole-field
fullmatch detectors on each scalar 3.	record detector hits by: •	normalized path •	leaf key

After all samples: 1.	infer path_classes 2.	infer key_classes 3.	carry forward the seed detector
list unchanged

9.4 Path inference rule

Emit a path classification only when all conditions hold: 1.	at least 3 samples exist for the path
2.	one class accounts for at least 95% of detector hits on that path 3.	the winning class has at
least 3 supporting hits

9.5 Key inference rule

Emit a key classification only when all conditions hold: 1.	at least 10 samples exist for the key
2.	one class accounts for at least 90% of detector hits for that key 3.	the key appears under at
least 3 unique normalized paths 4.	the winning class has at least 10 supporting hits

9.6 Confidence computation

For both path and key inference:

confidence = winning_hits / total_hits

rounded to 2 decimal places.

9.7 Builder output rules

The builder MUST output: •	version •	path_classes •	key_classes •	detectors

The builder MAY omit empty sections.

⸻

10. Modules to build

The POC implementation MUST contain these modules.

10.1 payload-traverser

Responsibilities: •	recursively walk JSON •	emit leaf nodes •	normalize array indices to * •	support
node replacement, removal, and inline string rewrites

10.2 index-loader

Responsibilities: •	load index JSON •	validate schema •	compile detector regexes

10.3 policy-loader

Responsibilities: •	load policy JSON •	validate schema •	preserve rule order

10.4 classifier

Responsibilities: •	classify a leaf node by path, key, or detector •	generate inline findings
•	return confidence and source metadata

10.5 policy-engine

Responsibilities: •	accept the normalized identity object from the active adapter •	combine identity
with request body context to build runtime context •	select rule •	resolve action per node using
precedence rules

10.6 transform-engine

Responsibilities: •	apply actions exactly as defined in this RFC •	support whole-field and inline
transformations •	preserve valid JSON output

10.7 http-api

Responsibilities: •	implement /sanitize, /classify, /index/build •	parse requests •	invoke the
active identity adapter on each request before policy evaluation •	return JSON responses

10.8 index-builder

Responsibilities: •	flatten sample payloads •	run seed detectors •	infer path and key classes •	emit
candidate index JSON

10.9 identity-adapter

Responsibilities: •	define the normalized identity contract (user, groups, attributes) •	define the
adapter interface that all adapters implement •	load the configured adapter at startup •	expose a
single function the http-api calls to extract identity from a request

10.10 adapter implementations

Each adapter implementation MUST: •	implement the adapter interface defined in 10.9 •	extract auth
context from the inbound HTTP request •	normalize it into the identity contract •	fail clearly if
required auth material is missing

The POC MUST ship with at minimum: •	trusted-header adapter •	OIDC/JWT adapter •	API key adapter
•	no-auth / local-dev adapter

10.11 config-loader

Responsibilities: •	resolve configuration from environment variables and optional config file
•	select the active adapter mode •	pass adapter-specific settings to the adapter •	resolve index and
policy file locations

⸻

11. Reference seed detectors

The POC SHOULD start with these detectors.

[ { "id": "email.full", "class": "pii.email", "mode": "fullmatch", "pattern":
"(?i)^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$", "confidence": 0.98 }, { "id": "email.contains",
"class": "pii.email", "mode": "contains", "pattern":
"(?i)\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b", "confidence": 0.95 }, { "id": "phone.full",
"class": "pii.phone", "mode": "fullmatch", "pattern": "(?i)^(?:\\+?1[-. ]?)?\\(?\\d{3}\\)?[-.
]?\\d{3}[-. ]?\\d{4}$", "confidence": 0.96 }, { "id": "phone.contains", "class": "pii.phone",
"mode": "contains", "pattern": "(?i)\\b(?:\\+?1[-. ]?)?\\(?\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}\\b",
"confidence": 0.92 }, { "id": "govid.full", "class": "government.id", "mode": "fullmatch",
"pattern": "^\\d{3}[- ]?\\d{2}[- ]?\\d{4}$|^\\d{3}[- ]?\\d{3}[- ]?\\d{3}$", "confidence": 0.95 }, {
"id": "pan.full", "class": "payment.card.pan", "mode": "fullmatch", "pattern": "^\\d{13,19}$",
"confidence": 0.90 } ]

⸻

12. Minimal implementation order
    1. identity-adapter contract and no-auth adapter
    2. config-loader
    3. payload-traverser
    4. index-loader
    5. policy-loader
    6. classifier
    7. policy-engine
    8. transform-engine
    9. POST /sanitize
    10. POST /classify
    11. index-builder
    12. POST /index/build
    13. trusted-header adapter
    14. OIDC/JWT adapter
    15. API key adapter

⸻

13. Final shape

The resulting system is exactly this: •	one container image with a single HTTP service •	one
identity adapter contract with pluggable adapter implementations •	one config surface (env vars or
optional config file) •	one index JSON •	one policy JSON •	one authenticated caller (identity
resolved by the active adapter) •	one outgoing JSON payload •	one sanitized JSON response

That is the full POC spec. The following sections define the adapter architecture, configuration
model, repo structure, release flow, and documentation requirements that support it.

⸻

14. Identity adapter architecture

14.1 Separation of concerns

The system has two distinct layers:

Layer 1 — Core scrubber engine: classification, policy evaluation, transforms. This layer receives a
normalized identity object and a request. It has zero knowledge of how identity was obtained.

Layer 2 — Identity adapter: extracts auth context from the HTTP request and produces the normalized
identity object. Each adapter encapsulates one auth mechanism.

14.2 Normalized identity contract

Every adapter MUST produce an object conforming to this shape:

{ "user": "<string, required>", "groups": ["<string>"], "attributes": { "<key>": "<value>" } }

    •	user is required. If the adapter cannot determine a user, it MUST reject the request.
    •	groups is optional. If unavailable, it MUST default to an empty array.
    •	attributes is optional. Adapters MAY populate it with additional claims relevant to policy evaluation (department, region, tenant, etc.).

14.3 Adapter interface

Each adapter MUST implement a function with this logical signature:

extract(request) → Identity | Error

    •	request is the raw inbound HTTP request (headers, query params, etc.).
    •	The function returns the normalized identity object or an error.
    •	The function MUST NOT modify the request body.
    •	The function MUST NOT call the scrubber engine.

This interface is language-agnostic. Implementations may express it as a function, class, module, or
trait depending on the language, but the contract is the same.

14.4 Adapter lifecycle

    1.	At startup, the config-loader determines the active adapter mode.
    2.	The adapter module is loaded and initialized with adapter-specific settings.
    3.	On each request, http-api calls extract(request) on the active adapter.
    4.	The resulting identity object is passed to the policy-engine.
    5.	The scrubber proceeds with no awareness of which adapter produced the identity.

14.5 Guarantees

    •	Adapters are pluggable: adding a new adapter MUST NOT require changes to the scrubber engine.
    •	Adapters normalize: every adapter produces the same identity shape regardless of the external auth mechanism.
    •	The core is vendor-neutral: the scrubber, classifier, policy engine, and transform engine MUST NOT import or reference any adapter implementation.

⸻

15. Supported adapter modes

15.1 Initial adapter modes

The project MUST support these adapter modes at launch:

trusted-header — Identity is extracted from HTTP headers set by an upstream reverse proxy or
identity-aware proxy. The adapter reads configured header names for user, groups, and attributes.

oidc-jwt — Identity is extracted from a Bearer token in the Authorization header. The adapter
validates the JWT signature, checks issuer/audience, and maps claims to the identity contract.

api-key — Identity is resolved from an API key provided in a header or query parameter. The key maps
to a known identity via static config or a lookup table.

no-auth — No authentication is performed. A static identity is used. This mode is for local
development and testing only.

15.2 Ecosystems covered

These modes cover the following common ecosystems without requiring separate first-class adapter
implementations per vendor:

    •	GCP (IAP, Cloud Run auth) — trusted-header or oidc-jwt
    •	AWS (ALB, API Gateway, Cognito) — trusted-header or oidc-jwt
    •	Okta — oidc-jwt
    •	Auth0 — oidc-jwt
    •	PingFederate / PingOne — oidc-jwt
    •	Azure AD / Entra ID — oidc-jwt
    •	Generic reverse proxy / ingress auth (nginx, Envoy, Traefik, Kong) — trusted-header
    •	Service-to-service auth — api-key
    •	Local development — no-auth

15.3 Vendor adapters are pattern instances

Vendor-specific adapters, if added later, are instances of the same adapter interface. They are not
separate architecture branches. A "GCP IAP adapter" is a trusted-header adapter with GCP-specific
header names and optional JWT verification. An "Okta adapter" is an oidc-jwt adapter with
Okta-specific issuer and claim mappings.

The RFC explicitly prohibits separate architecture paths per vendor.

⸻

16. Adapter template and extension

16.1 Adding a new adapter

A developer adding a new adapter MUST:

    1.	Create a new module in the adapter directory (see section 18 for repo layout).
    2.	Implement the adapter interface: extract(request) → Identity | Error.
    3.	Accept adapter-specific settings from config.
    4.	Register the adapter under a mode name in the adapter registry.
    5.	Add tests that verify identity extraction for valid requests, missing auth, and malformed auth.
    6.	Add a doc entry to the adapter catalog describing the mode, config keys, and which ecosystems it covers.

16.2 Adapter contract checklist

Every adapter MUST satisfy:

    •	Returns a valid identity object with at least user populated.
    •	Returns a clear error (not a crash) when auth material is missing or invalid.
    •	Does not import or depend on scrubber internals.
    •	Does not mutate the request body.
    •	Is stateless per-request (initialization state at startup is fine).
    •	Has unit tests covering: success, missing auth, invalid auth, and group/attribute extraction.

16.3 Adapter template

The repo MUST include a template adapter (skeleton) that a contributor can copy to start a new
adapter. The template MUST include:

    •	the interface function stub
    •	config consumption pattern
    •	a passing placeholder test
    •	a README section explaining what to fill in

16.4 Registration

Adapters MUST be registered by mode name. The config-loader selects the adapter by this name. The
registration mechanism MUST be simple — a map, registry object, or equivalent. Dynamic plugin
loading is not required for the POC.

⸻

17. Configuration model

17.1 Configuration sources

The service MUST support configuration from two sources, in this precedence order:

    1.	Environment variables (highest precedence)
    2.	Optional config file (YAML or JSON)

Environment variables MUST be sufficient for a minimal deployment. The config file is optional and
intended for structured or complex configurations.

17.2 Core config keys

| Key              | Env var          | Required          | Description                       |
| ---------------- | ---------------- | ----------------- | --------------------------------- |
| adapter mode     | SCRUBBER_ADAPTER | Yes               | Which identity adapter to use     |
| index file path  | SCRUBBER_INDEX   | Yes               | Path to classification index JSON |
| policy file path | SCRUBBER_POLICY  | Yes               | Path to policy JSON               |
| listen port      | SCRUBBER_PORT    | No (default 8080) | HTTP listen port                  |
| config file path | SCRUBBER_CONFIG  | No                | Path to optional config file      |

17.3 Adapter-specific config

Each adapter mode defines its own config keys, namespaced by adapter name. Examples:

trusted-header adapter: •	SCRUBBER_HEADER_USER — header name for user (default: X-Forwarded-User)
•	SCRUBBER_HEADER_GROUPS — header name for groups (default: X-Forwarded-Groups)
•	SCRUBBER_HEADER_GROUPS_SEPARATOR — separator for groups header (default: ,)

oidc-jwt adapter: •	SCRUBBER_JWT_ISSUER — expected token issuer •	SCRUBBER_JWT_AUDIENCE — expected
audience •	SCRUBBER_JWT_JWKS_URL — JWKS endpoint for key verification •	SCRUBBER_JWT_USER_CLAIM —
claim to map to user (default: sub) •	SCRUBBER_JWT_GROUPS_CLAIM — claim to map to groups (default:
groups)

api-key adapter: •	SCRUBBER_APIKEY_HEADER — header name for API key (default: X-API-Key)
•	SCRUBBER_APIKEY_MAP_FILE — path to JSON file mapping keys to identity objects

no-auth adapter: •	SCRUBBER_NOAUTH_USER — static user for local dev (default: local-dev)
•	SCRUBBER_NOAUTH_GROUPS — static groups, comma-separated

17.4 Example config file

{ "adapter": "oidc-jwt", "index": "./data/index.json", "policy": "./data/policy.json", "port": 8080,
"oidc-jwt": { "issuer": "https://accounts.google.com", "audience": "my-service", "jwks_url":
"https://www.googleapis.com/oauth2/v3/certs", "user_claim": "email", "groups_claim": "groups" } }

17.5 Config principles

    •	The config surface MUST stay small. Do not add config keys speculatively.
    •	Every key MUST have a sensible default where possible.
    •	Adapter-specific keys are only required when the corresponding adapter is active.

⸻

18. Repo structure

The project repo MUST contain the following top-level layout:

```
/
├── src/
│   ├── core/                  # Scrubber engine (classifier, policy, transforms, traverser)
│   ├── adapters/              # Identity adapters (one module per mode)
│   │   ├── trusted-header/
│   │   ├── oidc-jwt/
│   │   ├── api-key/
│   │   ├── no-auth/
│   │   └── _template/         # Skeleton adapter for contributors
│   ├── identity/              # Normalized identity contract definition
│   ├── config/                # Config loader
│   ├── loaders/               # Index and policy file loaders
│   └── server/                # HTTP server entrypoint and request routing
├── data/
│   ├── example-index.json     # Sample classification index
│   └── example-policy.json    # Sample policy file
├── configs/
│   ├── .env.template          # Environment file template (copy to .env)
│   ├── example.env            # Example environment variable set
│   └── example-config.json    # Example config file
├── deploy/
│   ├── docker/
│   │   └── Dockerfile
│   ├── cloud-run/             # GCP Cloud Run deployment example
│   ├── ecs/                   # AWS ECS deployment example
│   └── generic/               # Generic docker-compose or k8s example
├── docs/
│   ├── quickstart.md
│   ├── auth-modes.md
│   ├── adapter-authoring.md
│   ├── config-reference.md
│   ├── deployment.md
│   ├── provider-catalog.md
│   └── reasoning-middleware.md
├── scripts/
│   ├── build.sh
│   ├── run-local.sh
│   └── release.sh
├── .github/
│   └── workflows/
│       ├── build.yml
│       ├── test.yml
│       ├── publish.yml
│       └── release.yml
├── README.md
├── CONTRIBUTING.md
└── <dependency manifest>
```

18.1 Directory purpose summary

    •	src/core — the scrubber engine. No adapter or vendor imports allowed here.
    •	src/adapters — one subdirectory per adapter mode. Each is self-contained.
    •	src/adapters/_template — skeleton adapter for new contributors.
    •	src/identity — shared identity contract type/schema used by adapters and the core.
    •	src/config — config resolution from env vars and optional file.
    •	src/loaders — index and policy file loading/validation.
    •	src/server — HTTP entrypoint. Wires adapters, config, and core together.
    •	data — example data files for index and policy.
    •	configs — example config and environment variable files.
    •	deploy — deployment examples per platform.
    •	docs — all user and contributor documentation.
    •	scripts — build, run, and release automation.
    •	.github/workflows — CI/CD pipeline definitions.

⸻

19. Release and packaging

19.1 Release artifacts

Each release MUST produce:

    •	A published container image tagged with the release version and latest.
    •	A GitHub release with a changelog.
    •	Example environment variable sets included in the release or linked from the README.
    •	Example deployment manifests/templates for at least: Cloud Run, ECS, and generic Docker/compose.
    •	Sample index and policy files bundled with the release.

19.2 Versioning

The project MUST use semantic versioning. Tags MUST follow the format v<major>.<minor>.<patch>.

19.3 Container image

The container image MUST: •	be published to a container registry on each tagged release •	include
the compiled service, all built-in adapters, and default config •	expose the configured listen port
•	accept all configuration via environment variables •	start the service as the default entrypoint

19.4 Release documentation

Each release MUST include or link to: •	a changelog describing what changed •	the supported adapter
modes in that release •	any breaking config changes •	the quickstart path for new users

⸻

20. Deployment UX

20.1 Target experience

A user MUST be able to go from zero to a running deployment with this flow:

    1.	Read the README.
    2.	Choose an auth mode.
    3.	Copy a deployment example for their platform.
    4.	Set a few config values (adapter mode, index path, policy path, adapter-specific settings).
    5.	Deploy the container.
    6.	Hit POST /sanitize.

The repo structure, documentation, and release artifacts MUST be optimized for this path.

20.2 Requirements

    •	The README MUST include a quickstart section that gets a user to a running local instance in under 5 minutes using the no-auth adapter with example data.
    •	Each deployment example MUST be copy-pasteable with minimal edits.
    •	Config values that must be changed MUST be clearly marked as placeholders in examples.
    •	The service MUST start successfully with only the required config keys set.
    •	Error messages for missing config MUST name the missing key and suggest how to set it.

20.3 Non-goals

This section does not require production operations guides, monitoring dashboards, or scaling
documentation. It requires only that the path from README to deployed container is real and
documented.

⸻

21. Provider mapping

21.1 Approach

The RFC does not specify full implementations per provider. Instead, each provider maps to one of
the standard adapter modes defined in section 15.

21.2 Provider-to-adapter mapping

| Provider                       | Adapter mode   | Notes                                                                             |
| ------------------------------ | -------------- | --------------------------------------------------------------------------------- |
| GCP IAP                        | trusted-header | IAP sets X-Goog-Authenticated-User-Email and X-Goog-Authenticated-User-ID headers |
| GCP Cloud Run (native auth)    | oidc-jwt       | Authorization: Bearer <id-token> from Google OIDC                                 |
| AWS ALB                        | trusted-header | ALB sets X-Amzn-Oidc-Data header (base64 JWT in header)                           |
| AWS API Gateway + Cognito      | oidc-jwt       | Standard JWT from Cognito                                                         |
| Okta                           | oidc-jwt       | Standard OIDC, configure issuer and JWKS URL                                      |
| Auth0                          | oidc-jwt       | Standard OIDC, configure issuer, audience, JWKS URL                               |
| PingFederate / PingOne         | oidc-jwt       | Standard OIDC token with configurable claims                                      |
| Azure AD / Entra ID            | oidc-jwt       | Standard OIDC, Microsoft v2.0 endpoints                                           |
| Nginx / Envoy / Traefik / Kong | trusted-header | Proxy sets user/group headers after auth                                          |
| Service-to-service             | api-key        | Static key mapped to identity                                                     |
| Local development              | no-auth        | Static identity, no auth required                                                 |

21.3 Documentation per provider

For each provider listed above, the repo MUST include a doc entry in docs/provider-catalog.md that
contains: •	which adapter mode to use •	what config keys to set •	what external documentation the
developer should consult for their provider's auth setup •	any provider-specific quirks (header
format, claim naming, etc.)

This catalog is the deliverable — not a bespoke adapter per provider.

⸻

22. Documentation requirements

22.1 Required documents

The repo MUST contain these documents:

README.md — project overview, quickstart (local run with no-auth and example data), link to all
other docs.

docs/quickstart.md — step-by-step guide from clone to running instance with example data.

docs/auth-modes.md — overview of all supported adapter modes, when to use each, and how they differ.

docs/adapter-authoring.md — guide for adding a new adapter: copy template, implement interface, add
config, add tests, add catalog entry.

docs/config-reference.md — complete reference of all config keys (core and per-adapter), their env
var names, defaults, and types.

docs/deployment.md — guide covering deployment to each example platform (Cloud Run, ECS, generic
Docker), referencing the deploy/ directory.

docs/provider-catalog.md — per-provider mapping to adapter mode, config, and external docs
references (see section 21.3).

CONTRIBUTING.md — how to contribute, with focus on the adapter contribution path.

docs/reasoning-middleware.md — guide for the optional LLM-assisted classification layer (see
RFC-AIW0013a).

22.2 Documentation standards

    •	Every doc MUST be reachable from the README.
    •	Every doc MUST be kept in sync with the code. A release MUST NOT ship if docs reference removed config keys or missing adapter modes.
    •	Docs MUST be written for a developer who has not seen the codebase before.

⸻

23. Build, CI, and release workflows

23.1 Required workflows

The project MUST include these GitHub Actions workflows (or equivalent CI/CD):

build — builds the project, runs linting, and produces the service binary/artifact. Triggered on
push to main and pull requests.

test — runs unit and integration tests for the core scrubber and all adapters. Triggered on push to
main and pull requests.

publish — builds and pushes the container image to the container registry. Triggered on tagged
releases.

release — creates a GitHub release with changelog, links to container image, and bundled example
files. Triggered on version tags.

23.2 Required scripts

    •	scripts/build.sh — build the project locally.
    •	scripts/run-local.sh — start the service locally with example data and no-auth adapter.
    •	scripts/release.sh — tag and push a release (or document the manual steps).

23.3 Validation

The test workflow MUST: •	run all unit tests •	run all adapter tests •	validate that example config
files parse correctly •	validate that example index and policy files load correctly

23.4 Smoke test

The CI pipeline MUST include a smoke test that: 1.	builds the container image 2.	starts the
container with example data and no-auth adapter 3.	sends a POST /sanitize request 4.	verifies the
response contains a sanitized payload

This ensures the built artifact is functional before release.

⸻

Changelog

Sections modified: •	Section 1 (Objective): added portability and vendor-neutrality requirement.
•	Section 2 (Scope): expanded "defines" list to include adapter architecture, config, repo
structure, release, docs, and CI. Adjusted "does not define" to remove deployment topology (now
partially covered) and RBAC caveat. •	Section 3 (Design decisions): added 3.7 — vendor-neutral
identity via adapter layer. •	Section 4.1 (Authentication model): replaced IAP-specific model with
adapter-based model. Defined the normalized identity contract inline. •	Section 7.1 (Rule
selection): replaced "IAP identity attributes" with "normalized identity object produced by the
active adapter." •	Section 10 (Modules): updated policy-engine (10.5) and http-api (10.7) to
reference adapter. Added identity-adapter (10.9), adapter implementations (10.10), and config-loader
(10.11). •	Section 12 (Implementation order): added adapter and config steps. •	Section 13 (Final
shape): updated to reflect adapter, config, and container model.

Cross-references added: •	Section 2 (Scope): added reference to RFC-AIW0013a for reasoning
middleware. •	Section 6.4 (Unknowns): added note on optional reasoning middleware processing.
•	Section 18 (Repo structure): added .env.template and reasoning-middleware.md. •	Section 22
(Documentation): added reasoning-middleware.md to required docs list.

Sections added: •	Section 14: Identity adapter architecture. •	Section 15: Supported adapter modes.
•	Section 16: Adapter template and extension. •	Section 17: Configuration model. •	Section 18: Repo
structure. •	Section 19: Release and packaging. •	Section 20: Deployment UX. •	Section 21: Provider
mapping. •	Section 22: Documentation requirements. •	Section 23: Build, CI, and release workflows.

⸻

Assumptions •	The normalized identity contract (user, groups, attributes) is sufficient for all
policy predicates the scrubber currently supports. No additional identity fields were added beyond
what the existing policy match predicates (users_any, groups_any) require, plus a generic attributes
map for extensibility. •	The adapter interface is intentionally language-agnostic. The RFC describes
the logical contract, not a language-specific interface definition, to avoid forcing a technology
choice. •	The four initial adapter modes (trusted-header, oidc-jwt, api-key, no-auth) cover all
providers listed in the requirements via configuration differences, not code differences. No
vendor-specific adapter code is required at launch. •	The config surface uses a SCRUBBER_ prefix for
all environment variables. This prefix was chosen for clarity but is not load-bearing — it can be
changed during implementation. •	The repo structure assumes a single-language implementation. If the
project uses multiple languages, the src/ layout would need adjustment, but the logical module
boundaries remain the same. •	Container registry choice is left to the implementation. The RFC
requires a published image but does not mandate a specific registry. •	The smoke test in CI is a
container-level integration test, not a full end-to-end test with a real identity provider. Real
provider testing is expected to happen in staging or manual validation.
