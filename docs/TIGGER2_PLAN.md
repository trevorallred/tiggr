# Tigger 2 — Plan

> **Preamble.** This repo is a personal, independent continuation of Tigger 2 (an agent-era
> successor to `packages/tigger` in the Terros sales monorepo). It previously lived at
> `terros-inc/tigger`; after the Terros team decided not to open-source it there, the captain (who
> has that authority) mirrored the full repo history to this personal account to continue
> development independently. `packages/engine/` is the ported, standalone Tigger 1 baseline; CI is
> green; the sample app and every Tigger-2-specific primitive described below are still unbuilt.
>
> This plan was written by a scout/planning pass before the move; it hasn't been revisited since,
> so treat "current state" mentions calibrated to this repo's contents as more authoritative than
> any repo name it references (e.g. it may still say `terros-inc/tigger` in places).
>
> See also `docs/OPEN_DECISIONS.md` for four captain-only decisions that gate Phase 2 and Phase 3
> scope below — do not assume that scope until those are answered.

---

# Tigger 2 — Build Plan

**Scope note:** this plan was produced by a scout/planning pass before this repo moved from
`terros-inc/tigger` to its current personal home. Its content is unchanged; only its home has moved.

I read the full prior investigation of Tigger 1 (the original `packages/tigger` in the Terros sales
monorepo) before forming any opinion, verified against that engine's own passing test suite
(21/21). All `file:line` references to "Tigger 1" below refer to that original codebase, not this
repo's ported `packages/engine/`.

---

## 1. Independent assessment of the captain's relayed proposal

The proposal (written by another AI agent from the captain's input) is strong overall — I'd
implement most of it — but a few pieces are more ceremony than the tool needs on day one, and one
framing (migration cost) doesn't actually apply yet. Point by point:

### Keep, essentially as proposed

- **The DAG stays the core primitive.** `dependsOn`, `tearsDown`, `tags`, parallel-per-loop
  execution, forward failure-propagation, `dryRun`. Tigger 1's scheduler (a `do/while` polling loop
  with a 500ms re-scan and a `MAX_LOOPS=100` circuit breaker) is proven and simple. **I would not
  redesign the scheduler.** An event-driven scheduler would be more "elegant" but the polling loop
  is easy to reason about, easy to test, and was never the part of Tigger 1 that caused problems.
  Rewrite the DAG engine cleanly, but keep its shape.
- **Model-independent execution infrastructure, three-layer separation, no LLM inside the engine.**
  Full agreement, no notes. This is the load-bearing design principle and it costs nothing to keep
  — Tigger just needs to expose a clean CLI/JSON contract, not host any AI itself.
