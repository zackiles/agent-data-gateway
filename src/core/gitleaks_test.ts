import { assertEquals, assertNotEquals } from '@std/assert';
import { detectors } from './gitleaks.ts';

Deno.test('detectors - returns non-empty array', () => {
  const d = detectors();
  assertNotEquals(d.length, 0);
});

Deno.test('detectors - all have required fields', () => {
  for (const d of detectors()) {
    assertNotEquals(d.id, '');
    assertNotEquals(d.class, '');
    assertNotEquals(d.pattern, '');
    assertEquals(typeof d.confidence, 'number');
    assertEquals(d.mode === 'fullmatch' || d.mode === 'contains', true);
  }
});

Deno.test('detectors - all IDs are unique', () => {
  const ids = detectors().map((d) => d.id);
  assertEquals(ids.length, new Set(ids).size);
});

Deno.test('detectors - all patterns compile', () => {
  for (const d of detectors()) {
    const flags = d.pattern.startsWith('(?i)') ? 'i' : '';
    const pattern = d.pattern.replace(/^\(\?i\)/, '');
    const regex = new RegExp(pattern, flags);
    assertEquals(regex instanceof RegExp, true);
  }
});

Deno.test('detectors - all use credentials.secret class', () => {
  for (const d of detectors()) {
    assertEquals(d.class, 'credentials.secret');
  }
});

function matches(id: string, value: string): boolean {
  const d = detectors().find((d) => d.id === id)!;
  const flags = d.pattern.startsWith('(?i)') ? 'i' : '';
  const pattern = d.pattern.replace(/^\(\?i\)/, '');
  return new RegExp(pattern, flags).test(value);
}

function fake(...parts: string[]): string {
  return parts.join('');
}

Deno.test('aws-access-key-id matches', () => {
  assertEquals(matches('gitleaks.aws-access-key-id', 'AKIAIOSFODNN7EXAMPLE'), true);
  assertEquals(matches('gitleaks.aws-access-key-id', 'not-a-key'), false);
});

Deno.test('github-pat matches', () => {
  assertEquals(matches('gitleaks.github-pat', 'ghp_ABCDEFghijklmnopqrstuvwxyz0123456789'), true);
  assertEquals(matches('gitleaks.github-pat', 'ghx_nope'), false);
});

Deno.test('gitlab-pat matches', () => {
  assertEquals(matches('gitleaks.gitlab-pat', 'glpat-xxxxxxxxxxxxxxxxxxxx'), true);
  assertEquals(matches('gitleaks.gitlab-pat', 'glpat-short'), false);
});

Deno.test('slack-bot-token matches', () => {
  assertEquals(
    matches(
      'gitleaks.slack-bot-token',
      fake('xoxb-', '1234567890-1234567890123-abcdefghijklmnopqrstuvwx'),
    ),
    true,
  );
  assertEquals(matches('gitleaks.slack-bot-token', 'xoxb-short'), false);
});

Deno.test('stripe-live-key matches', () => {
  assertEquals(
    matches('gitleaks.stripe-live-key', fake('sk_live_', 'abcdefghijklmnopqrstuvwx')),
    true,
  );
  assertEquals(matches('gitleaks.stripe-live-key', 'sk_live_short'), false);
});

Deno.test('google-api-key matches', () => {
  assertEquals(matches('gitleaks.google-api-key', 'AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe'), true);
  assertEquals(matches('gitleaks.google-api-key', 'notakey'), false);
});

Deno.test('sendgrid-api-key matches', () => {
  assertEquals(
    matches(
      'gitleaks.sendgrid-api-key',
      fake('SG.', 'abcdefghijklmnopqrstuv', '.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'),
    ),
    true,
  );
});

Deno.test('private-key matches', () => {
  assertEquals(matches('gitleaks.private-key', '-----BEGIN RSA PRIVATE KEY-----'), true);
  assertEquals(matches('gitleaks.private-key', '-----BEGIN PRIVATE KEY-----'), true);
  assertEquals(matches('gitleaks.private-key', '-----BEGIN EC PRIVATE KEY-----'), true);
  assertEquals(matches('gitleaks.private-key', '-----BEGIN PUBLIC KEY-----'), false);
});

Deno.test('npm-token matches', () => {
  assertEquals(matches('gitleaks.npm-token', 'npm_abcdefghijklmnopqrstuvwxyz0123456789'), true);
  assertEquals(matches('gitleaks.npm-token', 'npm_short'), false);
});

Deno.test('generic-api-key matches', () => {
  assertEquals(
    matches('gitleaks.generic-api-key', 'api_key=sk_abcdefghijklmnopqrst'),
    true,
  );
  assertEquals(
    matches('gitleaks.generic-api-key', 'secret_key: abcdefghijklmnopqrstuvwxyz'),
    true,
  );
});

Deno.test('password-in-url matches', () => {
  assertEquals(
    matches('gitleaks.password-in-url', 'https://user:p4ssw0rd@example.com/path'),
    true,
  );
  assertEquals(matches('gitleaks.password-in-url', 'https://example.com/path'), false);
});
