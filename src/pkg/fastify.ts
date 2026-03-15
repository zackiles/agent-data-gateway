import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { Gateway } from './mod.ts';

function toWebRequest(request: FastifyRequest): Request {
  const url = `${request.protocol}://${request.hostname}${request.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    }
  }

  let body: string | undefined;
  if (request.body !== undefined && request.body !== null) {
    body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }

  return new Request(url, { method: request.method, headers, ...(body ? { body } : {}) });
}

async function sendResponse(reply: FastifyReply, response: Response) {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    reply.header(key, value);
  });
  const body = await response.text();
  return reply.send(body);
}

export function adapter(gateway: Gateway): FastifyPluginAsync {
  // deno-lint-ignore require-await
  return async (fastify: FastifyInstance) => {
    fastify.addContentTypeParser(
      'text/event-stream',
      { parseAs: 'string' },
      (_req, body, done) => {
        done(null, body);
      },
    );

    fastify.post('/sanitize', async (request, reply) => {
      const webReq = toWebRequest(request);
      const response = await gateway.sanitize(webReq);
      return sendResponse(reply, response);
    });

    fastify.post('/classify', async (request, reply) => {
      const webReq = toWebRequest(request);
      const response = await gateway.classify(webReq);
      return sendResponse(reply, response);
    });

    fastify.post('/index/build', async (request, reply) => {
      const webReq = toWebRequest(request);
      const response = await gateway.build(webReq);
      return sendResponse(reply, response);
    });
  };
}
