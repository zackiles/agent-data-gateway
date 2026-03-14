import type { Identity } from '../../core/types.ts';
import type { Adapter } from '../../identity/mod.ts';

export interface TrustedHeaderOptions {
  userHeader: string;
  groupsHeader: string;
  groupsSeparator: string;
}

export function create(options: TrustedHeaderOptions): Adapter {
  return {
    extract(request: Request): Identity {
      const user = request.headers.get(options.userHeader);
      if (!user) {
        throw new Error(`Missing required header: ${options.userHeader}`);
      }
      const groupsRaw = request.headers.get(options.groupsHeader) ?? '';
      const groups = groupsRaw
        ? groupsRaw.split(options.groupsSeparator).map((g) => g.trim()).filter(Boolean)
        : [];

      return { user, groups, attributes: {} };
    },
  };
}
