# PoPLY Pre-Pilot Report — Test Summary & Concept Audit

*Date: 2026-07-16 · Repo state: `main @ 2596375` (all suites green) ·
Status: **unaudited reference implementation** run in a local sandbox
(Anvil). Every number below is measured, reproducible from this repo, and
labeled with the command that produces it. Nothing here is from live players
or a production chain — this document exists so a technical reviewer can
audit the concept, not to imply production readiness. An independent
concept-audit review has been received and applied — see §5.*

---

## 1. What the pre-pilot demonstrates

PoPLY's thesis — **off-chain play, on-chain proof** — is running end to end:

- **Characters (Proof-of-Play):** publisher-signed EIP-712 checkpoints and
  achievement attestations over canonicalized game state, with a monotonic,
  plausibility-capped on-chain registry; a derived eligibility tier (PoPL)
  gates licensing and marketplace access.
- **Items (Verified Issuance, RFC-009):** per-item ERC-721 uniqueness as the
  anti-duplication guarantee; supply changes only through verifier-signed
  issuance / terminal destruction / transformation attestations.
- **Interlock (optional):** a verifier-attested binding locks an item to its
  character; a character sale severs the binding permissionlessly.
- **Settlement:** exclusive time-bounded licensing locks, ERC-2981 royalties,
  eligibility-gated fixed-price marketplace, pull-payment escrow.
- **Engine path:** a real game engine (Godot 4.7, headless) drives the
  publisher-verifier HTTP API through the shipped addon, and a second,
  unrelated game (Buzzkill, TypeScript) exercises the same API with its own
  event vocabulary — two independent integrations against one verifier
  surface.

## 2. Test inventory (all reproducible)

| Surface | Command | Count / result |
| --- | --- | --- |
| Solidity contracts (Foundry) | `npm run test:contracts` | **26/26** — checkpoint monotonicity + plausibility caps, verifier game-scoping, achievement non-duplication, exclusive vs. non-exclusive lock semantics, marketplace eligibility bars, royalty/fee settlement, item issuance-exactly-once, terminal destruction, transformation, binding lock/severance, binding-attestation replay rejection, soulbound non-release |
| SDK + backend + reference game (Node) | `npm run test:sdk` | **37/37** — EIP-712 digest-drift guards tying SDK type strings byte-for-byte to all four Solidity typehash sources, canonical-state collision resistance, PoPL policy, verifier restart persistence, single-writer lock enforcement, API auth (constant-time), 201/400/409/500 semantics, arena simulation determinism |
| Full on-chain lifecycle | `npm run e2e:local` | isolated Anvil chain: mint → checkpoint → achievement → exclusive license → lock → expiry → eligible listing → purchase → **item issuance → bind → sale severs binding → terminal destruction** |
| Engine integration (Godot) | `npm run e2e:godot` | headless Godot 4.7 drives the addon against a live verifier: signed checkpoint (201) + structured `sequence_conflict` (409) on replay |
| Second-game plumbing (Buzzkill) | `node game/scripts/poply-smoke.mjs` (Buzzkill repo) | real game event vocabulary (level complete → checkpoint, unlock → achievement) signed by the same verifier; replay rejected 409 |
| Static | `npm run check` | forge fmt + build + tsc + arena build, all clean |

Security posture: a ten-finding hardening pass (chain-id enforcement,
verifier scoping, plausibility ceilings, canonical-state collisions,
griefing-lock closure, reentrancy-safe pull payments, listing eligibility,
PII-guard) is complete and regression-covered — see `STATUS.md`.

## 3. Measured metrics for publishers

### 3.1 Gas footprint (measured: `forge test --gas-report`, Solc 0.8.30)

| Operation | Avg gas | Notes |
| --- | --- | --- |
| `submitCheckpoint` (Proof-of-Play) | **~91k** | Constant-size regardless of game-state complexity — the full state hashes to one 32-byte commitment |
| `submitAchievement` | ~57k | One permanent attestation per achievement per character |
| `submitIssuance` (item mint via attestation) | ~131k | Includes the ERC-721 mint |
| `submitDestruction` / `submitTransformation` | ~82k / ~60k | Terminal / class-lineage |
| `bind` / `settleOrphanedBinding` | ~95k / ~35k | Interlock create / permissionless severance |
| Marketplace `buy` (transfer + royalty + fee escrow) | ~83k | Pull-payment settlement |

**The structural claim, stated honestly:** PoPLY does not make on-chain state
updates cheaper — it makes them *constant and rare*. Storing game state
on-chain costs ~20k gas per new 32-byte storage slot, so a character sheet of
N fields costs ~20k·N and grows with game complexity; a PoPLY checkpoint
commits state of *any* size for a flat ~91k, and a publisher batches
checkpoints per session or per milestone, not per tick. The right comparison
is not "our write is X% cheaper" but "gameplay generates zero on-chain writes,
and provenance costs one flat commitment per milestone." We deliberately do
not publish a "%-cheaper" figure against on-chain-gameplay architectures —
the honest baseline (how much state, how often) varies per game, and any
single percentage would be an invented benchmark.

