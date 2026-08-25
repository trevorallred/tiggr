import { randomUUID } from 'node:crypto'
import { messageFromError } from './util/error.js'
import { Logger } from './util/logger.js'
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
  type JsonObject,
  type JsonValue,
  type ResourceDefinition,
  type SuiteDefinition,
} from './types.js'

const logger = new Logger('tester')
const MAX_LOOPS = 100
const RESCAN_DELAY_MS = 500
export const ENGINE_VERSION = '0.0.0'

type RunnableTest<Config extends object> = TestRun & {
  definition: TestDefinition<Config, unknown>
}

/** Run a dependency-aware suite and return its complete structured result. */
export async function runTests<Config extends object>(
  suiteDefinitions: SuiteDefinition<Config>[],
  options: RunTestsOptions<Config>
): Promise<TestRunnerOutput> {
  const definitions = compileDefinitions(suiteDefinitions)
  validateDefinitions(definitions)

  const suiteStart = Date.now()
  const startedAt = new Date(suiteStart).toISOString()
  const runId = randomUUID()
  const config = deepFreezePlainData(options.config)
  const metadata = options.metadata === undefined ? undefined : normalizeJsonObject(options.metadata, 'run metadata')
  const outputValues = new Map<TestId, JsonValue>()
  const outputs = createOutputs(outputValues)
  const tests = definitions.map(startTest)
  const testsById = new Map(tests.map((current) => [current.id, current]))
  const onlyIsUsed = definitions.some((definition) => definition.only && !definition.skip)
  const includeStartMessage = options.includeStartMessage ?? true
  const selectedIds = selectedTestIds(definitions, options.include ?? [])

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

    if (selectedIds !== undefined && !selectedIds.has(testRun.id)) {
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
        testRun.observations.push(normalizeJsonObject(observation, `observation from ${testRun.id}`) as Observation)
      },
    }

    try {
      const rawOutput = await testRun.definition.run(context)
      const output = rawOutput === undefined ? undefined : normalizeJsonValue(rawOutput, `output from ${testRun.id}`)
      await testRun.definition.verify?.(context, rawOutput)
      if (output !== undefined) {
        outputValues.set(testRun.id, output)
        testRun.output = output
      }
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

  const completedAt = new Date().toISOString()
  return {
    runId,
    startedAt,
    completedAt,
    engineVersion: ENGINE_VERSION,
    ...(metadata === undefined ? {} : { metadata }),
    result: fullTestResult(tests.map((testRun) => testRun.passed)),
    duration: Date.now() - suiteStart,
    tests: tests.map(({ definition: _definition, ...testRun }) => testRun),
    showSkipped: options.showSkipped,
  }
}

/** Compile singleton resource sugar into the same dependency/teardown nodes used by the scheduler. */
export function compileDefinitions<Config extends object>(
  suiteDefinitions: SuiteDefinition<Config>[]
): TestDefinition<Config, unknown>[] {
  const resources = suiteDefinitions.filter(isResourceDefinition)
  const tests = suiteDefinitions.filter((definition): definition is TestDefinition<Config, unknown> => !isResourceDefinition(definition))
  const resourcesById = new Map<TestId, ResourceDefinition<Config, unknown, unknown>>()

  for (const current of resources) {
    if (resourcesById.has(current.id)) throw new Error(`Duplicate resource id: ${current.id}`)
    if (current.create.tearsDown) throw new Error(`Resource ${current.id} create test cannot tear down another test`)
    if (current.destroy.tearsDown) throw new Error(`Resource ${current.id} destroy test cannot declare tearsDown`)
    resourcesById.set(current.id, current)
  }

  const expanded = resources.flatMap((current) => [
    current.create,
    {
      ...current.destroy,
      uses: unique([...(current.destroy.uses ?? []), current.id]),
      tearsDown: current.create.id,
    },
  ])

  return [...expanded, ...tests].map((definition) => {
    const resourceDependencies = (definition.uses ?? []).flatMap((resourceId) => {
      const current = resourcesById.get(resourceId)
      if (!current) throw new Error(`Resource ${resourceId} not found (used by ${definition.id})`)
      if (definition.id === current.destroy.id) return []
      return [current.create.id]
    })
    return {
      ...definition,
      ...(resourceDependencies.length === 0 && definition.dependsOn === undefined
        ? {}
        : { dependsOn: unique([...(definition.dependsOn ?? []), ...resourceDependencies]) }),
    }
  })
}

function isResourceDefinition<Config extends object>(
  definition: SuiteDefinition<Config>
): definition is ResourceDefinition<Config, unknown, unknown> {
  return 'kind' in definition && definition.kind === 'resource'
}

function unique<Value>(values: Value[]): Value[] {
  return [...new Set(values)]
}

function createOutputs(values: Map<TestId, JsonValue>): Outputs {
  return Object.freeze({
    get<Output = unknown>(id: TestId): Output | undefined {
      return values.get(id) as Output | undefined
    },
    has(id: TestId): boolean {
      return values.has(id)
    },
  })
}

function deepFreezePlainData<Value>(value: Value, seen = new WeakSet<object>()): DeepReadonly<Value> {
  if (value === null || typeof value !== 'object') return value as DeepReadonly<Value>
  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return value as DeepReadonly<Value>
  }
  if (seen.has(value)) return value as DeepReadonly<Value>
  seen.add(value)
  for (const nestedValue of Object.values(value)) deepFreezePlainData(nestedValue, seen)
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

  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]))
  const visited = new Set<TestId>()
  const active = new Set<TestId>()
  const path: TestId[] = []

  function visit(id: TestId): void {
    if (active.has(id)) {
      const cycleStart = path.indexOf(id)
      throw new Error(`Circular dependency: ${[...path.slice(cycleStart), id].join(' -> ')}`)
    }
    if (visited.has(id)) return

    active.add(id)
    path.push(id)
    const definition = definitionsById.get(id)
    const referencedIds = [...(definition?.dependsOn ?? []), ...(definition?.tearsDown ? [definition.tearsDown] : [])]
    referencedIds.forEach(visit)
    path.pop()
    active.delete(id)
    visited.add(id)
  }

  definitions.forEach(({ id }) => visit(id))
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

  function selectDependencies(id: TestId): void {
    const definition = definitionsById.get(id)
    for (const dependencyId of definition?.dependsOn ?? []) {
      if (selected.has(dependencyId)) continue
      selected.add(dependencyId)
      selectDependencies(dependencyId)
    }
  }

  ;[...selected].forEach(selectDependencies)
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
  return selected
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

function normalizeJsonObject(value: object, label: string): JsonObject {
  const normalized = normalizeJsonValue(value, label)
  if (Array.isArray(normalized) || normalized === null || typeof normalized !== 'object') {
    throw new Error(`${label} must be a JSON object`)
  }
  return normalized
}

function normalizeJsonValue(value: unknown, label: string, seen = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite number`)
    return value
  }
  if (typeof value !== 'object') throw new Error(`${label} contains a non-JSON value`)
  if (seen.has(value)) throw new Error(`${label} contains a circular reference`)

  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((item) => normalizeJsonValue(item, label, seen))
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} contains a non-plain object`)
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeJsonValue(nestedValue, label, seen)])
    )
  } finally {
    seen.delete(value)
  }
}
