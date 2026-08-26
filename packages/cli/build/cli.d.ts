#!/usr/bin/env node
import { type TestRunnerOutput } from 'tiggr';
export type CliOptions = {
    command: 'run';
    ids: string[];
    dryRun: boolean;
    include: string[];
    exclude: string[];
    format: 'json' | 'pretty';
};
export declare function parseCliArgs(args: string[]): CliOptions;
export declare function runCli(args?: string[], cwd?: string): Promise<number>;
export declare function formatOutput(result: TestRunnerOutput, format: 'json' | 'pretty'): string;
//# sourceMappingURL=cli.d.ts.map