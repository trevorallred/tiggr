export function simplifyRunnerOutput(input) {
    const originalTests = input.tests;
    const tests = simplifyTestOutput(originalTests);
    return {
        tags: uniqueTags(originalTests, input.showSkipped),
        tests,
        totalDuration: durationToString(input.duration),
        speedUp: calculationSpeedup(tests, input.duration),
        passed: count(tests, 'pass'),
        failed: count(tests, 'fail'),
        skipped: count(tests, 'skip'),
    };
}
function simplifyTestOutput(tests) {
    return [...tests].sort((a, b) => {
        const loopA = a.loop || Number.MAX_SAFE_INTEGER;
        const loopB = b.loop || Number.MAX_SAFE_INTEGER;
        return loopA - loopB;
    }).map((t) => {
        return {
            id: t.id,
            duration: t.duration || 0,
            loop: t.loop || 0,
            output: stringifyOutput(t.error ?? t.skipReason ?? t.output),
            passed: t.passed || 'skip',
        };
    });
}
function uniqueTags(allTests, showSkipped) {
    const tests = showSkipped ? allTests : allTests.filter((t) => t.passed !== 'skip');
    const tags = tests.flatMap((t) => t.tags || []);
    return [...new Set(tags)];
}
function stringifyOutput(output) {
    if (output === undefined)
        return '';
    if (typeof output === 'string')
        return output;
    return JSON.stringify(output);
}
function calculationSpeedup(tests, suiteDuration) {
    const totalDuration = tests.map((t) => t.duration).reduce(sum, 0);
    if (totalDuration <= suiteDuration)
        return 0;
    return Math.round(((totalDuration - suiteDuration) / totalDuration) * 100);
}
const sum = (a, b) => a + b;
function count(tests, passed) {
    return tests.filter((t) => t.passed === passed).length;
}
function durationToString(duration) {
    if (!duration)
        return '';
    if (duration > 1000)
        return `${(duration / 1000).toFixed(1)} seconds`;
    return duration + 'ms';
}
