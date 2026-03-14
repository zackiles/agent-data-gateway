import type { Classification, CompiledIndex, LeafNode, ReasoningConfig } from '../core/types.ts';
import { sample } from './sampler.ts';
import { invoke } from './invoker.ts';

export interface ReasoningMiddleware {
  classify(unknowns: LeafNode[], index: CompiledIndex): Promise<Classification[]>;
}

export async function create(config: ReasoningConfig): Promise<ReasoningMiddleware> {
  let promptContent: string;
  try {
    promptContent = await Deno.readTextFile(config.promptFile);
  } catch {
    console.error(`Reasoning: could not load prompt file at ${config.promptFile}`);
    return { classify: () => Promise.resolve([]) };
  }

  let cliAvailable = true;
  try {
    const cmd = new Deno.Command(config.cli, {
      args: ['--version'],
      stdout: 'piped',
      stderr: 'piped',
    });
    const { code } = await cmd.output();
    if (code !== 0) cliAvailable = false;
  } catch {
    console.error(`Reasoning: CLI "${config.cli}" not found on PATH. Reasoning disabled.`);
    cliAvailable = false;
  }

  let coolingDown = false;

  return {
    async classify(unknowns: LeafNode[], _index: CompiledIndex): Promise<Classification[]> {
      if (!cliAvailable || coolingDown) return [];
      if (unknowns.length === 0) return [];

      try {
        const samples = sample(unknowns, config.maxSamples);
        const results = await invoke(samples, promptContent, config);
        return results;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Reasoning: invocation failed: ${msg}`);
        if (msg.includes('rate') || msg.includes('quota')) {
          coolingDown = true;
          setTimeout(() => {
            coolingDown = false;
          }, config.cooldown);
        }
        return [];
      }
    },
  };
}
