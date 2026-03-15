import type {
  NextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
  Router as ExpressRouter,
} from 'express';
import express from 'express';
import type { Gateway } from './mod.ts';

function toHeaders(req: ExpressRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    }
  }
  return headers;
}

function toWebRequest(req: ExpressRequest): Request {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost';
  const url = `${protocol}://${host}${req.originalUrl}`;
  const headers = toHeaders(req);

  let body: string | undefined;
  if (req.body !== undefined && req.body !== null) {
    if (req.body instanceof Uint8Array || ArrayBuffer.isView(req.body)) {
      body = new TextDecoder().decode(req.body as ArrayBufferView);
    } else if (typeof req.body === 'string') {
      body = req.body;
    } else {
      body = JSON.stringify(req.body);
    }
  }

  return new Request(url, { method: req.method, headers, ...(body ? { body } : {}) });
}

async function sendResponse(res: ExpressResponse, response: Response) {
  res.status(response.status);
  response.headers.forEach((value, key) => {
    res.set(key, value);
  });

  if (response.body) {
    const text = await response.text();
    res.send(text);
  } else {
    res.end();
  }
}

type Handler = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void;

function route(handler: (request: Request) => Promise<Response>): Handler {
  return (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    const request = toWebRequest(req);
    handler(request).then((response) => sendResponse(res, response)).catch(next);
  };
}

export function adapter(gateway: Gateway): ExpressRouter {
  const router = express.Router();

  router.post('/sanitize', route(gateway.sanitize));
  router.post('/classify', route(gateway.classify));
  router.post('/index/build', route(gateway.build));

  return router;
}
