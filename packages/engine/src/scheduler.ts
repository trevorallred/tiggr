import { randomUUID } from 'node:crypto'
import { normalizeJsonObject, normalizeJsonValue } from './json.js'
import {
  type DeepReadonly,
  type JsonObject,
  type JsonValue,
  type Observation,
  type Outputs,
  type PassFail,
  type RunTestsOptions,
  type TestContext,
  type TestDefinition,
  type TestId,
  type TestRun,
  type TestRunnerOutput,
} from './types.js'
import { messageFromError } from './util/error.js'
import { Logger } from './util/logger.js'

const logger = new Logger('tester')
const MAX_LOOPS = 100
const RESCAN_DELAY_MS = 500
export const ENGINE_VERSION = '2.0.0'

type RunnableTest<Config extends object> = TestRun & {
  definition: TestDefinition<Config, unknown>
}

export class Scheduler<Config extends object> {
  private readonly suiteStart = Date.now()
  private readonly startedAt = new Date(this.suiteStart).toISOString()
  private readonly runId = randomUUID()
  private readonly outputValues = new Map<TestId, JsonValue>()
  private readonly outputs = createOutputs(this.outputValues)
  private readonly tests: RunnableTest<Config>[]
  private readonly testsById: Map<TestId, RunnableTest<Config>>
  private readonly onlyIsUsed: boolean
  private readonly selectedIds: Set<TestId> | undefined
  private loop = 0

  constructor(
    definitions: TestDefinition<Config, unknown>[],
    private readonly options: RunTestsOptions<Config>,
    private readonly config: DeepReadonly<Config>,
    private readonly metadata: JsonObject | undefined
  ) {
    this.tests = definitions.map(startTest)
    this.testsById = new Map(this.tests.map((current) => [current.id, current]))
    this.onlyIsUsed = definitions.some((definition) => definition.only && !definition.skip)
    this.selectedIds = selectedTestIds(definitions, options.include ?? [])
  }

  async run(): Promise<TestRunnerOutput> {
    if (this.options.includeStartMessage ?? true) logger.info('Starting tests')
    let done = false
    do {
      this.loop++
      const testsThisLoop = this.tests.filter((testRun) => this.shouldRunThisLoop(testRun))
      await Promise.all(testsThisLoop.map((testRun) => this.runTest(testRun)))
      if (this.loop > MAX_LOOPS) throw new Error('Looped too many times')
      if (this.tests.every((testRun) => testRun.complete)) done = true
      else if (testsThisLoop.length === 0) throw new Error('No tests ran this loop, possible circular dependency')
      else await wait(RESCAN_DELAY_MS)
    } while (!done)
    return this.result()
  }

  private findTest(id: TestId): RunnableTest<Config> {
    const found = this.testsById.get(id)
    if (found) return found
    throw new Error(`Test ${id} not found`)
  }

  private finishTest(testRun: RunnableTest<Config>, passed: PassFail, duration: number): void {
    testRun.complete = true
    testRun.duration = duration
    testRun.loop = this.loop
    testRun.passed = passed
    this.updateTornDownTree(testRun)
  }

  private updateTornDownTree(testRun: RunnableTest<Config>): void {
    if (testRun.tornDown) return
    const unfinishedChildren = this.tests.filter((candidate) => {
      if (candidate.id === testRun.id || candidate.tornDown) return false
      return candidate.tearsDown === testRun.id || candidate.dependsOn?.includes(testRun.id) === true
    })
    testRun.tornDown = unfinishedChildren.length === 0
    if (!testRun.tornDown) return
    if (testRun.tearsDown) this.updateTornDownTree(this.findTest(testRun.tearsDown))
    for (const id of testRun.dependsOn ?? []) this.updateTornDownTree(this.findTest(id))
  }

  private shouldRunThisLoop(testRun: RunnableTest<Config>): boolean {
    if (testRun.complete) return false
    if ((testRun.dependsOn ?? []).some((id) => !this.findTest(id).complete)) return false
    if (!testRun.tearsDown) return true
    const targetId = testRun.tearsDown
    return !this.tests.some((candidate) => {
      if (candidate.id === testRun.id) return false
      if (candidate.id === targetId && !candidate.complete) return true
      if (candidate.tornDown) return false
      return candidate.dependsOn?.includes(targetId) === true
    })
  }

  private skipReason(testRun: RunnableTest<Config>): string | undefined {
    if (testRun.skip) return 'test.skip = true'
    if (testRun.dependsOn?.some((id) => this.findTest(id).passed !== 'pass')) {
      return 'previous tests failed or skipped'
    }
    if (testRun.tearsDown && this.findTest(testRun.tearsDown).passed !== 'pass') {
      return 'previous test failed or skipped'
    }
    return this.selectionSkipReason(testRun)
  }

