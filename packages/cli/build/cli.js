#!/usr/bin/env node

// src/cli.ts
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// ../engine/build/definitions.js
function compileDefinitions(suiteDefinitions) {
  const resources = suiteDefinitions.filter(isResourceDefinition);
  const tests = suiteDefinitions.filter((definition) => !isResourceDefinition(definition));
  const resourcesById = indexResources(resources);
  const expanded = resources.flatMap((current) => [
    current.create,
    {
      ...current.destroy,
      uses: unique([...current.destroy.uses ?? [], current.id]),
      tearsDown: current.create.id
    }
  ]);
  return [...expanded, ...tests].map((definition) => addResourceDependencies(definition, resourcesById));
}
function indexResources(resources) {
  const resourcesById = /* @__PURE__ */ new Map();
  for (const current of resources) {
    if (resourcesById.has(current.id))
      throw new Error(`Duplicate resource id: ${current.id}`);
    if (current.create.tearsDown)
      throw new Error(`Resource ${current.id} create test cannot tear down another test`);
    if (current.destroy.tearsDown)
      throw new Error(`Resource ${current.id} destroy test cannot declare tearsDown`);
    resourcesById.set(current.id, current);
  }
  return resourcesById;
}
function addResourceDependencies(definition, resourcesById) {
  const resourceDependencies = (definition.uses ?? []).flatMap((resourceId) => {
    const current = resourcesById.get(resourceId);
    if (!current)
      throw new Error(`Resource ${resourceId} not found (used by ${definition.id})`);
    return definition.id === current.destroy.id ? [] : [current.create.id];
  });
  return {
    ...definition,
    ...resourceDependencies.length === 0 && definition.dependsOn === void 0 ? {} : { dependsOn: unique([...definition.dependsOn ?? [], ...resourceDependencies]) }
  };
}
function isResourceDefinition(definition) {
  return "kind" in definition && definition.kind === "resource";
}
function unique(values) {
  return [...new Set(values)];
}
function validateDefinitions(definitions) {
  const definitionsById = indexDefinitions(definitions);
  const visited = /* @__PURE__ */ new Set();
  const active = /* @__PURE__ */ new Set();
  const path = [];
  function visit(id) {
    if (active.has(id))
      throwCycle(path, id);
    if (visited.has(id))
      return;
    active.add(id);
    path.push(id);
    for (const referencedId of referencedIds(definitionsById.get(id)))
      visit(referencedId);
    path.pop();
    active.delete(id);
    visited.add(id);
  }
  for (const { id } of definitions)
    visit(id);
}
function indexDefinitions(definitions) {
  const definitionsById = /* @__PURE__ */ new Map();
  for (const definition of definitions) {
    if (definitionsById.has(definition.id))
      throw new Error(`Duplicate test id: ${definition.id}`);
    definitionsById.set(definition.id, definition);
  }
  for (const definition of definitions) {
    for (const referencedId of referencedIds(definition)) {
      if (!definitionsById.has(referencedId))
        throw new Error(`Test ${referencedId} not found`);
    }
  }
  return definitionsById;
}
function referencedIds(definition) {
  return [...definition?.dependsOn ?? [], ...definition?.tearsDown ? [definition.tearsDown] : []];
}
function throwCycle(path, id) {
  const cycleStart = path.indexOf(id);
  throw new Error(`Circular dependency: ${[...path.slice(cycleStart), id].join(" -> ")}`);
}

