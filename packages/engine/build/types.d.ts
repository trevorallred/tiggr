export type TestId = string;
export type PassFail = 'pass' | 'fail' | 'skip';
export type MaybePromise<T> = T | Promise<T>;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
export type JsonObject = {
    [key: string]: JsonValue;
};
export type DeepReadonly<Value> = Value extends (...args: never[]) => unknown ? Value : Value extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[] : Value extends object ? {
    readonly [Key in keyof Value]: DeepReadonly<Value[Key]>;
} : Value;
/** A read-only view of outputs produced by tests that have already run. */
export type Outputs = {
    get<Output = JsonValue>(id: TestId): Output | undefined;
    has(id: TestId): boolean;
};
export type HttpObservation = {
    type: 'http';
    method: string;
    path: string;
    status: number;
    [key: string]: JsonValue;
};
export type EventObservation = {
    type: 'event';
    name: string;
    [key: string]: JsonValue;
};
export type PollObservation = {
    type: 'poll';
    attempts: number;
    settled: boolean;
    [key: string]: JsonValue;
};
export type AssertionObservation = {
    type: 'assertion';
    expected: JsonValue;
    actual: JsonValue;
    passed: boolean;
    [key: string]: JsonValue;
};
/**
 * Known observations get useful field completion, while the open shape permits callers to add
 * domain-specific observation types and extra JSON-serializable details.
 */
export type Observation = HttpObservation | EventObservation | PollObservation | AssertionObservation | {
    type: string;
    [key: string]: JsonValue;
};
export type Provenance = {
    origin: string;
    reference?: string;
    createdBy?: string;
    createdAt?: string;
    reasoning?: string;
};
export type TestContext<Config extends object> = {
    outputs: Outputs;
    config: DeepReadonly<Config>;
    observe(observation: Observation): void;
};
export type TestDefinition<Config extends object = Record<string, never>, Output = unknown> = {
    id: TestId;
    intent?: string;
    invariants?: string[];
    provenance?: Provenance;
    dependsOn?: TestId[];
    /** Logical singleton resource IDs; compiled to ordinary DAG dependencies before scheduling. */
    uses?: TestId[];
    tearsDown?: TestId;
    tags?: string[];
    /** Skip this test even if only=true. */
    skip?: boolean;
    /** Run only definitions marked with only when any definition uses this flag. */
    only?: boolean;
    /** Wait this many milliseconds before the scheduler begins its next scan. */
    waitAfter?: number;
    run(context: TestContext<Config>): MaybePromise<Output>;
    verify?(context: TestContext<Config>, output: Output): MaybePromise<void>;
};
export type ResourceDefinition<Config extends object = Record<string, never>, CreateOutput = unknown, DestroyOutput = unknown> = {
    readonly kind: 'resource';
    /** Logical singleton name referenced by tests through uses. */
    id: TestId;
    /** The one test that creates this resource. */
    create: TestDefinition<Config, CreateOutput>;
    /** The one teardown test that destroys this resource. */
    destroy: TestDefinition<Config, DestroyOutput>;
};
export type SuiteDefinition<Config extends object = Record<string, never>> = TestDefinition<Config, unknown> | ResourceDefinition<Config, unknown, unknown>;
/** Define a test while retaining inference for its config and output types. */
export declare function test<Config extends object = Record<string, never>, Output = unknown>(definition: TestDefinition<Config, Output>): TestDefinition<Config, Output>;
/** Define a singleton lifecycle that runTests compiles into ordinary DAG nodes. */
export declare function resource<Config extends object = Record<string, never>, CreateOutput = unknown, DestroyOutput = unknown>(definition: Omit<ResourceDefinition<Config, CreateOutput, DestroyOutput>, 'kind'>): ResourceDefinition<Config, CreateOutput, DestroyOutput>;
export type RunTestsOptions<Config extends object> = {
    config: Config;
    /** JSON-safe caller context copied into the run envelope. */
    metadata?: JsonObject;
    /** Mark runnable tests as passed without invoking run or verify. */
    dryRun?: boolean;
    includeStartMessage?: boolean;
    /** Only run tests with one of these IDs or tags. */
    include?: string[];
    /** Skip tests with one of these IDs or tags. Overrides include. */
    exclude?: string[];
    /** Include skipped tests in the human-readable summary. */
    showSkipped?: boolean;
};
export type TestRun = {
    id: TestId;
    intent?: string;
    invariants?: string[];
    provenance?: Provenance;
    dependsOn?: TestId[];
    uses?: TestId[];
    tearsDown?: TestId;
    tags?: string[];
    skip?: boolean;
    only?: boolean;
    waitAfter?: number;
    loop?: number;
    duration?: number;
    output?: JsonValue;
    observations: Observation[];
    complete: boolean;
    tornDown?: boolean;
    passed?: PassFail;
    error?: string;
    skipReason?: string;
};
export type TestRunnerOutput = {
    runId: string;
    startedAt: string;
    completedAt: string;
    engineVersion: string;
    metadata?: JsonObject;
    result: PassFail;
    duration: number;
    tests: TestRun[];
    showSkipped?: boolean;
};
//# sourceMappingURL=types.d.ts.map