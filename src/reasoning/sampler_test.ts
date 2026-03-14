import { assertEquals } from '@std/assert';
import { sample } from './sampler.ts';
import type { LeafNode } from '../core/types.ts';

function makeNode(overrides: Partial<LeafNode> = {}): LeafNode {
  return {
    path: '/test',
    normalizedPath: '/test',
    key: 'test',
    value: 'value',
    parent: {},
    parentKey: 'test',
    ...overrides,
  };
}

Deno.test('sample - groups by normalized path', () => {
  const unknowns: LeafNode[] = [
    makeNode({ path: '/items/0/code', normalizedPath: '/items/*/code', key: 'code', value: 'A1' }),
    makeNode({ path: '/items/1/code', normalizedPath: '/items/*/code', key: 'code', value: 'B2' }),
  ];
  const result = sample(unknowns, 50);
  assertEquals(result.sample_count, 1);
  assertEquals(result.total_unknown_nodes, 2);
  assertEquals(result.samples[0]!.key, 'code');
});

Deno.test('sample - deduplicates by key+type', () => {
  const unknowns: LeafNode[] = [
    makeNode({ path: '/a/name', normalizedPath: '/a/name', key: 'name', value: 'Alice' }),
    makeNode({ path: '/b/name', normalizedPath: '/b/name', key: 'name', value: 'Bob' }),
  ];
  const result = sample(unknowns, 50);
  assertEquals(result.sample_count, 1);
  assertEquals(result.samples[0]!.all_paths.length, 2);
});

Deno.test('sample - caps at maxSamples', () => {
  const unknowns = Array.from({ length: 100 }, (_, i) =>
    makeNode({
      path: `/field${i}`,
      normalizedPath: `/field${i}`,
      key: `field${i}`,
      value: `val${i}`,
    })
  );
  const result = sample(unknowns, 10);
  assertEquals(result.sample_count, 10);
});

Deno.test('sample - truncates string values to 64 chars', () => {
  const longString = 'x'.repeat(200);
  const unknowns = [makeNode({ value: longString })];
  const result = sample(unknowns, 50);
  assertEquals((result.samples[0]!.value_sample as string).length, 64);
  assertEquals(result.samples[0]!.value_length, 200);
});
