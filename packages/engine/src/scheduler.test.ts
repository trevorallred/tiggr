import { runTests } from './main.js'
import { config, resetRuns, runs, stubTest } from '../test/test-helpers.js'

beforeEach(resetRuns)

it('runs dependencies before consumers and independent tests in the same loop', async () => {
  const result = await runTests(
    [
      stubTest('fan-in', {
        dependsOn: ['left', 'right'],
        run: ({ outputs }) => runs.push(`fan-in:${String(outputs.get('root'))}`),
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
  const verify = vi.fn<() => void>()
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
