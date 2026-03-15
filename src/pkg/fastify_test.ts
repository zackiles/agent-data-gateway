import { assertEquals, assertExists } from '@std/assert';
import Fastify from 'fastify';
import { Gateway, noAuth } from './mod.ts';
import { adapter } from './fastify.ts';
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

Deno.test('Fastify adapter - sanitize via inject', async () => {
  const gw = createGateway();
  const fastify = Fastify();
  await fastify.register(adapter(gw));

  const res = await fastify.inject({
    method: 'POST',
    url: '/sanitize',
    headers: { 'content-type': 'application/json' },
    payload: {
      context: { purpose: 'test' },
      payload: { customer: { email: 'jane@example.com' } },
    },
  });

  assertEquals(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assertEquals(body.payload.customer.email, 'j***@example.com');
  await fastify.close();
});

Deno.test('Fastify adapter - classify via inject', async () => {
  const gw = createGateway();
  const fastify = Fastify();
  await fastify.register(adapter(gw));

  const res = await fastify.inject({
    method: 'POST',
    url: '/classify',
    headers: { 'content-type': 'application/json' },
    payload: { payload: { customer: { email: 'jane@example.com' } } },
  });

  assertEquals(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assertEquals(body.classifications.length, 1);
  assertEquals(body.classifications[0].class, 'pii.email');
  await fastify.close();
});

Deno.test('Fastify adapter - build via inject', async () => {
  const gw = createGateway();
  const fastify = Fastify();
  await fastify.register(adapter(gw));

  const res = await fastify.inject({
    method: 'POST',
    url: '/index/build',
    headers: { 'content-type': 'application/json' },
    payload: { samples: [] },
  });

  assertEquals(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assertExists(body.index);
  await fastify.close();
});

Deno.test('Fastify adapter - prefix mounting', async () => {
  const gw = createGateway();
  const fastify = Fastify();
  await fastify.register(adapter(gw), { prefix: '/api/gateway' });

  const res = await fastify.inject({
    method: 'POST',
    url: '/api/gateway/sanitize',
    headers: { 'content-type': 'application/json' },
    payload: {
      context: { purpose: 'test' },
      payload: { name: 'Alice' },
    },
  });

  assertEquals(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assertEquals(body.payload.name, 'Alice');
  await fastify.close();
});
