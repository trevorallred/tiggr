import { Logger } from './util/logger'
import { isEmpty, isNotEmpty } from './util/isEmpty'
import { messageFromError } from './util/error'
import {
  type TestDefinition,
  type TestRun,
  type TestEvaluationOutput,
  type PassFail,
  type RunTestsOptions,
  type TestDefinitionWithoutState,
  type TestRunnerOutput,
  type WithTestId,
  type TestRunWithoutState,
  type TestId,
} from './types'
import { readStateFromFile, writeStateToFile } from './state'
import { updateOptions } from './options'

const logger = new Logger('tester')
// logger.level = 'verbose'

const MAX_LOOPS = 100

export async function runTests<State>(
  testDefinitions: TestDefinition<State>[],
  inputOptions: RunTestsOptions<State>
): Promise<TestRunnerOutput<State>> {
  const start = Date.now()
  const options = updateOptions(inputOptions)
  logger.info('Starting with options', options)
  const state: State = {
    ...readStateFromFile<State>(options.logDirectory),
    ...options.initial,
  }

  const { includeStartMessage = true } = options
  includeStartMessage && logger.info('Starting tests')
  const testOutputs: TestRun<State>[] = testDefinitions.map(startTest)
  const testMap = new Map<string, TestRun<State>>()
  testOutputs.forEach((t) => testMap.set(t.id, t))
  const onlyArgUsed = testDefinitions.some((t) => t.only && !t.skip)

  function findTest(id: string): TestRun<State> {
    const test = testMap.get(id)
    if (test) return test
    throw new Error(`Test ${id} not found`)
  }

  let done = false
  let loop = 0
  function updateTestOutput(t: TestRun<State>, output: TestEvaluationOutput, duration: number, passed: PassFail): void {
    t.complete = true
    t.duration = duration
    t.output = output
    t.loop = loop
    t.passed = passed
    isTreeTornDown(t)
  }

  function isTreeTornDown(test: TestRun<State>): void {
    if (test.tornDown) return
    const childrenNotTornDown = testOutputs.filter((t) => {
      if (t.id === test.id) return false
      if (t.tornDown) return false
      if (t.tearsDown === test.id) return true
      if (t.dependsOn?.includes(test.id)) return true
      return false
    })

    logger.verbose(`${test.id}: childrenNotTornDown`, childrenNotTornDown.map(toTestId).join(', '))
    test.tornDown = isEmpty(childrenNotTornDown)
    if (test.tearsDown) {
      const tearsDown = findTest(test.tearsDown)
      isTreeTornDown(tearsDown)
    }
    test.dependsOn?.forEach((t) => {
      const dependsOn = findTest(t)
      isTreeTornDown(dependsOn)
    })
  }

  function shouldRunTestThisLoop(test: TestRun<State>): boolean {
    const { dependsOn = [], tearsDown } = test
    if (test.complete) return false
    logger.verbose(`${test.id}: Should we run?`)
    const dependentTestsNotComplete = dependsOn.filter((id) => !findTest(id).complete)
    if (isNotEmpty(dependentTestsNotComplete)) {
      const list = dependentTestsNotComplete.join(', ')
      logger.verbose(`${test.id}: still depends on ${list}`)
      return false
    }
    if (!tearsDown) return true

    const testsStillUsingTearDownTarget: TestId[] = testOutputs
      .filter((t2) => {
        if (t2.id === test.id) return false
        // Look for any test that has not completed and is a prerequisite for this test
        if (t2.id === tearsDown && isNotComplete(t2)) {
          logger.verbose(`  ${test.id}: ${test.id} should teardown ${t2.id} but it's not complete`)
          return true
        }
        if (t2.tornDown) {
          logger.verbose(`  ${test.id}: ${t2.id} is torn down`)
          return false
        }
        if (!t2.dependsOn) {
          logger.verbose(`  ${test.id}: ${t2.id} doesn't depend on anything`)
          return false
        }
        const dependsOnTearDown = t2.dependsOn.includes(tearsDown)
        if (dependsOnTearDown) {
          logger.verbose(`  ${test.id}: ${t2.id} depends on ${tearsDown}`)
          return true
        } else {
          logger.verbose(`  ${test.id}: ${t2.id} doesn't depend on ${tearsDown}`)
        }
        return dependsOnTearDown
      })
      .map(toTestId)
    if (isNotEmpty(testsStillUsingTearDownTarget)) {
      const list = testsStillUsingTearDownTarget.join(', ')
      logger.verbose(`${test.id}: Need to wait to teardown because ${tearsDown} is still being used by: ${list}`)
      return false
    }

    return true
  }

  async function runTest(t: TestRun<State>): Promise<void> {
    const testStart = Date.now()
    const skipReason = shouldSkip(t)
    if (skipReason !== false) {
      updateTestOutput(t, skipReason, 0, 'skip')
      return
    }
    includeStartMessage && logger.info(`Loop:${loop} ${t.id} started`)
    try {
      if (options.dryRun) {
        logger.info(`Loop:${t.loop} ${t.id} dryRun completed`)
        updateTestOutput(t, 'dryRun', Date.now() - testStart, 'pass')
        return
      }
      const output = await t.evaluate(state)
      updateTestOutput(t, output, Date.now() - testStart, 'pass')
      logger.info(`Loop:${t.loop} ${t.id} completed ${t.duration}ms ${outputString(t)}`)
      t.waitAfter && (await wait(t.waitAfter))
    } catch (error) {
      updateTestOutput(t, messageFromError(error), Date.now() - testStart, 'fail')
      logger.warn(`Loop:${t.loop} ${t.id} failed`, error)
    }
  }

  function shouldSkip(t: TestRun<State>): string | false {
    if (t.skip) return 'test.skip = true'

    const dependentTestsFailed = t.dependsOn?.filter((id) => findTest(id).passed !== 'pass')
    if (isNotEmpty(dependentTestsFailed)) {
      const list = dependentTestsFailed.join(', ')
      logger.verbose(`${t.id}: previous tests failed or skipped: ${list}`)
      return 'previous tests failed or skipped'
    }

    const tearsDownFailed = t.tearsDown && findTest(t.tearsDown).passed !== 'pass'
    if (tearsDownFailed) {
      logger.verbose(`${t.id}: previous test failed or skipped`)
      return 'previous test failed or skipped'
    }

    if (isNotEmpty(options.exclude)) {
      if (options.exclude.includes(t.id)) return `test id excluded`
      if (options.exclude.some((excludeTag) => t.tags?.includes(excludeTag))) {
        return `test excluded by tag`
      }
    }

    if (isNotEmpty(options.include)) {
      if (!options.include.some((tag) => tagOnTest(tag, t))) return 'test did not have an include tag'
    }

    if (onlyArgUsed && !t.only) return 'another test is marked as only'
    return false // don't skip
  }

  do {
    loop++
    logger.verbose('Running test loop', loop)
    const runTheseTests = testOutputs.filter(shouldRunTestThisLoop)
    const promisesThisLoop = runTheseTests.map(runTest)

    await Promise.all(promisesThisLoop)

    if (loop > MAX_LOOPS) {
      throw new Error('Looped too many times')
    }
    if (allTestsComplete(testOutputs)) {
      done = true
    } else if (isEmpty(runTheseTests)) {
      const testsLeft = testOutputs.filter((t) => !t.complete)
      logger.level = 'verbose'
      logger.verbose('tests left to run:', testsLeft.map(toTestId))
      testsLeft.map(shouldRunTestThisLoop)
      throw new Error('No tests ran this loop, possible circular dependency')
    } else {
      await wait(500)
    }
  } while (!done)

  const duration = Date.now() - start

  writeStateToFile(state, options.logDirectory)

  return {
    result: fullTestResult(testOutputs.map(toPassFail)),
    duration,
    tests: testOutputs,
    state,
    showSkipped: options.showSkipped,
  }
}

function toPassFail(test: { passed?: PassFail }): PassFail | undefined {
  return test.passed
}

const isFail = (x?: PassFail): boolean => x === 'fail'
const isSkip = (x?: PassFail): boolean => x === 'skip' || x === undefined

function fullTestResult(tests: (PassFail | undefined)[]): PassFail {
  if (tests.some(isFail)) return 'fail'
  if (tests.every(isSkip)) return 'skip'
  return 'pass'
}

function tagOnTest(tag: string, test: TestDefinitionWithoutState): boolean {
  if (test.id === tag) return true
  return test.tags?.includes(tag) ?? false
}

function startTest<State>(test: TestDefinition<State>): TestRun<State> {
  return { ...test, complete: false }
}

function allTestsComplete<State>(tests: TestRun<State>[]): boolean {
  return tests.every((t) => t.complete)
}

function outputString<T>(t: TestRun<T>): string {
  if (t.skip) return 'skipped'
  if (!t.output) return ''
  return `${t.output}`
}

function isNotComplete(test: TestRunWithoutState): boolean {
  return !test.complete
}

function toTestId(test: WithTestId): string {
  return test.id
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
