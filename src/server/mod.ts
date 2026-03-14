import { load as loadConfig } from '../config/mod.ts';
import { loadIndex, loadPolicy, mergeDetectors } from '../loaders/mod.ts';
import { load as loadAdapter } from '../adapters/mod.ts';
import { handleBuild, handleClassify, handleSanitize } from './handlers.ts';
import type { HandlerContext } from './handlers.ts';
import { create as createReasoning } from '../reasoning/mod.ts';
import { detectors as gitleaksDetectors } from '../core/gitleaks.ts';

async function main() {
  const config = await loadConfig();
  let index = await loadIndex(config.index);
  const policy = await loadPolicy(config.policy);
  const adapter = await loadAdapter(config);

  if (config.gitleaks.enabled) {
    index = mergeDetectors(index, gitleaksDetectors());
    console.log(`Gitleaks protection enabled (${gitleaksDetectors().length} detectors loaded)`);
  }

  let reasoning;
  if (config.reasoning.enabled) {
    reasoning = await createReasoning(config.reasoning);
    console.log(`Reasoning middleware enabled (cli=${config.reasoning.cli})`);
  }

  const ctx: HandlerContext = { index, policy, adapter, reasoning };

  console.log(`Agent Data Gateway starting on port ${config.port}`);
  console.log(`  adapter: ${config.adapter}`);
  console.log(`  index:   ${config.index}`);
  console.log(`  policy:  ${config.policy}`);

  Deno.serve({ port: config.port }, async (request) => {
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      switch (url.pathname) {
        case '/sanitize':
          return await handleSanitize(request, ctx);
        case '/classify':
          return await handleClassify(request, ctx);
        case '/index/build':
          return await handleBuild(request, ctx);
        default:
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      const status = message.includes('Missing required header') ||
          message.includes('Missing or invalid Authorization') ||
          message.includes('Unknown API key')
        ? 401
        : 500;
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  });
}

if (import.meta.main) {
  main();
}
