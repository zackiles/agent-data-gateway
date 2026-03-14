import type { Identity } from '../core/types.ts';

export interface Adapter {
  extract(request: Request): Promise<Identity> | Identity;
}

export function validateIdentity(identity: Identity): Identity {
  if (!identity.user || typeof identity.user !== 'string') {
    throw new Error('Identity must have a non-empty user string');
  }
  return {
    user: identity.user,
    groups: Array.isArray(identity.groups) ? identity.groups : [],
    attributes: identity.attributes && typeof identity.attributes === 'object'
      ? identity.attributes
      : {},
  };
}
