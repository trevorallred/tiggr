# Engine Package - Dependency-Aware Test Runner

## Domain Responsibility
Sophisticated test execution framework with dependency management, teardown orchestration, and parallel processing. Handles complex test workflows with state persistence, loop-based execution, conditional skipping, and comprehensive reporting with colored output formatting.

## Domain Conventions
- **Loop-based execution**: Tests run in loops until all dependencies resolved and tests complete
- **State persistence**: Test state saved to/loaded from file system between runs for continuity
- **Dependency resolution**: `dependsOn` and `tearsDown` relationships control execution order
- **Tag-based filtering**: `include`/`exclude` arrays filter tests by tags or test IDs
- **Only/skip semantics**: `only` runs exclusively, `skip` bypasses completely

## Handler Patterns
```
Test Execution Flow:
  1. State loading from file system with initial state merge
  2. Test dependency graph construction and validation
  3. Loop-based execution with dependency resolution
  4. Parallel test execution within each loop iteration
  5. Teardown orchestration based on dependency completion
  6. State persistence and comprehensive result reporting
```

## Data Flow
```
Test Definitions → Dependency Analysis → Loop Execution → State Management → Result Summary
       ↓                ↓                  ↓               ↓                 ↓
   Test Config     Graph Building     Parallel Runs    File Persistence  Colored Output
   Validation      Order Resolution   Promise.all()     JSON Storage      Pass/Fail Stats
```

## Cross-Domain Dependencies
- **`src/util/*`**: small, self-contained local utilities (`Logger`, `isEmpty()`/`isNotEmpty()`, `messageFromError()`) inlined here so this package has no dependency on any Terros-internal shared package — it is meant to be standalone and potentially open-sourceable.
- **Node.js File System**: State persistence with JSON serialization for test continuity
- **Process Arguments**: Command-line integration for configuration and execution control
- **Promise Concurrency**: Parallel test execution with dependency-aware scheduling

## Non-Obvious Behaviors
- **Circular dependency detection** - Framework throws error when no tests run in a loop to prevent infinite loops
- **Tree teardown logic** - `isTreeTornDown()` recursively determines when dependent tests can be cleaned up
- **Only precedence** - If any test has `only: true`, all non-only tests automatically skip
- **Exclude override** - `exclude` tags override `include` tags for maximum control
- **Loop timeout protection** - `MAX_LOOPS = 100` prevents infinite execution cycles
- **Wait injection** - `waitAfter` property adds delays between tests for timing-sensitive operations
- **Dry run simulation** - `dryRun: true` validates test structure without executing test logic
- **State merging strategy** - File state merged with initial options, initial takes precedence
- **Torn down tracking** - Tests track if their dependencies are fully cleaned up
- **Duration calculation** - Individual test and total execution time tracked with millisecond precision

## Pattern Recognition
- **Test definition structure**: Tests require `id`, `evaluate` function, optional `dependsOn`, `tearsDown`, `tags`
- **Loop execution pattern**: `do-while` loop continues until all tests complete or error occurs
- **Dependency checking**: `shouldRunTestThisLoop()` validates all dependencies complete before execution
- **State management**: File-based persistence preserves test state across executions
- **Result aggregation**: `fullTestResult()` determines overall pass/fail based on individual test outcomes

## Common Extensions
- **Add custom test hooks** → Extend `TestDefinition` with setup/teardown lifecycle methods
- **Add parallel test limits** → Implement concurrency control for resource-intensive tests
- **Add test retries** → Extend test runner with retry logic for flaky tests
- **Add custom reporters** → Create new output formatters following `printTestOutput()` pattern
- **Add test grouping** → Implement test suite organization with nested dependency resolution

## Key Files & Their Jobs
- `src/main.ts` - Core test runner with `runTests()` orchestrating dependency-aware parallel execution
- `src/types.ts` - Type definitions for test structure including `TestDefinition`, `TestRun`, `RunTestsOptions`
- `src/summary/index.ts` - Test result formatting with `printTestOutput()` and colored terminal output
- `src/state.ts` - File system state persistence for test continuity across executions
- `src/options.ts` - Configuration processing and option validation for test execution parameters
- `src/util/` - Local, dependency-free replacements for the small set of `@terros/common` helpers this code used before being ported out of the Terros sales monorepo
