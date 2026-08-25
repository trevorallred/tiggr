import { runTests } from './main'
import { test, type TestDefinition } from './types'

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

  it('detects circular dependencies', async () => {
    await expect(
      runTests([stubTest('a', { dependsOn: ['b'] }), stubTest('b', { dependsOn: ['a'] })], {
        config,
        includeStartMessage: false,
      })
    ).rejects.toThrow('No tests ran this loop, possible circular dependency')
  })

  it('filters by included IDs and tags', async () => {
    const result = await runTests(
      [stubTest('by-id'), stubTest('by-tag', { tags: ['selected'] }), stubTest('other')],
      { config, include: ['by-id', 'selected'], includeStartMessage: false }
    )

    expect(runs).toEqual(['by-id', 'by-tag'])
    expect(result.tests.find(({ id }) => id === 'other')?.passed).toBe('skip')
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

  it('makes each returned output available to downstream tests and verify', async () => {
    type Project = { id: string }
    let downstreamProject: Project | undefined
    let verifiedProject: Project | undefined

    const result = await runTests(
      [
        test<Config, Project>({
          id: 'create-project',
          run: ({ config: readOnlyConfig }) => ({ id: `${readOnlyConfig.baseUrl}/projects/1` }),
          verify: ({ outputs }) => {
            verifiedProject = outputs.get<Project>('create-project')
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
          verify: ({ observe, outputs }) => {
            observe({ type: 'poll', attempts: 3, settled: true })
            observe({
              type: 'assertion',
              expected: 202,
              actual: outputs.get<{ status: number }>('observed')?.status,
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
      output: 'run output',
      error: 'verification failed',
    })
  })

  it('provides a frozen suite-wide config', async () => {
    let receivedConfig: Readonly<Config> | undefined
    const nestedConfig: Config = {
      baseUrl: config.baseUrl,
      headers: { authorization: 'secret' },
    }
    await runTests(
      [
        stubTest('config', {
          run: ({ config: readOnlyConfig }) => {
            receivedConfig = readOnlyConfig
          },
        }),
      ],
      { config: nestedConfig, includeStartMessage: false }
    )

    expect(receivedConfig).toEqual(nestedConfig)
    expect(Object.isFrozen(receivedConfig)).toBe(true)
    expect(Object.isFrozen(receivedConfig?.headers)).toBe(true)
    expect(receivedConfig?.headers).not.toBe(nestedConfig.headers)
  })

  it('carries intent, invariants, uses, and provenance into the run record', async () => {
    const provenance = {
      origin: 'production incident',
      issueLink: 'https://example.test/issues/1',
      createdBy: 'agent',
      createdAt: '2026-08-24T00:00:00.000Z',
      reasoning: 'Prevent a regression',
    }
    const result = await runTests(
      [
        stubTest('metadata', {
          intent: 'Projects stay isolated',
          invariants: ['Search never crosses project boundaries'],
          uses: ['project'],
          provenance,
        }),
      ],
      { config, includeStartMessage: false }
    )

    expect(result.tests[0]).toMatchObject({
      intent: 'Projects stay isolated',
      invariants: ['Search never crosses project boundaries'],
      uses: ['project'],
      provenance,
    })
    expect(Object.hasOwn(result.tests[0] ?? {}, 'definition')).toBe(false)
  })
})
