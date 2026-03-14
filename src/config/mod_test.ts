import { assertEquals, assertRejects } from '@std/assert';
import { load } from './mod.ts';

Deno.test('load - throws on missing required keys', async () => {
  const original = {
    adapter: Deno.env.get('SCRUBBER_ADAPTER'),
    index: Deno.env.get('SCRUBBER_INDEX'),
    policy: Deno.env.get('SCRUBBER_POLICY'),
  };
  try {
    Deno.env.delete('SCRUBBER_ADAPTER');
    Deno.env.delete('SCRUBBER_INDEX');
    Deno.env.delete('SCRUBBER_POLICY');
    Deno.env.delete('SCRUBBER_CONFIG');
    await assertRejects(() => load(), Error, 'SCRUBBER_ADAPTER');
  } finally {
    if (original.adapter) Deno.env.set('SCRUBBER_ADAPTER', original.adapter);
    if (original.index) Deno.env.set('SCRUBBER_INDEX', original.index);
    if (original.policy) Deno.env.set('SCRUBBER_POLICY', original.policy);
  }
});

Deno.test('load - reads env vars', async () => {
  const original = {
    adapter: Deno.env.get('SCRUBBER_ADAPTER'),
    index: Deno.env.get('SCRUBBER_INDEX'),
    policy: Deno.env.get('SCRUBBER_POLICY'),
    port: Deno.env.get('SCRUBBER_PORT'),
    config: Deno.env.get('SCRUBBER_CONFIG'),
  };
  try {
    Deno.env.set('SCRUBBER_ADAPTER', 'no-auth');
    Deno.env.set('SCRUBBER_INDEX', './data/example-index.json');
    Deno.env.set('SCRUBBER_POLICY', './data/example-policy.json');
    Deno.env.set('SCRUBBER_PORT', '9090');
    Deno.env.delete('SCRUBBER_CONFIG');

    const config = await load();
    assertEquals(config.adapter, 'no-auth');
    assertEquals(config.index, './data/example-index.json');
    assertEquals(config.policy, './data/example-policy.json');
    assertEquals(config.port, 9090);
    assertEquals(config.reasoning.enabled, false);
  } finally {
    for (const [k, v] of Object.entries(original)) {
      const envKey = `SCRUBBER_${k.toUpperCase()}`;
      if (v) Deno.env.set(envKey, v);
      else Deno.env.delete(envKey);
    }
  }
});
