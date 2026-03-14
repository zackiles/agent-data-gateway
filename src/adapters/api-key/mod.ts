import type { Identity } from '../../core/types.ts';
import type { Adapter } from '../../identity/mod.ts';

export interface ApiKeyOptions {
  header: string;
  keyMap: Record<string, Identity>;
}

export function create(options: ApiKeyOptions): Adapter {
  return {
    extract(request: Request): Identity {
      const key = request.headers.get(options.header);
      if (!key) {
        throw new Error(`Missing required header: ${options.header}`);
      }
      const identity = options.keyMap[key];
      if (!identity) {
        throw new Error(`Unknown API key`);
      }
      return identity;
    },
  };
}

export async function loadKeyMap(path: string): Promise<Record<string, Identity>> {
  const text = await Deno.readTextFile(path);
  return JSON.parse(text) as Record<string, Identity>;
}
