import { messageFromError } from './util/error'
import { Logger } from './util/logger'
import {
  type Observation,
  type Outputs,
  type PassFail,
  type RunTestsOptions,
  type DeepReadonly,
  type TestContext,
  type TestDefinition,
  type TestId,
  type TestRun,
  type TestRunnerOutput,
} from './types'

const logger = new Logger('tester')
const MAX_LOOPS = 100
const RESCAN_DELAY_MS = 500

type RunnableTest<Config extends object> = TestRun & {
  definition: TestDefinition<Config, unknown>
}

/** Run a dependency-aware suite and return its complete structured result. */
export async function runTests<Config extends object>(
  definitions: TestDefinition<Config, unknown>[],
  options: RunTestsOptions<Config>
): Promise<TestRunnerOutput> {
  validateDefinitions(definitions)

  const suiteStart = Date.now()
  const config = deepFreeze(structuredClone(options.config))
  const outputValues = new Map<TestId, unknown>()
  const outputs = createOutputs(outputValues)
  const tests = definitions.map(startTest)
  const testsById = new Map(tests.map((current) => [current.id, current]))
  const onlyIsUsed = definitions.some((definition) => definition.only && !definition.skip)
  const includeStartMessage = options.includeStartMessage ?? true

  includeStartMessage && logger.info('Starting tests')

  function findTest(id: TestId): RunnableTest<Config> {
    const found = testsById.get(id)
    if (found) return found
    throw new Error(`Test ${id} not found`)
  }

  let loop = 0

  function finishTest(testRun: RunnableTest<Config>, passed: PassFail, duration: number): void {
    testRun.complete = true
    testRun.duration = duration
    testRun.loop = loop
    testRun.passed = passed
    updateTornDownTree(testRun)
  }

  function updateTornDownTree(testRun: RunnableTest<Config>): void {
    if (testRun.tornDown) return

    const unfinishedChildren = tests.filter((candidate) => {
      if (candidate.id === testRun.id || candidate.tornDown) return false
      return candidate.tearsDown === testRun.id || candidate.dependsOn?.includes(testRun.id) === true
    })

    testRun.tornDown = unfinishedChildren.length === 0
    if (!testRun.tornDown) return

    if (testRun.tearsDown) updateTornDownTree(findTest(testRun.tearsDown))
    testRun.dependsOn?.forEach((id) => updateTornDownTree(findTest(id)))
  }

  function shouldRunThisLoop(testRun: RunnableTest<Config>): boolean {
    if (testRun.complete) return false

    const dependencies = testRun.dependsOn ?? []
    if (dependencies.some((id) => !findTest(id).complete)) return false
    if (!testRun.tearsDown) return true

    const targetId = testRun.tearsDown
    return !tests.some((candidate) => {
      if (candidate.id === testRun.id) return false
      if (candidate.id === targetId && !candidate.complete) return true
      if (candidate.tornDown) return false
      return candidate.dependsOn?.includes(targetId) === true
    })
  }

  function skipReason(testRun: RunnableTest<Config>): string | undefined {
    if (testRun.skip) return 'test.skip = true'

    if (testRun.dependsOn?.some((id) => findTest(id).passed !== 'pass')) {
      return 'previous tests failed or skipped'
    }

    if (testRun.tearsDown && findTest(testRun.tearsDown).passed !== 'pass') {
      return 'previous test failed or skipped'
    }

    const exclude = options.exclude ?? []
    if (exclude.includes(testRun.id)) return 'test id excluded'
    if (exclude.some((tag) => testRun.tags?.includes(tag))) return 'test excluded by tag'

    const include = options.include ?? []
    if (include.length > 0 && !include.some((tag) => tagOnTest(tag, testRun))) {
      return 'test did not have an include tag'
    }

    if (onlyIsUsed && !testRun.only) return 'another test is marked as only'
    return undefined
  }

  async function runTest(testRun: RunnableTest<Config>): Promise<void> {
    const testStart = Date.now()
    const reason = skipReason(testRun)
    if (reason) {
      testRun.skipReason = reason
      finishTest(testRun, 'skip', 0)
      return
    }

    includeStartMessage && logger.info(`Loop:${loop} ${testRun.id} started`)
    if (options.dryRun) {
      finishTest(testRun, 'pass', Date.now() - testStart)
      return
    }

    const context: TestContext<Config> = {
      outputs,
      config,
      observe(observation: Observation): void {
        testRun.observations.push(observation)
      },
    }

    try {
      const output = await testRun.definition.run(context)
      outputValues.set(testRun.id, output)
      testRun.output = output
      await testRun.definition.verify?.(context)
      finishTest(testRun, 'pass', Date.now() - testStart)
      includeStartMessage && logger.info(`Loop:${loop} ${testRun.id} completed ${testRun.duration}ms`)
      if (testRun.waitAfter) await wait(testRun.waitAfter)
    } catch (error) {
      testRun.error = messageFromError(error) ?? 'unknown error'
      finishTest(testRun, 'fail', Date.now() - testStart)
      logger.warn(`Loop:${loop} ${testRun.id} failed`, error)
    }
  }

  let done = false
  do {
    loop++
    const testsThisLoop = tests.filter(shouldRunThisLoop)
    await Promise.all(testsThisLoop.map(runTest))

    if (loop > MAX_LOOPS) throw new Error('Looped too many times')
    if (tests.every((testRun) => testRun.complete)) {
      done = true
    } else if (testsThisLoop.length === 0) {
      throw new Error('No tests ran this loop, possible circular dependency')
    } else {
      await wait(RESCAN_DELAY_MS)
    }
  } while (!done)

  return {
    result: fullTestResult(tests.map((testRun) => testRun.passed)),
    duration: Date.now() - suiteStart,
    tests: tests.map(({ definition: _definition, ...testRun }) => testRun),
    showSkipped: options.showSkipped,
  }
}

