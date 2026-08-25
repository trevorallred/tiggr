# Tiggr — Plan

> **Preamble.** This public repository contains Tiggr, an agent-era successor to an earlier
> private integration-test engine. `packages/engine/` began as the ported
> Tiggr 1 baseline; CI is green, and Phase 1 is now implemented.
>
> See also `docs/OPEN_DECISIONS.md` for the captain's decision record. All four questions from the
> original planning pass are now resolved.

---

# Tiggr — Build Plan

**Scope note:** this plan was produced by a scout/planning pass against the earlier private
implementation. Its assessment was verified against that engine's passing test suite (21/21).
References to "Tiggr 1" below mean that predecessor, not this repository's `packages/engine/`.

---

## 1. Independent assessment of the captain's relayed proposal

The proposal (written by another AI agent from the captain's input) is strong overall — I'd
implement most of it — but a few pieces are more ceremony than the tool needs on day one, and one
framing (migration cost) doesn't actually apply yet. Point by point:

### Keep, essentially as proposed

- **The DAG stays the core primitive.** `dependsOn`, `tearsDown`, `tags`, parallel-per-loop
  execution, forward failure-propagation, `dryRun`. Tiggr 1's scheduler (a `do/while` polling loop
  with a 500ms re-scan and a `MAX_LOOPS=100` circuit breaker) is proven and simple. **I would not
  redesign the scheduler.** An event-driven scheduler would be more "elegant" but the polling loop
  is easy to reason about, easy to test, and was never the part of Tiggr 1 that caused problems.
  Rewrite the DAG engine cleanly, but keep its shape.
- **Model-independent execution infrastructure, three-layer separation, no LLM inside the engine.**
  Full agreement, no notes. This is the load-bearing design principle and it costs nothing to keep
  — Tiggr just needs to expose a clean CLI/JSON contract, not host any AI itself.
- **Structured observations instead of pass/fail-plus-a-string.** This is the single highest-value
  idea in the whole document. Tiggr 1's `output: string` is genuinely weak for an agent to consume;
  a typed observation list is a small API addition (one `ctx.observe(...)` call) with an outsized
  payoff for anything downstream that has to reason about *why* a test failed.
- **Explicit resource lifecycle (`resource({ create, destroy })` + `uses: [...]`).** Real
  improvement over `tearsDown: 'someOtherTestId'`. It removes a whole class of "which id do I
  point tearsDown at" mistakes and matches how a human or agent actually thinks about the test
  ("this test *uses* a project," not "this test tears down test #7"). I'd implement it exactly as
  proposed: sugar that compiles down to the same `dependsOn`/`tearsDown` DAG internally, not a
  parallel runtime concept.
- **Test provenance metadata** (origin, issue link, created-by, reasoning). This is a handful of
  optional string fields — essentially free to add, and useful to humans debugging old tests too,
  not just agents. Add it early.
- **Explorations as a genuinely distinct construct**, separate from "invariants" and "expected
  behaviors." I'd simplify the three-way taxonomy (see below) but the exploration/test split is
  mechanically real: an exploration doesn't require a fixed assertion and produces a *finding*,
  not a pass/fail. That's different enough from a normal test to deserve its own construct rather
  than a flag on `test()`.

### Keep, but simplified or de-scoped

