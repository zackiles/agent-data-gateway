import { assertEquals, assertThrows } from '@std/assert';
import { create } from './mod.ts';

const adapter = create({
  userHeader: 'X-Forwarded-User',
  groupsHeader: 'X-Forwarded-Groups',
  groupsSeparator: ',',
});

Deno.test('trusted-header - extracts user and groups', async () => {
  const req = new Request('http://localhost', {
    headers: {
      'X-Forwarded-User': 'jane@example.com',
      'X-Forwarded-Groups': 'support,tier-2',
    },
  });
  const identity = await adapter.extract(req);
  assertEquals(identity.user, 'jane@example.com');
  assertEquals(identity.groups, ['support', 'tier-2']);
});

Deno.test('trusted-header - throws on missing user header', () => {
  const req = new Request('http://localhost');
  assertThrows(() => adapter.extract(req) as never, Error, 'Missing required header');
});

Deno.test('trusted-header - empty groups when header missing', async () => {
  const req = new Request('http://localhost', {
    headers: { 'X-Forwarded-User': 'bob' },
  });
  const identity = await adapter.extract(req);
  assertEquals(identity.groups, []);
});
