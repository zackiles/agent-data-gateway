import { assertEquals } from '@std/assert';
import { create } from './mod.ts';

Deno.test('no-auth - returns static identity', () => {
  const adapter = create({ user: 'dev-user', groups: ['admin'] });
  const identity = adapter.extract(new Request('http://localhost'));
  assertEquals(identity, { user: 'dev-user', groups: ['admin'], attributes: {} });
});

Deno.test('no-auth - same identity on every request', () => {
  const adapter = create({ user: 'test', groups: [] });
  const a = adapter.extract(new Request('http://localhost/a'));
  const b = adapter.extract(new Request('http://localhost/b'));
  assertEquals(a, b);
});
