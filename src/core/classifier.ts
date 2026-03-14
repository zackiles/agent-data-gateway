import type { Classification, CompiledIndex, Finding, LeafNode } from './types.ts';

export function classify(node: LeafNode, index: CompiledIndex): Classification | null {
  const pathEntry = index.path_classes[node.normalizedPath];
  if (pathEntry) {
    return {
      path: node.path,
      class: pathEntry.class,
      source: 'path',
      confidence: pathEntry.confidence,
    };
  }

  const keyEntry = index.key_classes[node.key];
  if (keyEntry) {
    return {
      path: node.path,
      class: keyEntry.class,
      source: 'key',
      confidence: keyEntry.confidence,
    };
  }

  if (node.value === null || node.value === undefined) return null;
  const strValue = String(node.value);

  const fullmatches = index.detectors
    .filter((d) => d.mode === 'fullmatch')
    .map((d) => {
      d.regex.lastIndex = 0;
      return d.regex.test(strValue) ? d : null;
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  if (fullmatches.length === 1) {
    return {
      path: node.path,
      class: fullmatches[0]!.class,
      source: 'detector',
      confidence: fullmatches[0]!.confidence,
    };
  }

  if (fullmatches.length > 1) {
    const classes = new Set(fullmatches.map((d) => d.class));
    if (classes.size === 1) {
      const best = fullmatches.reduce((a, b) => a.confidence >= b.confidence ? a : b);
      return {
        path: node.path,
        class: best.class,
        source: 'detector',
        confidence: best.confidence,
      };
    }
    const sorted = [...fullmatches].sort((a, b) => b.confidence - a.confidence);
    if (sorted[0]!.confidence > sorted[1]!.confidence) {
      return {
        path: node.path,
        class: sorted[0]!.class,
        source: 'detector',
        confidence: sorted[0]!.confidence,
      };
    }
    return null;
  }

  return null;
}

export function findInline(node: LeafNode, index: CompiledIndex): Finding[] {
  if (typeof node.value !== 'string') return [];
  const str = node.value;
  const findings: Finding[] = [];

  for (const detector of index.detectors) {
    if (detector.mode !== 'contains') continue;
    const regex = new RegExp(detector.regex.source, detector.regex.flags.replace('g', '') + 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(str)) !== null) {
      findings.push({
        class: detector.class,
        source: 'detector-inline',
        confidence: detector.confidence,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  return findings;
}