  private selectionSkipReason(testRun: RunnableTest<Config>): string | undefined {
    const exclude = this.options.exclude ?? []
    if (exclude.includes(testRun.id)) return 'test id excluded'
    if (exclude.some((tag) => testRun.tags?.includes(tag))) return 'test excluded by tag'
    if (this.selectedIds !== undefined && !this.selectedIds.has(testRun.id)) return 'test did not have an include tag'
    if (this.onlyIsUsed && !testRun.only) return 'another test is marked as only'
    return undefined
  }

  private async runTest(testRun: RunnableTest<Config>): Promise<void> {
    const testStart = Date.now()
    const reason = this.skipReason(testRun)
    if (reason) {
      testRun.skipReason = reason
      this.finishTest(testRun, 'skip', 0)
      return
    }
    if (this.options.includeStartMessage ?? true) logger.info(`Loop:${this.loop} ${testRun.id} started`)
    if (this.options.dryRun) {
      this.finishTest(testRun, 'pass', Date.now() - testStart)
      return
    }
    await this.executeTest(testRun, testStart)
  }

  private async executeTest(testRun: RunnableTest<Config>, testStart: number): Promise<void> {
    const context = this.contextFor(testRun)
    try {
      const rawOutput = await testRun.definition.run(context)
      const output = rawOutput === undefined ? undefined : normalizeJsonValue(rawOutput, `output from ${testRun.id}`)
      await testRun.definition.verify?.(context, rawOutput)
      if (output !== undefined) {
        this.outputValues.set(testRun.id, output)
        testRun.output = output
      }
      this.finishTest(testRun, 'pass', Date.now() - testStart)
      if (this.options.includeStartMessage ?? true) {
        logger.info(`Loop:${this.loop} ${testRun.id} completed ${String(testRun.duration)}ms`)
      }
      if (testRun.waitAfter) await wait(testRun.waitAfter)
    } catch (error) {
      testRun.error = messageFromError(error) ?? 'unknown error'
      this.finishTest(testRun, 'fail', Date.now() - testStart)
      logger.warn(`Loop:${this.loop} ${testRun.id} failed`, error)
    }
  }

  private contextFor(testRun: RunnableTest<Config>): TestContext<Config> {
    return {
      outputs: this.outputs,
      config: this.config,
      observe: (observation: Observation): void => {
        testRun.observations.push(normalizeJsonObject(observation, `observation from ${testRun.id}`) as Observation)
      },
    }
  }

  private result(): TestRunnerOutput {
    return {
      runId: this.runId,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      ...(this.metadata === undefined ? {} : { metadata: this.metadata }),
      result: fullTestResult(this.tests.map((testRun) => testRun.passed)),
      duration: Date.now() - this.suiteStart,
      tests: this.tests.map(({ definition: _definition, ...testRun }) => testRun),
      showSkipped: this.options.showSkipped,
    }
  }
}

function createOutputs(values: Map<TestId, JsonValue>): Outputs {
  return Object.freeze({
    get<Output = JsonValue>(id: TestId): Output | undefined {
      return values.get(id) as Output | undefined
    },
    has(id: TestId): boolean {
      return values.has(id)
    },
  })
}

function startTest<Config extends object>(definition: TestDefinition<Config, unknown>): RunnableTest<Config> {
  const metadata = Object.fromEntries(
    Object.entries(definition).filter(([key]) => key !== 'run' && key !== 'verify')
  ) as Omit<TestDefinition<Config, unknown>, 'run' | 'verify'>
  return { ...metadata, observations: [], complete: false, definition }
}

function selectedTestIds<Config extends object>(
  definitions: TestDefinition<Config, unknown>[],
  include: string[]
): Set<TestId> | undefined {
  if (include.length === 0) return undefined
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]))
  const selected = new Set(
    definitions.filter((definition) => include.some((value) => tagOnTest(value, definition))).map(({ id }) => id)
  )
  const selectDependencies = (id: TestId): void => {
    for (const dependencyId of definitionsById.get(id)?.dependsOn ?? []) {
      if (selected.has(dependencyId)) continue
      selected.add(dependencyId)
      selectDependencies(dependencyId)
    }
  }
  for (const id of selected) selectDependencies(id)
  addSelectedTeardowns(definitions, selected, selectDependencies)
  return selected
}

function addSelectedTeardowns<Config extends object>(
  definitions: TestDefinition<Config, unknown>[],
  selected: Set<TestId>,
  selectDependencies: (id: TestId) => void
): void {
  let addedTeardown: boolean
  do {
    addedTeardown = false
    for (const definition of definitions) {
      if (!definition.tearsDown || !selected.has(definition.tearsDown) || selected.has(definition.id)) continue
      selected.add(definition.id)
      selectDependencies(definition.id)
      addedTeardown = true
    }
  } while (addedTeardown)
}

function tagOnTest(tag: string, testRun: Pick<TestRun, 'id' | 'tags'>): boolean {
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