// ../engine/build/json.js
function deepFreezePlainData(value, seen = /* @__PURE__ */ new WeakSet()) {
  if (value === null || typeof value !== "object")
    return value;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return value;
  }
  if (seen.has(value))
    return value;
  seen.add(value);
  for (const nestedValue of Object.values(value))
    deepFreezePlainData(nestedValue, seen);
  return Object.freeze(value);
}
function normalizeJsonObject(value, label) {
  const normalized = normalizeJsonValue(value, label);
  if (Array.isArray(normalized) || normalized === null || typeof normalized !== "object") {
    throw new Error(`${label} must be a JSON object`);
  }
  return normalized;
}
function normalizeJsonValue(value, label, seen = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error(`${label} contains a non-finite number`);
    return value;
  }
  if (typeof value !== "object")
    throw new Error(`${label} contains a non-JSON value`);
  if (seen.has(value))
    throw new Error(`${label} contains a circular reference`);
  seen.add(value);
  try {
    if (Array.isArray(value))
      return value.map((item) => normalizeJsonValue(item, label, seen));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} contains a non-plain object`);
    }
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, normalizeJsonValue(nestedValue, label, seen)]));
  } finally {
    seen.delete(value);
  }
}

// ../engine/build/scheduler.js
import { randomUUID } from "node:crypto";

// ../engine/build/util/error.js
function messageFromError(error) {
  if (error === void 0)
    return;
  if (error === null)
    return;
  if (error instanceof Error)
    return error.message;
  if (error && typeof error === "object") {
    if ("message" in error && typeof error.message === "string")
      return error.message;
    if ("error" in error && typeof error.error === "string")
      return error.error;
  }
  if (typeof error === "string")
    return error;
  return "unknown error type";
}

// ../engine/build/util/logger.js
var levels = {
  error: 0,
  warn: 1,
  info: 2,
  timer: 3,
  verbose: 4
};
var DEFAULT_LEVEL = "timer";
var Logger = class {
  name;
  level;
  constructor(name, opts) {
    this.name = name;
    this.level = opts?.level ?? DEFAULT_LEVEL;
  }
  error(message, ...other) {
    this.log("error", message, ...other);
  }
  warn(message, ...other) {
    this.log("warn", message, ...other);
  }
  info(message, ...other) {
    this.log("info", message, ...other);
  }
  verbose(message, ...other) {
    this.log("verbose", message, ...other);
  }
  log(level, message, ...other) {
    if (levels[level] > levels[this.level])
      return;
    const consoleMethod = consoleMethodFor(level);
    if (typeof message === "string") {
      consoleMethod(`${this.name}: ${message}`, ...other);
      return;
    }
    consoleMethod(`${this.name}:`, message, ...other);
  }
};
function consoleMethodFor(level) {
  if (level === "error")
    return console.error;
  if (level === "warn")
    return console.warn;
  if (level === "verbose")
    return console.debug;
  return console.log;
}

// ../engine/build/scheduler.js
var logger = new Logger("tester");
var MAX_LOOPS = 100;
var RESCAN_DELAY_MS = 500;
var ENGINE_VERSION = "2.0.0";
var Scheduler = class {
  options;
  config;
  metadata;
  suiteStart = Date.now();
  startedAt = new Date(this.suiteStart).toISOString();
  runId = randomUUID();
  outputValues = /* @__PURE__ */ new Map();
  outputs = createOutputs(this.outputValues);
  tests;
  testsById;
  onlyIsUsed;
  selectedIds;
  loop = 0;
  constructor(definitions, options, config, metadata) {
    this.options = options;
    this.config = config;
    this.metadata = metadata;
    this.tests = definitions.map(startTest);
    this.testsById = new Map(this.tests.map((current) => [current.id, current]));
    this.onlyIsUsed = definitions.some((definition) => definition.only && !definition.skip);
    this.selectedIds = selectedTestIds(definitions, options.include ?? []);
  }
  async run() {
    if (this.options.includeStartMessage ?? true)
      logger.info("Starting tests");
    let done = false;
    do {
      this.loop++;
      const testsThisLoop = this.tests.filter((testRun) => this.shouldRunThisLoop(testRun));
      await Promise.all(testsThisLoop.map((testRun) => this.runTest(testRun)));
      if (this.loop > MAX_LOOPS)
        throw new Error("Looped too many times");
      if (this.tests.every((testRun) => testRun.complete))
        done = true;
      else if (testsThisLoop.length === 0)
        throw new Error("No tests ran this loop, possible circular dependency");
      else
        await wait(RESCAN_DELAY_MS);
    } while (!done);
    return this.result();
  }
  findTest(id) {
    const found = this.testsById.get(id);
    if (found)
      return found;
    throw new Error(`Test ${id} not found`);
  }
  finishTest(testRun, passed, duration) {
    testRun.complete = true;
    testRun.duration = duration;
    testRun.loop = this.loop;
    testRun.passed = passed;
    this.updateTornDownTree(testRun);
  }
  updateTornDownTree(testRun) {
    if (testRun.tornDown)
      return;
    const unfinishedChildren = this.tests.filter((candidate) => {
      if (candidate.id === testRun.id || candidate.tornDown)
        return false;
      return candidate.tearsDown === testRun.id || candidate.dependsOn?.includes(testRun.id) === true;
    });
    testRun.tornDown = unfinishedChildren.length === 0;
    if (!testRun.tornDown)
      return;
    if (testRun.tearsDown)
      this.updateTornDownTree(this.findTest(testRun.tearsDown));
    for (const id of testRun.dependsOn ?? [])
      this.updateTornDownTree(this.findTest(id));
  }
  shouldRunThisLoop(testRun) {
    if (testRun.complete)
      return false;
    if ((testRun.dependsOn ?? []).some((id) => !this.findTest(id).complete))
      return false;
    if (!testRun.tearsDown)
      return true;
    const targetId = testRun.tearsDown;
    return !this.tests.some((candidate) => {
      if (candidate.id === testRun.id)
        return false;
      if (candidate.id === targetId && !candidate.complete)
        return true;
      if (candidate.tornDown)
        return false;
      return candidate.dependsOn?.includes(targetId) === true;
    });
  }
  skipReason(testRun) {
    if (testRun.skip)
      return "test.skip = true";
    if (testRun.dependsOn?.some((id) => this.findTest(id).passed !== "pass")) {
      return "previous tests failed or skipped";
    }
    if (testRun.tearsDown && this.findTest(testRun.tearsDown).passed !== "pass") {
      return "previous test failed or skipped";
    }
    return this.selectionSkipReason(testRun);
  }
  selectionSkipReason(testRun) {
    const exclude = this.options.exclude ?? [];
    if (exclude.includes(testRun.id))
      return "test id excluded";
    if (exclude.some((tag) => testRun.tags?.includes(tag)))
      return "test excluded by tag";
    if (this.selectedIds !== void 0 && !this.selectedIds.has(testRun.id))
      return "test did not have an include tag";
    if (this.onlyIsUsed && !testRun.only)
      return "another test is marked as only";
    return void 0;
  }
  async runTest(testRun) {
    const testStart = Date.now();
    const reason = this.skipReason(testRun);
    if (reason) {
      testRun.skipReason = reason;
      this.finishTest(testRun, "skip", 0);
      return;
    }
    if (this.options.includeStartMessage ?? true)
      logger.info(`Loop:${this.loop} ${testRun.id} started`);
    if (this.options.dryRun) {
      this.finishTest(testRun, "pass", Date.now() - testStart);
      return;
    }
    await this.executeTest(testRun, testStart);
  }
  async executeTest(testRun, testStart) {
    const context = this.contextFor(testRun);
    try {
      const rawOutput = await testRun.definition.run(context);
      const output = rawOutput === void 0 ? void 0 : normalizeJsonValue(rawOutput, `output from ${testRun.id}`);
      await testRun.definition.verify?.(context, rawOutput);
      if (output !== void 0) {
        this.outputValues.set(testRun.id, output);
        testRun.output = output;
      }
      this.finishTest(testRun, "pass", Date.now() - testStart);
      if (this.options.includeStartMessage ?? true) {
        logger.info(`Loop:${this.loop} ${testRun.id} completed ${String(testRun.duration)}ms`);
      }
      if (testRun.waitAfter)
        await wait(testRun.waitAfter);
    } catch (error) {
      testRun.error = messageFromError(error) ?? "unknown error";
      this.finishTest(testRun, "fail", Date.now() - testStart);
      logger.warn(`Loop:${this.loop} ${testRun.id} failed`, error);
    }
  }
  contextFor(testRun) {
    return {
      outputs: this.outputs,
      config: this.config,
      observe: (observation) => {
        testRun.observations.push(normalizeJsonObject(observation, `observation from ${testRun.id}`));
      }
    };
  }
  result() {
    return {
      runId: this.runId,
      startedAt: this.startedAt,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      engineVersion: ENGINE_VERSION,
      ...this.metadata === void 0 ? {} : { metadata: this.metadata },
      result: fullTestResult(this.tests.map((testRun) => testRun.passed)),
      duration: Date.now() - this.suiteStart,
      tests: this.tests.map(({ definition: _definition, ...testRun }) => testRun),
      showSkipped: this.options.showSkipped
    };
  }
};
function createOutputs(values) {
  return Object.freeze({
    get(id) {
      return values.get(id);
    },
    has(id) {
      return values.has(id);
    }
  });
}
function startTest(definition) {
  const metadata = Object.fromEntries(Object.entries(definition).filter(([key]) => key !== "run" && key !== "verify"));
  return { ...metadata, observations: [], complete: false, definition };
}
function selectedTestIds(definitions, include) {
  if (include.length === 0)
    return void 0;
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const selected = new Set(definitions.filter((definition) => include.some((value) => tagOnTest(value, definition))).map(({ id }) => id));
  const selectDependencies = (id) => {
    for (const dependencyId of definitionsById.get(id)?.dependsOn ?? []) {
      if (selected.has(dependencyId))
        continue;
      selected.add(dependencyId);
      selectDependencies(dependencyId);
    }
  };
  for (const id of selected)
    selectDependencies(id);
  addSelectedTeardowns(definitions, selected, selectDependencies);
  return selected;
}
function addSelectedTeardowns(definitions, selected, selectDependencies) {
  let addedTeardown;
  do {
    addedTeardown = false;
    for (const definition of definitions) {
      if (!definition.tearsDown || !selected.has(definition.tearsDown) || selected.has(definition.id))
        continue;
      selected.add(definition.id);
      selectDependencies(definition.id);
      addedTeardown = true;
    }
  } while (addedTeardown);
}
function tagOnTest(tag, testRun) {
  return testRun.id === tag || testRun.tags?.includes(tag) === true;
}
function fullTestResult(results) {
  if (results.some((result) => result === "fail"))
    return "fail";
  if (results.every((result) => result === "skip" || result === void 0))
    return "skip";
  return "pass";
}
function wait(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}

// ../engine/build/main.js
async function runTests(suiteDefinitions, options) {
  const definitions = compileDefinitions(suiteDefinitions);
  validateDefinitions(definitions);
  const config = deepFreezePlainData(options.config);
  const metadata = options.metadata === void 0 ? void 0 : normalizeJsonObject(options.metadata, "run metadata");
  return new Scheduler(definitions, options, config, metadata).run();
}

// ../engine/build/summary/color.js
function green(message) {
  return `\x1B[32m${message}\x1B[0m`;
}
function red(message) {
  return `\x1B[31m${message}\x1B[0m`;
}
function yellow(message) {
  return `\x1B[38;2;255;255;0m${message}\x1B[0m`;
}
function gray(message) {
  return `\x1B[38;2;128;128;128m${message}\x1B[0m`;
}
function greenBg(message) {
  return `\x1B[42m\x1B[30m${message}\x1B[0m`;
}
function redBg(message) {
  return `\x1B[41m\x1B[30m${message}\x1B[0m`;
}

// ../engine/build/summary/reduce.js
function simplifyRunnerOutput(input) {
  const originalTests = input.tests;
  const tests = simplifyTestOutput(originalTests);
  return {
    tags: uniqueTags(originalTests, input.showSkipped),
    tests,
    totalDuration: durationToString(input.duration),
    speedUp: calculationSpeedup(tests, input.duration),
    passed: count(tests, "pass"),
    failed: count(tests, "fail"),
    skipped: count(tests, "skip")
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
      passed: t.passed || "skip"
    };
  });
}
function uniqueTags(allTests, showSkipped) {
  const tests = showSkipped ? allTests : allTests.filter((t) => t.passed !== "skip");
  const tags = tests.flatMap((t) => t.tags || []);
  return [...new Set(tags)];
}
function stringifyOutput(output) {
  if (output === void 0)
    return "";
  if (typeof output === "string")
    return output;
  return JSON.stringify(output);
}
function calculationSpeedup(tests, suiteDuration) {
  const totalDuration = tests.map((t) => t.duration).reduce(sum, 0);
  if (totalDuration <= suiteDuration)
    return 0;
  return Math.round((totalDuration - suiteDuration) / totalDuration * 100);
}
var sum = (a, b) => a + b;
function count(tests, passed) {
  return tests.filter((t) => t.passed === passed).length;
}
function durationToString(duration) {
  if (!duration)
    return "";
  if (duration > 1e3)
    return `${(duration / 1e3).toFixed(1)} seconds`;
  return duration + "ms";
}

// ../engine/build/summary/index.js
function printTestOutput(raw) {
  const { showSkipped = false } = raw;
  const input = simplifyRunnerOutput(raw);
  const { tags, totalDuration, speedUp, failed, tests } = input;
  const output = [];
  function addLine(line = "") {
    output.push(line);
  }
  if (tags) {
    addLine(`Tags:  ${gray(stringsToArray(tags))}`);
    addLine();
  }
  addLine(failed ? redBg(" FAIL ") : greenBg(" PASS "));
  addLine();
  let lastLoop = 0;
  tests.forEach((t) => {
    if (t.passed === "pass" || t.passed === "skip" && !showSkipped)
      return;
    if (t.loop > lastLoop) {
      addLine(gray("   Loop " + t.loop));
      lastLoop = t.loop;
    }
    const summary = `${t.id} (${t.duration}ms) ${t.output}`;
    addLine(`      ${passingSymbol[t.passed]} ${gray(summary)}`);
  });
  addLine();
  addLine(buildTestSummaryOutput(input));
  if (totalDuration) {
    addLine(`Duration: ${totalDuration}, ${speedUp}% speed up with Tiggr`);
  }
  return output.join("\n");
}
function buildTestSummaryOutput({ passed, failed, skipped }) {
  const output = [];
  if (failed) {
    output.push(`Tests: ${red(`${failed} failed`)}`);
    output.push(green(`${passed} passed`));
  } else {
    output.push(`Tests: ${green(`${passed} passed`)}`);
  }
  if (skipped > 0)
    output.push(yellow(`${skipped} skipped`));
  output.push(`${passed + failed + skipped} total`);
  return output.join(", ");
}
function stringsToArray(values) {
  return `[ ${values.map((v) => `"${v}"`).join(", ")} ]`;
}
var passingSymbol = {
  pass: green("\u2713"),
  fail: red("\u2717"),
  skip: yellow("\u25CB")
};

// src/cli.ts
function parseCliArgs(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      include: { type: "string", multiple: true, short: "i" },
      exclude: { type: "string", multiple: true, short: "x" },
      json: { type: "boolean", default: false },
      pretty: { type: "boolean", default: false }
    }
  });
  const [command, ...ids] = positionals;
  if (command !== "run") throw new Error("Usage: tiggr run [ids...] [--dry-run] [--include <id-or-tag>] [--exclude <id-or-tag>] [--json|--pretty]");
  if (values.json && values.pretty) throw new Error("--json and --pretty cannot be used together");
  return {
    command,
    ids,
    dryRun: values["dry-run"] ?? false,
    include: splitValues(values.include),
    exclude: splitValues(values.exclude),
    format: values.pretty ? "pretty" : "json"
  };
}
async function runCli(args = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseCliArgs(args);
  const suite = await loadSuite(cwd);
  const result = await runTests(suite.definitions, {
    config: suite.config,
    metadata: suite.metadata,
    dryRun: options.dryRun,
    include: unique2([...options.ids, ...options.include]),
    exclude: options.exclude,
    includeStartMessage: false
  });
  process.stdout.write(formatOutput(result, options.format) + "\n");
  return result.result === "fail" ? 1 : 0;
}
function formatOutput(result, format) {
  return format === "pretty" ? printTestOutput(result) : JSON.stringify(result, null, 2);
}
async function loadSuite(cwd) {
  const explicit = process.env.TIGGR_CONFIG;
  const candidates = explicit ? [resolve(cwd, explicit)] : ["tiggr.config.mjs", "tiggr.config.js"].map((name) => resolve(cwd, name));
  const configPath = candidates.find(existsSync);
  if (!configPath) throw new Error(`No tiggr.config.mjs or tiggr.config.js found in ${cwd}`);
  const imported = await import(pathToFileURL(configPath).href);
  const suite = imported.default;
  if (!suite || typeof suite !== "object" || !("definitions" in suite) || !Array.isArray(suite.definitions)) {
    throw new Error(`${configPath} must default-export { definitions, config }`);
  }
  if (!("config" in suite) || !suite.config || typeof suite.config !== "object") {
    throw new Error(`${configPath} must provide an object config`);
  }
  return suite;
}
function splitValues(values) {
  return values?.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean) ?? [];
}
function unique2(values) {
  return [...new Set(values)];
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url))) {
  runCli().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`tiggr: ${error instanceof Error ? error.message : String(error)}
`);
      process.exitCode = 2;
    }
  );
}
export {
  formatOutput,
  parseCliArgs,
  runCli
};