- **Structured observations instead of pass/fail-plus-a-string.** This is the single highest-value
  idea in the whole document. Tigger 1's `output: string` is genuinely weak for an agent to consume;
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
  That enforcement has no user yet: nothing in this repo runs an autonomous agent against Tigger
  today, so building a policy engine now would be speculative. My recommendation: add `intent` and
  `invariants` as plain metadata fields from day one (they're just strings/string arrays, and
  they're valuable as human documentation even with zero enforcement), but don't build enforcement
  tooling until there's an actual agent workflow to protect against. This is exactly the shape of
  decision flagged as an open question below (see "test-agent-driver" in `OPEN_DECISIONS.md`).
- **The three-way test taxonomy (hard invariants / expected behaviors / explorations).** I'd
  collapse "hard invariants" and "expected behaviors" into one `test()` construct with an optional
  `policy: 'protected' | 'flexible'` field (or similar), rather than two enforced categories —
  they don't actually differ mechanically, only in how much latitude an agent has to edit them,
  and that's a metadata question, not a different runtime path. Keep `explore()` as the one real
  second construct, since it differs mechanically (no fixed assertion, produces a finding).
- **Change-aware test selection (`covers`, `--changed`).** The *metadata* (`covers: [...]`,
  effectively a richer replacement for today's flat `tags: string[]`) is cheap and worth adding
  early. The *semantic* mapping from "these files changed" to "these concepts are affected" is
  explicitly the test agent's job per the proposal's own three-layer split, not Tigger's — so
  Tigger's job is just a dumb `--changed <files...>` flag doing set-intersection against `covers`,
  which is a small, deferrable feature, not core execution.
- **Run-scoped, agent-authored temporary explorations.** Nothing new is actually needed here: since
  tests are just data passed into a `run()` call, a caller can already assemble ad-hoc
  `TestDefinition`s at runtime and hand them in alongside (or instead of) the checked-in suite.
  I'd treat this as "already falls out of the design" and just document the pattern, rather than
  building new mechanics for it.

### Push back on / defer

- **"Eliminate shared mutable state" — worth doing, but not because of migration cost.** The
  original brief for this plan asked whether this is worth the migration cost given Tigger 1's
  entire consumer suite (`packages/integration` in the Terros sales monorepo, ~50 domains) relies
  on shared mutable `state`. My honest read: **that framing doesn't apply here.** Tigger 2 starts
  with zero consumers other than its own sample app — `packages/integration` keeps using Tigger 1
  unless and until the captain separately decides to port it, which is its own open question (see
  `migration-compat` in `OPEN_DECISIONS.md`). So there is no existing-suite migration cost to weigh
  *right now*. Judged purely on its own merits for a new engine, explicit `outputs` (a `Map`-like
  store of `{ id -> whatever that test's run() returned }`, read via `ctx.outputs.get(id)`) is
  worth it: it's what makes "data provenance through the graph" (a real, concrete agent-debugging
  win — "which test produced this undefined value") possible at all, and it costs little for code
  written from scratch. I would *not*, however, chase full static type-inference across the whole
  graph's output types (à la a tRPC/Effect-style typed context) — that's a rabbit hole. A
  loosely-typed runtime map with a developer-asserted generic
  (`ctx.outputs.get<ProjectOutput>('create-project')`) is enough for v0.
  - One caveat: I'd keep a small, explicitly *read-only* `ctx.config` object seeded once per run
    (base URL, run namespace, etc. — the useful part of Tigger 1's `initial: State`), just not a
    *mutable* one. This isn't a re-introduction of shared mutable state — tests can read suite-wide
    config, but the only way to hand data to a downstream test is through that test's own declared
    `outputs`.
- **Cross-run `state.json` persistence.** I would drop this outright rather than carry it forward.
  This mechanism's real job in `packages/integration` was incidental, not load-bearing — the actual
  cross-run isolation mechanism was `loginGroup` (a config value namespacing throwaway
  company/users), and CI always started from an empty `output/` anyway since it was gitignored.
  What Tigger 2 actually wants instead is a **history of what happened**, not a resumable mutable
  blob — i.e., persist each run's full structured JSON under a run-id
  (`.tigger/runs/<run-id>.json`), which is a fundamentally different and more useful artifact than
  the old `state.json`. This directly enables `tigger inspect <run-id>` from the CLI sketch below.
- **Triage-before-healing, healing-permission matrices, failure-category distributions.** Good
  *philosophy*, but this is agent operating procedure, not engine mechanics, and building it now
  would be building tooling for an agent that doesn't exist yet. Tigger's actual job here is small:
  store the metadata that lets an external agent's triage logic make these calls
  (`policy`/`authority` fields), and maybe later add a lightweight CI lint that flags a diff
  touching a `policy: 'protected'` field. No classifier, no automation, inside Tigger itself.
- **AXI-style system-under-test inspection commands.** The proposal itself places this in the
  "AXI / system-under-test tools" layer, explicitly outside Tigger — agreed, would not build this
  into the engine. The sample app can optionally expose one illustrative inspection endpoint (see
  §3) just to make the three-layer separation concrete, but it's not a serious tool and shouldn't
  be treated as one.
- **Mutation testing.** Interesting long-term signal, but it requires safely mutating and
  reverting implementation code around a full test run — that's a separate tool built *on top of*
  Tigger, not a Tigger feature, and there's no implementation here to mutate yet (the sample app is
  a toy). Not scoped into any phase; it's a "someday, if the rest proves out" idea.
- **Any internal Terros dependency (`@terros/common`, etc.).** Tigger 1 depended on
  `@terros/common` for `Logger`, `isEmpty`, `isNotEmpty`, `messageFromError`. Tigger 2, as a
  standalone repo with no access to the Terros sales monorepo, **must not** depend on any
  `@terros/*` package — not because of open-sourcing plans (undecided, see `OPEN_DECISIONS.md`),
  but because this repo literally cannot resolve that dependency at all. This is cheap insurance
  regardless of how the open-source question resolves. (This part is already done: `packages/engine/`
  reimplements the handful of needed utilities locally under `packages/engine/src/util/`.)

---

## 2. Phased build plan

Scope and sequencing, not calendar time. None of this is large in absolute terms (Tigger 1's entire
engine was ~264 lines).

### Phase 0 — Repo scaffold (no features yet) — **DONE**

- Layout: engine at the repo root's `packages/engine/` (not nested further — `packages/tigger`
  nesting made sense in the old monorepo where tigger was one of dozens of packages; inside a repo
  that already IS tigger, deeper nesting is redundant), plus a planned sibling workspace package,
  `sample-app/` (`private: true`, not yet created), via `pnpm-workspace.yaml`.
