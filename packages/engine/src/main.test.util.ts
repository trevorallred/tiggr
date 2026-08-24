export class TestRunner {
  private runs: string[] = []
  public run(val: string): Promise<void> {
    this.runs.push(val)
    return Promise.resolve()
  }
  clear(): void {
    this.runs = []
  }
  toString(): string {
    return this.runs.join(',')
  }
}
