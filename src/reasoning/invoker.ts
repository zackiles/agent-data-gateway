import type { Classification, ReasoningConfig } from '../core/types.ts';
import type { SampleFile } from './sampler.ts';

interface CliClassification {
  path: string;
  key: string;
  class: string;
  confidence: number;
  reasoning?: string;
}

export async function invoke(
  sampleFile: SampleFile,
  promptContent: string,
  config: ReasoningConfig,
): Promise<Classification[]> {
  const tmpDir = await Deno.makeTempDir({ prefix: 'scrubber-reasoning-' });

  try {
    const samplePath = `${tmpDir}/samples.json`;
    await Deno.writeTextFile(samplePath, JSON.stringify(sampleFile, null, 2));

    const prompt = promptContent.replace('{{SAMPLE_FILE_PATH}}', 'samples.json');

    if (config.cli === 'cursor') {
      await Deno.writeTextFile(`${tmpDir}/.cursorrules`, prompt);
    }

    const args = buildArgs(config, prompt, tmpDir);
    const cmd = new Deno.Command(config.cli, {
      args,
      cwd: tmpDir,
      stdout: 'piped',
      stderr: 'piped',
      env: {},
    });

    const child = cmd.spawn();
    const result = await Promise.race([
      child.output(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          try {
            child.kill('SIGTERM');
          } catch { /* already exited */ }
          reject(new Error(`CLI timed out after ${config.timeout}ms`));
        }, config.timeout);
      }),
    ]);

    if (result.code !== 0) {
      const stderr = new TextDecoder().decode(result.stderr);
      throw new Error(`CLI exited with code ${result.code}: ${stderr.slice(0, 500)}`);
    }

    const stdout = new TextDecoder().decode(result.stdout);
    return parseOutput(stdout, sampleFile, config);
  } finally {
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch { /* cleanup best-effort */ }
  }
}

function buildArgs(config: ReasoningConfig, prompt: string, _tmpDir: string): string[] {
  if (config.cli === 'claude') {
    const args = [
      '-p',
      '--system-prompt-file',
      `${_tmpDir}/system-prompt.md`,
      '--output-format',
      'json',
      '--max-turns',
      '1',
      '--allowedTools',
      'Read',
    ];
    if (config.model) args.push('--model', config.model);
    Deno.writeTextFileSync(`${_tmpDir}/system-prompt.md`, prompt);
    args.push('Classify the data samples in samples.json');
    return args;
  }

  const args = ['-p', '--output-format', 'json'];
  if (config.model) args.push('--model', config.model);
  args.push(`${prompt}\n\nClassify the data samples in samples.json`);
  return args;
}

function parseOutput(
  stdout: string,
  sampleFile: SampleFile,
  config: ReasoningConfig,
): Classification[] {
  let parsed: { result?: string; classifications?: CliClassification[] };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('CLI output is not valid JSON');
  }

  let classifications: CliClassification[];
  if (parsed.result) {
    try {
      const inner = JSON.parse(parsed.result);
      classifications = inner.classifications ?? [];
    } catch {
      throw new Error('CLI result field is not valid JSON');
    }
  } else if (parsed.classifications) {
    classifications = parsed.classifications;
  } else {
    throw new Error('CLI output missing "result" or "classifications"');
  }

  const concretePathMap = new Map<string, string[]>();
  for (const s of sampleFile.samples) {
    concretePathMap.set(s.path, s.concrete_paths);
  }

  const results: Classification[] = [];
  for (const c of classifications) {
    if (c.class === 'unknown' || c.confidence < config.minConfidence) continue;
    const concretePaths = concretePathMap.get(c.path) ?? [c.path];
    for (const path of concretePaths) {
      results.push({
        path,
        class: c.class,
        source: 'reasoning',
        confidence: c.confidence,
      });
    }
  }
  return results;
}
