export function green(message: string): string {
  return `\u001b[32m${message}\u001b[0m`
}

export function red(message: string): string {
  return `\u001b[31m${message}\u001b[0m`
}

export function yellow(message: string): string {
  return `\u001b[38;2;255;255;0m${message}\u001b[0m`
}

export function gray(message: string): string {
  return `\u001b[38;2;128;128;128m${message}\u001b[0m`
}

export function black(message: string): string {
  return `\u001b[30m${message}\u001b[0m`
}

export function greenBg(message: string): string {
  return `\u001b[42m\u001b[30m${message}\u001b[0m`
}

export function redBg(message: string): string {
  return `\u001b[41m\u001b[30m${message}\u001b[0m`
}
