import { assertEquals, assertRejects } from '@std/assert';
import { compileIndexFromRaw, loadIndex, loadPolicy } from './mod.ts';

Deno.test('compileIndexFromRaw - compiles detectors', () => {
  const compiled = compileIndexFromRaw({
    version: 1,
    path_classes: {},
    key_classes: {},
    detectors: [
      {
        id: 'email.full',
        class: 'pii.email',
        mode: 'fullmatch',
        pattern: '(?i)^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$',
        confidence: 0.98,
      },
    ],
  });
  assertEquals(compiled.detectors.length, 1);
  assertEquals(compiled.detectors[0]!.regex.test('jane@example.com'), true);
  assertEquals(compiled.detectors[0]!.regex.test('not-an-email'), false);
});

Deno.test('compileIndexFromRaw - throws on invalid detector mode', () => {
  try {
    compileIndexFromRaw({
      version: 1,
      path_classes: {},
      key_classes: {},
      detectors: [
        { id: 'bad', class: 'x', mode: 'invalid' as 'fullmatch', pattern: '.*', confidence: 0.5 },
      ],
    });
    throw new Error('should have thrown');
  } catch (e) {
    assertEquals((e as Error).message.includes('fullmatch'), true);
  }
});

Deno.test('loadIndex - rejects missing file', async () => {
  await assertRejects(() => loadIndex('/nonexistent/index.json'));
});

Deno.test('loadPolicy - rejects missing file', async () => {
  await assertRejects(() => loadPolicy('/nonexistent/policy.json'));
});
