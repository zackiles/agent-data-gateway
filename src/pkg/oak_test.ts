import { assertEquals, assertExists } from '@std/assert';
import { Application, Router } from '@oak/oak';
import { Gateway, noAuth } from './mod.ts';
import { adapter } from './oak.ts';
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

function makeOakApp(gw: Gateway): Application {
  const router = adapter(gw);
  const app = new Application();
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app;
}

async function withServer(
  fn: (port: number) => Promise<void>,
) {
  const gw = createGateway();
  const app = makeOakApp(gw);
  const controller = new AbortController();
  const port = 10000 + Math.floor(Math.random() * 50000);

  app.listen({ port, signal: controller.signal });
  await new Promise((r) => setTimeout(r, 300));

  try {
    await fn(port);
  } finally {
    controller.abort();
    await new Promise((r) => setTimeout(r, 50));
  }
}

Deno.test('Oak adapter - returns a Router', () => {
  const gw = createGateway();
  const router = adapter(gw);
  assertExists(router);
  assertEquals(router instanceof Router, true);
});

Deno.test({
  name: 'Oak adapter - sanitize via HTTP',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await withServer(async (port) => {
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
  },
});

Deno.test({
  name: 'Oak adapter - classify via HTTP',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await withServer(async (port) => {
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
  },
});

Deno.test({
  name: 'Oak adapter - build via HTTP',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await withServer(async (port) => {
      const res = await fetch(`http://localhost:${port}/index/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples: [] }),
      });
      assertEquals(res.status, 200);
      const body = await res.json();
      assertExists(body.index);
    });
  },
});
