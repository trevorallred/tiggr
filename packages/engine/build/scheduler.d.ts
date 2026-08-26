import { type DeepReadonly, type JsonObject, type RunTestsOptions, type TestDefinition, type TestRunnerOutput } from './types.js';
export declare const ENGINE_VERSION = "2.0.0";
export declare class Scheduler<Config extends object> {
    private readonly options;
    private readonly config;
    private readonly metadata;
    private readonly suiteStart;
    private readonly startedAt;
    private readonly runId;
    private readonly outputValues;
    private readonly outputs;
    private readonly tests;
    private readonly testsById;
    private readonly onlyIsUsed;
    private readonly selectedIds;
    private loop;
    constructor(definitions: TestDefinition<Config, unknown>[], options: RunTestsOptions<Config>, config: DeepReadonly<Config>, metadata: JsonObject | undefined);
    run(): Promise<TestRunnerOutput>;
    private findTest;
    private finishTest;
    private updateTornDownTree;
    private shouldRunThisLoop;
    private skipReason;
    private selectionSkipReason;
    private runTest;
    private executeTest;
    private contextFor;
    private result;
}
