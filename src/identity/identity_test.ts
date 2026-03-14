import { assertEquals, assertThrows } from '@std/assert';
import { validateIdentity } from './mod.ts';

Deno.test('validateIdentity - valid identity passes through', () => {
  const identity = validateIdentity({
    user: 'jane@example.com',
    groups: ['support'],
    attributes: { department: 'cs' },
  });
  assertEquals(identity.user, 'jane@example.com');
  assertEquals(identity.groups, ['support']);
  assertEquals(identity.attributes.department, 'cs');
});

Deno.test('validateIdentity - defaults missing groups and attributes', () => {
  const identity = validateIdentity({
    user: 'bob',
    groups: undefined as unknown as string[],
    attributes: undefined as unknown as Record<string, string>,
  });
  assertEquals(identity.groups, []);
  assertEquals(identity.attributes, {});
});

Deno.test('validateIdentity - throws on missing user', () => {
  assertThrows(
    () => validateIdentity({ user: '', groups: [], attributes: {} }),
    Error,
    'non-empty user',
  );
});
