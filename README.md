# Tiggr

Tiggr 2: an agent-era, dependency-aware integration-test execution engine, rebuilt as a standalone
open-source project from an earlier private implementation.

This repo is a pnpm workspace:

- `packages/engine/` — the Tiggr 2 DAG engine core, with explicit per-test outputs, structured
  observations, and separate `run`/`verify` callbacks. It has no dependency on any internal
  proprietary package. See `packages/engine/README.md` for usage.
- `packages/cli/` — the JSON-first `tiggr run` command. It loads `tiggr.config.mjs` or
  `tiggr.config.js` from the current directory.
- `sample-app/` — a private, in-memory HTTP app and suite that dogfoods resource lifecycle,
  fan-out/fan-in execution, eventual-consistency polling, and project isolation.
- `packages/runner/` (planned) — an AI-driven test-runner package that designs/selects/diagnoses
  tests and drives the engine. Not yet added.

## Development

```sh
pnpm install
pnpm run build
pnpm run test
pnpm --filter @tiggr/sample-app dogfood
```

See `docs/TIGGER2_PLAN.md` for the phased build plan and `docs/OPEN_DECISIONS.md` for the captain's
decision record.
