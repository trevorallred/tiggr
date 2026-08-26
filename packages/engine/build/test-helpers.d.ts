import { type TestDefinition } from './types.js';
export type Config = {
    baseUrl: string;
    headers?: {
        authorization: string;
    };
};
export declare const config: Config;
export declare const runs: string[];
export declare function resetRuns(): void;
export declare function stubTest(id: string, partial?: Partial<TestDefinition<Config>>): TestDefinition<Config>;
//# sourceMappingURL=test-helpers.d.ts.map