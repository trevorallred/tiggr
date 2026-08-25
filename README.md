# Tigger

Tigger 2: an agent-era, dependency-aware integration-test execution engine — the successor to
`packages/tigger` in the Terros sales monorepo.

This repo is a pnpm workspace:

- `packages/engine/` — the Tigger 2 DAG engine core, with explicit per-test outputs, structured
  observations, and separate `run`/`verify` callbacks. It has no dependency on any Terros-internal
  package. See `packages/engine/README.md` for usage.
- `packages/cli/` — the JSON-first `tigger run` command. It loads `tigger.config.mjs` or
  `tigger.config.js` from the current directory.
- `sample-app/` — a private, in-memory HTTP app and suite that dogfoods resource lifecycle,
  fan-out/fan-in execution, eventual-consistency polling, and project isolation.
- `packages/runner/` (planned) — an AI-driven test-runner package that designs/selects/diagnoses
  tests and drives the engine. Not yet added.

## Development

```sh
pnpm install
pnpm run build
pnpm run test
pnpm --filter @tigger/sample-app dogfood
```

See `docs/TIGGER2_PLAN.md` for the phased build plan and `docs/OPEN_DECISIONS.md` for decisions that
gate later phases.
