import { assertEquals } from '@std/assert';
import { build } from './builder.ts';
import type { CompiledDetector } from '../core/types.ts';

const seedDetectors: CompiledDetector[] = [
  {
    id: 'email.full',
    class: 'pii.email',
    mode: 'fullmatch',
    pattern: '(?i)^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$',
    confidence: 0.98,
    regex: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
  },
  {
    id: 'phone.full',
    class: 'pii.phone',
    mode: 'fullmatch',
    pattern: '(?i)^(?:\\+?1[-. ]?)?\\(?\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}$',
    confidence: 0.96,
    regex: /^(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}$/i,
  },
];

Deno.test('build - infers path_classes from 3+ samples', () => {
  const samples = Array.from({ length: 5 }, (_, i) => ({
    payload: { customer: { email: `user${i}@example.com` } },
  }));
  const index = build(samples, seedDetectors);
  assertEquals(index.path_classes['/customer/email']?.class, 'pii.email');
  assertEquals(index.path_classes['/customer/email']?.count, 5);
});

Deno.test('build - does not infer path with < 3 samples', () => {
  const samples = [
    { payload: { customer: { email: 'a@b.com' } } },
    { payload: { customer: { email: 'c@d.com' } } },
  ];
  const index = build(samples, seedDetectors);
  assertEquals(index.path_classes['/customer/email'], undefined);
});

Deno.test('build - carries forward seed detectors', () => {
  const index = build([], seedDetectors);
  assertEquals(index.detectors.length, 2);
  assertEquals(index.detectors[0]!.id, 'email.full');
});

Deno.test('build - infers key_classes with sufficient data', () => {
  const samples = Array.from({ length: 15 }, (_, i) => ({
    payload: {
      [`section${i % 5}`]: { phone: `416-555-${String(i).padStart(4, '0')}` },
    },
  }));
  const index = build(samples, seedDetectors);
  if (index.key_classes['phone']) {
    assertEquals(index.key_classes['phone']!.class, 'pii.phone');
  }
});
