// Minimal standalone stand-in for the `Logger` class tigger used from `@terros/common` in the
// Terros sales monorepo. That version also handles AWS Lambda structured JSON logging, which this
// standalone engine has no use for — this keeps only the leveled, prefixed console logging tigger
// itself depends on.
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  timer: 3,
  verbose: 4,
} as const

export type Level = keyof typeof levels

export type LoggerOptions = {
  level?: Level
}

const DEFAULT_LEVEL: Level = 'timer'

export class Logger {
  public name: string
  public level: Level

  constructor(name: string, opts?: LoggerOptions) {
    this.name = name
    this.level = opts?.level ?? DEFAULT_LEVEL
  }

  error(message: unknown, ...other: unknown[]): void {
    this.log('error', message, ...other)
  }

  warn(message: unknown, ...other: unknown[]): void {
    this.log('warn', message, ...other)
  }

  info(message: unknown, ...other: unknown[]): void {
    this.log('info', message, ...other)
  }

  verbose(message: unknown, ...other: unknown[]): void {
    this.log('verbose', message, ...other)
  }

  log(level: Level, message: unknown, ...other: unknown[]): void {
    if (levels[level] > levels[this.level]) return
    const consoleMethod = consoleMethodFor(level)
    if (typeof message === 'string') {
      consoleMethod(`${this.name}: ${message}`, ...other)
      return
    }
    consoleMethod(`${this.name}:`, message, ...other)
  }
}

function consoleMethodFor(level: Level): (...args: unknown[]) => void {
  if (level === 'error') return console.error
  if (level === 'warn') return console.warn
  if (level === 'verbose') return console.debug
  return console.log
}
