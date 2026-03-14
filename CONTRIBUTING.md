# Contributing

## Development setup

1. Install [Deno 2.x](https://deno.land/).
2. Clone the repo: `git clone https://github.com/zackiles/agent-data-gateway.git`
3. Run tests: `deno task test`

## Adding an adapter

Follow [docs/adapter-authoring.md](docs/adapter-authoring.md). Copy `src/adapters/_template/`, implement `extract`, register in `src/adapters/mod.ts`, add tests, and add a provider-catalog entry.

## Running tests

```bash
deno task test
```

Tests use `--allow-read`, `--allow-env`, `--allow-net`, `--allow-run`, `--allow-write` as needed.

## Code style

- No inline comments unless documenting a hidden bug, critical warning (prefix with `// DANGER:` or `// IMPORTANT:`), TODO, or complex rationale
- Simple, idiomatic names; avoid shorthand (e.g. `Messages` not `Msgs`)
- Avoid single-caller methods: inline into the caller when logic is simple and not reused

## PR process

1. Branch from `main`
2. Run `deno task test` and `deno task lint` before pushing
3. Open a PR with a clear description
4. Address review feedback
