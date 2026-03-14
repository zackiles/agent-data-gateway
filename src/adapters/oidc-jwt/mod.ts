import type { Identity } from '../../core/types.ts';
import type { Adapter } from '../../identity/mod.ts';
import * as jose from 'jose';

export interface OidcJwtOptions {
  issuer: string;
  audience: string;
  jwksUrl: string;
  userClaim: string;
  groupsClaim: string;
}

export function create(options: OidcJwtOptions): Adapter {
  const jwks = jose.createRemoteJWKSet(new URL(options.jwksUrl));

  return {
    async extract(request: Request): Promise<Identity> {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) {
        throw new Error('Missing or invalid Authorization header (expected Bearer token)');
      }
      const token = auth.slice(7);

      const { payload } = await jose.jwtVerify(token, jwks, {
        issuer: options.issuer,
        audience: options.audience,
      });

      const user = payload[options.userClaim];
      if (typeof user !== 'string' || !user) {
        throw new Error(`JWT missing claim "${options.userClaim}" for user identity`);
      }

      const groupsRaw = payload[options.groupsClaim];
      const groups = Array.isArray(groupsRaw)
        ? groupsRaw.filter((g): g is string => typeof g === 'string')
        : [];

      const attributes: Record<string, string> = {};
      for (const [k, v] of Object.entries(payload)) {
        if (k !== options.userClaim && k !== options.groupsClaim && typeof v === 'string') {
          attributes[k] = v;
        }
      }

      return { user, groups, attributes };
    },
  };
}
