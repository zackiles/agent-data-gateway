import type {
  Action,
  BuildRequest,
  ClassifyRequest,
  ClassifyResult,
  CompiledIndex,
  Config,
  Decision,
  Finding,
  GitleaksConfig,
  Identity,
  Index,
  LeafNode,
  Policy,
  ReasoningConfig,
  RequestContext,
  SanitizeRequest,
} from '../core/types.ts';
import type { Adapter } from '../identity/mod.ts';
import type { ReasoningMiddleware } from '../reasoning/mod.ts';
import {
  handleBuild,
  handleClassify,
  handleSanitize,
  type HandlerContext,
} from '../server/handlers.ts';
import { compileIndexFromRaw, mergeDetectors } from '../loaders/mod.ts';
import { detectors as gitleaksDetectors } from '../core/gitleaks.ts';

export type {
  Action,
  Adapter,
  BuildRequest,
  ClassifyRequest,
  ClassifyResult,
  CompiledIndex,
  Config,
  Decision,
  Finding,
  GitleaksConfig,
  HandlerContext,
  Identity,
  Index,
  LeafNode,
  Policy,
  ReasoningConfig,
  ReasoningMiddleware,
  RequestContext,
  SanitizeRequest,
};

export { create as noAuth, type NoAuthOptions } from '../adapters/no-auth/mod.ts';
export {
  create as trustedHeader,
  type TrustedHeaderOptions,
} from '../adapters/trusted-header/mod.ts';
export { compileIndexFromRaw as compileIndex } from '../loaders/mod.ts';

export interface GatewayOptions {
  index: Index | CompiledIndex;
  policy: Policy;
  auth: Adapter;
  reasoning?: ReasoningMiddleware;
  gitleaks?: boolean;
}

function isCompiled(index: Index | CompiledIndex): index is CompiledIndex {
  const d = index.detectors;
  return d.length === 0 || 'regex' in d[0]!;
}

const AUTH_ERRORS = [
  'Missing required header',
  'Missing or invalid Authorization',
  'Unknown API key',
];

function withErrorHandling(
  handler: (request: Request, ctx: HandlerContext) => Promise<Response>,
  ctx: HandlerContext,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      return await handler(request, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      const status = AUTH_ERRORS.some((e) => message.includes(e)) ? 401 : 500;
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

export class Gateway {
  readonly context: HandlerContext;
  readonly sanitize: (request: Request) => Promise<Response>;
  readonly classify: (request: Request) => Promise<Response>;
  readonly build: (request: Request) => Promise<Response>;

  constructor(options: GatewayOptions) {
    let index: CompiledIndex = isCompiled(options.index)
      ? options.index
      : compileIndexFromRaw(options.index);

    if (options.gitleaks) {
      index = mergeDetectors(index, gitleaksDetectors());
    }

    this.context = {
      index,
      policy: options.policy,
      adapter: options.auth,
      reasoning: options.reasoning,
    };

    this.sanitize = withErrorHandling(handleSanitize, this.context);
    this.classify = withErrorHandling(handleClassify, this.context);
    this.build = withErrorHandling(handleBuild, this.context);
  }

  fetch = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    switch (url.pathname) {
      case '/sanitize':
        return this.sanitize(request);
      case '/classify':
        return this.classify(request);
      case '/index/build':
        return this.build(request);
      default:
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
    }
  };
}
