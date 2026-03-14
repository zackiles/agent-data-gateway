import { assertEquals } from '@std/assert';
import { mergeFindings, resolveAction, selectRule } from './policy.ts';
import type { Identity, Policy, RequestContext } from './types.ts';

const testPolicy: Policy = {
  version: 1,
  default_rule: {
    default_action: 'allow',
    unknown_action: 'allow',
    class_actions: { 'government.id': 'drop', 'credentials.secret': 'drop' },
    path_actions: {},
  },
  rules: [
    {
      match: { groups_any: ['support'], purposes_any: ['ticket'] },
      default_action: 'allow',
      unknown_action: 'allow',
      class_actions: {
        'pii.email': 'mask',
        'pii.phone': 'mask',
        'government.id': 'drop',
      },
      path_actions: { '/customer/notes': 'mask_inline' },
    },
    {
      match: { groups_any: ['risk', 'fraud'], purposes_any: ['investigation'] },
      default_action: 'allow',
      unknown_action: 'allow',
      class_actions: {
        'pii.email': 'allow',
        'government.id': 'last4',
      },
      path_actions: {},
    },
  ],
};

const supportIdentity: Identity = {
  user: 'jane@example.com',
  groups: ['support', 'tier-2'],
  attributes: {},
};

const riskIdentity: Identity = {
  user: 'bob@example.com',
  groups: ['risk'],
  attributes: {},
};

const unknownIdentity: Identity = {
  user: 'nobody@example.com',
  groups: ['marketing'],
  attributes: {},
};

Deno.test('selectRule - matches support rule', () => {
  const ctx: RequestContext = { purpose: 'ticket' };
  const rule = selectRule(supportIdentity, ctx, testPolicy);
  assertEquals(rule.class_actions['pii.email'], 'mask');
});

Deno.test('selectRule - matches risk rule', () => {
  const ctx: RequestContext = { purpose: 'investigation' };
  const rule = selectRule(riskIdentity, ctx, testPolicy);
  assertEquals(rule.class_actions['government.id'], 'last4');
});

Deno.test('selectRule - falls back to default_rule', () => {
  const ctx: RequestContext = { purpose: 'browsing' };
  const rule = selectRule(unknownIdentity, ctx, testPolicy);
  assertEquals(rule, testPolicy.default_rule);
});

Deno.test('resolveAction - path_actions takes precedence', () => {
  const rule = testPolicy.rules[0]!;
  const action = resolveAction(
    '/customer/notes',
    { path: '/customer/notes', class: 'pii.email', source: 'key', confidence: 0.9 },
    [],
    rule,
  );
  assertEquals(action, 'mask_inline');
});

Deno.test('resolveAction - class_actions when no path match', () => {
  const rule = testPolicy.rules[0]!;
  const action = resolveAction(
    '/customer/email',
    { path: '/customer/email', class: 'pii.email', source: 'key', confidence: 0.9 },
    [],
    rule,
  );
  assertEquals(action, 'mask');
});

Deno.test('resolveAction - unknown_action for unclassified nodes', () => {
  const rule = testPolicy.rules[0]!;
  const action = resolveAction('/customer/foo', null, [], rule);
  assertEquals(action, 'allow');
});

Deno.test('mergeFindings - non-overlapping preserved', () => {
  const findings = [
    { class: 'pii.email', source: 'detector-inline' as const, confidence: 0.95, start: 0, end: 7 },
    {
      class: 'pii.phone',
      source: 'detector-inline' as const,
      confidence: 0.92,
      start: 12,
      end: 20,
    },
  ];
  const merged = mergeFindings(findings);
  assertEquals(merged.length, 2);
});

Deno.test('mergeFindings - overlapping merged', () => {
  const findings = [
    { class: 'pii.email', source: 'detector-inline' as const, confidence: 0.95, start: 0, end: 10 },
    {
      class: 'pii.phone',
      source: 'detector-inline' as const,
      confidence: 0.92,
      start: 5,
      end: 15,
    },
  ];
  const merged = mergeFindings(findings);
  assertEquals(merged.length, 1);
  assertEquals(merged[0]!.start, 0);
  assertEquals(merged[0]!.end, 15);
});
