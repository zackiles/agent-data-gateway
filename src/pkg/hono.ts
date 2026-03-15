import { Hono } from 'hono';
import type { Gateway } from './mod.ts';

export function adapter(gateway: Gateway): Hono {
  const app = new Hono();

  app.post('/sanitize', (c) => gateway.sanitize(c.req.raw));
  app.post('/classify', (c) => gateway.classify(c.req.raw));
  app.post('/index/build', (c) => gateway.build(c.req.raw));

  return app;
}
