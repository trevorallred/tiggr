import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCliArgs, formatOutput } from './cli.js';
describe('CLI v0', () => {
    it('parses positional IDs and all selection/output flags', () => {
        expect(parseCliArgs([
            'run',
            'search',
            '--dry-run',
            '--include',
            'smoke,projects',
            '--exclude',
            'slow',
            '--pretty',
        ])).toEqual({
            command: 'run',
            ids: ['search'],
            dryRun: true,
            include: ['smoke', 'projects'],
            exclude: ['slow'],
            format: 'pretty',
        });
    });
    it('uses JSON as the default and accepts --json explicitly', () => {
        expect(parseCliArgs(['run']).format).toBe('json');
        expect(parseCliArgs(['run', '--json']).format).toBe('json');
        expect(() => parseCliArgs(['run', '--json', '--pretty'])).toThrow('--json and --pretty cannot be used together');
    });
    it('formats the structured result directly as JSON', () => {
        const result = {
            runId: 'run-1',
            startedAt: '2026-08-24T00:00:00.000Z',
            completedAt: '2026-08-24T00:00:00.001Z',
            engineVersion: '0.0.0',
            result: 'pass',
            duration: 1,
            tests: [],
        };
        expect(JSON.parse(formatOutput(result, 'json'))).toEqual(result);
    });
    it('ships a standalone bundle without a runtime tiggr package dependency', () => {
        const packageRoot = resolve(import.meta.dirname, '..');
        const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
        const bundle = readFileSync(resolve(packageRoot, 'build/cli.js'), 'utf8');
        expect(manifest.dependencies?.tiggr).toBeUndefined();
        const runtimeTiggrImport = /(?:from\s*|import\s*\()['"]tiggr['"]/;
        expect(bundle).not.toMatch(runtimeTiggrImport);
    });
});
