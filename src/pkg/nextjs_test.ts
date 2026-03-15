import { assertEquals, assertExists } from '@std/assert';
import { Gateway, noAuth } from './mod.ts';
import { build, classify, handlers, sanitize } from './nextjs.ts';
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

function createGateway(): Gateway {
  return new Gateway({
    index,
    policy,
    auth: noAuth({ user: 'dev', groups: [] }),
  });
}

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test('Next.js handlers - routes to sanitize', async () => {
  const gw = createGateway();
  const { POST } = handlers(gw);
  const res = await POST(
    post('/sanitize', {
      context: { purpose: 'test' },
      payload: { customer: { email: 'jane@example.com' } },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.payload.customer.email, 'j***@example.com');
});

Deno.test('Next.js handlers - routes to classify', async () => {
  const gw = createGateway();
  const { POST } = handlers(gw);
  const res = await POST(
    post('/classify', { payload: { customer: { email: 'jane@example.com' } } }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.classifications.length, 1);
});

Deno.test('Next.js handlers - routes to index/build', async () => {
  const gw = createGateway();
  const { POST } = handlers(gw);
  const res = await POST(post('/index/build', { samples: [] }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertExists(body.index);
});

Deno.test('Next.js handlers - prefix stripping', async () => {
  const gw = createGateway();
  const { POST } = handlers(gw, '/api/gateway');
  const res = await POST(
    post('/api/gateway/sanitize', {
      context: { purpose: 'test' },
      payload: { name: 'Alice' },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.payload.name, 'Alice');
});

Deno.test('Next.js handlers - 404 for unknown route', async () => {
  const gw = createGateway();
  const { POST } = handlers(gw);
  const res = await POST(post('/unknown', {}));
  assertEquals(res.status, 404);
});

Deno.test('Next.js sanitize - individual route handler', async () => {
  const gw = createGateway();
  const { POST } = sanitize(gw);
  const res = await POST(
    post('/sanitize', {
      context: { purpose: 'test' },
      payload: { customer: { email: 'jane@example.com' } },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.payload.customer.email, 'j***@example.com');
});

Deno.test('Next.js classify - individual route handler', async () => {
  const gw = createGateway();
  const { POST } = classify(gw);
  const res = await POST(
    post('/classify', { payload: { customer: { email: 'jane@example.com' } } }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.classifications[0].class, 'pii.email');
});

Deno.test('Next.js build - individual route handler', async () => {
  const gw = createGateway();
  const { POST } = build(gw);
  const res = await POST(post('/index/build', { samples: [] }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertExists(body.index);
});
