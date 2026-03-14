import { assertEquals } from '@std/assert';
import { handleClassify, handleSanitize } from './handlers.ts';
import type { HandlerContext } from './handlers.ts';
import { compileIndexFromRaw } from '../loaders/mod.ts';
import type { Policy } from '../core/types.ts';

const index = compileIndexFromRaw({
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
});

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
      path_actions: { '/customer/notes': 'mask_inline' },
    },
  ],
};

const ctx: HandlerContext = {
  index,
  policy,
  adapter: { extract: () => ({ user: 'jane', groups: ['support'], attributes: {} }) },
};

function makeRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test('handleSanitize - masks email and drops sin', async () => {
  const req = makeRequest('/sanitize', {
    context: { purpose: 'ticket' },
    payload: {
      customer: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        sin: '123-456-789',
      },
    },
    explain: true,
  });
  const res = await handleSanitize(req, ctx);
  const body = await res.json();
  assertEquals(body.payload.customer.email, 'j***@example.com');
  assertEquals(body.payload.customer.sin, undefined);
  assertEquals(body.payload.customer.name, 'Jane Doe');
  assertEquals(Array.isArray(body.decisions), true);
});

Deno.test('handleSanitize - inline mask on notes', async () => {
  const req = makeRequest('/sanitize', {
    context: { purpose: 'ticket' },
    payload: {
      customer: {
        notes: 'Customer called from 416-555-0199',
      },
    },
    explain: true,
  });
  const res = await handleSanitize(req, ctx);
  const body = await res.json();
  assertEquals(body.payload.customer.notes, 'Customer called from ***');
});

Deno.test('handleClassify - returns classifications', async () => {
  const req = makeRequest('/classify', {
    payload: {
      customer: {
        email: 'jane@example.com',
        notes: 'Call 416-555-0199',
      },
    },
  });
  const res = await handleClassify(req, ctx);
  const body = await res.json();
  assertEquals(body.classifications.length, 2);
  assertEquals(body.classifications[0].class, 'pii.email');
});
