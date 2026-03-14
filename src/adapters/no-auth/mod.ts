import type { Identity } from '../../core/types.ts';
import type { Adapter } from '../../identity/mod.ts';

export interface NoAuthOptions {
  user: string;
  groups: string[];
}

export function create(options: NoAuthOptions): Adapter {
  const identity: Identity = {
    user: options.user,
    groups: options.groups,
    attributes: {},
  };
  return {
    extract: () => identity,
  };
}
