// Minimal standalone logger. Tiggr only needs leveled, prefixed console logging, so this avoids
// coupling the engine to a proprietary logging package or deployment-specific formatting.
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    timer: 3,
    verbose: 4,
};
const DEFAULT_LEVEL = 'timer';
export class Logger {
    name;
    level;
    constructor(name, opts) {
        this.name = name;
        this.level = opts?.level ?? DEFAULT_LEVEL;
    }
    error(message, ...other) {
        this.log('error', message, ...other);
    }
    warn(message, ...other) {
        this.log('warn', message, ...other);
    }
    info(message, ...other) {
        this.log('info', message, ...other);
    }
    verbose(message, ...other) {
        this.log('verbose', message, ...other);
    }
    log(level, message, ...other) {
        if (levels[level] > levels[this.level])
            return;
        const consoleMethod = consoleMethodFor(level);
        if (typeof message === 'string') {
            consoleMethod(`${this.name}: ${message}`, ...other);
            return;
        }
        consoleMethod(`${this.name}:`, message, ...other);
    }
}
function consoleMethodFor(level) {
    if (level === 'error')
        return console.error;
    if (level === 'warn')
        return console.warn;
    if (level === 'verbose')
        return console.debug;
    return console.log;
}
