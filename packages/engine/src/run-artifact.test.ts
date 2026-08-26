import { runTests } from './main.js'
import { resource, test } from './types.js'
import { config, type Config, resetRuns, stubTest } from '../test/test-helpers.js'

beforeEach(resetRuns)

it('publishes verified returned outputs to downstream tests', async () => {
  type Project = { id: string }
  let downstreamProject: Project | undefined
  let verifiedProject: Project | undefined
  const result = await runTests(
    [
      test<Config, Project>({
        id: 'create-project',
        run: ({ config: readOnlyConfig }) => ({ id: `${readOnlyConfig.baseUrl}/projects/1` }),
        verify: ({ outputs }, output) => {
          expect(outputs.has('create-project')).toBe(false)
          verifiedProject = output
        },
      }),
      test<Config>({
        id: 'read-project',
        dependsOn: ['create-project'],
        run: ({ outputs }) => {
          downstreamProject = outputs.get<Project>('create-project')
        },
      }),
    ],
    { config, includeStartMessage: false }
  )
  const expected = { id: 'https://example.test/projects/1' }
  expect(verifiedProject).toEqual(expected)
  expect(downstreamProject).toEqual(expected)
  expect(result.tests.find(({ id }) => id === 'create-project')?.output).toEqual(expected)
})

it('captures structured observations from both run and verify', async () => {
  const result = await runTests(
    [
      test<Config, { status: number }>({
        id: 'observed',
        run: (context) => {
          context.observe({ type: 'http', method: 'POST', path: '/documents', status: 202 })
          context.observe({ type: 'event', name: 'document.queued', documentId: 'doc-1' })
          return { status: 202 }
        },
        verify: (context, output) => {
          context.observe({ type: 'poll', attempts: 3, settled: true })
          context.observe({ type: 'assertion', expected: 202, actual: output.status, passed: true })
        },
      }),
    ],
    { config, includeStartMessage: false }
  )
  expect(result.tests[0]?.observations).toEqual([
    { type: 'http', method: 'POST', path: '/documents', status: 202 },
    { type: 'event', name: 'document.queued', documentId: 'doc-1' },
    { type: 'poll', attempts: 3, settled: true },
    { type: 'assertion', expected: 202, actual: 202, passed: true },
  ])
})

it('keeps verify separate and reports verification failures', async () => {
  const result = await runTests(
    [
      stubTest('verified', {
        run: () => 'run output',
        verify: () => {
          throw new Error('verification failed')
        },
      }),
    ],
    { config, includeStartMessage: false }
  )
  expect(result.tests[0]).toMatchObject({ passed: 'fail', error: 'verification failed' })
  expect(result.tests[0]).not.toHaveProperty('output')
})

it('freezes plain config in place without cloning or freezing client instances', async () => {
  let receivedConfig: Readonly<Config> | undefined
  class Client {
    calls = 0
    request(): void {
      this.calls++
    }
  }
  const client = new Client()
  const nestedConfig: Config = { baseUrl: config.baseUrl, headers: { authorization: 'secret' } }
  const configWithClient = { ...nestedConfig, client, buildUrl: (path: string) => `${nestedConfig.baseUrl}${path}` }
  await runTests(
    [
      test<typeof configWithClient>({
        id: 'config',
        run: ({ config: readOnlyConfig }) => {
          receivedConfig = readOnlyConfig
          readOnlyConfig.client.request()
          expect(readOnlyConfig.buildUrl('/ok')).toBe('https://example.test/ok')
        },
      }),
    ],
    { config: configWithClient, includeStartMessage: false }
  )
  expect(receivedConfig).toBe(configWithClient)
  expect(Object.isFrozen(receivedConfig)).toBe(true)
  expect(Object.isFrozen(receivedConfig?.headers)).toBe(true)
  expect(receivedConfig?.headers).toBe(nestedConfig.headers)
  expect(Object.isFrozen(client)).toBe(false)
  expect(client.calls).toBe(1)
})

it('rejects non-JSON outputs and observations instead of silently corrupting the artifact', async () => {
  const outputResult = await runTests(
    [stubTest('date-output', { run: () => new Date('2026-08-24T00:00:00.000Z') })],
    { config, includeStartMessage: false }
  )
  expect(outputResult.tests[0]).toMatchObject({
    passed: 'fail',
    error: 'output from date-output contains a non-plain object',
  })
  const observationResult = await runTests(
    [
      stubTest('bad-observation', {
        run: (context) => {
          context.observe({ type: 'custom', value: undefined } as never)
        },
      }),
    ],
    { config, includeStartMessage: false }
  )
  expect(observationResult.tests[0]).toMatchObject({
    passed: 'fail',
    error: 'observation from bad-observation contains a non-JSON value',
  })
})

it('returns a JSON-safe run envelope with caller metadata', async () => {
  const before = new Date().toISOString()
  const result = await runTests([stubTest('a')], {
    config,
    metadata: { commit: 'abc123', trigger: { kind: 'manual' } },
    includeStartMessage: false,
  })
  const after = new Date().toISOString()
  expect(result.runId).toMatch(/^[0-9a-f-]{36}$/)
  expect(result.startedAt >= before).toBe(true)
  expect(result.completedAt <= after).toBe(true)
  expect(result.engineVersion).toBe('2.0.0')
  expect(result.metadata).toEqual({ commit: 'abc123', trigger: { kind: 'manual' } })
  expect(() => JSON.stringify(result)).not.toThrow()
})

it('carries intent, invariants, uses, and provenance into the run record', async () => {
  const provenance = { origin: 'production incident' }
  const project = resource<Config>({
    id: 'project',
    create: stubTest('create-project'),
    destroy: stubTest('destroy-project'),
  })
  const result = await runTests(
    [
      project,
      stubTest('metadata', {
        intent: 'Projects stay isolated',
        invariants: ['Search never crosses project boundaries'],
        uses: ['project'],
        provenance,
      }),
    ],
    { config, includeStartMessage: false }
  )
  const metadata = result.tests.find(({ id }) => id === 'metadata')
  expect(metadata).toMatchObject({
    intent: 'Projects stay isolated',
    invariants: ['Search never crosses project boundaries'],
    uses: ['project'],
    provenance,
  })
  expect(Object.hasOwn(metadata ?? {}, 'definition')).toBe(false)
})
