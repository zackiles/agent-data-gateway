import { assertEquals } from '@std/assert';
import { detect, format, parse } from './sse.ts';

Deno.test('parse - single event with data', () => {
  const body = 'data: {"hello":"world"}\n\n';
  const events = parse(body);
  assertEquals(events.length, 1);
  assertEquals(events[0]!.data, '{"hello":"world"}');
  assertEquals(events[0]!.event, undefined);
});

Deno.test('parse - multiple events', () => {
  const body = [
    'event: message',
    'data: {"a":1}',
    '',
    'event: message',
    'data: {"b":2}',
    '',
  ].join('\n');
  const events = parse(body);
  assertEquals(events.length, 2);
  assertEquals(events[0]!.data, '{"a":1}');
  assertEquals(events[1]!.data, '{"b":2}');
  assertEquals(events[0]!.event, 'message');
});

Deno.test('parse - multiline data', () => {
  const body = [
    'data: line1',
    'data: line2',
    '',
  ].join('\n');
  const events = parse(body);
  assertEquals(events.length, 1);
  assertEquals(events[0]!.data, 'line1\nline2');
});

Deno.test('parse - event with id and retry', () => {
  const body = [
    'event: update',
    'id: 42',
    'retry: 5000',
    'data: {"x":1}',
    '',
  ].join('\n');
  const events = parse(body);
  assertEquals(events.length, 1);
  assertEquals(events[0]!.event, 'update');
  assertEquals(events[0]!.id, '42');
  assertEquals(events[0]!.retry, 5000);
  assertEquals(events[0]!.data, '{"x":1}');
});

Deno.test('parse - ignores comments', () => {
  const body = [
    ': this is a comment',
    'data: {"ok":true}',
    '',
  ].join('\n');
  const events = parse(body);
  assertEquals(events.length, 1);
  assertEquals(events[0]!.data, '{"ok":true}');
});

Deno.test('parse - empty body', () => {
  assertEquals(parse('').length, 0);
  assertEquals(parse('\n\n').length, 0);
});

Deno.test('format - basic event', () => {
  const result = format({ data: '{"a":1}' });
  assertEquals(result, 'data: {"a":1}\n\n');
});

Deno.test('format - full event', () => {
  const result = format({ event: 'message', id: '1', retry: 3000, data: '{"a":1}' });
  assertEquals(result, 'event: message\nid: 1\nretry: 3000\ndata: {"a":1}\n\n');
});

Deno.test('format - multiline data', () => {
  const result = format({ data: 'line1\nline2' });
  assertEquals(result, 'data: line1\ndata: line2\n\n');
});

Deno.test('detect - content-type text/event-stream', () => {
  const req = new Request('http://localhost/sanitize', {
    method: 'POST',
    headers: { 'Content-Type': 'text/event-stream' },
    body: '',
  });
  assertEquals(detect(req), true);
});

Deno.test('detect - accept header alone does not trigger SSE', () => {
  const req = new Request('http://localhost/sanitize', {
    method: 'POST',
    headers: { 'Accept': 'text/event-stream', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assertEquals(detect(req), false);
});

Deno.test('detect - regular json request', () => {
  const req = new Request('http://localhost/sanitize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assertEquals(detect(req), false);
});

Deno.test('parse - CRLF line endings', () => {
  const body = 'event: message\r\ndata: {"a":1}\r\n\r\nevent: message\r\ndata: {"b":2}\r\n\r\n';
  const events = parse(body);
  assertEquals(events.length, 2);
  assertEquals(events[0]!.data, '{"a":1}');
  assertEquals(events[1]!.data, '{"b":2}');
});

Deno.test('parse - lone CR line endings', () => {
  const body = 'data: {"x":1}\r\r';
  const events = parse(body);
  assertEquals(events.length, 1);
  assertEquals(events[0]!.data, '{"x":1}');
});

Deno.test('parse - mixed line endings', () => {
  const body = 'event: a\r\ndata: {"v":1}\n\nevent: b\r\ndata: {"v":2}\r\n\r\n';
  const events = parse(body);
  assertEquals(events.length, 2);
  assertEquals(events[0]!.data, '{"v":1}');
  assertEquals(events[1]!.data, '{"v":2}');
});

Deno.test('roundtrip - parse then format', () => {
  const original = [
    'event: test',
    'id: 5',
    'data: {"value":"hello"}',
    '',
  ].join('\n');

  const events = parse(original);
  assertEquals(events.length, 1);

  const formatted = format(events[0]!);
  const reparsed = parse(formatted);
  assertEquals(reparsed.length, 1);
  assertEquals(reparsed[0]!.event, 'test');
  assertEquals(reparsed[0]!.id, '5');
  assertEquals(reparsed[0]!.data, '{"value":"hello"}');
});
