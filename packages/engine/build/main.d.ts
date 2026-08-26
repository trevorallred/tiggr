import { type RunTestsOptions, type SuiteDefinition, type TestRunnerOutput } from './types.js';
export { compileDefinitions } from './definitions.js';
export { ENGINE_VERSION } from './scheduler.js';
/** Run a dependency-aware suite and return its complete structured result. */
export declare function runTests<Config extends object>(suiteDefinitions: SuiteDefinition<Config>[], options: RunTestsOptions<Config>): Promise<TestRunnerOutput>;
//# sourceMappingURL=main.d.ts.map