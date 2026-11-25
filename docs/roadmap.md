# PoPLY — Roadmap

*This roadmap extends `README.md`'s "Delivery sequence" and consumes the open
lists in `STATUS.md` ("Not yet fixed", "Product decisions still open", "Before
production"). It runs two tracks in parallel: **Technical readiness** (T) moves
the reference implementation toward a production-credible system; **Commercial**
(C) moves the business from zero to a signed pilot and beyond. A commercial
stage cannot open until its technical prerequisites clear — the dependency is
one-directional and enforced.*

---

## Where we are (grounded in STATUS.md)

Phase 1 (protocol definition) and Phase 2 (reference implementation) are done
and hardened: the six-contract suite passes `forge test` (15/15), the SDK is
typechecked and tested (28/28) with a digest-drift guard tying EIP-712 types to
the Solidity typehashes, and `e2e:local` runs the full mint → checkpoint →
achievement → exclusive-license → lock → expiry → eligible-listing → purchase
lifecycle green. Ten security findings from the recall-biased review are fixed
and covered.

Phase 3 (publisher SDK) is **partial**: the TypeScript core is complete; the
Unity/Unreal/Godot transports exist at source level but are not compiled or CI'd
against their target engines, and there is no sample integration project.

The system is an **unaudited reference implementation**. Everything below the
Stage 0 gate assumes that status is retired first.

---

## Track T — Technical readiness

### T1 — Finish Phase 3 (publisher SDK)

Compile and CI the Unity/Unreal/Godot adapters against their real engines; ship
one sample integration project so a studio can integrate without contract
knowledge (Phase 3 exit criterion from `README.md`). Restore the structured
`{error, message}` response through the engine clients so integrators get
actionable reasons, not a generic failure string.

*Exit:* a studio engineer integrates the sample game against a local chain
using only published docs.

### T2 — Close the known lower-severity gaps (STATUS "Not yet fixed")

Replace or single-writer-guard `FileVerifierStateStore` (clobber risk under
concurrent writers); correct backend error semantics (409 for stale sequence,
500 for internal fault) and stop leaking the next expected sequence number in
the 400 body; wire the existing `schemas/*.schema.json` into the endpoint so
`state`/`evidence` bodies are validated before signing; factor the duplicated
credit-escrow/fee subsystem and `keyOf`/`_key` into shared code.

*Exit:* no known-and-deferred correctness gap remains unguarded; concurrent
verifier operation is safe.

### T3 — Resolve the production decisions (STATUS "Product decisions still open")

Each of these needs an explicit RFC/ADR before it can ship, per the
"Decisions required before production" list in `README.md`: target chain and
account-abstraction strategy; verifier registration/revocation authority;
identity recovery and custodial-to-self-custody migration; PoPL calculation,
versioning, and dispute handling; licensing exclusivity enforcement at the
publisher boundary; transfer behaviour during active licences; metadata
availability guarantees; and upgrade/pause/emergency-recovery authority.

*Exit:* each open decision has a merged RFC or ADR; none is resolved implicitly
in code.

### T4 — Production hardening (STATUS "Before production")

Independent contract audit; publisher-specific threat-model review;
production-grade verifier persistence replacing the file store; managed signing-
key custody replacing the raw env-var key; multisig/timelock administration;
incident response; load testing; jurisdiction-specific legal review.

*Exit:* the reference implementation is no longer the thing in production — an
audited, custody-managed, multisig-administered deployment is.

---

## Track C — Commercial

### C0 — Land the wedge studio *(gated on T1; T3's PoPL/exclusivity/custody decisions in flight)*

Target a mid-size studio with a solid niche F2P title, an active gray market,
and an agile legal function. Pitch is the standalone wedge only: durable
provenance + enforced ERC-2981 secondary royalties + gray-market recapture. No
crossover, no wagering, no cross-IP. Deliverable is the `business-model.md`
one-pager plus a technical integration brief drawn from T1's sample project.

*Exit:* one signed pilot agreement with a named studio.

### C1 — Run the pilot as a measurement instrument *(gated on T2; T4 audit in progress)*

Instrument for the three numbers that constitute the next pitch and the seed
deck: retention lift attributable to provenance, secondary-market volume settled
with enforced royalty, and provenance premium (aged vs. fresh character). Get
marketing close for distribution and narrative, but the pilot's real output is
evidence, not reach.

*Exit:* the three metrics exist as defensible figures from live play.

### C2 — Studio cohort on the shared standard *(gated on T4 complete)*

Several studios independently adopt the same verifier standard and marketplace
rails for their own single-studio reasons; this incidentally builds the shared
liquidity layer. Stand up the neutral standards body (airline-alliance
governance shell) here — *before* it has to arbitrate anything — so that when it
later must, it already exists and is controlled by no single member.

*Exit:* three or more studios live on the shared standard; the governance body
is incorporated and neutral.

### C3 — The compliance-heavy tier (each behind its own gate)

| Feature | Unlock condition | Permission holder |
| --- | --- | --- |
| **3a — Seasonal NFT guests** | Two cohort studios + a bilateral IP-depiction deal | The two studios; PoPLY is the settlement/provenance rail |
| **3b — Non-cashable dice arena** | Anytime after C1; no external permission | PoPLY alone — a competitive ladder |
| **3c — Persistent social environment** | Cohort liquidity + a real content-moderation / duty-of-care build | PoPLY as host, with its own memo |
| **3d — Wagering-for-value arena** | A licensed gaming or sweepstakes-model partner signed as the fronting entity + jurisdiction geo-fencing | The licensed partner; PoPLY supplies mechanic + provenance only |

3d is structurally firewalled in a separate entity from the core provenance
business. The IP-depiction clearance (3a) and gaming permission (3d) are
distinct counterparties and never substitute for each other.

---

## Dependency graph

```
T1 ──► C0 ──► C1 ──► C2 ──► C3(a/c/d)
 │       ▲      ▲      ▲
T2 ──────┘      │      │
T3 ──(feeds C0/C1 decisions)
T4 ─────────────┴──────┘         C3b branches off C1 (no external gate)
```

Read: no commercial stage opens ahead of its technical gate. C0 needs a
studio-integrable SDK (T1). C1 needs the concurrency and error-semantics fixes
(T2) so a real pilot does not corrupt state. C2 needs full production hardening
(T4) because a multi-studio standard cannot ride an unaudited file-backed
reference. C3b (non-cashable arena) is the one branch that needs no external
permission and can ship off C1. C3d (wagering) is the last and most heavily
walled.

---

## Immediate next actions (repo-level)

*(Updated 2026-07-16: the T2 "Not yet fixed" list is fully closed — see
`STATUS.md` — and the item-issuance design is drafted as
`rfc/RFC-009-item-issuance.md`.)*

The nearest-term, highest-leverage moves: finish the engine-adapter
compilation/CI and sample project (T1) — now the sole blocker on C0. The PoPL
calculation and versioning RFC (T3) is the first design-level document to
open, since C0's pitch and C1's provenance-premium metric both depend on PoPL
being defined and dispute-handled rather than left as the reference policy.
The items layer (RFC-009) implements after the PoPL RFC: an `ItemRegistry`
plus item-NFT contract that ride the existing verifier and settlement layers,
so the C0/C1 pilot can carry both provenance products on one integration. The
optional character–item interlock stays paper-only until a pilot demonstrates
demand for it.
