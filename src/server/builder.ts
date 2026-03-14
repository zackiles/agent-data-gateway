import type { CompiledIndex, Detector, Index, PathClass } from '../core/types.ts';
import { traverse } from '../core/traverser.ts';

interface HitRecord {
  class: string;
  count: number;
}

export function build(
  samples: Array<{ payload: unknown }>,
  seedDetectors: CompiledIndex['detectors'],
): Index {
  const pathHits = new Map<string, Map<string, number>>();
  const pathCounts = new Map<string, number>();
  const keyHits = new Map<string, Map<string, number>>();
  const keyCounts = new Map<string, number>();
  const keyPaths = new Map<string, Set<string>>();

  for (const sample of samples) {
    for (const node of traverse(sample.payload)) {
      const np = node.normalizedPath;
      pathCounts.set(np, (pathCounts.get(np) ?? 0) + 1);
      keyCounts.set(node.key, (keyCounts.get(node.key) ?? 0) + 1);

      if (!keyPaths.has(node.key)) keyPaths.set(node.key, new Set());
      keyPaths.get(node.key)!.add(np);

      if (node.value === null || node.value === undefined) continue;
      const strValue = String(node.value);

      for (const detector of seedDetectors) {
        if (detector.mode !== 'fullmatch') continue;
        detector.regex.lastIndex = 0;
        if (detector.regex.test(strValue)) {
          if (!pathHits.has(np)) pathHits.set(np, new Map());
          const pm = pathHits.get(np)!;
          pm.set(detector.class, (pm.get(detector.class) ?? 0) + 1);

          if (!keyHits.has(node.key)) keyHits.set(node.key, new Map());
          const km = keyHits.get(node.key)!;
          km.set(detector.class, (km.get(detector.class) ?? 0) + 1);
        }
      }
    }
  }

  const pathClasses: Record<string, PathClass> = {};
  for (const [path, hits] of pathHits) {
    const total = [...hits.values()].reduce((a, b) => a + b, 0);
    const count = pathCounts.get(path) ?? 0;
    if (count < 3) continue;
    const winner = bestClass(hits);
    if (!winner || winner.count < 3 || winner.count / total < 0.95) continue;
    pathClasses[path] = {
      class: winner.class,
      confidence: round2(winner.count / total),
      count,
    };
  }

  const keyClassesResult: Record<string, PathClass> = {};
  for (const [key, hits] of keyHits) {
    const total = [...hits.values()].reduce((a, b) => a + b, 0);
    const count = keyCounts.get(key) ?? 0;
    const uniquePaths = keyPaths.get(key)?.size ?? 0;
    if (count < 10) continue;
    if (uniquePaths < 3) continue;
    const winner = bestClass(hits);
    if (!winner || winner.count < 10 || winner.count / total < 0.90) continue;
    keyClassesResult[key] = {
      class: winner.class,
      confidence: round2(winner.count / total),
      count,
    };
  }

  const rawDetectors: Detector[] = seedDetectors.map((d) => ({
    id: d.id,
    class: d.class,
    mode: d.mode,
    pattern: d.pattern,
    confidence: d.confidence,
  }));

  return {
    version: 1,
    path_classes: pathClasses,
    key_classes: keyClassesResult,
    detectors: rawDetectors,
  };
}

function bestClass(hits: Map<string, number>): HitRecord | null {
  let best: HitRecord | null = null;
  for (const [cls, count] of hits) {
    if (!best || count > best.count) best = { class: cls, count };
  }
  return best;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
