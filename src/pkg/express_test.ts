import { assertEquals, assertExists } from '@std/assert';
import express from 'express';
import { Gateway, noAuth } from './mod.ts';
import { adapter } from './express.ts';
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

async function withExpressServer(
  fn: (port: number) => Promise<void>,
  prefix = '',
) {
  const gw = createGateway();
  const app = express();
  app.use(express.json());

  if (prefix) {
    app.use(prefix, adapter(gw));
  } else {
    app.use(adapter(gw));
  }

  const port = 10000 + Math.floor(Math.random() * 50000);

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(port, () => resolve(s));
  });

  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

Deno.test('Express adapter - sanitize via HTTP', async () => {
  await withExpressServer(async (port) => {
    const res = await fetch(`http://localhost:${port}/sanitize`, {
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
});

Deno.test('Express adapter - classify via HTTP', async () => {
  await withExpressServer(async (port) => {
    const res = await fetch(`http://localhost:${port}/classify`, {
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
});

Deno.test('Express adapter - build via HTTP', async () => {
  await withExpressServer(async (port) => {
    const res = await fetch(`http://localhost:${port}/index/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples: [] }),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertExists(body.index);
  });
});

Deno.test('Express adapter - prefix mounting', async () => {
  await withExpressServer(async (port) => {
    const res = await fetch(`http://localhost:${port}/api/gateway/sanitize`, {
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
  }, '/api/gateway');
});
