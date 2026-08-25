import { compileDefinitions, runTests } from './main.js'
import { resource, test, type TestDefinition } from './types.js'

type Config = { baseUrl: string; headers?: { authorization: string } }

describe('runTests', () => {
  const config: Config = { baseUrl: 'https://example.test' }
  let runs: string[]

  beforeEach(() => {
    runs = []
  })

  function stubTest(id: string, partial: Partial<TestDefinition<Config>> = {}): TestDefinition<Config> {
    return {
      id,
      run: () => {
        runs.push(id)
      },
      ...partial,
    }
  }

  it('runs dependencies before consumers and independent tests in the same loop', async () => {
    const result = await runTests(
      [
        stubTest('fan-in', {
          dependsOn: ['left', 'right'],
          run: ({ outputs }) => runs.push(`fan-in:${outputs.get('root')}`),
        }),
        stubTest('left', { dependsOn: ['root'] }),
        stubTest('right', { dependsOn: ['root'] }),
        stubTest('root', {
          run: () => {
            runs.push('root')
            return 'created'
          },
        }),
      ],
      { config, includeStartMessage: false }
    )

    expect(runs).toEqual(['root', 'left', 'right', 'fan-in:created'])
    expect(result.tests.find(({ id }) => id === 'left')?.loop).toBe(2)
    expect(result.tests.find(({ id }) => id === 'right')?.loop).toBe(2)
    expect(result.tests.find(({ id }) => id === 'fan-in')?.loop).toBe(3)
  })

  it('executes all runnable tests in a loop concurrently', async () => {
    let active = 0
    let maximumActive = 0
    let release: (() => void) | undefined
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const concurrentRun = async (): Promise<void> => {
      active++
      maximumActive = Math.max(maximumActive, active)
      if (maximumActive === 2) release?.()
      await barrier
      active--
    }

    await runTests(
      [stubTest('left', { run: concurrentRun }), stubTest('right', { run: concurrentRun })],
      { config, includeStartMessage: false }
    )

    expect(maximumActive).toBe(2)
  })

  it('waits to tear down a target until its full dependent tree is complete', async () => {
    await runTests(
      [
        stubTest('create-child', { dependsOn: ['create-parent'] }),
        stubTest('create-parent'),
        stubTest('remove-parent', { tearsDown: 'create-parent' }),
        stubTest('remove-child', { tearsDown: 'create-child' }),
      ],
      { config, includeStartMessage: false }
    )

    expect(runs).toEqual(['create-parent', 'create-child', 'remove-child', 'remove-parent'])
  })

  it('propagates a failure forward as skips', async () => {
    const result = await runTests(
      [
        stubTest('a', {
          run: () => {
            throw new Error('boom')
          },
        }),
        stubTest('b', { dependsOn: ['a'] }),
        stubTest('c', { dependsOn: ['b'] }),
      ],
      { config, includeStartMessage: false }
    )

    expect(runs).toEqual([])
    expect(result.result).toBe('fail')
    expect(result.tests.map(({ passed }) => passed)).toEqual(['fail', 'skip', 'skip'])
    expect(result.tests[0]?.error).toBe('boom')
    expect(result.tests[1]?.skipReason).toBe('previous tests failed or skipped')
  })

  it('marks tests passed without calling run or verify in dry-run mode', async () => {
    const verify = vi.fn()
    const result = await runTests([stubTest('a', { verify })], {
      config,
      dryRun: true,
      includeStartMessage: false,
    })

    expect(runs).toEqual([])
    expect(verify).not.toHaveBeenCalled()
    expect(result.result).toBe('pass')
    expect(result.tests[0]).toMatchObject({ id: 'a', passed: 'pass', observations: [] })
  })

  it('detects circular dependencies before execution and reports the cycle path', async () => {
    await expect(
      runTests([stubTest('a', { dependsOn: ['b'] }), stubTest('b', { dependsOn: ['a'] })], {
        config,
        includeStartMessage: false,
      })
    ).rejects.toThrow('Circular dependency: a -> b -> a')
  })

  it('detects teardown cycles before execution and reports the cycle path', async () => {
    await expect(
      runTests([stubTest('a', { tearsDown: 'b' }), stubTest('b', { tearsDown: 'a' })], {
        config,
        includeStartMessage: false,
      })
    ).rejects.toThrow('Circular dependency: a -> b -> a')
  })

  it('filters by included IDs and tags', async () => {
    const result = await runTests(
      [stubTest('by-id'), stubTest('by-tag', { tags: ['selected'] }), stubTest('other')],
      { config, include: ['by-id', 'selected'], includeStartMessage: false }
    )

    expect(runs).toEqual(['by-id', 'by-tag'])
    expect(result.tests.find(({ id }) => id === 'other')?.passed).toBe('skip')
  })

  it('includes the full transitive dependency closure of selected tests', async () => {
    const result = await runTests(
      [
        stubTest('root'),
        stubTest('middle', { dependsOn: ['root'] }),
        stubTest('selected', { dependsOn: ['middle'], tags: ['focus'] }),
        stubTest('unrelated'),
      ],
      { config, include: ['focus'], includeStartMessage: false }
    )

    expect(runs).toEqual(['root', 'middle', 'selected'])
    expect(result.tests.find(({ id }) => id === 'unrelated')?.passed).toBe('skip')
  })

  it('lets exclude destructively override an included dependency', async () => {
    const result = await runTests(
      [stubTest('root'), stubTest('selected', { dependsOn: ['root'] })],
      { config, include: ['selected'], exclude: ['root'], includeStartMessage: false }
    )

    expect(runs).toEqual([])
    expect(result.tests.map(({ passed }) => passed)).toEqual(['skip', 'skip'])
  })

  it('filters by excluded IDs and tags, overriding include', async () => {
    const result = await runTests(
      [stubTest('by-id'), stubTest('by-tag', { tags: ['excluded'] }), stubTest('kept', { tags: ['selected'] })],
      {
        config,
        include: ['by-id', 'excluded', 'selected'],
        exclude: ['by-id', 'excluded'],
        includeStartMessage: false,
      }
    )

    expect(runs).toEqual(['kept'])
    expect(result.tests.map(({ passed }) => passed)).toEqual(['skip', 'skip', 'pass'])
  })

  it('honors skip and only flags', async () => {
    const result = await runTests(
      [stubTest('ordinary'), stubTest('selected', { only: true }), stubTest('selected-but-skipped', { only: true, skip: true })],
      { config, includeStartMessage: false }
    )

    expect(runs).toEqual(['selected'])
    expect(result.tests.map(({ passed }) => passed)).toEqual(['skip', 'pass', 'skip'])
  })

  it('waits for a teardown target to complete', async () => {
    await runTests([stubTest('remove', { tearsDown: 'create' }), stubTest('create')], {
      config,
      includeStartMessage: false,
    })

    expect(runs).toEqual(['create', 'remove'])
  })

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
          run: ({ observe }) => {
            observe({ type: 'http', method: 'POST', path: '/documents', status: 202 })
            observe({ type: 'event', name: 'document.queued', documentId: 'doc-1' })
            return { status: 202 }
          },
          verify: ({ observe }, output) => {
            observe({ type: 'poll', attempts: 3, settled: true })
            observe({
              type: 'assertion',
              expected: 202,
              actual: output.status,
              passed: true,
            })
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

    expect(result.tests[0]).toMatchObject({
      passed: 'fail',
      error: 'verification failed',
    })
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
    const nestedConfig: Config = {
      baseUrl: config.baseUrl,
      headers: { authorization: 'secret' },
    }
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
    expect(outputResult.tests[0]).toMatchObject({ passed: 'fail', error: 'output from date-output contains a non-plain object' })

    const observationResult = await runTests(
      [
        stubTest('bad-observation', {
          run: ({ observe }) => observe({ type: 'custom', value: undefined } as never),
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

  it('compiles singleton resources into ordinary dependency and teardown nodes', async () => {
    const project = resource<Config, { id: string }>({
      id: 'project',
      create: test({
        id: 'createProject',
        run: () => {
          runs.push('createProject')
          return { id: 'project-1' }
        },
      }),
      destroy: test({
        id: 'archiveProject',
        run: ({ outputs }) => {
          runs.push(`archiveProject:${outputs.get<{ id: string }>('createProject')?.id}`)
        },
      }),
    })
    const definitions = compileDefinitions<Config>([
      project,
      stubTest('left', { uses: ['project'] }),
      stubTest('right', { uses: ['project'] }),
      stubTest('fan-in', { dependsOn: ['left', 'right'] }),
    ])

    expect(definitions.find(({ id }) => id === 'left')?.dependsOn).toEqual(['createProject'])
    expect(definitions.find(({ id }) => id === 'archiveProject')).toMatchObject({
      uses: ['project'],
      tearsDown: 'createProject',
    })

    const result = await runTests([project, stubTest('left', { uses: ['project'] }), stubTest('right', { uses: ['project'] }), stubTest('fan-in', { dependsOn: ['left', 'right'] })], {
      config,
      includeStartMessage: false,
    })

    expect(runs).toEqual(['createProject', 'left', 'right', 'fan-in', 'archiveProject:project-1'])
    expect(result.tests.map(({ id }) => id)).toEqual(['createProject', 'archiveProject', 'left', 'right', 'fan-in'])
  })

  it('keeps resource teardown selected when a consumer is included', async () => {
    const project = resource<Config>({
      id: 'project',
      create: stubTest('createProject'),
      destroy: stubTest('archiveProject'),
    })

    const result = await runTests([project, stubTest('consumer', { uses: ['project'] }), stubTest('other')], {
      config,
      include: ['consumer'],
      includeStartMessage: false,
    })

    expect(runs).toEqual(['createProject', 'consumer', 'archiveProject'])
    expect(result.tests.find(({ id }) => id === 'other')?.passed).toBe('skip')
  })

  it('rejects missing and duplicate singleton resource definitions', async () => {
    expect(() => compileDefinitions([stubTest('consumer', { uses: ['missing'] })])).toThrow(
      'Resource missing not found (used by consumer)'
    )

    const one = resource({ id: 'project', create: stubTest('create-one'), destroy: stubTest('destroy-one') })
    const two = resource({ id: 'project', create: stubTest('create-two'), destroy: stubTest('destroy-two') })
    expect(() => compileDefinitions([one, two])).toThrow('Duplicate resource id: project')
  })
})
