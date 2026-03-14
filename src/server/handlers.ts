import type {
  Action,
  BuildRequest,
  ClassifyRequest,
  ClassifyResult,
  CompiledIndex,
  Decision,
  Finding,
  Identity,
  Policy,
  RequestContext,
  SanitizeRequest,
} from '../core/types.ts';
import { classify, findInline } from '../core/classifier.ts';
import { mergeFindings, resolveAction, selectRule } from '../core/policy.ts';
import { hash, last4, mask, maskInline, toNull, yearOnly } from '../core/transforms.ts';
import { apply, traverse } from '../core/traverser.ts';
import { build } from './builder.ts';
import type { Adapter } from '../identity/mod.ts';
import type { ReasoningMiddleware } from '../reasoning/mod.ts';
import * as sse from '../core/sse.ts';

export interface HandlerContext {
  index: CompiledIndex;
  policy: Policy;
  adapter: Adapter;
  reasoning?: ReasoningMiddleware;
}

interface SanitizeResult {
  payload: unknown;
  decisions?: Decision[];
}

export async function sanitize(
  payload: unknown,
  context: RequestContext,
  explain: boolean,
  identity: Identity,
  ctx: HandlerContext,
): Promise<SanitizeResult> {
  const rule = selectRule(identity, context, ctx.policy);
  const nodes = [...traverse(payload)];
  const classifications = new Map<
    string,
    { classification: ReturnType<typeof classify>; findings: Finding[] }
  >();

  for (const node of nodes) {
    const c = classify(node, ctx.index);
    const findings = c ? [] : findInline(node, ctx.index);
    classifications.set(node.path, { classification: c, findings });
  }

  const unknowns = nodes.filter((n) => {
    const entry = classifications.get(n.path)!;
    return !entry.classification && entry.findings.length === 0;
  });

  if (ctx.reasoning && unknowns.length > 0) {
    const reasoningResults = await ctx.reasoning.classify(unknowns, ctx.index);
    for (const r of reasoningResults) {
      const existing = classifications.get(r.path);
      if (existing && !existing.classification) {
        existing.classification = r;
      }
    }
  }

  const decisions: Decision[] = [];
  const nodeDecisions: Array<
    { path: string; action: Action; value?: unknown; findings?: Finding[] }
  > = [];

  for (const node of nodes) {
    const entry = classifications.get(node.path)!;
    const c = entry.classification;
    const findings = mergeFindings(entry.findings);
    const action = resolveAction(node.normalizedPath, c, findings, rule);

    if (action === 'drop') {
      nodeDecisions.push({ path: node.path, action: 'drop' });
      if (explain) {
        decisions.push({
          path: node.path,
          class: c?.class,
          source: c?.source,
          confidence: c?.confidence,
          action: 'drop',
        });
      }
      continue;
    }

    const transformed = await applyTransform(action, node.value, c?.class, findings);
    nodeDecisions.push({ path: node.path, action, value: transformed });

    if (explain) {
      decisions.push({
        path: node.path,
        class: c?.class,
        source: c?.source,
        confidence: c?.confidence,
        action,
      });
    }
  }

  const rootDecision = nodeDecisions.find((d) => d.path === '' && d.action === 'drop');
  if (rootDecision) return { payload: null, ...(explain ? { decisions } : {}) };

  const sanitized = apply(payload, nodeDecisions);
  return { payload: sanitized, ...(explain ? { decisions } : {}) };
}

export async function classifyPayload(
  payload: unknown,
  ctx: HandlerContext,
): Promise<{ classifications: ClassifyResult[] }> {
  const nodes = [...traverse(payload)];
  const results: ClassifyResult[] = [];
  const unknowns: typeof nodes = [];

  for (const node of nodes) {
    const c = classify(node, ctx.index);
    if (c) {
      results.push({ path: node.path, class: c.class, source: c.source, confidence: c.confidence });
      continue;
    }
    const findings = findInline(node, ctx.index);
    if (findings.length > 0) {
      results.push({ path: node.path, findings });
    } else {
      unknowns.push(node);
    }
  }

  if (ctx.reasoning && unknowns.length > 0) {
    const reasoningResults = await ctx.reasoning.classify(unknowns, ctx.index);
    for (const r of reasoningResults) {
      results.push({ path: r.path, class: r.class, source: r.source, confidence: r.confidence });
    }
  }

  return { classifications: results };
}

