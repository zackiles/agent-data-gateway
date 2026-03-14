# Adapter Template

Copy this directory to create a new identity adapter.

## Steps

1. Copy `_template/` to a new directory named after your adapter mode (e.g. `my-provider/`)
2. Implement the `extract(request)` function in `mod.ts`
3. Define your `Options` interface for adapter-specific config
4. Register your adapter in `src/adapters/mod.ts`
5. Add tests in `mod_test.ts` covering: success, missing auth, invalid auth, group extraction
6. Add a doc entry in `docs/provider-catalog.md`

## Contract

Your adapter MUST:

- Return an `Identity` with at least `user` populated
- Throw a clear `Error` when auth material is missing or invalid
- Not import anything from `src/core/` except types
- Not mutate the request body
- Be stateless per-request (startup initialization is fine)
