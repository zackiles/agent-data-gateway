import type { Identity } from '../../core/types.ts';
import type { Adapter } from '../../identity/mod.ts';

export type TemplateOptions = Record<string, string>;

export function create(_options: TemplateOptions): Adapter {
  return {
    extract(_request: Request): Identity {
      // TODO: extract auth context from the request and return an Identity
      throw new Error('Template adapter not implemented — copy this and fill in your logic');
    },
  };
}
