# @tigger/engine

Tigger is a small, deterministic, dependency-aware test execution engine. It runs tests in a DAG,
keeps test data provenance explicit through per-test outputs, and captures structured observations
as part of each run record. It has no knowledge of any application domain and no dependency on
Terros-internal packages.

## Defining tests

Use `test()` to define an ID, an optional set of dependencies, and a `run` function. A separate
optional `verify` function can assert the result; when it is omitted, a test passes as long as
`run` does not throw.

```typescript
import { runTests, test } from '@tigger/engine'

type Config = {
  baseUrl: string
}

type Project = {
  id: string
}

const tests = [
  test<Config, Project>({
    id: 'create-project',
    intent: 'Create an isolated project for the suite',
    invariants: ['The project ID is non-empty'],
    tags: ['projects'],
    provenance: {
      origin: 'issue',
      issueLink: 'https://example.test/issues/42',
      createdBy: 'test-agent',
      createdAt: '2026-08-24T00:00:00.000Z',
      reasoning: 'Protect project creation from regressions',
    },
    run: async ({ config, observe }) => {
      const response = await fetch(`${config.baseUrl}/projects`, { method: 'POST' })
      observe({ type: 'http', method: 'POST', path: '/projects', status: response.status })
      return (await response.json()) as Project
    },
    verify: ({ outputs, observe }) => {
      const project = outputs.get<Project>('create-project')
      const passed = Boolean(project?.id)
      observe({ type: 'assertion', expected: 'a project ID', actual: project?.id, passed })
      if (!passed) throw new Error('Project ID was empty')
    },
  }),
  test<Config>({
    id: 'read-project',
    dependsOn: ['create-project'],
    run: async ({ config, outputs }) => {
      const project = outputs.get<Project>('create-project')
      await fetch(`${config.baseUrl}/projects/${project?.id}`)
    },
  }),
]

const result = await runTests(tests, {
  config: { baseUrl: 'http://localhost:3000' },
})
```

`run` and `verify` receive the same context:

- `outputs` is a read-only, Map-like view. A test's `run` return value is stored under its ID before
  `verify` runs, and is available to downstream tests after the test passes.
- `config` is a read-only suite-wide seed value. Use outputs, not config mutation, to pass data
  through the graph.
- `observe(value)` appends a structured observation to that test's run record. Built-in shapes
  cover HTTP calls, events, polling, and assertions; custom `type` values and extra fields are
  supported.

`intent`, `invariants`, and `provenance` are descriptive metadata only. The core does not enforce
policy based on them. `uses` is accepted as resource metadata for the planned `resource()` layer;
resources themselves are not part of this package yet.

## Scheduling and options

`dependsOn` controls forward execution. A failed or skipped dependency causes its consumers to be
skipped. `tearsDown` points to the test whose complete dependent subtree must finish before the
teardown runs. Independent runnable tests execute in parallel during each scheduler scan.

`runTests` accepts:

- `config`: required read-only suite configuration
- `dryRun`: calculate scheduling, filtering, and results without calling `run` or `verify`
- `include`: run only matching test IDs or tags
- `exclude`: skip matching test IDs or tags; exclusion overrides inclusion
- `includeStartMessage`: enable or disable progress logs
- `showSkipped`: control skipped-test visibility in `printTestOutput`

The returned `TestRunnerOutput` is the source of truth. It contains the suite result and one JSON-
serializable record per test, including status, loop, duration, output, observations, error or skip
reason, and descriptive metadata. `printTestOutput(result)` is an optional human-readable formatter.
