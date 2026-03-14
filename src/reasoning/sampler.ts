import type { LeafNode } from '../core/types.ts';

export interface SampleRecord {
  path: string;
  key: string;
  value_type: string;
  value_sample: string | number | boolean | null;
  value_length: number;
  occurrences: number;
  all_paths: string[];
  concrete_paths: string[];
}

export interface SampleFile {
  schema_version: number;
  sample_count: number;
  total_unknown_nodes: number;
  samples: SampleRecord[];
}

export function sample(unknowns: LeafNode[], maxSamples: number): SampleFile {
  const byNormalizedPath = new Map<string, { representative: LeafNode; concretePaths: string[] }>();
  for (const node of unknowns) {
    const existing = byNormalizedPath.get(node.normalizedPath);
    if (existing) {
      existing.concretePaths.push(node.path);
    } else {
      byNormalizedPath.set(node.normalizedPath, {
        representative: node,
        concretePaths: [node.path],
      });
    }
  }

  const dedupKey = (key: string, valueType: string) => `${key}::${valueType}`;
  const deduped = new Map<string, SampleRecord>();

  for (const { representative: node, concretePaths } of byNormalizedPath.values()) {
    const valueType = node.value === null ? 'null' : typeof node.value;
    const dk = dedupKey(node.key, valueType);
    const existing = deduped.get(dk);
    if (existing) {
      existing.occurrences++;
      existing.all_paths.push(node.normalizedPath);
      existing.concrete_paths.push(...concretePaths);
    } else {
      let valueSample: string | number | boolean | null;
      let valueLength = 0;
      if (typeof node.value === 'string') {
        valueSample = node.value.slice(0, 64);
        valueLength = node.value.length;
      } else if (typeof node.value === 'number' || typeof node.value === 'boolean') {
        valueSample = node.value;
      } else {
        valueSample = null;
      }

      deduped.set(dk, {
        path: node.normalizedPath,
        key: node.key,
        value_type: valueType,
        value_sample: valueSample,
        value_length: valueLength,
        occurrences: 1,
        all_paths: [node.normalizedPath],
        concrete_paths: [...concretePaths],
      });
    }
  }

  let samples = [...deduped.values()];
  if (samples.length > maxSamples) {
    samples.sort((a, b) => b.occurrences - a.occurrences);
    samples = samples.slice(0, maxSamples);
  }

  return {
    schema_version: 1,
    sample_count: samples.length,
    total_unknown_nodes: unknowns.length,
    samples,
  };
}
