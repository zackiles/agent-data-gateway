import type { Config } from '../core/types.ts';
import type { Adapter } from '../identity/mod.ts';
import { create as createNoAuth } from './no-auth/mod.ts';
import { create as createTrustedHeader } from './trusted-header/mod.ts';
import { create as createOidcJwt } from './oidc-jwt/mod.ts';
import { create as createApiKey, loadKeyMap } from './api-key/mod.ts';

export async function load(config: Config): Promise<Adapter> {
  switch (config.adapter) {
    case 'no-auth':
      return createNoAuth({
        user: Deno.env.get('SCRUBBER_NOAUTH_USER') ?? config.adapterConfig.user ?? 'local-dev',
        groups: (Deno.env.get('SCRUBBER_NOAUTH_GROUPS') ?? config.adapterConfig.groups ?? '')
          .split(',').map((g) => g.trim()).filter(Boolean),
      });

    case 'trusted-header':
      return createTrustedHeader({
        userHeader: Deno.env.get('SCRUBBER_HEADER_USER') ??
          config.adapterConfig.user_header ?? 'X-Forwarded-User',
        groupsHeader: Deno.env.get('SCRUBBER_HEADER_GROUPS') ??
          config.adapterConfig.groups_header ?? 'X-Forwarded-Groups',
        groupsSeparator: Deno.env.get('SCRUBBER_HEADER_GROUPS_SEPARATOR') ??
          config.adapterConfig.groups_separator ?? ',',
      });

    case 'oidc-jwt': {
      const issuer = Deno.env.get('SCRUBBER_JWT_ISSUER') ?? config.adapterConfig.issuer;
      const audience = Deno.env.get('SCRUBBER_JWT_AUDIENCE') ?? config.adapterConfig.audience;
      const jwksUrl = Deno.env.get('SCRUBBER_JWT_JWKS_URL') ?? config.adapterConfig.jwks_url;
      if (!issuer || !audience || !jwksUrl) {
        throw new Error(
          'oidc-jwt adapter requires SCRUBBER_JWT_ISSUER, SCRUBBER_JWT_AUDIENCE, and SCRUBBER_JWT_JWKS_URL',
        );
      }
      return createOidcJwt({
        issuer,
        audience,
        jwksUrl,
        userClaim: Deno.env.get('SCRUBBER_JWT_USER_CLAIM') ??
          config.adapterConfig.user_claim ?? 'sub',
        groupsClaim: Deno.env.get('SCRUBBER_JWT_GROUPS_CLAIM') ??
          config.adapterConfig.groups_claim ?? 'groups',
      });
    }

    case 'api-key': {
      const header = Deno.env.get('SCRUBBER_APIKEY_HEADER') ??
        config.adapterConfig.header ?? 'X-API-Key';
      const mapFile = Deno.env.get('SCRUBBER_APIKEY_MAP_FILE') ??
        config.adapterConfig.map_file;
      if (!mapFile) {
        throw new Error('api-key adapter requires SCRUBBER_APIKEY_MAP_FILE');
      }
      const keyMap = await loadKeyMap(mapFile);
      return createApiKey({ header, keyMap });
    }

    default:
      throw new Error(
        `Unknown adapter mode: "${config.adapter}". Supported: no-auth, trusted-header, oidc-jwt, api-key`,
      );
  }
}
