export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}

export function detect(request: Request): boolean {
  const contentType = request.headers.get('content-type') ?? '';
  const accept = request.headers.get('accept') ?? '';
  return contentType.includes('text/event-stream') || accept.includes('text/event-stream');
}

export function parse(body: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = body.split(/\n\n+/);

  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split('\n');
    let event: string | undefined;
    const dataLines: string[] = [];
    let id: string | undefined;
    let retry: number | undefined;

    for (const line of lines) {
      if (line.startsWith(':')) continue;
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const field = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1).replace(/^ /, '');

      switch (field) {
        case 'event':
          event = value;
          break;
        case 'data':
          dataLines.push(value);
          break;
        case 'id':
          id = value;
          break;
        case 'retry':
          retry = parseInt(value, 10);
          break;
      }
    }

    if (dataLines.length > 0 || event) {
      events.push({ event, data: dataLines.join('\n'), id, retry });
    }
  }

  return events;
}

export function format(event: SSEEvent): string {
  let result = '';
  if (event.event) result += `event: ${event.event}\n`;
  if (event.id) result += `id: ${event.id}\n`;
  if (event.retry !== undefined) result += `retry: ${event.retry}\n`;

  for (const line of event.data.split('\n')) {
    result += `data: ${line}\n`;
  }
  result += '\n';
  return result;
}

export function headers(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };
}
