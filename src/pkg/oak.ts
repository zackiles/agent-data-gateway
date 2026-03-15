import { Router } from '@oak/oak';
import type { Gateway } from './mod.ts';

interface OakContext {
  request: {
    url: URL;
    method: string;
    headers: Headers;
    hasBody: boolean;
    body: { stream(): ReadableStream<Uint8Array> };
  };
  response: {
    status: number;
    headers: Headers;
    body: unknown;
  };
}

function toRequest(ctx: OakContext): Request {
  const body = ctx.request.hasBody ? ctx.request.body.stream() : undefined;
  return new Request(ctx.request.url, {
    method: ctx.request.method,
    headers: ctx.request.headers,
    // deno-lint-ignore no-explicit-any
    body: body as any,
    ...(body ? { duplex: 'half' } : {}),
  });
}

function applyResponse(ctx: OakContext, response: Response) {
  ctx.response.status = response.status;
  response.headers.forEach((value, key) => {
    ctx.response.headers.set(key, value);
  });
  ctx.response.body = response.body;
}

export function adapter(gateway: Gateway): Router {
  const router = new Router();

  router.post('/sanitize', async (ctx) => {
    const request = toRequest(ctx as unknown as OakContext);
    const response = await gateway.sanitize(request);
    applyResponse(ctx as unknown as OakContext, response);
  });

  router.post('/classify', async (ctx) => {
    const request = toRequest(ctx as unknown as OakContext);
    const response = await gateway.classify(request);
    applyResponse(ctx as unknown as OakContext, response);
  });

  router.post('/index/build', async (ctx) => {
    const request = toRequest(ctx as unknown as OakContext);
    const response = await gateway.build(request);
    applyResponse(ctx as unknown as OakContext, response);
  });

  return router;
}
