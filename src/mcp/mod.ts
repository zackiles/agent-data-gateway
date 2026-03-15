import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

import { load as loadConfig } from '../config/mod.ts';
import { loadIndex, loadPolicy, mergeDetectors } from '../loaders/mod.ts';
import { load as loadAdapter } from '../adapters/mod.ts';
import { create as createReasoning } from '../reasoning/mod.ts';
import { detectors as gitleaksDetectors } from '../core/gitleaks.ts';
import { sanitize, classifyPayload, type HandlerContext } from '../server/handlers.ts';
import { build } from '../server/builder.ts';
import type { RequestContext, Index } from '../core/types.ts';

const VERSION = '0.1.0';

function env(key: string): string | undefined {
  return Deno.env.get(key);
}

async function main() {
  const config = await loadConfig();
  let index = await loadIndex(config.index);
  const policy = await loadPolicy(config.policy);
  const adapter = await loadAdapter(config);

  if (config.gitleaks.enabled) {
    index = mergeDetectors(index, gitleaksDetectors());
    console.error(`Gitleaks protection enabled (${gitleaksDetectors().length} detectors loaded)`);
  }

  let reasoning;
  if (config.reasoning.enabled) {
    reasoning = await createReasoning(config.reasoning);
    console.error(`Reasoning middleware enabled (cli=${config.reasoning.cli})`);
  }

  const ctx: HandlerContext = { index, policy, adapter, reasoning };

  const server = new McpServer(
    { name: 'agent-data-gateway', version: VERSION },
    { capabilities: { tools: { listChanged: true }, resources: { listChanged: true } } },
  );

  server.registerTool('sanitize', {
    title: 'Sanitize Data',
    description:
      'Sanitize a JSON payload according to policy rules. Classifies every field by path, key, and regex pattern, then applies transforms (mask, drop, hash, last4, etc.).',
    inputSchema: {
      payload: z.any().describe('The JSON payload to sanitize'),
      context: z
        .object({
          resource: z.string().optional().describe('Resource identifier'),
          purpose: z.string().optional().describe('Access purpose (e.g. "ticket", "investigation")'),
          region: z.string().optional().describe('Geographic region'),
        })
        .passthrough()
        .describe('Request context for rule matching'),
      explain: z
        .boolean()
        .optional()
        .describe('When true, include per-field decisions in the response'),
      identity: z
        .object({
          user: z.string().describe('User identifier'),
          groups: z.array(z.string()).describe('User group memberships'),
        })
        .optional()
        .describe('Override identity (defaults to configured adapter identity)'),
    },
  }, async ({ payload, context, explain, identity: identityOverride }) => {
    const identitySource = identityOverride
      ? { user: identityOverride.user, groups: identityOverride.groups, attributes: {} }
      : await adapter.extract(
        new Request('http://localhost/sanitize', { method: 'POST' }),
      );

    const result = await sanitize(
      payload,
      (context ?? { purpose: 'default' }) as RequestContext,
      explain ?? false,
      identitySource,
      ctx,
    );

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('classify', {
    title: 'Classify Data',
    description:
      'Classify every leaf node in a JSON payload. Returns classifications with data class, source (path/key/detector/reasoning), and confidence score.',
    inputSchema: {
      payload: z.any().describe('The JSON payload to classify'),
    },
  }, async ({ payload }) => {
    const result = await classifyPayload(payload, ctx);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('build_index', {
    title: 'Build Classification Index',
    description:
      'Build a classification index from sample payloads. Analyzes paths and keys across samples to infer stable data classes. Use the returned index as input to the gateway at startup.',
    inputSchema: {
      samples: z
        .array(z.object({ payload: z.any() }))
        .describe('Array of sample objects, each with a "payload" field'),
    },
  }, ({ samples }) => {
    const result = build(samples as Array<{ payload: unknown }>, ctx.index.detectors);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ index: result }, null, 2) }],
    };
  });

  server.registerTool('reload', {
    title: 'Reload Configuration',
    description:
      'Hot-reload the classification index and/or policy from disk without restarting the server.',
    inputSchema: {
      index: z.boolean().optional().describe('Reload the classification index (default: true)'),
      policy: z.boolean().optional().describe('Reload the policy (default: true)'),
    },
  }, async ({ index: reloadIdx, policy: reloadPol }) => {
    const reloaded: string[] = [];

    if (reloadIdx !== false) {
      let newIndex = await loadIndex(config.index);
      if (config.gitleaks.enabled) {
        newIndex = mergeDetectors(newIndex, gitleaksDetectors());
      }
      ctx.index = newIndex;
      reloaded.push('index');
    }

    if (reloadPol !== false) {
      ctx.policy = await loadPolicy(config.policy);
      reloaded.push('policy');
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ reloaded, status: 'ok' }),
      }],
    };
  });

  server.registerResource('policy', `gateway://policy`, {
    title: 'Current Policy',
    description: 'The active sanitization policy with all rules and actions',
    mimeType: 'application/json',
  }, (uri) => ({
    contents: [{ uri: uri.href, text: JSON.stringify(ctx.policy, null, 2) }],
  }));

  server.registerResource('index', `gateway://index`, {
    title: 'Current Classification Index',
    description:
      'The active classification index including path_classes, key_classes, and detectors',
    mimeType: 'application/json',
  }, (uri) => {
    const raw: Index = {
      version: ctx.index.version,
      path_classes: ctx.index.path_classes,
      key_classes: ctx.index.key_classes,
      detectors: ctx.index.detectors.map((d) => ({
        id: d.id,
        class: d.class,
        mode: d.mode,
        pattern: d.pattern,
        confidence: d.confidence,
      })),
    };
    return { contents: [{ uri: uri.href, text: JSON.stringify(raw, null, 2) }] };
  });

  server.registerResource('config', `gateway://config`, {
    title: 'Gateway Configuration',
    description: 'Current gateway runtime configuration (adapter, file paths, feature flags)',
    mimeType: 'application/json',
  }, (uri) => {
    const safe = {
      adapter: config.adapter,
      index: config.index,
      policy: config.policy,
      port: config.port,
      gitleaks: config.gitleaks,
      reasoning: { enabled: config.reasoning.enabled, cli: config.reasoning.cli },
    };
    return { contents: [{ uri: uri.href, text: JSON.stringify(safe, null, 2) }] };
  });

  const transport = env('MCP_TRANSPORT') ?? 'stdio';

  if (transport === 'http') {
    const port = Number(env('MCP_PORT') ?? config.port ?? 8080);

    const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

    console.error(`Agent Data Gateway MCP (streamable-http) starting on port ${port}`);
    console.error(`  adapter: ${config.adapter}`);
    console.error(`  index:   ${config.index}`);
    console.error(`  policy:  ${config.policy}`);

    Deno.serve({ port }, async (request) => {
      const url = new URL(request.url);
      if (url.pathname !== '/mcp') {
        return new Response(JSON.stringify({ error: 'Not found — use /mcp' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const sessionId = request.headers.get('mcp-session-id');

      if (request.method === 'POST' && !sessionId) {
        const httpTransport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, httpTransport);
          },
        });

        httpTransport.onclose = () => {
          if (httpTransport.sessionId) sessions.delete(httpTransport.sessionId);
        };

        await server.connect(httpTransport);
        return httpTransport.handleRequest(request);
      }

      if (sessionId && sessions.has(sessionId)) {
        return sessions.get(sessionId)!.handleRequest(request);
      }

      if (request.method === 'GET' || request.method === 'DELETE') {
        if (!sessionId || !sessions.has(sessionId!)) {
          return new Response(JSON.stringify({ error: 'Invalid or missing session' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return sessions.get(sessionId!)!.handleRequest(request);
      }

      return new Response(JSON.stringify({ error: 'Bad request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  } else {
    console.error('Agent Data Gateway MCP (stdio) starting');
    console.error(`  adapter: ${config.adapter}`);
    console.error(`  index:   ${config.index}`);
    console.error(`  policy:  ${config.policy}`);

    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
  }
}

if (import.meta.main) {
  main();
}
