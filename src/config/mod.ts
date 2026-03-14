import type { Config, ReasoningConfig } from '../core/types.ts';

function env(key: string): string | undefined {
  return Deno.env.get(key);
}

function required(key: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required config: set ${key} as an environment variable or in the config file`,
    );
  }
  return value;
}

async function loadFile(path: string): Promise<Record<string, unknown>> {
  try {
    const text = await Deno.readTextFile(path);
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function extractAdapterConfig(
  file: Record<string, unknown>,
  adapter: string,
): Record<string, string> {
  const section = file[adapter];
  if (section && typeof section === 'object' && !Array.isArray(section)) {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(section as Record<string, unknown>)) {
      if (typeof v === 'string') result[k] = v;
    }
    return result;
  }
  return {};
}

function loadReasoningConfig(file: Record<string, unknown>): ReasoningConfig {
  const reasoning = (file.reasoning ?? {}) as Record<string, unknown>;
  const cli = env('SCRUBBER_REASONING_CLI') ?? String(reasoning.cli ?? 'claude');
  if (cli !== 'claude' && cli !== 'cursor') {
    throw new Error(`SCRUBBER_REASONING_CLI must be "claude" or "cursor", got "${cli}"`);
  }
  return {
    enabled: (env('SCRUBBER_REASONING_ENABLED') ?? String(reasoning.enabled ?? 'false')) === 'true',
    cli,
    model: env('SCRUBBER_REASONING_MODEL') ?? (reasoning.model as string | undefined),
    timeout: Number(env('SCRUBBER_REASONING_TIMEOUT') ?? reasoning.timeout ?? 30000),
    minConfidence: Number(
      env('SCRUBBER_REASONING_MIN_CONFIDENCE') ?? reasoning.min_confidence ?? 0.5,
    ),
    maxSamples: Number(env('SCRUBBER_REASONING_MAX_SAMPLES') ?? reasoning.max_samples ?? 50),
    cooldown: Number(env('SCRUBBER_REASONING_COOLDOWN') ?? reasoning.cooldown ?? 60000),
    promptFile: env('SCRUBBER_REASONING_PROMPT_FILE') ??
      (reasoning.prompt_file as string | undefined) ??
      'src/core/system-prompt-agent-classifier.md',
  };
}

export async function load(): Promise<Config> {
  const configPath = env('SCRUBBER_CONFIG');
  const file = configPath ? await loadFile(configPath) : {};

  const adapter = env('SCRUBBER_ADAPTER') ?? (file.adapter as string | undefined);
  const index = env('SCRUBBER_INDEX') ?? (file.index as string | undefined);
  const policy = env('SCRUBBER_POLICY') ?? (file.policy as string | undefined);
  const port = Number(env('SCRUBBER_PORT') ?? file.port ?? 8080);

  return {
    adapter: required('SCRUBBER_ADAPTER', adapter),
    index: required('SCRUBBER_INDEX', index),
    policy: required('SCRUBBER_POLICY', policy),
    port,
    configFile: configPath,
    adapterConfig: extractAdapterConfig(file, adapter ?? ''),
    reasoning: loadReasoningConfig(file),
  };
}
