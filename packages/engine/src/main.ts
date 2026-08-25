import { compileDefinitions, validateDefinitions } from './definitions.js'
import { deepFreezePlainData, normalizeJsonObject } from './json.js'
import { Scheduler } from './scheduler.js'
import { type RunTestsOptions, type SuiteDefinition, type TestRunnerOutput } from './types.js'

export { compileDefinitions } from './definitions.js'
export { ENGINE_VERSION } from './scheduler.js'

/** Run a dependency-aware suite and return its complete structured result. */
export async function runTests<Config extends object>(
  suiteDefinitions: SuiteDefinition<Config>[],
  options: RunTestsOptions<Config>
): Promise<TestRunnerOutput> {
  const definitions = compileDefinitions(suiteDefinitions)
  validateDefinitions(definitions)
  const config = deepFreezePlainData(options.config)
  const metadata = options.metadata === undefined ? undefined : normalizeJsonObject(options.metadata, 'run metadata')
  return new Scheduler(definitions, options, config, metadata).run()
}
