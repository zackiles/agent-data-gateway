# Provider Catalog

Provider-to-adapter mapping. Use this to choose an adapter and config for your auth provider.

| Provider | Adapter | Config keys | External docs | Quirks |
|----------|---------|-------------|---------------|--------|
| GCP IAP | trusted-header | `SCRUBBER_HEADER_USER=X-Goog-Authenticated-User-Email`, `SCRUBBER_HEADER_GROUPS` if using IAP + groups | [IAP headers](https://cloud.google.com/iap/docs/signed-headers-howto) | IAP sets `X-Goog-Authenticated-User-*`; parse email from header value |
| GCP Cloud Run | oidc-jwt | `SCRUBBER_JWT_ISSUER`, `SCRUBBER_JWT_AUDIENCE`, `SCRUBBER_JWT_JWKS_URL` | [Cloud Run auth](https://cloud.google.com/run/docs/authenticating/service-to-service) | Use the OIDC issuer URL for your service |
| AWS ALB | trusted-header | `SCRUBBER_HEADER_USER`, `SCRUBBER_HEADER_GROUPS` | [ALB auth](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html) | ALB can forward Cognito/OIDC claims as headers |
| AWS API Gateway + Cognito | oidc-jwt | `SCRUBBER_JWT_ISSUER`, `SCRUBBER_JWT_AUDIENCE`, `SCRUBBER_JWT_JWKS_URL` | [Cognito JWKS](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html) | JWKS URL: `https://cognito-idp.{region}.amazonaws.com/{poolId}/.well-known/jwks.json` |
| Okta | oidc-jwt | `SCRUBBER_JWT_ISSUER`, `SCRUBBER_JWT_AUDIENCE`, `SCRUBBER_JWT_JWKS_URL`, `SCRUBBER_JWT_USER_CLAIM`, `SCRUBBER_JWT_GROUPS_CLAIM` | [Okta JWKS](https://developer.okta.com/docs/reference/api/oidc/#get-keys) | Issuer: `https://{domain}/oauth2/default`; groups claim often `groups` |
| Auth0 | oidc-jwt | Same as Okta | [Auth0 JWKS](https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-key-sets) | Issuer: `https://{tenant}.auth0.com/` |
| PingFederate | oidc-jwt | Same as Okta | [PingFederate OIDC](https://docs.pingidentity.com/bundle/pingfederate-103/page/lyc1563915049062.html) | JWKS at `{base}/as/token.oauth2/jwks` |
| Azure AD / Entra ID | oidc-jwt | Same as Okta | [Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) | Issuer: `https://login.microsoftonline.com/{tenant}/v2.0`; groups may be in `groups` or custom claim |
| Nginx | trusted-header | `SCRUBBER_HEADER_USER`, `SCRUBBER_HEADER_GROUPS` | [Nginx auth](https://nginx.org/en/docs/http/ngx_http_auth_request_module.html) | Set headers in auth_request subrequest |
| Envoy | trusted-header | Same as Nginx | [Envoy ext_authz](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/ext_authz_filter) | Auth service sets `x-envoy-auth-*` or custom headers |
| Traefik | trusted-header | Same as Nginx | [Traefik forward auth](https://doc.traefik.io/traefik/middlewares/http/forwardauth/) | Forward auth middleware sets headers |
| Kong | trusted-header | Same as Nginx | [Kong auth](https://docs.konghq.com/gateway/latest/plugins/request-transformer/) | JWT/OIDC plugins can forward claims as headers |
| Service-to-service | api-key | `SCRUBBER_APIKEY_HEADER`, `SCRUBBER_APIKEY_MAP_FILE` | - | Key map maps each key to `{user, groups}` |
| Local dev | no-auth | `SCRUBBER_NOAUTH_USER`, `SCRUBBER_NOAUTH_GROUPS` | - | No auth; static identity |
