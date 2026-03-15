import type { Gateway } from './mod.ts';

type RouteHandler = { POST: (request: Request) => Promise<Response> };

export function handlers(gateway: Gateway, prefix = ''): RouteHandler {
  return {
    async POST(request: Request): Promise<Response> {
      if (prefix) {
        const url = new URL(request.url);
        if (url.pathname.startsWith(prefix)) {
          const stripped = url.pathname.slice(prefix.length) || '/';
          const target = new URL(stripped + url.search, url.origin);
          return await gateway.fetch(new Request(target, request));
        }
      }
      return await gateway.fetch(request);
    },
  };
}

export function sanitize(gateway: Gateway): RouteHandler {
  return { POST: (request: Request) => gateway.sanitize(request) };
}

export function classify(gateway: Gateway): RouteHandler {
  return { POST: (request: Request) => gateway.classify(request) };
}

export function build(gateway: Gateway): RouteHandler {
  return { POST: (request: Request) => gateway.build(request) };
}