**Rollup economics favor this profile further.** A PoPLY checkpoint is
computationally heavy (EIP-712 signature recovery) but storage-light (one
32-byte commitment plus fixed bookkeeping). Modern L2s price execution
aggressively cheaply relative to persistent storage growth, so the cost gap
between PoPLY's flat commitment and a state-bloated on-chain-gaming write
pattern widens on rollups (ApeChain, Abstract, Immutable zkEVM) — exactly the
venues in the outreach target list.

### 3.2 Latency

**Zero on-chain calls on the gameplay critical path — by construction, and
enforced as a review invariant, not a benchmark.** The reference arena runs a
fixed 16 ms simulation timestep with signing and relaying fully asynchronous;
the engine adapters are fire-and-forget HTTP posts to the publisher's own
verifier. There is no code path in this repo where a game action awaits chain
finality, so gameplay tick-rate impact is structurally zero rather than
measured-as-small.

### 3.3 Integrity (verified behaviors, not simulations of scale)

Over the automated suites and both game integrations, the following integrity
properties hold and are regression-tested:

- checkpoint history cannot skip, repeat, or regress; no single checkpoint
  can advance play time or level past its plausibility ceiling;
- a rejected checkpoint cannot desynchronize a character (validated before
  local sequence state advances);
- an item token can be issued exactly once and never re-issued after
  destruction — the dupe vector is closed at the supply level;
- a verifier can only attest for its own publisher's games; a forged or
  out-of-scope signature is rejected on-chain;
- an active exclusive license blocks every transfer path, including via the
  marketplace; non-exclusive licenses leave the asset tradeable;
- a bound item cannot move or be destroyed separately from its character.
  Severance after a character sale is **lazy by design**: no transfer hook
  exists on the character contract, so a sale on any venue — including
  external marketplaces — becomes permissionlessly severable via a ~35k-gas
  settlement call; the item stays locked until that call runs. This is the
  accepted trade for staying decoupled from marketplace implementations
  (RFC-009).

What this pre-pilot has **not** measured — and a real pilot must: sustained
throughput under production load, verifier operations at scale, retention
lift, secondary-market volume, and provenance premium (the three pilot
metrics in `docs/roadmap.md`).

## 4. Known limits (read before citing this report)

- Unaudited; local Anvil only; single admin key; file-backed verifier store
  (single-writer-guarded, but not a production datastore).
- Unity/Unreal adapters exist at source level without engine CI (Godot is
  the proven path).
- Buzzkill is an integration-plumbing demonstration, not a pilot candidate:
  it has no tradable assets or secondary market.
- Production gates (audit, key custody, multisig, legal review) are listed
  in `STATUS.md` and remain open by design.

## 5. Review history

Three review passes have run against this repository; every finding is
dispositioned in the consolidated ledger at **`docs/review-findings.md`**:

1. **Internal security hardening** (2026-07-14) — 10 findings, all fixed and
   regression-covered (detail in `STATUS.md`).
2. **Full-repo code review** (2026-07-16) — 8 findings: 7 fixed (error
   semantics, schema wiring, single-writer store, escrow dedup, structured
   engine errors, two cosmetic contract items), 1 accepted-as-theoretical
   (uint16 PoPL-ceiling overflow, unreachable under any realistic policy).
3. **External concept-audit review** (2026-07-16,
   `docs/outreach/poply-concept-audit-review.md`) — 6 points: lazy
   interlock-severance semantics documented (RFC-009, natspec, §3.3), L2 gas
   framing added (§3.1), engine-wedge framing added to the pitch plan,
   README prerequisites strengthened, EIP-712 domain portability documented,
   constant-time auth verified as already implemented.
4. **Adversarial EIP-712 self-audit** (2026-07-16, pre-outreach) — the three
   standard signature-vulnerability classes (domain replay, nonce
   consumption, malleability) all pass with live-computed domain separators,
   strict sequence consumption, and a single hardened `ecrecover` site. One
   finding: binding attestations were deadline-bounded but not consumed on
   use — fixed with a one-time digest marker and a regression test.

## 6. Reproduce everything

```bash
git clone https://github.com/R4m1r0qu41/PoPLY-public && cd PoPLY
npm install
npm run check          # 26 contract + 37 SDK/backend tests
npm run e2e:local       # full character + item on-chain lifecycle (Anvil)
npm run e2e:godot        # headless Godot engine integration
forge test --gas-report   # the gas numbers above
```
