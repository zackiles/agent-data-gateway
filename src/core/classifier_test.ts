import { assertEquals } from '@std/assert';
import { classify, findInline } from './classifier.ts';
import type { CompiledIndex, LeafNode } from './types.ts';

function makeIndex(overrides: Partial<CompiledIndex> = {}): CompiledIndex {
  return {
    version: 1,
    path_classes: {},
    key_classes: {},
    detectors: [],
    ...overrides,
  };
}

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

Deno.test('classify - path match wins first', () => {
  const index = makeIndex({
    path_classes: { '/customer/email': { class: 'pii.email', confidence: 0.99, count: 10 } },
    key_classes: { email: { class: 'pii.email', confidence: 0.97, count: 5 } },
  });
  const node = makeNode({
    path: '/customer/email',
    normalizedPath: '/customer/email',
    key: 'email',
    value: 'a@b.com',
  });
  const result = classify(node, index);
  assertEquals(result?.source, 'path');
  assertEquals(result?.confidence, 0.99);
});

Deno.test('classify - key match when no path match', () => {
  const index = makeIndex({
    key_classes: { emailAddress: { class: 'pii.email', confidence: 0.97, count: 5 } },
  });
  const node = makeNode({
    path: '/user/emailAddress',
    normalizedPath: '/user/emailAddress',
    key: 'emailAddress',
    value: 'a@b.com',
  });
  const result = classify(node, index);
  assertEquals(result?.source, 'key');
  assertEquals(result?.class, 'pii.email');
});

Deno.test('classify - fullmatch detector', () => {
  const index = makeIndex({
    detectors: [{
      id: 'email.full',
      class: 'pii.email',
      mode: 'fullmatch',
      pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
      confidence: 0.98,
      regex: new RegExp('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$', 'i'),
    }],
  });
  const node = makeNode({ value: 'jane@example.com' });
  const result = classify(node, index);
  assertEquals(result?.source, 'detector');
  assertEquals(result?.class, 'pii.email');
});

Deno.test('classify - returns null when nothing matches', () => {
  const index = makeIndex();
  const node = makeNode({ value: 'hello world' });
  assertEquals(classify(node, index), null);
});

Deno.test('classify - tied confidence different classes returns null', () => {
  const index = makeIndex({
    detectors: [
      {
        id: 'a',
        class: 'type.a',
        mode: 'fullmatch',
        pattern: '^.*$',
        confidence: 0.9,
        regex: /^.*$/,
      },
      {
        id: 'b',
        class: 'type.b',
        mode: 'fullmatch',
        pattern: '^.*$',
        confidence: 0.9,
        regex: /^.*$/,
      },
    ],
  });
  const node = makeNode({ value: 'ambiguous' });
  assertEquals(classify(node, index), null);
});

Deno.test('findInline - finds phone in text', () => {
  const index = makeIndex({
    detectors: [{
      id: 'phone.contains',
      class: 'pii.phone',
      mode: 'contains',
      pattern: '\\b(?:\\+?1[-. ]?)?\\(?\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}\\b',
      confidence: 0.92,
      regex: new RegExp(
        '\\b(?:\\+?1[-. ]?)?\\(?\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}\\b',
        'ig',
      ),
    }],
  });
  const node = makeNode({ value: 'Call 416-555-0199 now' });
  const findings = findInline(node, index);
  assertEquals(findings.length, 1);
  assertEquals(findings[0]!.class, 'pii.phone');
  assertEquals(findings[0]!.source, 'detector-inline');
  assertEquals(findings[0]!.start, 5);
  assertEquals(findings[0]!.end, 17);
});

Deno.test('findInline - returns empty for non-string', () => {
  const index = makeIndex({
    detectors: [{
      id: 'phone.contains',
      class: 'pii.phone',
      mode: 'contains',
      pattern: '\\d+',
      confidence: 0.9,
      regex: /\d+/g,
    }],
  });
  const node = makeNode({ value: 42 });
  assertEquals(findInline(node, index), []);
});
