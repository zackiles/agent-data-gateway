import { assertEquals } from '@std/assert';
import { handleClassify, handleSanitize } from './handlers.ts';
import type { HandlerContext } from './handlers.ts';
import { compileIndexFromRaw, mergeDetectors } from '../loaders/mod.ts';
import type { Policy } from '../core/types.ts';
import { detectors as gitleaksDetectors } from '../core/gitleaks.ts';
import * as sse from '../core/sse.ts';

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

// --- SSE Tests ---

function makeSSERequest(
  path: string,
  events: sse.SSEEvent[],
  headers?: Record<string, string>,
): Request {
  let body = '';
  for (const event of events) {
    body += sse.format(event);
  }
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/event-stream',
      ...headers,
    },
    body,
  });
}

async function parseSSEResponse(response: Response): Promise<sse.SSEEvent[]> {
  const text = await response.text();
  return sse.parse(text);
}

Deno.test('handleSanitize SSE - single event with inline context', async () => {
  const req = makeSSERequest('/sanitize', [
    {
      data: JSON.stringify({
        payload: { customer: { name: 'Jane', email: 'jane@example.com' } },
        context: { purpose: 'ticket' },
      }),
    },
  ]);
  const res = await handleSanitize(req, ctx);
  assertEquals(res.headers.get('content-type'), 'text/event-stream');

  const events = await parseSSEResponse(res);
  const sanitizeEvents = events.filter((e) => e.event === 'sanitize');
  assertEquals(sanitizeEvents.length, 1);

  const result = JSON.parse(sanitizeEvents[0]!.data);
  assertEquals(result.payload.customer.email, 'j***@example.com');
  assertEquals(result.payload.customer.name, 'Jane');

  assertEquals(events.some((e) => e.event === 'done'), true);
});

Deno.test('handleSanitize SSE - shared context via header', async () => {
  const req = makeSSERequest(
    '/sanitize',
    [
      {
        data: JSON.stringify({
          customer: { name: 'Jane', email: 'jane@example.com' },
        }),
      },
    ],
    { 'X-Scrubber-Context': JSON.stringify({ purpose: 'ticket' }) },
  );
  const res = await handleSanitize(req, ctx);
  const events = await parseSSEResponse(res);
  const sanitizeEvents = events.filter((e) => e.event === 'sanitize');
  assertEquals(sanitizeEvents.length, 1);

  const result = JSON.parse(sanitizeEvents[0]!.data);
  assertEquals(result.payload.customer.email, 'j***@example.com');
});

Deno.test('handleSanitize SSE - multiple events', async () => {
  const req = makeSSERequest(
    '/sanitize',
    [
      {
        event: 'msg',
        data: JSON.stringify({
          payload: { user: { email: 'a@b.com' } },
          context: { purpose: 'ticket' },
        }),
      },
      {
        event: 'msg',
        data: JSON.stringify({
          payload: { user: { name: 'Bob' } },
          context: { purpose: 'ticket' },
        }),
      },
    ],
  );
  const res = await handleSanitize(req, ctx);
  const events = await parseSSEResponse(res);
  const sanitizeEvents = events.filter((e) => e.event === 'msg');
  assertEquals(sanitizeEvents.length, 2);
});

Deno.test('handleSanitize SSE - non-json data passes through', async () => {
  const req = makeSSERequest('/sanitize', [
    { event: 'ping', data: 'not-json' },
  ]);
  const res = await handleSanitize(req, ctx);
  const events = await parseSSEResponse(res);
  const passthrough = events.find((e) => e.event === 'ping');
  assertEquals(passthrough?.data, 'not-json');
});

Deno.test('handleClassify SSE - classifies events', async () => {
  const req = makeSSERequest('/classify', [
    {
      data: JSON.stringify({
        payload: { customer: { email: 'test@example.com' } },
      }),
    },
  ]);
  const res = await handleClassify(req, ctx);
  assertEquals(res.headers.get('content-type'), 'text/event-stream');

  const events = await parseSSEResponse(res);
  const classifyEvents = events.filter((e) => e.event === 'classify');
  assertEquals(classifyEvents.length, 1);

  const result = JSON.parse(classifyEvents[0]!.data);
  assertEquals(result.classifications.length, 1);
  assertEquals(result.classifications[0].class, 'pii.email');
});

Deno.test('handleSanitize SSE - preserves event ids', async () => {
  const req = makeSSERequest('/sanitize', [
    {
      event: 'msg',
      id: 'evt-42',
      data: JSON.stringify({
        payload: { x: 1 },
        context: { purpose: 'test' },
      }),
    },
  ]);
  const res = await handleSanitize(req, ctx);
  const events = await parseSSEResponse(res);
  const msg = events.find((e) => e.event === 'msg');
  assertEquals(msg?.id, 'evt-42');
});

