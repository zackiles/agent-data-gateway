import { assertEquals, assertThrows } from '@std/assert';
import { create } from './mod.ts';

const adapter = create({
  header: 'X-API-Key',
  keyMap: {
    'key-123': { user: 'service-a', groups: ['internal'], attributes: {} },
  },
});

Deno.test('api-key - resolves known key', async () => {
  const req = new Request('http://localhost', {
    headers: { 'X-API-Key': 'key-123' },
  });
  const identity = await adapter.extract(req);
  assertEquals(identity.user, 'service-a');
  assertEquals(identity.groups, ['internal']);
});

Deno.test('api-key - throws on missing header', () => {
  const req = new Request('http://localhost');
  assertThrows(() => adapter.extract(req) as never, Error, 'Missing required header');
});

Deno.test('api-key - throws on unknown key', () => {
  const req = new Request('http://localhost', {
    headers: { 'X-API-Key': 'bad-key' },
  });
  assertThrows(() => adapter.extract(req) as never, Error, 'Unknown API key');
});
