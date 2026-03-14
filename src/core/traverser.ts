import type { Action, LeafNode } from './types.ts';

export function normalizePath(path: string): string {
  return path.replace(/\/\d+\//g, '/*/').replace(/\/\d+$/, '/*');
}

export function* traverse(
  payload: unknown,
  path = '',
  parent?: Record<string, unknown> | unknown[],
  parentKey?: string | number,
): Generator<LeafNode> {
  if (payload === null || payload === undefined) {
    if (parent !== undefined && parentKey !== undefined) {
      yield {
        path,
        normalizedPath: normalizePath(path),
        key: String(parentKey),
        value: payload,
        parent: parent!,
        parentKey: parentKey!,
      };
    }
    return;
  }

  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i++) {
      yield* traverse(payload[i], `${path}/${i}`, payload, i);
    }
    return;
  }

  if (typeof payload === 'object') {
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      yield* traverse(value, `${path}/${key}`, payload as Record<string, unknown>, key);
    }
    return;
  }

  if (parent !== undefined && parentKey !== undefined) {
    yield {
      path,
      normalizedPath: normalizePath(path),
      key: String(parentKey),
      value: payload,
      parent: parent!,
      parentKey: parentKey!,
    };
  }
}

interface NodeDecision {
  path: string;
  action: Action;
  value?: unknown;
}

export function apply(
  payload: unknown,
  decisions: NodeDecision[],
): unknown {
  const decisionMap = new Map<string, NodeDecision>();
  for (const d of decisions) decisionMap.set(d.path, d);

  return applyRecursive(payload, '', decisionMap);
}

function applyRecursive(
  node: unknown,
  path: string,
  decisions: Map<string, NodeDecision>,
): unknown {
  if (node === null || node === undefined) return node;

  if (Array.isArray(node)) {
    const result: unknown[] = [];
    for (let i = 0; i < node.length; i++) {
      const childPath = `${path}/${i}`;
      const decision = decisions.get(childPath);
      if (decision?.action === 'drop') continue;
      result.push(applyRecursive(node[i], childPath, decisions));
    }
    return result;
  }

  if (typeof node === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const childPath = `${path}/${key}`;
      const decision = decisions.get(childPath);
      if (decision?.action === 'drop') continue;
      result[key] = applyRecursive(value, childPath, decisions);
    }
    return result;
  }

  const decision = decisions.get(path);
  if (!decision) return node;
  if (decision.action === 'allow') return node;
  if (decision.value !== undefined) return decision.value;
  return node;
}
