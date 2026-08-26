export function green(message) {
    return `\u001b[32m${message}\u001b[0m`;
}
export function red(message) {
    return `\u001b[31m${message}\u001b[0m`;
}
export function yellow(message) {
    return `\u001b[38;2;255;255;0m${message}\u001b[0m`;
}
export function gray(message) {
    return `\u001b[38;2;128;128;128m${message}\u001b[0m`;
}
export function black(message) {
    return `\u001b[30m${message}\u001b[0m`;
}
export function greenBg(message) {
    return `\u001b[42m\u001b[30m${message}\u001b[0m`;
}
export function redBg(message) {
    return `\u001b[41m\u001b[30m${message}\u001b[0m`;
}
