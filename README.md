# Tigger

Tigger 2: an agent-era, dependency-aware integration-test execution engine — the successor to
`packages/tigger` in the Terros sales monorepo.

This repo is a pnpm workspace:

- `packages/engine/` — a standalone port of today's `packages/tigger` engine from the Terros sales
  monorepo, with no dependency on any Terros-internal package. This is the known-good baseline the
  Tigger 2 redesign will build on top of. See `packages/engine/README.md` for usage.
- `packages/runner/` (planned) — an AI-driven test-runner package that designs/selects/diagnoses
  tests and drives the engine. Not yet added.

## Development

```sh
pnpm install
pnpm run build
pnpm run test
```

This repo is freshly scaffolded and under active planning for the Tigger 2 redesign. See the
backlog/report for the current build plan before contributing.
