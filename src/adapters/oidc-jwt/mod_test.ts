import { assertRejects } from '@std/assert';
import { create } from './mod.ts';

Deno.test('oidc-jwt - rejects missing Authorization header', async () => {
  const adapter = create({
    issuer: 'https://example.com',
    audience: 'test',
    jwksUrl: 'https://example.com/.well-known/jwks.json',
    userClaim: 'sub',
    groupsClaim: 'groups',
  });
  const req = new Request('http://localhost');
  await assertRejects(
    () => Promise.resolve(adapter.extract(req)),
    Error,
    'Missing or invalid Authorization',
  );
});

Deno.test('oidc-jwt - rejects non-Bearer token', async () => {
  const adapter = create({
    issuer: 'https://example.com',
    audience: 'test',
    jwksUrl: 'https://example.com/.well-known/jwks.json',
    userClaim: 'sub',
    groupsClaim: 'groups',
  });
  const req = new Request('http://localhost', {
    headers: { Authorization: 'Basic abc123' },
  });
  await assertRejects(
    () => Promise.resolve(adapter.extract(req)),
    Error,
    'Missing or invalid Authorization',
  );
});
