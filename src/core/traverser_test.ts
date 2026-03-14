import { assertEquals } from '@std/assert';
import { apply, normalizePath, traverse } from './traverser.ts';

Deno.test('normalizePath - replaces array indices with *', () => {
  assertEquals(normalizePath('/orders/0/email'), '/orders/*/email');
  assertEquals(normalizePath('/a/1/b/2/c'), '/a/*/b/*/c');
  assertEquals(normalizePath('/items/0'), '/items/*');
});

Deno.test('normalizePath - leaves non-indexed paths unchanged', () => {
  assertEquals(normalizePath('/customer/email'), '/customer/email');
});

Deno.test('traverse - flat object', () => {
  const nodes = [...traverse({ name: 'Jane', age: 30 })];
  assertEquals(nodes.length, 2);
  assertEquals(nodes[0]!.path, '/name');
  assertEquals(nodes[0]!.key, 'name');
  assertEquals(nodes[0]!.value, 'Jane');
  assertEquals(nodes[1]!.path, '/age');
  assertEquals(nodes[1]!.value, 30);
});

Deno.test('traverse - nested object', () => {
  const nodes = [...traverse({ customer: { email: 'a@b.com' } })];
  assertEquals(nodes.length, 1);
  assertEquals(nodes[0]!.path, '/customer/email');
  assertEquals(nodes[0]!.normalizedPath, '/customer/email');
});

Deno.test('traverse - array normalization', () => {
  const payload = { orders: [{ email: 'a@b.com' }, { email: 'c@d.com' }] };
  const nodes = [...traverse(payload)];
  assertEquals(nodes.length, 2);
  assertEquals(nodes[0]!.path, '/orders/0/email');
  assertEquals(nodes[0]!.normalizedPath, '/orders/*/email');
  assertEquals(nodes[1]!.path, '/orders/1/email');
  assertEquals(nodes[1]!.normalizedPath, '/orders/*/email');
});

Deno.test('traverse - null values', () => {
  const nodes = [...traverse({ a: null })];
  assertEquals(nodes.length, 1);
  assertEquals(nodes[0]!.value, null);
});

Deno.test('apply - drop removes fields', () => {
  const result = apply({ a: 1, b: 2, c: 3 }, [{ path: '/b', action: 'drop' }]);
  assertEquals(result, { a: 1, c: 3 });
});

Deno.test('apply - drop from array', () => {
  const result = apply({ items: [1, 2, 3] }, [{ path: '/items/1', action: 'drop' }]);
  assertEquals(result, { items: [1, 3] });
});

Deno.test('apply - allow passes through', () => {
  const result = apply({ a: 1 }, [{ path: '/a', action: 'allow' }]);
  assertEquals(result, { a: 1 });
});

Deno.test('apply - replaces value', () => {
  const result = apply({ a: 'secret' }, [{ path: '/a', action: 'mask', value: 's***t' }]);
  assertEquals(result, { a: 's***t' });
});
