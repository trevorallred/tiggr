# tiggr

Tiggr is a small, deterministic, dependency-aware test execution engine. It runs tests in a DAG,
keeps test data provenance explicit through per-test outputs, and captures structured observations
as part of each run record. It has no knowledge of any application domain and no dependency on
internal proprietary packages.

## Installing from Git

The engine can be installed directly from this repository without being published to npm:

```sh
pnpm add tiggr@github:trevorallred/tiggr#path:packages/engine
```

The committed `build/` output is included for git consumers, so installation does not run a
lifecycle script and needs no `pnpm.onlyBuiltDependencies` (or other consumer-side build
permission). Pin a commit or tag for a reproducible dependency, for example:

```json
{
  "dependencies": {
    "tiggr": "github:trevorallred/tiggr#<commit-or-tag>&path:packages/engine"
  }
}
```

## Defining tests

Use `test()` to define an ID, an optional set of dependencies, and a `run` function. A separate
optional `verify` function can assert the result; when it is omitted, a test passes as long as
`run` does not throw.

```typescript
import { resource, runTests, test } from 'tiggr'

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
      reference: 'https://example.test/issues/42',
      createdBy: 'test-agent',
      createdAt: '2026-08-24T00:00:00.000Z',
      reasoning: 'Protect project creation from regressions',
    },
    run: async ({ config, observe }) => {
      const response = await fetch(`${config.baseUrl}/projects`, { method: 'POST' })
      observe({ type: 'http', method: 'POST', path: '/projects', status: response.status })
      return (await response.json()) as Project
    },
    verify: ({ observe }, project) => {
      const passed = Boolean(project.id)
      observe({ type: 'assertion', expected: 'a project ID', actual: project.id, passed })
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

- `outputs` is a read-only, Map-like view. A test's JSON-safe `run` return value is published under
  its ID only after `verify` succeeds. `verify` receives that just-produced value as its second
  argument; downstream tests see only successful upstream artifacts.
- `config` is a read-only suite-wide seed value. Plain objects and arrays are frozen in place,
  while functions and client instances remain usable and are not cloned. Use outputs, not config
  mutation, to pass data through the graph.
- `observe(value)` appends a structured observation to that test's run record. Built-in shapes
  cover HTTP calls, events, polling, and assertions; custom `type` values and extra fields are
  supported. Outputs and observations are normalized across an explicit JSON-value boundary;
  circular references, class instances, dates, functions, and other non-JSON values fail the test.

`intent`, `invariants`, and `provenance` are descriptive metadata only. The core does not enforce
policy based on them. Provenance requires only `origin`; `reference`, `createdBy`, `createdAt`, and
`reasoning` are optional.

## Singleton resources

`resource()` groups one creator and one destroyer under a logical ID. A consumer declares
`uses: ['project']`; the engine compiles that into ordinary `dependsOn` and `tearsDown` edges before
validation and scheduling. Resources are singleton lifecycle sugar, not a second runtime concept.

```typescript
const project = resource<Config, Project>({
  id: 'project',
  create: test({
    id: 'createProject',
    run: async ({ config }) => createProject(config.baseUrl),
  }),
  destroy: test({
    id: 'archiveProject',
    run: async ({ config, outputs }) => {
      const created = outputs.get<Project>('createProject')
      await archiveProject(config.baseUrl, created?.id)
    },
  }),
})

const createDocument = test<Config>({
  id: 'createDocument',
  uses: ['project'],
  run: async () => {},
})

await runTests([project, createDocument], { config })
```

## Scheduling and options

`dependsOn` controls forward execution. A failed or skipped dependency causes its consumers to be
skipped. `tearsDown` points to the test whose complete dependent subtree must finish before the
teardown runs. Independent runnable tests execute in parallel during each scheduler scan.

`runTests` accepts:

- `config`: required read-only suite configuration
- `dryRun`: calculate scheduling, filtering, and results without calling `run` or `verify`
- `include`: run matching test IDs or tags plus their full transitive dependency closure
- `exclude`: skip matching test IDs or tags; exclusion overrides inclusion
- `includeStartMessage`: enable or disable progress logs
- `showSkipped`: control skipped-test visibility in `printTestOutput`

The returned `TestRunnerOutput` is the source of truth. Its run envelope includes `runId`,
`startedAt`, `completedAt`, `engineVersion`, and optional caller-supplied JSON metadata. It also
contains the suite result and one JSON-serializable record per test, including status, loop,
duration, output, observations, error or skip reason, and descriptive metadata.
When `result.result === 'pass'`, every declared test completed and passed; check `result.result`
alone for overall success. Use `result.tests` for per-test diagnostic detail (such as errors or
observations) on failure, rather than re-verifying which tests ran or their individual pass status.
`printTestOutput(result)` is an optional human-readable formatter.