Deno.test('handleSanitize SSE - explain via header', async () => {
  const req = makeSSERequest(
    '/sanitize',
    [
      {
        data: JSON.stringify({
          payload: { customer: { email: 'jane@example.com' } },
          context: { purpose: 'ticket' },
        }),
      },
    ],
    { 'X-Scrubber-Explain': 'true' },
  );
  const res = await handleSanitize(req, ctx);
  const events = await parseSSEResponse(res);
  const sanitizeEvents = events.filter((e) => e.event === 'sanitize');
  const result = JSON.parse(sanitizeEvents[0]!.data);
  assertEquals(Array.isArray(result.decisions), true);
});

// --- Gitleaks Integration Tests ---

const gitleaksIndex = mergeDetectors(index, gitleaksDetectors());

const gitleaksPolicy: Policy = {
  version: 1,
  default_rule: {
    default_action: 'allow',
    unknown_action: 'allow',
    class_actions: { 'credentials.secret': 'drop' },
    path_actions: {},
  },
  rules: [],
};

const gitleaksCtx: HandlerContext = {
  index: gitleaksIndex,
  policy: gitleaksPolicy,
  adapter: { extract: () => ({ user: 'dev', groups: [], attributes: {} }) },
};

Deno.test('gitleaks - drops AWS access key', async () => {
  const req = makeRequest('/sanitize', {
    context: { purpose: 'audit' },
    payload: { config: { aws_key: 'AKIAIOSFODNN7EXAMPLE' } },
    explain: true,
  });
  const res = await handleSanitize(req, gitleaksCtx);
  const body = await res.json();
  assertEquals(body.payload.config.aws_key, undefined);
});

Deno.test('gitleaks - drops GitHub PAT', async () => {
  const req = makeRequest('/sanitize', {
    context: { purpose: 'audit' },
    payload: { token: 'ghp_ABCDEFghijklmnopqrstuvwxyz0123456789' },
    explain: true,
  });
  const res = await handleSanitize(req, gitleaksCtx);
  const body = await res.json();
  assertEquals(body.payload.token, undefined);
});

Deno.test('gitleaks - drops private key header', async () => {
  const req = makeRequest('/sanitize', {
    context: { purpose: 'audit' },
    payload: { key: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKC...' },
    explain: true,
  });
  const res = await handleSanitize(req, gitleaksCtx);
  const body = await res.json();
  assertEquals(body.payload.key, undefined);
});

Deno.test('gitleaks - drops Stripe live key', async () => {
  const stripeKey = ['sk_live_', 'abcdefghijklmnopqrstuvwx'].join('');
  const req = makeRequest('/sanitize', {
    context: { purpose: 'audit' },
    payload: { stripe: stripeKey },
    explain: true,
  });
  const res = await handleSanitize(req, gitleaksCtx);
  const body = await res.json();
  assertEquals(body.payload.stripe, undefined);
});

Deno.test('gitleaks - allows non-secret values', async () => {
  const req = makeRequest('/sanitize', {
    context: { purpose: 'audit' },
    payload: { name: 'Alice', count: 42, active: true },
  });
  const res = await handleSanitize(req, gitleaksCtx);
  const body = await res.json();
  assertEquals(body.payload.name, 'Alice');
  assertEquals(body.payload.count, 42);
  assertEquals(body.payload.active, true);
});

Deno.test('gitleaks - classifies secrets in classify endpoint', async () => {
  const req = makeRequest('/classify', {
    payload: {
      token: 'ghp_ABCDEFghijklmnopqrstuvwxyz0123456789',
      name: 'Bob',
    },
  });
  const res = await handleClassify(req, gitleaksCtx);
  const body = await res.json();
  const tokenResult = body.classifications.find(
    (c: { path: string }) => c.path === '/token',
  );
  assertEquals(tokenResult?.findings?.[0]?.class, 'credentials.secret');
});

Deno.test('gitleaks + SSE - drops secrets in SSE events', async () => {
  const req = makeSSERequest(
    '/sanitize',
    [
      {
        data: JSON.stringify({
          payload: { key: 'ghp_ABCDEFghijklmnopqrstuvwxyz0123456789' },
          context: { purpose: 'audit' },
        }),
      },
    ],
  );
  const res = await handleSanitize(req, gitleaksCtx);
  const events = await parseSSEResponse(res);
  const sanitizeEvents = events.filter((e) => e.event === 'sanitize');
  const result = JSON.parse(sanitizeEvents[0]!.data);
  assertEquals(result.payload.key, undefined);
});
