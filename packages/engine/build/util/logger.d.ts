declare const levels: {
    readonly error: 0;
    readonly warn: 1;
    readonly info: 2;
    readonly timer: 3;
    readonly verbose: 4;
};
export type Level = keyof typeof levels;
export type LoggerOptions = {
    level?: Level;
};
export declare class Logger {
    name: string;
    level: Level;
    constructor(name: string, opts?: LoggerOptions);
    error(message: unknown, ...other: unknown[]): void;
    warn(message: unknown, ...other: unknown[]): void;
    info(message: unknown, ...other: unknown[]): void;
    verbose(message: unknown, ...other: unknown[]): void;
    log(level: Level, message: unknown, ...other: unknown[]): void;
}
export {};
