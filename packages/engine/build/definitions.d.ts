import { type SuiteDefinition, type TestDefinition } from './types.js';
/** Compile singleton resource sugar into the same dependency/teardown nodes used by the scheduler. */
export declare function compileDefinitions<Config extends object>(suiteDefinitions: SuiteDefinition<Config>[]): TestDefinition<Config, unknown>[];
export declare function validateDefinitions<Config extends object>(definitions: TestDefinition<Config, unknown>[]): void;
