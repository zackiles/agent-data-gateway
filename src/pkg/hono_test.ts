import { assertEquals, assertExists } from '@std/assert';
import { Hono } from 'hono';
import { Gateway, noAuth } from './mod.ts';
import { adapter } from './hono.ts';
import type { Index, Policy } from './mod.ts';

const index: Index = {
  version: 1,
  path_classes: {
    '/customer/email': { class: 'pii.email', confidence: 0.99, count: 10 },
  },
  key_classes: {},
  detectors: [],
};

const policy: Policy = {
  version: 1,
  default_rule: {
    default_action: 'allow',
    unknown_action: 'allow',
    class_actions: { 'pii.email': 'mask' },
    path_actions: {},
  },
  rules: [],
};

function setup(prefix = ''): Hono {
  const gw = new Gateway({
    index,
    policy,
    auth: noAuth({ user: 'dev', groups: [] }),
  });
  const app = new Hono();
  app.route(prefix, adapter(gw));
  return app;
}

Deno.test('Hono adapter - sanitize endpoint', async () => {
  const app = setup();
  const res = await app.request('/sanitize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: { purpose: 'test' },
      payload: { customer: { email: 'jane@example.com' } },
    }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.payload.customer.email, 'j***@example.com');
});

Deno.test('Hono adapter - classify endpoint', async () => {
  const app = setup();
  const res = await app.request('/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: { customer: { email: 'jane@example.com' } },
    }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.classifications.length, 1);
  assertEquals(body.classifications[0].class, 'pii.email');
});

Deno.test('Hono adapter - build endpoint', async () => {
  const app = setup();
  const res = await app.request('/index/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ samples: [] }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertExists(body.index);
});

Deno.test('Hono adapter - prefix mounting', async () => {
  const app = setup('/api/gateway');
  const res = await app.request('/api/gateway/sanitize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: { purpose: 'test' },
      payload: { name: 'Alice' },
    }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.payload.name, 'Alice');
});

Deno.test('Hono adapter - SSE support', async () => {
  const app = setup();
  const sseBody = 'event: msg\ndata: ' +
    JSON.stringify({
      payload: { customer: { email: 'a@b.com' } },
      context: { purpose: 'test' },
    }) +
    '\n\n';
  const res = await app.request('/sanitize', {
    method: 'POST',
    headers: { 'Content-Type': 'text/event-stream' },
    body: sseBody,
  });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('content-type'), 'text/event-stream');
  const text = await res.text();
  assertEquals(text.includes('a***@b.com'), true);
});

Deno.test('Hono adapter - existing routes unaffected', async () => {
  const app = setup('/gateway');
  app.get('/health', (c) => c.json({ ok: true }));
  const res = await app.request('/health');
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
});
