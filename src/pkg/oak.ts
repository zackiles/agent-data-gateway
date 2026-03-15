import { Router } from '@oak/oak';
import type { Gateway } from './mod.ts';

interface OakContext {
  request: {
    url: URL;
    method: string;
    headers: Headers;
    hasBody: boolean;
    body: {
      text(): Promise<string>;
    };
  };
  response: {
    status: number;
    headers: Headers;
    body: unknown;
  };
}

async function toRequest(ctx: OakContext): Promise<Request> {
  let body: string | undefined;
  if (ctx.request.hasBody) {
    body = await ctx.request.body.text();
  }
  return new Request(ctx.request.url, {
    method: ctx.request.method,
    headers: ctx.request.headers,
    ...(body ? { body } : {}),
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
    const request = await toRequest(ctx as unknown as OakContext);
    const response = await gateway.sanitize(request);
    applyResponse(ctx as unknown as OakContext, response);
  });

  router.post('/classify', async (ctx) => {
    const request = await toRequest(ctx as unknown as OakContext);
    const response = await gateway.classify(request);
    applyResponse(ctx as unknown as OakContext, response);
  });

  router.post('/index/build', async (ctx) => {
    const request = await toRequest(ctx as unknown as OakContext);
    const response = await gateway.build(request);
    applyResponse(ctx as unknown as OakContext, response);
  });

  return router;
}