- **`intent`/`run`/`verify` replacing `evaluate`.** I'd adopt this, but I don't think the "extra
  ceremony" objection the brief raises is really about `run`/`verify` — splitting one callback
  into two costs almost nothing (it's a function signature, not an architecture). The ceremony
  that *is* questionable is the proposed **authority-enforcement machinery** on top of it (locked
  invariants, reviewable verify blocks, freely-editable run blocks, a healing-permission matrix).
  That enforcement has no user yet: nothing in this repo runs an autonomous agent against Tiggr
  today, so building a policy engine now would be speculative. My recommendation: add `intent` and
  `invariants` as plain metadata fields from day one (they're just strings/string arrays, and
  they're valuable as human documentation even with zero enforcement), but don't build enforcement
  tooling until there's an actual agent workflow to protect against. The captain has since
  confirmed that AI-driven test-authoring and agent features are planned; see
  `OPEN_DECISIONS.md`.
- **The three-way test taxonomy (hard invariants / expected behaviors / explorations).** I'd
  collapse "hard invariants" and "expected behaviors" into one `test()` construct with an optional
  `policy: 'protected' | 'flexible'` field (or similar), rather than two enforced categories —
  they don't actually differ mechanically, only in how much latitude an agent has to edit them,
  and that's a metadata question, not a different runtime path. Keep `explore()` as the one real
  second construct, since it differs mechanically (no fixed assertion, produces a finding).
- **Change-aware test selection (`covers`, `--changed`).** The *metadata* (`covers: [...]`,
  effectively a richer replacement for today's flat `tags: string[]`) is cheap and worth adding
  early. The *semantic* mapping from "these files changed" to "these concepts are affected" is
  explicitly the test agent's job per the proposal's own three-layer split, not Tiggr's — so
  Tiggr's job is just a dumb `--changed <files...>` flag doing set-intersection against `covers`,
  which is a small, deferrable feature, not core execution.
- **Run-scoped, agent-authored temporary explorations.** Nothing new is actually needed here: since
  tests are just data passed into a `run()` call, a caller can already assemble ad-hoc
  `TestDefinition`s at runtime and hand them in alongside (or instead of) the checked-in suite.
  I'd treat this as "already falls out of the design" and just document the pattern, rather than
  building new mechanics for it.

### Push back on / defer

- **"Eliminate shared mutable state" — worth doing, but not because of migration cost.** The
  original brief for this plan asked whether this is worth the migration cost given Tiggr 1's
  entire private consumer suite (~50 domains) relies
  on shared mutable `state`. My honest read: **that framing doesn't apply here.** Tiggr starts
  with zero consumers other than its own sample app — `packages/integration` keeps using Tiggr 1
  unless and until the captain separately decides to port it, which is its own open question (see
  `migration-compat` in `OPEN_DECISIONS.md`). So there is no existing-suite migration cost to weigh
  *right now*. The captain has since chosen a clean break for Tiggr. Judged purely on its own
  merits for a new engine, explicit `outputs` (a `Map`-like
  store of `{ id -> whatever that test's run() returned }`, read via `ctx.outputs.get(id)`) is
  worth it: it's what makes "data provenance through the graph" (a real, concrete agent-debugging
  win — "which test produced this undefined value") possible at all, and it costs little for code
  written from scratch. I would *not*, however, chase full static type-inference across the whole
  graph's output types (à la a tRPC/Effect-style typed context) — that's a rabbit hole. A
  loosely-typed runtime map with a developer-asserted generic
  (`ctx.outputs.get<ProjectOutput>('create-project')`) is enough for v0.
  - One caveat: I'd keep a small, explicitly *read-only* `ctx.config` object seeded once per run
    (base URL, run namespace, etc. — the useful part of Tiggr 1's `initial: State`), just not a
    *mutable* one. This isn't a re-introduction of shared mutable state — tests can read suite-wide
    config, but the only way to hand data to a downstream test is through that test's own declared
    `outputs`.
- **Cross-run `state.json` persistence.** I would drop this outright rather than carry it forward.
  This mechanism's real job in `packages/integration` was incidental, not load-bearing — the actual
  cross-run isolation mechanism was `loginGroup` (a config value namespacing throwaway
  company/users), and CI always started from an empty `output/` anyway since it was gitignored.
  What Tiggr actually wants instead is a **history of what happened**, not a resumable mutable
  blob — i.e., persist each run's full structured JSON under a run-id
  (`.tiggr/runs/<run-id>.json`), which is a fundamentally different and more useful artifact than
  the old `state.json`. This directly enables `tiggr inspect <run-id>` from the CLI sketch below.
- **Triage-before-healing, healing-permission matrices, failure-category distributions.** Good
  *philosophy*, but this is agent operating procedure, not engine mechanics, and building it now
  would be building tooling for an agent that doesn't exist yet. Tiggr's actual job here is small:
  store the metadata that lets an external agent's triage logic make these calls
  (`policy`/`authority` fields), and maybe later add a lightweight CI lint that flags a diff
  touching a `policy: 'protected'` field. No classifier, no automation, inside Tiggr itself.
- **AXI-style system-under-test inspection commands.** The proposal itself places this in the
  "AXI / system-under-test tools" layer, explicitly outside Tiggr — agreed, would not build this
  into the engine. The sample app can optionally expose one illustrative inspection endpoint (see
  §3) just to make the three-layer separation concrete, but it's not a serious tool and shouldn't
  be treated as one.
- **Mutation testing.** Interesting long-term signal, but it requires safely mutating and
  reverting implementation code around a full test run — that's a separate tool built *on top of*
  Tiggr, not a Tiggr feature, and there's no implementation here to mutate yet (the sample app is
  a toy). Not scoped into any phase; it's a "someday, if the rest proves out" idea.
- **Any internal proprietary dependency.** The predecessor depended on private utility packages
  for logging and error normalization. Tiggr is standalone and open source, so it must not
  depend on packages that public consumers cannot resolve. This is already done:
  `packages/engine/` implements the handful of needed utilities under
  `packages/engine/src/util/`.

---

## 2. Phased build plan

Scope and sequencing, not calendar time. None of this is large in absolute terms (Tiggr 1's entire
engine was ~264 lines).

### Phase 0 — Repo scaffold (no features yet) — **DONE**

- Layout: engine at `packages/engine/` (deeper nesting is redundant in a dedicated repository),
  plus a planned sibling workspace package,
  `sample-app/` (`private: true`, not yet created), via `pnpm-workspace.yaml`.
- Toolchain: pnpm, TypeScript, vitest, Node's built-in `node:util.parseArgs` for CLI args (Tiggr 1
  already used this, no new dependency needed).
- CI: a GitHub Actions workflow that installs, builds, typechecks, and runs the engine's unit tests
  on every PR — **live and green.**
- This phase's deliverable (an installable, structured repo with the ported baseline engine) is
  done; Tiggr-specific primitives below are not yet started.

### Phase 1 — v0 / MVP: core engine + first agent-native primitives + sample app + dogfood CI — **DONE**

This phase is where the rewrite became version 2 rather than "Tiggr 1 copied into a new repo."
Delivered:

- **DAG engine, rewritten clean** (not copy-pasted): `dependsOn`, `tearsDown` (still available as
  an escape hatch under `resource()`, see below), `tags`/`covers`, per-loop parallel execution via
  the same `do/while` polling scheduler shape as Tiggr 1, circular-dependency detection, `dryRun`,
  forward skip-propagation on failure. No behavior regression versus Tiggr 1's mechanics — same
  guarantees, new API surface.
- **`test({ id, intent?, invariants?, dependsOn?, uses?, run, verify? })`**: `run` replaces
  `evaluate`; `verify` is a genuinely separate, optional function (defaults to "no additional
  assertion beyond what `run` throws on" if omitted, so a test can still be a single function in
  the simple case — no forced ceremony for a trivial test).
- **Explicit outputs, no shared mutable state object**: `run`/`verify` receive a context
  `{ outputs, config, observe }`; whatever `run` returns becomes that test's own output, retrieved
  downstream via `outputs.get(id)`. `config` is the read-only, suite-wide seed value (successor to
  the useful part of Tiggr 1's `initial`).
- **Structured observations**: `ctx.observe({...})` during `run`/`verify`, producing a typed list
  (e.g. `{type:'http', method, path, status}`, `{type:'event', name}`, `{type:'poll', attempts,
  settled}`, `{type:'assertion', expected, actual, passed}`) attached to that test's run record —
  a first-class JSON artifact, not console text.
- **`resource({ id, create, destroy })` + `uses: ['id']`**: sugar compiling to `dependsOn`/
  `tearsDown` internally, singleton resources only (one creator, one destroyer, N consumers) — I'd
  explicitly defer multi-instance/parameterized resources (e.g. "three separate projects in one
  run") to a later phase; singleton coverage is exactly what the sample app in §3 needs, and
  Tiggr 1's own teardown-ordering logic was already its trickiest, most bug-prone-feeling code —
  worth getting solid unit-test coverage on this before generalizing it further.
- **JSON-first output**: `runTests()` (or its final API equivalent) returns one structured
  object; the CLI defaults to emitting that as JSON, with a human-pretty renderer built as a
  separate formatter on top of it rather than the source of truth.
- **CLI v0**: `tiggr run [ids...]`, `--dry-run`, `--include`, `--exclude`, `--json` (or JSON
  default plus a `--pretty` flag). Drop `--runInBand` (already a documented no-op in Tiggr 1)
  rather than reintroduce dead surface area.
- **Sample app** (see §3 for full design): a small, in-memory, HTTP-driven toy app living at
  `sample-app/`, standing up a `createProject -> createDocument -> processDocument ->
  {summary, tags} -> search -> archive`-shaped graph — deliberately structured to exercise every
  primitive above (fan-out/fan-in DAG, resource lifecycle, structured observations including a
  genuine polling/eventual-consistency case, at least one real invariant).
- **Dogfood CI**: the same PR that lands this engine also lands a CI job that boots the sample app
  on localhost and runs `tiggr run` against it end-to-end, asserting exit code 0 — proving the
  new engine against a realistic target in the same PR that changes it.
- **Test provenance metadata** (`provenance?: { origin, reference, createdBy, createdAt,
  reasoning }`) and `intent`/`invariants` as plain optional metadata fields — no enforcement yet,
  just present and documented.

**Explicitly out of Phase 1**: `explore()`, run-history persistence/`tiggr inspect`, any
policy-enforcement tooling, `--changed`, multi-instance resources, mutation testing.

### Phase 2 — Explorations, run history, lightweight policy tooling — **NOT STARTED**

- **`explore({ id, question, dependsOn?, uses?, run })`**: a second top-level construct alongside
  `test()`. No `verify` requirement — it produces a `Finding` (freeform structured record: what
  was tried, what was observed, whether it looks surprising) instead of pass/fail/skip. CLI:
  `tiggr run --explore`. A finding can be manually promoted into a permanent `test()` by a human
  or agent copying it into the checked-in suite — Tiggr doesn't need to automate that promotion
  step itself.
- **Run-history persistence**: every invocation gets a run-id; full structured JSON persists to
  `.tiggr/runs/<run-id>.json` (gitignored, same spirit as Tiggr 1's `output/` but now an
  immutable per-run record instead of a mutable resumable blob). `tiggr inspect <run-id>` and
  `tiggr output <run-id> --json` read that file back — no custom query language needed for v0,
  plain JSON that pipes cleanly into `jq` is enough.
- **`covers` metadata + naive `--changed`**: rename/broaden `tags` into `covers: string[]`;
  `tiggr run --changed <file...>` does plain set-intersection against `covers` — explicitly *not*
  a semantic mapping (that stays the test agent's job).
- **Lightweight policy metadata + CI lint**: `policy: 'protected' | 'flexible'` on a test/verify
  block, `authority: 'human' | 'ai'` on an invariant. A CI script flags a diff that touches a
  `policy: 'protected'` field for required human review — this is the first *real* piece of
  "triage before healing" tooling, deliberately scoped as a git-diff-aware lint, not a classifier.
- **Illustrative inspection surface in the sample app**: one small `/admin/inspect/*` endpoint (or
  a `sample-app inspect <kind> <id>` script) purely to make the three-layer separation (test agent
  / Tiggr / system-under-test tools) concrete and demonstrable, not a serious AXI-equivalent tool.

The captain has confirmed that an AI-driven test-authoring/agent workflow is planned, so the
policy/lint tooling has an intended downstream consumer.

### Phase 3 — Speculative / revisit-if-it-proves-out (not committed scope)

- Multi-instance/parameterized resources.
- Deeper `--changed` semantics (an actual concept graph, beyond string-set intersection).
- Mutation testing as a quality signal.
- Additional open-source release work beyond the npm-ready engine package (for example, a docs
  site), if usage warrants it. The repository is already public and MIT-licensed.
- No compatibility or migration tooling for `packages/integration`: the captain chose a clean
  major-version break from Tiggr 1.

---

## 3. Sample app — **IMPLEMENTED**

**Location**: `sample-app/` at repo root (flat, not nested under `apps/`) — a private pnpm
workspace member alongside the private workspace root. Two packages total doesn't need an `apps/`
convention; keep the layout obvious.

**Domain model** — deliberately generic terminology so it reads as an honest
green-field toy:

```
createProject
  -> createDocument (uses: project)
    -> processDocument                      (async: returns 202, "processing" happens via an
                                                in-process timer, not a real job queue)
       -> {summarize, tag}                  (fan-out: two independent downstream artifacts)
         -> search                          (fan-in: reads both summary and tags)
  -> archiveProject (tearsDown/uses: project — resource lifecycle exercised end-to-end)
```

This shape exercises every primitive from §2 concretely:
- **DAG with real fan-out and fan-in** (not just a linear chain like Tiggr 1's worked
  `workflow.ts` example, which was really a chain, not a DAG) — `processDocument` produces two
  independent outputs consumed by one downstream test.
- **Resource lifecycle**: `project` is a `resource()` with `create`/`destroy`; `createDocument`,
  `processDocument`, `search` all declare `uses: ['project']`; `archiveProject` only becomes
  eligible once nothing else still needs the project alive — directly exercising the
  teardown-ordering logic carried forward from Tiggr 1.
- **Structured observations with genuine eventual consistency**: `processDocument` returns
  immediately and does its work on a delay, so the test that depends on `summarize`/`tag` has to
  poll — producing real `{type:'poll', attempts, settled}` observations, not a contrived example.
- **At least one real invariant**: "a project's documents are never returned by another project's
  `search`" — a genuine isolation invariant in the same spirit as real user-data isolation checks,
  without any real user data, credentials, or product logic involved.
- A future Phase 2 exploration can add unusual-character and empty-input search probes without
  changing the Phase 1 dogfood suite.

**Tech stack**:
- **HTTP layer**: plain `node:http` — this is a real HTTP API, not
  in-process function calls, because the `{type:'http', method, path, status}` observation shape
  only means something if there's an actual request/response boundary to observe. Express
  a direct in-process test harness.
- **Storage**: pure in-memory (`Map`s in the process), no SQLite/Postgres/Docker. This keeps "runs
  entirely on localhost" trivial — nothing to install, nothing to migrate, resets by restarting
  the process. It's an honest simplification: the sample app doesn't pretend to have real
  persistence, because that's not what it's testing.
- **Async processing**: an in-process `setTimeout`-based fake job runner for `processDocument`,
  not a real queue — genuine eventual-consistency behavior with zero infrastructure.
- **No isolation-namespace concept needed** (unlike Tiggr 1's `loginGroup`): since the sample app
  is a fresh localhost process per CI run with no shared live stage to collide on, there's no need
  to replicate that namespacing trick at all — this is one respect in which local dogfooding is
  strictly simpler than the predecessor suite, worth calling out explicitly rather than
  over-building.

**Open-source exclusion**: **don't exclude it** from the open-source repository —
it's a genuinely useful onboarding/example artifact (the same role example apps play for
Playwright, Cypress, Prisma, etc.), contains no proprietary branding, data, or credentials by
construction, and hiding a general-purpose toy app would cost more (an extra publish-filtering
step) than it saves. The one concrete mechanical requirement, not a publishing *exclusion* so much
as correctness: `sample-app/package.json` must be `"private": true`. Only `packages/engine/` is
published as `tiggr`; the private workspace root and sample app must never enter its tarball.

---

## 4. Captain decisions

All four captain-only questions are resolved. See `docs/OPEN_DECISIONS.md` for the direct answers
and publishing-name history:

1. **Migration:** clean break at 2.0.0; no Tiggr 1 compatibility shim or migration tooling.
2. **Open source:** yes, under the MIT License.
3. **AI features:** yes, planned.
4. **Public identity:** publish the engine as `tiggr` from the public `trevorallred/tiggr` repo.

These decisions no longer block later phases.

---

## 5. Completed initial implementation sequence

The first implementation PR was scoped to the riskiest architectural bet before anything was
built on top of it:

> **Build the Tiggr engine core** — the rewritten DAG scheduler (`dependsOn`/`tearsDown`/`tags`/
> parallel-per-loop/circular-detection/`dryRun`, no internal proprietary dependency — already
> true here), the `test({ run, verify? })` API replacing `evaluate`, explicit `outputs` replacing
> shared mutable state, and structured `observe()` observations. Ship it with its own vitest
> unit-test suite proving parity with Tiggr 1's proven mechanics (dependency ordering, teardown
> ordering, skip-on-failure propagation, `dryRun`, circular-dependency detection, `include`/
> `exclude` filtering) plus new tests for `outputs` provenance and observation capture.
>
> **Explicitly out of scope for that first task**: `resource()`, the sample app, the CLI, and any
> exploration/policy/run-history features. A follow-up added `resource()`, the sample app, the CLI,
> and dogfood CI against the working, unit-tested core.
>
> Together those two implementation slices completed Phase 1.

---

## 6. Summary

The proposal's direction is sound and most of it is worth implementing. The narrower disagreements:
don't build authority-enforcement/triage tooling before an agent exists to need it, don't chase
full static typing across the outputs graph, don't carry forward Tiggr 1's cross-run `state.json`
persistence (replace it with immutable per-run history instead), and don't treat "eliminate shared
mutable state" as a migration-cost question — it isn't one, since Tiggr has no existing
consumers to migrate. The phased plan above (Phase 0 and Phase 1 done, including dogfood CI against
an in-repo sample app; Phase 2 explorations/history/lightweight policy;
Phase 3 speculative) delivers a working, meaningfully "agent-era" engine quickly without
over-building. The four captain-only questions are resolved and recorded in
`docs/OPEN_DECISIONS.md`; everything else here is a recommendation confident enough to hand
directly to the next engineer/agent as a starting task (§5).
