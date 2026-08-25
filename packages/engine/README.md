# @tigger/engine

Tigger is a small, generic, dependency-aware integration-test execution engine. The name "tigger"
is a loose play off of the word "integ". It has no knowledge of any particular application domain
— it only knows about abstract "tests" with IDs, dependencies, and an `evaluate` function.

This package is a standalone port of `packages/tigger` from the Terros sales monorepo (see the
root `README.md` for context on this repo).

## Options

The following CLI options are available:

- `-x, --exclude <testName>` Exclude a test or a set of tags from running. Can be comma separated
  such as `-x "test1, test2"` or `-x="tag1,tag2"` or `--exclude=foo`
- `-i, --include <testName>` Include a test or a set of tags to run. Can be comma separated such as
  `-i "test1, test2"` or `-i="tag1,tag2"` or `--include=foo`
- `-d, --dryRun` Run the tests without executing the evaluate function

## Usage

```typescript
import { runTests, printTestOutput, type TestDefinition } from '@tigger/engine'

type ApplicationState = {
  // Your custom integration test state.
  // This might include users you need to login or entities you create that you need in your tests.
  count: number
}

const tests: TestDefinition<ApplicationState>[] = [
  {
    id: 'test1',
    evaluate: async (state) => {
      // Your test code here
      state.count = 1
    },
    // optional configuration
  },
  {
    id: 'test2',
    evaluate: async (state) => {
      // Your test code here
      state.count = 2
    },
    dependsOn: ['test1'],
    // optional configuration
  },
]

const result = await runTests(tests, {
  initial: { count: 0 },
  // optional configuration
})

const screenOutput = printTestOutput(result)
```
