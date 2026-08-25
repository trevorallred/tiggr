export type TestId = string

export type WithTestId = { id: TestId }

export type RunTestsOptions<State> = {
  initial: State
  /** Skip all tests */
  dryRun?: boolean
  includeStartMessage?: boolean
  /** Only run tests with these tags */
  include?: string[]
  /** Skip tests with these tags. Overrides include */
  exclude?: string[]
  /** Show skipped tests */
  showSkipped?: boolean
  /** Location relative to the current directory to store logs */
  logDirectory?: string
}

export type TestDefinitionWithoutState = WithTestId & {
  dependsOn?: TestId[]
  tearsDown?: TestId
  tags?: string[]
  /** Skip this test even if only=true */
  skip?: boolean
  /** Only run this test */
  only?: boolean
  /** Wait X ms until next test */
  waitAfter?: number
}

export type TestDefinition<State> = TestDefinitionWithoutState & {
  evaluate: (state: State) => Promise<TestEvaluationOutput>
}

export type TestRun<State> = TestDefinition<State> & {
  loop?: number
  duration?: number
  output?: TestEvaluationOutput
  complete: boolean
  tornDown?: boolean
  passed?: PassFail
}

export type TestRunWithoutState = TestRun<any>

export type TestEvaluationOutput = string | boolean | undefined

export type PassFail = 'pass' | 'fail' | 'skip'

export type TestRunnerOutput<State> = {
  result: PassFail
  duration: number
  tests: TestRun<State>[]
  state: State
  showSkipped?: boolean
}
