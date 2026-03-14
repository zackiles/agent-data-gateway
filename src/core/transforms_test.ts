import { assertEquals } from '@std/assert';
import { allow, hash, last4, mask, maskInline, toNull, yearOnly } from './transforms.ts';

Deno.test('allow - returns value unchanged', () => {
  assertEquals(allow('hello'), 'hello');
  assertEquals(allow(42), 42);
  assertEquals(allow(null), null);
});

Deno.test('toNull - returns null', () => {
  assertEquals(toNull(), null);
});

Deno.test('mask - email', () => {
  assertEquals(mask('jane@example.com', 'pii.email'), 'j***@example.com');
  assertEquals(mask('a@b.com', 'pii.email'), 'a***@b.com');
});

Deno.test('mask - phone', () => {
  assertEquals(mask('416-555-0199', 'pii.phone'), '***-***-0199');
  assertEquals(mask('4165550199', 'pii.phone'), '******0199');
});

Deno.test('mask - generic string', () => {
  assertEquals(mask('secret', undefined), 's***t');
  assertEquals(mask('AB', undefined), '***');
  assertEquals(mask('abc', undefined), '***');
  assertEquals(mask('abcd', undefined), 'a***d');
});

Deno.test('mask - numbers and booleans return null', () => {
  assertEquals(mask(42, undefined), null);
  assertEquals(mask(true, undefined), null);
});

Deno.test('maskInline - replaces spans', () => {
  const result = maskInline('Call me at 416-555-0199 please', [
    { class: 'pii.phone', source: 'detector-inline', confidence: 0.92, start: 11, end: 23 },
  ]);
  assertEquals(result, 'Call me at *** please');
});

Deno.test('maskInline - multiple non-overlapping', () => {
  const result = maskInline('a@b.com and 555-1234', [
    { class: 'pii.email', source: 'detector-inline', confidence: 0.95, start: 0, end: 7 },
    { class: 'pii.phone', source: 'detector-inline', confidence: 0.92, start: 12, end: 20 },
  ]);
  assertEquals(result, '*** and ***');
});

Deno.test('last4 - SSN', () => {
  assertEquals(last4('123-45-6789'), '***-**-6789');
});

Deno.test('last4 - PAN', () => {
  assertEquals(last4('4111111111111111'), '************1111');
});

Deno.test('last4 - short string unchanged', () => {
  assertEquals(last4('abcd'), 'abcd');
});

Deno.test('yearOnly - ISO date', () => {
  assertEquals(yearOnly('1988-07-20'), '1988');
});

Deno.test('yearOnly - slash date', () => {
  assertEquals(yearOnly('1988/07/20'), '1988');
});

Deno.test('yearOnly - unparseable returns null', () => {
  assertEquals(yearOnly('not-a-date'), null);
});

Deno.test('hash - produces hex SHA-256', async () => {
  const result = await hash('hello');
  assertEquals(result.length, 64);
  assertEquals(typeof result, 'string');
  assertEquals(result, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});