function createOutputs(values: Map<TestId, unknown>): Outputs {
  return Object.freeze({
    get<Output = unknown>(id: TestId): Output | undefined {
      return values.get(id) as Output | undefined
    },
    has(id: TestId): boolean {
      return values.has(id)
    },
  })
}

function deepFreeze<Value>(value: Value): DeepReadonly<Value> {
  if (value === null || typeof value !== 'object') return value as DeepReadonly<Value>
  for (const nestedValue of Object.values(value)) deepFreeze(nestedValue)
  return Object.freeze(value) as DeepReadonly<Value>
}

function startTest<Config extends object>(definition: TestDefinition<Config, unknown>): RunnableTest<Config> {
  const { run: _run, verify: _verify, ...metadata } = definition
  return {
    ...metadata,
    observations: [],
    complete: false,
    definition,
  }
}

function validateDefinitions<Config extends object>(definitions: TestDefinition<Config, unknown>[]): void {
  const ids = new Set<TestId>()
  for (const definition of definitions) {
    if (ids.has(definition.id)) throw new Error(`Duplicate test id: ${definition.id}`)
    ids.add(definition.id)
  }

  for (const definition of definitions) {
    const referencedIds = [...(definition.dependsOn ?? []), ...(definition.tearsDown ? [definition.tearsDown] : [])]
    for (const referencedId of referencedIds) {
      if (!ids.has(referencedId)) throw new Error(`Test ${referencedId} not found`)
    }
  }
}

function tagOnTest(tag: string, testRun: TestRun): boolean {
  return testRun.id === tag || testRun.tags?.includes(tag) === true
}

function fullTestResult(results: (PassFail | undefined)[]): PassFail {
  if (results.some((result) => result === 'fail')) return 'fail'
  if (results.every((result) => result === 'skip' || result === undefined)) return 'skip'
  return 'pass'
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