- Toolchain: pnpm, TypeScript, vitest, Node's built-in `node:util.parseArgs` for CLI args (Tigger 1
  already used this, no new dependency needed).
- CI: a GitHub Actions workflow that installs, builds, typechecks, and runs the engine's unit tests
  on every PR — **live and green.**
- This phase's deliverable (an installable, structured repo with the ported baseline engine) is
  done; Tigger-2-specific primitives below are not yet started.

### Phase 1 — v0 / MVP: core engine + first agent-native primitives + sample app + dogfood CI — **NOT STARTED**

This is the meaty phase — it's where Tigger 2 actually becomes "Tigger 2" rather than "Tigger 1
copied into a new repo." Deliverables:

- **DAG engine, rewritten clean** (not copy-pasted): `dependsOn`, `tearsDown` (still available as
  an escape hatch under `resource()`, see below), `tags`/`covers`, per-loop parallel execution via
  the same `do/while` polling scheduler shape as Tigger 1, circular-dependency detection, `dryRun`,
  forward skip-propagation on failure. No behavior regression versus Tigger 1's mechanics — same
  guarantees, new API surface.
- **`test({ id, intent?, invariants?, dependsOn?, uses?, run, verify? })`**: `run` replaces
  `evaluate`; `verify` is a genuinely separate, optional function (defaults to "no additional
  assertion beyond what `run` throws on" if omitted, so a test can still be a single function in
  the simple case — no forced ceremony for a trivial test).
