export type TestId = string

export type PassFail = 'pass' | 'fail' | 'skip'

export type MaybePromise<T> = T | Promise<T>

export type DeepReadonly<Value> = Value extends (...args: never[]) => unknown
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value

/** A read-only view of outputs produced by tests that have already run. */
export type Outputs = {
  get<Output = unknown>(id: TestId): Output | undefined
  has(id: TestId): boolean
}

export type HttpObservation = {
  type: 'http'
  method: string
  path: string
  status: number
  [key: string]: unknown
}

export type EventObservation = {
  type: 'event'
  name: string
  [key: string]: unknown
}

export type PollObservation = {
  type: 'poll'
  attempts: number
  settled: boolean
  [key: string]: unknown
}

export type AssertionObservation = {
  type: 'assertion'
  expected: unknown
  actual: unknown
  passed: boolean
  [key: string]: unknown
}

/**
 * Known observations get useful field completion, while the open shape permits callers to add
 * domain-specific observation types and extra JSON-serializable details.
 */
export type Observation =
  | HttpObservation
  | EventObservation
  | PollObservation
  | AssertionObservation
  | { type: string; [key: string]: unknown }

export type Provenance = {
  origin: string
  issueLink: string
  createdBy: string
  createdAt: string
  reasoning: string
}

export type TestContext<Config extends object> = {
  outputs: Outputs
  config: DeepReadonly<Config>
  observe(observation: Observation): void
}

export type TestDefinition<Config extends object = Record<string, never>, Output = unknown> = {
  id: TestId
  intent?: string
  invariants?: string[]
  provenance?: Provenance
  dependsOn?: TestId[]
  /** Reserved for resource() integration; resources are not part of the core scheduler yet. */
  uses?: TestId[]
  tearsDown?: TestId
  tags?: string[]
  /** Skip this test even if only=true. */
  skip?: boolean
  /** Run only definitions marked with only when any definition uses this flag. */
  only?: boolean
  /** Wait this many milliseconds before the scheduler begins its next scan. */
  waitAfter?: number
  run(context: TestContext<Config>): MaybePromise<Output>
  verify?(context: TestContext<Config>): MaybePromise<void>
}

/** Define a test while retaining inference for its config and output types. */
export function test<Config extends object = Record<string, never>, Output = unknown>(
  definition: TestDefinition<Config, Output>
): TestDefinition<Config, Output> {
  return definition
}

export type RunTestsOptions<Config extends object> = {
  config: Config
  /** Mark runnable tests as passed without invoking run or verify. */
  dryRun?: boolean
  includeStartMessage?: boolean
  /** Only run tests with one of these IDs or tags. */
  include?: string[]
  /** Skip tests with one of these IDs or tags. Overrides include. */
  exclude?: string[]
  /** Include skipped tests in the human-readable summary. */
  showSkipped?: boolean
}

export type TestRun = {
  id: TestId
  intent?: string
  invariants?: string[]
  provenance?: Provenance
  dependsOn?: TestId[]
  uses?: TestId[]
  tearsDown?: TestId
  tags?: string[]
  skip?: boolean
  only?: boolean
  waitAfter?: number
  loop?: number
  duration?: number
  output?: unknown
  observations: Observation[]
  complete: boolean
  tornDown?: boolean
  passed?: PassFail
  error?: string
  skipReason?: string
}

export type TestRunnerOutput = {
  result: PassFail
  duration: number
  tests: TestRun[]
  showSkipped?: boolean
}