export async function handleSanitize(
  request: Request,
  ctx: HandlerContext,
): Promise<Response> {
  if (sse.detect(request)) return handleSanitizeSSE(request, ctx);

  const body = (await request.json()) as SanitizeRequest;
  if (!body.payload || !body.context) {
    return json({ error: 'Request must include "payload" and "context"' }, 400);
  }

  const identity = await ctx.adapter.extract(request);
  const result = await sanitize(body.payload, body.context, body.explain ?? false, identity, ctx);
  return json(result);
}

async function handleSanitizeSSE(
  request: Request,
  ctx: HandlerContext,
): Promise<Response> {
  const identity = await ctx.adapter.extract(request);
  const contextHeader = request.headers.get('x-scrubber-context');
  const explainHeader = request.headers.get('x-scrubber-explain');
  const sharedContext: RequestContext | null = contextHeader ? JSON.parse(contextHeader) : null;
  const sharedExplain = explainHeader === 'true';

  const body = await request.text();
  const events = sse.parse(body);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let idx = 0;

      for (const event of events) {
        if (!event.data) {
          controller.enqueue(encoder.encode(sse.format(event)));
          idx++;
          continue;
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          controller.enqueue(encoder.encode(sse.format(event)));
          idx++;
          continue;
        }

        const payload = parsed.payload !== undefined ? parsed.payload : parsed;
        const context: RequestContext = (parsed.context as RequestContext) ??
          sharedContext ?? { purpose: 'default' };
        const explain = (parsed.explain as boolean) ?? sharedExplain;

        const result = await sanitize(payload, context, explain, identity, ctx);

        controller.enqueue(
          encoder.encode(
            sse.format({
              event: event.event ?? 'sanitize',
              data: JSON.stringify(result),
              id: event.id ?? String(idx),
            }),
          ),
        );
        idx++;
      }

      controller.enqueue(encoder.encode(sse.format({ event: 'done', data: '{}' })));
      controller.close();
    },
  });

  return new Response(stream, { headers: sse.headers() });
}

export async function handleClassify(
  request: Request,
  ctx: HandlerContext,
): Promise<Response> {
  if (sse.detect(request)) return handleClassifySSE(request, ctx);

  const body = (await request.json()) as ClassifyRequest;
  if (!body.payload) return json({ error: 'Request must include "payload"' }, 400);

  const result = await classifyPayload(body.payload, ctx);
  return json(result);
}

async function handleClassifySSE(
  request: Request,
  ctx: HandlerContext,
): Promise<Response> {
  const body = await request.text();
  const events = sse.parse(body);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let idx = 0;

      for (const event of events) {
        if (!event.data) {
          controller.enqueue(encoder.encode(sse.format(event)));
          idx++;
          continue;
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          controller.enqueue(encoder.encode(sse.format(event)));
          idx++;
          continue;
        }

        const payload = parsed.payload !== undefined ? parsed.payload : parsed;
        const result = await classifyPayload(payload, ctx);

        controller.enqueue(
          encoder.encode(
            sse.format({
              event: event.event ?? 'classify',
              data: JSON.stringify(result),
              id: event.id ?? String(idx),
            }),
          ),
        );
        idx++;
      }

      controller.enqueue(encoder.encode(sse.format({ event: 'done', data: '{}' })));
      controller.close();
    },
  });

  return new Response(stream, { headers: sse.headers() });
}

export async function handleBuild(
  request: Request,
  ctx: HandlerContext,
): Promise<Response> {
  const body = (await request.json()) as BuildRequest;
  if (!Array.isArray(body.samples)) {
    return json({ error: 'Request must include "samples" array' }, 400);
  }

  const index = build(body.samples, ctx.index.detectors);
  return json({ index });
}

async function applyTransform(
  action: Action,
  value: unknown,
  className: string | undefined,
  findings: Finding[],
): Promise<unknown> {
  switch (action) {
    case 'allow':
      return value;
    case 'null':
      return toNull();
    case 'mask':
      return mask(value, className);
    case 'mask_inline':
      return typeof value === 'string' ? maskInline(value, findings) : mask(value, className);
    case 'last4':
      return last4(value);
    case 'year_only':
      return yearOnly(value);
    case 'hash':
      return await hash(value);
    case 'drop':
      return undefined;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
