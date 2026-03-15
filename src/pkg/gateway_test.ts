import { assertEquals, assertExists } from '@std/assert';
import { compileIndex, Gateway, noAuth } from './mod.ts';
import type { Index, Policy } from './mod.ts';

const index: Index = {
  version: 1,
  path_classes: {
    '/customer/email': { class: 'pii.email', confidence: 0.99, count: 10 },
  },
  key_classes: {
    sin: { class: 'government.id', confidence: 0.96, count: 5 },
  },
  detectors: [
    {
      id: 'phone.contains',
      class: 'pii.phone',
      mode: 'contains',
      pattern: '\\b(?:\\+?1[-. ]?)?\\(?\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}\\b',
      confidence: 0.92,
    },
  ],
};

const policy: Policy = {
  version: 1,
  default_rule: {
    default_action: 'allow',
    unknown_action: 'allow',
    class_actions: { 'government.id': 'drop' },
    path_actions: {},
  },
  rules: [
    {
      match: { groups_any: ['support'] },
      default_action: 'allow',
      unknown_action: 'allow',
      class_actions: {
        'pii.email': 'mask',
        'pii.phone': 'mask',
        'government.id': 'drop',
      },
      path_actions: {},
    },
  ],
};

function gateway(): Gateway {
  return new Gateway({
    index,
    policy,
    auth: noAuth({ user: 'jane', groups: ['support'] }),
  });
}

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test('Gateway - constructor compiles raw index', () => {
  const gw = gateway();
  assertExists(gw.context.index);
  assertEquals(gw.context.index.version, 1);
  assertEquals(gw.context.index.detectors.length, 1);
  assertExists(gw.context.index.detectors[0]!.regex);
});

Deno.test('Gateway - constructor accepts pre-compiled index', () => {
  const compiled = compileIndex(index);
  const gw = new Gateway({
    index: compiled,
    policy,
    auth: noAuth({ user: 'test', groups: [] }),
  });
  assertEquals(gw.context.index, compiled);
});

Deno.test('Gateway - gitleaks option adds detectors', () => {
  const gw = new Gateway({
    index,
    policy,
    auth: noAuth({ user: 'test', groups: [] }),
    gitleaks: true,
  });
  const count = gw.context.index.detectors.length;
  assertEquals(count > 1, true);
});

Deno.test('Gateway.sanitize - masks PII', async () => {
  const gw = gateway();
  const req = post('/sanitize', {
    context: { purpose: 'ticket' },
    payload: {
      customer: { name: 'Jane Doe', email: 'jane@example.com', sin: '123-456-789' },
    },
    explain: true,
  });
  const res = await gw.sanitize(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.payload.customer.email, 'j***@example.com');
  assertEquals(body.payload.customer.sin, undefined);
  assertEquals(body.payload.customer.name, 'Jane Doe');
  assertEquals(Array.isArray(body.decisions), true);
});

Deno.test('Gateway.classify - returns classifications', async () => {
  const gw = gateway();
  const req = post('/classify', {
    payload: { customer: { email: 'jane@example.com' } },
  });
  const res = await gw.classify(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.classifications.length, 1);
  assertEquals(body.classifications[0].class, 'pii.email');
});

Deno.test('Gateway.build - builds index from samples', async () => {
  const gw = gateway();
  const samples = Array.from({ length: 5 }, () => ({
    payload: { user: { email: 'a@b.com' } },
  }));
  const req = post('/index/build', { samples });
  const res = await gw.build(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertExists(body.index);
  assertEquals(body.index.version, 1);
});

Deno.test('Gateway.fetch - routes to sanitize', async () => {
  const gw = gateway();
  const req = post('/sanitize', {
    context: { purpose: 'test' },
    payload: { name: 'Alice' },
  });
  const res = await gw.fetch(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.payload.name, 'Alice');
});

Deno.test('Gateway.fetch - routes to classify', async () => {
  const gw = gateway();
  const req = post('/classify', { payload: { x: 1 } });
  const res = await gw.fetch(req);
  assertEquals(res.status, 200);
});

Deno.test('Gateway.fetch - routes to index/build', async () => {
  const gw = gateway();
  const req = post('/index/build', { samples: [] });
  const res = await gw.fetch(req);
  assertEquals(res.status, 200);
});

Deno.test('Gateway.fetch - returns 404 for unknown path', async () => {
  const gw = gateway();
  const req = post('/unknown', {});
  const res = await gw.fetch(req);
  assertEquals(res.status, 404);
});

Deno.test('Gateway.fetch - returns 405 for non-POST', async () => {
  const gw = gateway();
  const req = new Request('http://localhost/sanitize', { method: 'GET' });
  const res = await gw.fetch(req);
  assertEquals(res.status, 405);
});

Deno.test('Gateway.sanitize - returns 400 for missing payload', async () => {
  const gw = gateway();
  const req = post('/sanitize', { context: { purpose: 'test' } });
  const res = await gw.sanitize(req);
  assertEquals(res.status, 400);
});

Deno.test('Gateway - auth errors return 401', async () => {
  const gw = new Gateway({
    index,
    policy,
    auth: {
      extract() {
        throw new Error('Missing required header: X-User');
      },
    },
  });
  const req = post('/sanitize', {
    context: { purpose: 'test' },
    payload: { x: 1 },
  });
  const res = await gw.sanitize(req);
  assertEquals(res.status, 401);
});

Deno.test('noAuth - creates identity adapter', () => {
  const adapter = noAuth({ user: 'dev', groups: ['admin'] });
  const identity = adapter.extract(new Request('http://localhost'));
  assertEquals(identity, { user: 'dev', groups: ['admin'], attributes: {} });
});
