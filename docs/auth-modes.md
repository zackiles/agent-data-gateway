# Auth Modes

The Agent Data Gateway uses pluggable identity adapters. Choose one based on your deployment.

## no-auth

**When to use:** Local development, demos, or environments where identity is not enforced.

**Config keys:**

| Env var | Default | Description |
|---------|---------|-------------|
| `SCRUBBER_NOAUTH_USER` | `local-dev` | Static user ID |
| `SCRUBBER_NOAUTH_GROUPS` | (empty) | Comma-separated groups |

**Example:** `SCRUBBER_NOAUTH_USER=alice SCRUBBER_NOAUTH_GROUPS=support,admin`

---

## trusted-header

**When to use:** A reverse proxy or API gateway authenticates users and sets headers. The gateway trusts these headers.

**Config keys:**

| Env var | Default | Description |
|---------|---------|-------------|
| `SCRUBBER_HEADER_USER` | `X-Forwarded-User` | Header containing user ID |
| `SCRUBBER_HEADER_GROUPS` | `X-Forwarded-Groups` | Header containing groups |
| `SCRUBBER_HEADER_GROUPS_SEPARATOR` | `,` | Delimiter for groups |

**Example:** GCP IAP sets `X-Goog-Authenticated-User-Email`. Use `SCRUBBER_HEADER_USER=X-Goog-Authenticated-User-Email`.

---

## oidc-jwt

**When to use:** Bearer JWTs from OIDC providers (Okta, Auth0, Azure AD, Cognito, etc.). The gateway validates the JWT and extracts user/groups from claims.

**Config keys:**

| Env var | Default | Required | Description |
|---------|---------|----------|-------------|
| `SCRUBBER_JWT_ISSUER` | - | yes | JWT issuer (e.g. `https://your-tenant.okta.com`) |
| `SCRUBBER_JWT_AUDIENCE` | - | yes | Expected audience |
| `SCRUBBER_JWT_JWKS_URL` | - | yes | JWKS URL for signature verification |
| `SCRUBBER_JWT_USER_CLAIM` | `sub` | no | Claim for user ID |
| `SCRUBBER_JWT_GROUPS_CLAIM` | `groups` | no | Claim for groups (array) |

**Example:** `SCRUBBER_JWT_ISSUER=https://accounts.google.com SCRUBBER_JWT_AUDIENCE=my-service SCRUBBER_JWT_JWKS_URL=https://www.googleapis.com/oauth2/v3/certs`

---

## api-key

**When to use:** Service-to-service calls. Each API key maps to a fixed identity (user + groups).

**Config keys:**

| Env var | Default | Required | Description |
|---------|---------|----------|-------------|
| `SCRUBBER_APIKEY_HEADER` | `X-API-Key` | no | Header containing the key |
| `SCRUBBER_APIKEY_MAP_FILE` | - | yes | Path to JSON file mapping keys to identities |

**Key map format:**

```json
{
  "key-abc123": {"user": "service-a", "groups": ["internal"]},
  "key-xyz789": {"user": "service-b", "groups": ["admin"]}
}
```

**Example:** `SCRUBBER_APIKEY_HEADER=X-API-Key SCRUBBER_APIKEY_MAP_FILE=/secrets/apikeys.json`
