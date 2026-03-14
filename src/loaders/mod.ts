import type { CompiledDetector, CompiledIndex, Detector, Index, Policy } from '../core/types.ts';

export async function loadIndex(path: string): Promise<CompiledIndex> {
  const text = await Deno.readTextFile(path);
  const raw = JSON.parse(text) as Index;
  validateIndex(raw);
  return compileIndex(raw);
}

export async function loadPolicy(path: string): Promise<Policy> {
  const text = await Deno.readTextFile(path);
  const raw = JSON.parse(text) as Policy;
  validatePolicy(raw);
  return raw;
}

function validateIndex(index: Index): void {
  if (typeof index.version !== 'number') {
    throw new Error('Index missing "version" (number)');
  }
  if (!index.path_classes || typeof index.path_classes !== 'object') {
    throw new Error('Index missing "path_classes" (object)');
  }
  if (!index.key_classes || typeof index.key_classes !== 'object') {
    throw new Error('Index missing "key_classes" (object)');
  }
  if (!Array.isArray(index.detectors)) {
    throw new Error('Index missing "detectors" (array)');
  }
  for (const d of index.detectors) {
    if (!d.id || !d.class || !d.mode || !d.pattern) {
      throw new Error(`Detector "${d.id}" missing required fields (id, class, mode, pattern)`);
    }
    if (d.mode !== 'fullmatch' && d.mode !== 'contains') {
      throw new Error(`Detector "${d.id}" mode must be "fullmatch" or "contains", got "${d.mode}"`);
    }
  }
}

function validatePolicy(policy: Policy): void {
  if (typeof policy.version !== 'number') {
    throw new Error('Policy missing "version" (number)');
  }
  if (!policy.default_rule) {
    throw new Error('Policy missing "default_rule"');
  }
  if (!policy.default_rule.default_action) {
    throw new Error('Policy default_rule missing "default_action"');
  }
  if (!Array.isArray(policy.rules)) {
    throw new Error('Policy missing "rules" (array)');
  }
}

function compileIndex(index: Index): CompiledIndex {
  const detectors: CompiledDetector[] = index.detectors.map((d) => {
    const flags = d.pattern.startsWith('(?i)') ? 'i' : '';
    const pattern = d.pattern.replace(/^\(\?i\)/, '');
    return { ...d, regex: new RegExp(pattern, flags) };
  });
  return {
    version: index.version,
    path_classes: index.path_classes,
    key_classes: index.key_classes,
    detectors,
  };
}

export function compileIndexFromRaw(index: Index): CompiledIndex {
  validateIndex(index);
  return compileIndex(index);
}

export function mergeDetectors(
  index: CompiledIndex,
  extra: Detector[],
): CompiledIndex {
  const existing = new Set(index.detectors.map((d) => d.id));
  const compiled: CompiledDetector[] = extra
    .filter((d) => !existing.has(d.id))
    .map((d) => {
      const flags = d.pattern.startsWith('(?i)') ? 'i' : '';
      const pattern = d.pattern.replace(/^\(\?i\)/, '');
      return { ...d, regex: new RegExp(pattern, flags) };
    });
  return {
    ...index,
    detectors: [...index.detectors, ...compiled],
  };
}
