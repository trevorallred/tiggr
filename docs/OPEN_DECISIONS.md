# Open decisions — Tigger 2

These are unanswered captain decisions from the original planning pass. Do not guess at any of
these or assume a default; they materially change scope for Phase 2 and Phase 3 of
`docs/TIGGER2_PLAN.md`. **Phase 2 and Phase 3 scope should not be started until these are
answered** — several of them change what "the plan" even is for those phases. None of them block
Phase 1 (the engine core + sample app), which is safe to build regardless of how these resolve.

These questions must be resolved by the captain — not inferred or answered by a future agent.

## 1. Migration path for `packages/integration`

**Status: UNANSWERED.**

**Question:** Should Tigger 2 aim for eventual drop-in compatibility, or an explicit migration
path, for the ~50-domain integration suite that currently runs on Tigger 1 (`packages/integration`
in the Terros sales monorepo) — or is Tigger 2 explicitly a clean-slate project with no near-term
plan to replace that live suite?

**Why it matters:** The plan proposes eliminating shared mutable state in favor of explicit
`outputs` plus `run`/`verify` — a clean break from Tigger 1's contract that `packages/integration`
currently relies on. Whether to design any compatibility or migration path now, or treat Tigger 2
as fully independent, changes real scope in Phase 3 and potentially earlier.

## 2. Open-source timeline and license

**Status: UNANSWERED.** (Context: this repo already moved once — from `terros-inc/tigger` to this
personal account — because the Terros team did not want to open-source it there. That doesn't
answer whether or when *this* independent version might be open-sourced.)

**Question:** What's the real timeline/appetite for eventually open-sourcing Tigger 2 (and, if so,
license choice and public visibility), versus this being purely speculative for now?

**Why it matters:** This gates how much open-source-readiness work (LICENSE file, docs polish
beyond internal use, any further independence hardening) belongs in a near-term phase versus
staying indefinitely deferred. The engine is already kept free of any Terros-internal dependency as
cheap insurance either way, but license and timeline are separate, captain-only calls.

## 3. Is a real AI test-agent driver actually planned soon?

**Status: UNANSWERED.**

**Question:** Is a Codex/Claude-driven test agent actually planned to be built against this engine
soon, or is Tigger 2 being built now as speculative agent-ready infrastructure with no near-term
driver?

**Why it matters:** The plan's triage/healing-permission tooling (Phase 2's policy metadata + CI
lint) only pays off once something autonomously drives Tigger. This directly changes how much of
that tooling is worth building in the near term versus deferring further.

## 4. Public package/npm identity

**Status: UNANSWERED.**

**Question:** If Tigger 2 is ever published, what should the npm package name and public identity
be (`tigger`, a scoped name, or something else)?

**Why it matters:** This affects the `package.json` `"name"` field, ideally decided before it needs
changing later rather than renamed after the fact once other tooling references it.
