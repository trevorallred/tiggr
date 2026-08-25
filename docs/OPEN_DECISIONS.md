# Captain decisions — Tiggr

The four captain-only questions from the original planning pass are now resolved. They no longer
block Phase 2 or Phase 3 of `docs/PLAN.md`.

## 1. Migration path from Tiggr 1

**Status: DECIDED — clean break.**

The captain's direct answer was: **"Clean break: this is a breaking change, shipped as major
version 2.0.0, with no compatibility shim or migration tooling for users of the predecessor
package."**

Tiggr therefore does not carry a compatibility or migration workstream for the live Tiggr 1
integration suite.

## 2. Open source and license

**Status: DECIDED — yes; MIT.**

The captain's direct answer to open-sourcing Tiggr was: **"Yes."** The repository is public,
and the captain subsequently selected the MIT License for the project and npm package.

## 3. AI-driven test-authoring and agent features

**Status: DECIDED — yes, planned.**

The captain's direct answer was: **"Yes, planned."** Agent-oriented test authoring and driving are
intended product work rather than speculative infrastructure.

## 4. Public package and repository identity

**Status: DECIDED — publish `tiggr` to npm from `trevorallred/tiggr`.**

The captain wants the engine published to npm and the repository public. The original preferred
package name was `tigger`, but the npm registry already has an actively maintained, unrelated
package with that name, published by a different author. Its latest release was 2026-07-31 after
roughly 11 years of history, so that name is not available.

The captain subsequently confirmed the available unscoped package name **`tiggr`**. The public
GitHub repository is `trevorallred/tiggr`.
