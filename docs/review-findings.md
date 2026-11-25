# Review Findings Ledger

*Consolidated record of every review pass run against this repository, each
finding's disposition, and where the fix or accepted trade-off lives. This is
the audit trail companion to `pre-pilot-report.md`; `STATUS.md` remains the
single source for current state.*

---

## Pass 1 — Internal security hardening (2026-07-14, recall-biased review)

Ten confirmed/plausible findings across contracts, SDK crypto, backend, and
engine clients. **All fixed and regression-covered.** Full detail in
`STATUS.md` ("Security hardening"); summary:

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | `POPLY_CHAIN_ID` silently defaulted to Anvil's 31337 — wrong-chain signatures | Fixed — explicit, required |
| 2 | Verifiers globally trusted across all publishers' games | Fixed — scoped via `isVerifierForGame` |
| 3 | Unbounded play-time/PoPL jump could permanently brick a character's chain | Fixed — plausibility ceilings (`MAX_PLAY_TIME_DELTA`, `MAX_POPL_DELTA`) |
| 4 | Canonical-state collision: `bigint` vs. equal numeric string hashed identically | Fixed — distinct-type encoding |
| 5 | License manager could be unset/repointed, breaking the transfer lock | Fixed — constructor-immutable |
| 6 | Rejected checkpoint could desync verifier sequence state forever | Fixed — validate before advancing |
| 7 | Free griefing-lock via unsolicited public license offers | Fixed — publisher opt-in or collectible-tier price |
| 8 | Frame-rate-dependent proofs (wall-clock delta) | Fixed — fixed 16 ms timestep |
| 9 | Spoofed ERC-721s listable on the marketplace | Fixed — on-chain age/play-time/PoPL eligibility bars |
| 10 | Analytics PII guard scanned keys only | Fixed — value scanning + word-boundary regex |

## Pass 2 — Full-repo code review (2026-07-16, this repo at Apache-2.0 relicense)

| Finding | Severity | Disposition |
| --- | --- | --- |
| Backend collapsed all errors to 400; leaked next expected sequence | Low | **Fixed** — 409 `sequence_conflict` (generic body), 400 with reason, 500 opaque; typed `SequenceConflictError` in SDK |
| Signed envelopes left the verifier unvalidated against published schemas | Low | **Fixed** — Ajv (draft 2020-12) validation wired into both endpoints |
| `FileVerifierStateStore` clobber risk under concurrent writers | Low | **Fixed** — pid-tracked single-writer lock; stale locks reclaimed |
| Credit-escrow/fee subsystem duplicated across `Licensing`/`Marketplace`; `keyOf` duplicated | Quality | **Fixed** — shared `CreditEscrow` base + `CharacterKeys` library in `Common.sol` |
| Engine clients collapsed structured `{error, message}` into a generic string | Low | **Fixed** — Unity/Unreal/Godot all surface the structured reason |
| `settleExpired` reverted with misleading `CharacterAlreadyLocked` | Cosmetic | **Fixed** — dedicated `NoExpiredLicense` error |
| `OfferCreated` did not emit the `exclusive` flag (indexers needed a storage read) | Cosmetic | **Fixed** — flag added to the event |
| `current.popl + MAX_POPL_DELTA` could overflow `uint16` and freeze checkpoints if PoPL ever reached ≥ 65,504 | Theoretical | **Accepted** — unreachable under any realistic policy (reference tops out at level 5; reaching the threshold needs ~2,000 max-delta checkpoints); documented here rather than changed |

## Pass 3 — External concept-audit review (2026-07-16, `docs/outreach/poply-concept-audit-review.md`)

| Finding | Disposition |
| --- | --- |
| Interlock severance semantics under external-marketplace transfers (OpenSea, Blur) undocumented | **Documented** — severance is lazy by design: no transfer hook on the character contract; a sale on any venue becomes permissionlessly severable (~35k gas) and the item stays locked until settlement runs. Stated in RFC-009, `CharacterItemBinding` natspec, and the pre-pilot report §3.3. A publisher wanting eager clearing settles from its own indexer on the transfer event. |
| L2 gas framing missing (computation-heavy vs. storage-light) | **Added** — pre-pilot report §3.1 rollup-economics note |
| Godot-proven / Unreal-wedge engine framing + ODK partner call to action | **Added** — `docs/outreach/first-wave-pitch.md` |
| README should state Foundry/`anvil` as an explicit prerequisite | **Already present; strengthened** — `foundryup` pointer + SDK-only vs. full-toolchain note |
| EIP-712 domain/chain portability should be documented | **Added** — README section: chain moves are configuration, guarded by digest-drift tests |
| Verify constant-time API-key comparison | **Verified already implemented** — `crypto.timingSafeEqual` with length-guard (`backend/src/server.ts`) |

## Pass 4 — Adversarial EIP-712 self-audit (2026-07-16, pre-outreach)

Run against the three "senior reviewer" signature-vulnerability classes
before sending the report to ecosystem DevRel teams:

| Check | Result |
| --- | --- |
| Cross-chain / cross-contract domain replay | **Pass** — every registry recomputes its domain separator at call time from live `block.chainid` + `address(this)` (no constructor caching, so hard-fork-safe); three distinct domain names prevent replay between PoPLY's own contracts; SDK type strings are digest-drift-guarded |
| Nonce consumption / state freshness | **Pass** — checkpoint sequence is the nonce, checked strictly (`expected + 1`) and consumed atomically in the accepting transaction; achievements once-per-id, issuance consumed by token existence + terminal `destroyed` marker; all messages deadline-bounded |
| Signature malleability / raw `ecrecover` | **Pass** — single `ecrecover` call site (`SignatureChecker.recover`), rejecting high-`s`, invalid `v`, wrong length, and zero-address recovery |
| Binding attestation replay within deadline window | **Found and fixed** — `bind` checked deadline but did not consume the digest, so the same owner could replay the same attestation after an unbind within its validity window. Low severity (same authorized party, same action, bounded window) but re-binding is a game-approved action and must require a fresh verifier signature. Fixed with a `usedBindingDigests` one-time consumption marker + regression test (`testBindingAttestationCannotBeReplayedAfterUnbind`) |

Documented-not-defects, stated proactively: verifier equivocation at the
same sequence is the declared publisher-trust boundary (whitepaper §5.4);
open relay is by design (authority comes from the signature, not
`msg.sender`; a relayed message is content-identical).

## Open, tracked, deliberately deferred

These are not unreviewed — they are known and gated in `STATUS.md` /
`docs/roadmap.md`:

- Unity/Unreal adapters: source-level only, no engine CI (roadmap T1 remainder).
- Production gates: independent audit, managed key custody,
  production datastore, multisig/timelock admin, legal review (T4).
- Product decisions: target chain, account abstraction, identity recovery,
  metadata availability, PoPL versioning RFC (T3), soulbound-binding
  release path (RFC-009 open question).
