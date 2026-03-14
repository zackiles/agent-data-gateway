# Adapter Authoring

Guide for adding a new identity adapter.

## 1. Copy the template

```bash
cp -r src/adapters/_template src/adapters/my-provider
```

## 2. Implement extract

In `src/adapters/my-provider/mod.ts`, implement the `extract(request)` function. It must return an `Identity`:

```typescript
import type { Identity } from '../../core/types.ts';
import type { Adapter } from '../../identity/mod.ts';

export interface MyProviderOptions {
  userHeader: string;
  groupsHeader?: string;
}

export function create(options: MyProviderOptions): Adapter {
  return {
    extract(request: Request): Identity {
      const user = request.headers.get(options.userHeader);
      if (!user) throw new Error(`Missing header: ${options.userHeader}`);
      const groups = options.groupsHeader
        ? (request.headers.get(options.groupsHeader) ?? '').split(',').map((g) => g.trim()).filter(Boolean)
        : [];
      return { user, groups, attributes: {} };
    },
  };
}
```

**Contract:**

- Return an `Identity` with at least `user` populated
- Throw a clear `Error` when auth material is missing or invalid
- Do not import from `src/core/` except types
- Do not mutate the request body
- Be stateless per-request

## 3. Add config consumption

In `src/adapters/mod.ts`, add a case for your adapter in the `load` switch:

```typescript
case 'my-provider': {
  const userHeader = Deno.env.get('SCRUBBER_MYPROVIDER_USER_HEADER') ??
    config.adapterConfig.user_header ?? 'X-User';
  const groupsHeader = Deno.env.get('SCRUBBER_MYPROVIDER_GROUPS_HEADER') ??
    config.adapterConfig.groups_header;
  return createMyProvider({ userHeader, groupsHeader });
}
```

Config can come from env vars or from the `SCRUBBER_CONFIG` JSON file under an adapter-named section:

```json
{
  "adapter": "my-provider",
  "my-provider": {
    "user_header": "X-User",
    "groups_header": "X-Groups"
  }
}
```

## 4. Register in mod.ts

Add the import and case as shown above. The `default` branch throws for unknown adapters; your adapter name must match the `config.adapter` value.

## 5. Add tests

Create `src/adapters/my-provider/mod_test.ts` with tests for:

- Success: valid request returns correct identity
- Missing auth: throws with clear message
- Invalid auth: throws with clear message
- Group extraction: groups parsed correctly when present

## 6. Add provider-catalog entry

Add a row to [docs/provider-catalog.md](provider-catalog.md) describing when to use this adapter, which config keys to set, and any quirks.