- **Explicit outputs, no shared mutable state object**: `run`/`verify` receive a context
  `{ outputs, config, observe }`; whatever `run` returns becomes that test's own output, retrieved
  downstream via `outputs.get(id)`. `config` is the read-only, suite-wide seed value (successor to
  the useful part of Tigger 1's `initial`).
- **Structured observations**: `ctx.observe({...})` during `run`/`verify`, producing a typed list
  (e.g. `{type:'http', method, path, status}`, `{type:'event', name}`, `{type:'poll', attempts,
  settled}`, `{type:'assertion', expected, actual, passed}`) attached to that test's run record —
  a first-class JSON artifact, not console text.
- **`resource({ id, create, destroy })` + `uses: ['id']`**: sugar compiling to `dependsOn`/
  `tearsDown` internally, singleton resources only (one creator, one destroyer, N consumers) — I'd
  explicitly defer multi-instance/parameterized resources (e.g. "three separate projects in one
  run") to a later phase; singleton coverage is exactly what the sample app in §3 needs, and
  Tigger 1's own teardown-ordering logic was already its trickiest, most bug-prone-feeling code —
  worth getting solid unit-test coverage on this before generalizing it further.
- **JSON-first output**: `runTests()` (or its Tigger-2-renamed equivalent) returns one structured
  object; the CLI defaults to emitting that as JSON, with a human-pretty renderer built as a
  separate formatter on top of it rather than the source of truth.
- **CLI v0**: `tigger run [ids...]`, `--dry-run`, `--include`, `--exclude`, `--json` (or JSON
  default plus a `--pretty` flag). Drop `--runInBand` (already a documented no-op in Tigger 1)
  rather than reintroduce dead surface area.
- **Sample app** (see §3 for full design): a small, in-memory, HTTP-driven toy app living at
  `sample-app/`, standing up a `createProject -> createDocument -> processDocument ->
  {summary, tags} -> search -> archive`-shaped graph — deliberately structured to exercise every
  primitive above (fan-out/fan-in DAG, resource lifecycle, structured observations including a
  genuine polling/eventual-consistency case, at least one real invariant).
- **Dogfood CI**: the same PR that lands this engine also lands a CI job that boots the sample app
  on localhost and runs `tigger run` against it end-to-end, asserting exit code 0 — proving the
  new engine against a realistic target in the same PR that changes it.
- **Test provenance metadata** (`provenance?: { origin, issueLink, createdBy, createdAt,
  reasoning }`) and `intent`/`invariants` as plain optional metadata fields — no enforcement yet,
  just present and documented.

**Explicitly out of Phase 1**: `explore()`, run-history persistence/`tigger inspect`, any
policy-enforcement tooling, `--changed`, multi-instance resources, mutation testing.

### Phase 2 — Explorations, run history, lightweight policy tooling — **NOT STARTED, gated on open decisions**

- **`explore({ id, question, dependsOn?, uses?, run })`**: a second top-level construct alongside
  `test()`. No `verify` requirement — it produces a `Finding` (freeform structured record: what
  was tried, what was observed, whether it looks surprising) instead of pass/fail/skip. CLI:
  `tigger run --explore`. A finding can be manually promoted into a permanent `test()` by a human
  or agent copying it into the checked-in suite — Tigger doesn't need to automate that promotion
  step itself.
- **Run-history persistence**: every invocation gets a run-id; full structured JSON persists to
  `.tigger/runs/<run-id>.json` (gitignored, same spirit as Tigger 1's `output/` but now an
  immutable per-run record instead of a mutable resumable blob). `tigger inspect <run-id>` and
  `tigger output <run-id> --json` read that file back — no custom query language needed for v0,
  plain JSON that pipes cleanly into `jq` is enough.
- **`covers` metadata + naive `--changed`**: rename/broaden `tags` into `covers: string[]`;
  `tigger run --changed <file...>` does plain set-intersection against `covers` — explicitly *not*
  a semantic mapping (that stays the test agent's job).
- **Lightweight policy metadata + CI lint**: `policy: 'protected' | 'flexible'` on a test/verify
  block, `authority: 'human' | 'ai'` on an invariant. A CI script flags a diff that touches a
  `policy: 'protected'` field for required human review — this is the first *real* piece of
  "triage before healing" tooling, deliberately scoped as a git-diff-aware lint, not a classifier.
- **Illustrative inspection surface in the sample app**: one small `/admin/inspect/*` endpoint (or
  a `sample-app inspect <kind> <id>` script) purely to make the three-layer separation (test agent
  / Tigger / system-under-test tools) concrete and demonstrable, not a serious AXI-equivalent tool.

**This phase's scope is directly affected by `test-agent-driver` in `OPEN_DECISIONS.md`** — the
policy/lint tooling only pays off once something autonomously drives Tigger.

### Phase 3 — Speculative / revisit-if-it-proves-out (not committed scope)

- Multi-instance/parameterized resources.
- Deeper `--changed` semantics (an actual concept graph, beyond string-set intersection).
- Mutation testing as a quality signal.
- Open-source publish prep (LICENSE, docs site, public visibility) — explicitly gated on
  `open-source-timeline` in `OPEN_DECISIONS.md`.
- A compatibility/migration path for `packages/integration` (the Terros sales monorepo's real
  integration suite) — explicitly gated on `migration-compat` in `OPEN_DECISIONS.md`. Not designed
  against speculatively before that answer exists, since "explicit outputs vs. shared mutable
  state" and "what compatibility even means" are downstream of that decision.

---

## 3. Sample app recommendation — **NOT YET BUILT**

**Location**: `sample-app/` at repo root (flat, not nested under `apps/`) — a private pnpm
workspace member alongside the root `tigger` package. Two packages total doesn't need an `apps/`
convention; keep the layout obvious.

**Domain model** — deliberately generic, non-Terros terminology so it reads as an honest
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
- **DAG with real fan-out and fan-in** (not just a linear chain like Tigger 1's worked
  `workflow.ts` example, which was really a chain, not a DAG) — `processDocument` produces two
  independent outputs consumed by one downstream test.
- **Resource lifecycle**: `project` is a `resource()` with `create`/`destroy`; `createDocument`,
  `processDocument`, `search` all declare `uses: ['project']`; `archiveProject` only becomes
  eligible once nothing else still needs the project alive — directly exercising the
  teardown-ordering logic carried forward from Tigger 1.
- **Structured observations with genuine eventual consistency**: `processDocument` returns
  immediately and does its work on a delay, so the test that depends on `summarize`/`tag` has to
  poll — producing real `{type:'poll', attempts, settled}` observations, not a contrived example.
- **At least one real invariant**: "a project's documents are never returned by another project's
  `search`" — a genuine isolation invariant in the same spirit as real user-data isolation checks,
  without any real user data, credentials, or product logic involved.
- **At least one exploration**: "given a document containing unusual characters (emoji, very long
  text, empty string), try `search` variations and report anything surprising" — no fixed
  assertion, a `Finding` record.

**Tech stack**:
- **HTTP layer**: Express (or plain `node:http`) — this needs to be a real HTTP API, not
  in-process function calls, because the `{type:'http', method, path, status}` observation shape
  only means something if there's an actual request/response boundary to observe. Express
  specifically for speed of standing this up with minimal boilerplate.
- **Storage**: pure in-memory (`Map`s in the process), no SQLite/Postgres/Docker. This keeps "runs
  entirely on localhost" trivial — nothing to install, nothing to migrate, resets by restarting
  the process. It's an honest simplification: the sample app doesn't pretend to have real
  persistence, because that's not what it's testing.
- **Async processing**: an in-process `setTimeout`-based fake job runner for `processDocument`,
  not a real queue — genuine eventual-consistency behavior with zero infrastructure.
- **No isolation-namespace concept needed** (unlike Tigger 1's `loginGroup`): since the sample app
  is a fresh localhost process per CI run with no shared live stage to collide on, there's no need
  to replicate that namespacing trick at all — this is one respect in which local dogfooding is
  strictly simpler than the real Terros suite, worth calling out explicitly rather than
  over-building.

**Open-source exclusion**: recommendation is **don't exclude it** if this is ever open-sourced —
it's a genuinely useful onboarding/example artifact (the same role example apps play for
Playwright, Cypress, Prisma, etc.), contains zero Terros branding, data, or credentials by
construction, and hiding a general-purpose toy app would cost more (an extra publish-filtering
step) than it saves. The one concrete mechanical requirement, not a publishing *exclusion* so much
as correctness: `sample-app/package.json` must be `"private": true` and never listed as a
dependency of the root `tigger` package, so a `pnpm publish` of the root package can never
accidentally pull it into the published tarball.

---

## 4. Open questions for the captain

See `docs/OPEN_DECISIONS.md` for the full text of all four — this section just names them:

1. **Migration path for `packages/integration`** (the Terros sales monorepo's real integration
   suite currently running on Tigger 1).
2. **Open-source timeline and license.**
3. **Is a real test-agent driver actually planned soon?**
4. **Public package/npm identity, if ever published.**

None of these block Phase 1 (the engine core + sample app) — only Phase 2/3 scope depends on them.

---

## 5. Suggested first concrete task

The first PR should be scoped to just the riskiest architectural bet, proven in isolation, before
anything is built on top of it:

> **Build the Tigger 2 engine core** — the rewritten DAG scheduler (`dependsOn`/`tearsDown`/`tags`/
> parallel-per-loop/circular-detection/`dryRun`, no `@terros/common`-style dependency — already
> true here), the `test({ run, verify? })` API replacing `evaluate`, explicit `outputs` replacing
> shared mutable state, and structured `observe()` observations. Ship it with its own vitest
> unit-test suite proving parity with Tigger 1's proven mechanics (dependency ordering, teardown
> ordering, skip-on-failure propagation, `dryRun`, circular-dependency detection, `include`/
> `exclude` filtering) plus new tests for `outputs` provenance and observation capture.
>
> **Explicitly out of scope for this first task**: `resource()`, the sample app, the CLI, and any
> exploration/policy/run-history features. The next task builds `resource()` and the sample app
> against a working, unit-tested core; this first task's only job is to prove the core
> architecture (explicit outputs + observations + run/verify) actually holds together before
> anything depends on it.
>
> This is genuinely the next unstarted piece of work in this repo as of the plan's writing — Phase
> 0 (scaffold + ported baseline + CI) is done; this is the first slice of Phase 1.

---

## 6. Summary

The proposal's direction is sound and most of it is worth implementing. The narrower disagreements:
don't build authority-enforcement/triage tooling before an agent exists to need it, don't chase
full static typing across the outputs graph, don't carry forward Tigger 1's cross-run `state.json`
persistence (replace it with immutable per-run history instead), and don't treat "eliminate shared
mutable state" as a migration-cost question — it isn't one, since Tigger 2 has no existing
consumers to migrate. The phased plan above (Phase 0 done, Phase 1 next/MVP with dogfood CI against
an in-repo sample app, Phase 2 explorations/history/lightweight policy gated on open decisions,
Phase 3 speculative) delivers a working, meaningfully "agent-era" engine quickly without
over-building for an agent workflow that doesn't exist yet. Four genuine captain decisions remain
open (`docs/OPEN_DECISIONS.md`); everything else here is a recommendation confident enough to hand
directly to the next engineer/agent as a starting task (§5).
