# PoPLY — Product Directions Reconciliation

*Status: strategy note, companion to `business-model.md` and `roadmap.md`.
It does not replace either — it maps the project's four product axes onto the
staging those documents already define, states what infrastructure is common
versus axis-specific, and names the open questions honestly instead of
resolving them by assertion.*

---

## The four axes

The project has grown four distinct product directions. They share one
substrate — publisher-signed, independently verifiable provenance over game
state — but diverge in product shape, counterparty, and regulatory surface.

| Axis | One-line product | Maturity |
| --- | --- | --- |
| **A — Character provenance & licensing** | Durable, tradable, verifiably-played characters; exclusive time-bounded licensing (NPC loan-out, tournament, guest appearances); team-owned rosters | Specified (whitepaper v0.2) and implemented as the reference system |
| **B — Item provenance / anti-dupe** | High-value in-game items recorded on-chain so they cannot be fraudulently duplicated | Concept; adjacent reuse of existing machinery |
| **C — Arena (chance-weighted contest)** | Characters pitted in a dice-like contest: higher PoPL grants more dice/power, randomness lets underdogs upset | Partially specified (business-model stages 3b/3d) |
| **D — Prediction markets on arena outcomes** | Spectator-side bets on arena matches, under whatever licenses that requires | Concept; regulatory question unresolved |

Axis A is the anchor. It is the only axis with a whitepaper, a hardened
reference implementation, and a staged business model. The other three are
extensions that must justify themselves against A's existing gates, not
peers to be designed from scratch.

## Common infrastructure vs. axis-specific

**Genuinely common (build once, all axes consume):**

- **Asset identity** — `(contract, tokenId)` ownership with immutable game
  binding (`CharacterNFT` today; an item asset is the same pattern).
- **Publisher-signed commitments** — EIP-712 checkpoints/attestations over
  canonically-encoded state, sequence-ordered, plausibility-capped
  (`StateRegistry`, `canonical-state.ts`).
- **Verifier trust scoping** — verifiers authorized only for their own
  publisher's games (`VerifierRegistry`). Every axis inherits this; none may
  reintroduce a globally trusted verifier.
- **Settlement rails** — pull-payment escrow, ERC-2981 royalties, eligibility
  gating (`Licensing`, `Marketplace`, `RoyaltyRegistry`).
- **The product boundary** — gameplay never blocks on a transaction; no
  protocol token; no pay-to-win; no passive yield from ownership alone.

**Axis-specific (each carries its own build and its own risk):**

- **B**: an item asset contract (likely ERC-721 for uniques; a fungible-tier
  question for stackables), an item-event schema, and a supply-attestation
  model (see tension #1 below).
- **C**: the contest ruleset and its RNG. For any staked variant the
  randomness source must be verifiable/commit-reveal, not a server roll —
  otherwise the operator can rig outcomes. Non-cashable (3b) tolerates
  server-side RNG; wagering (3d) does not.
- **C (3d only)**: the licensed-gaming compliance wall already specified in
  `business-model.md` — a fronting licensed operator or sweepstakes partner,
  structurally firewalled in a separate entity.
- **D**: market-making/settlement logic for third-party bets, plus its own
  regulatory counterparty (see open question below).

## Mapping onto the existing staged model

`business-model.md`'s staged unlock model absorbs all four axes without a new
scheme:

| Axis | Stage placement | Rationale |
| --- | --- | --- |
| A — Characters | Stages 0–3a as written | Already the spine of the model |
| B — Items | **Alongside Stage 0/1** | Same compliance profile as character provenance (no wagering, no cross-IP, single publisher). Arguably a *stronger* wedge: "stop dupe fraud on your $500 items" is a more immediate studio pain than character provenance, and needs no player-facing marketplace to deliver value. |
| C — Arena, non-cashable | Stage 3b as written | No external permission; can ship off C1 |
| C — Arena, wagered | Stage 3d as written | Licensed operator wall, unchanged |
| D — Prediction markets | **Behind or beside 3d — never before it** | Spectator wagering on outcomes is at least as regulated as participant wagering; see open question |

The roadmap's one-directional gates (`roadmap.md`) apply unchanged: no axis's
commercial stage opens before its technical prerequisites. Items would need
its own small technical track (item schema, item registry or generalized
`StateRegistry`, dupe-detection semantics) gated the same way T1/T2 gate C0/C1.

## Tensions the docs do not yet resolve

These are surfaced deliberately; smoothing them over would hide real design
work.

1. **Items do not fit the checkpoint model — resolved as a dual-concept
   split.** Character progression is low-frequency and monotonic; item
   integrity is a *supply* invariant ("exactly one of item X exists") that no
   per-character sequence expresses. Decision (owner-confirmed 2026-07-16):
   the protocol carries two proof concepts on one substrate — **Proof-of-Play**
   for characters and **Verified Issuance** for items, where each high-value
   item is its own ERC-721 token and uniqueness is the anti-dupe guarantee,
   with verifier attestations only at issuance, destruction, and
   transformation. An optional **character–item interlock** (binding an item
   to a character so it trades, locks, and licenses with it) is sketched but
   deliberately deferred — the anti-dupe product does not need it. Full
   design: `rfc/RFC-009-item-issuance.md`.
2. **The arena needs a game-integrity story before a compliance story.**
   3d's wall covers *who holds the gambling license*, not *whether the dice are
   fair*. A wagered contest run on operator-controlled RNG is unauditable.
   Before 3d unlocks, the arena needs a verifiable-randomness RFC
   (commit-reveal or VRF) — this is a technical gate that belongs on Track T,
   and it does not exist yet.
3. **PoPL as combat power flirts with pay-to-win adjacency.** The whitepaper
   is explicit that PoPL "must not directly increase in-game power" — but the
   arena grants more dice for higher PoPL. This is defensible (the power is
   earned by play, not purchased, and randomness compresses the advantage) but
   it is a carve-out from a stated design commitment and should be written up
   as such, not slipped in.

## The open regulatory question (not solved here)

**Is spectator prediction-market betting (D) the same counterparty category
as participant wagering (3d), or a new one?** `business-model.md` explicitly
rejects event-derivatives exchanges as the 3d counterparty because their
license rests on *not* being gaming. Prediction markets are exactly that
category. So either:

- D runs through the same licensed-gaming/sweepstakes operator as 3d (treating
  spectator bets as gaming, the conservative reading), or
- D runs through an event-contracts/derivatives venue (a different regulator,
  a different argument, and one `business-model.md`'s logic currently
  disallows for 3d).

These cannot both be handled by one partner, and choosing wrong contaminates
the firewall. This is a decision for counsel and the owner, not this document.
Until it is made, D stays a paper axis: no schema, no contract, no partner
outreach.

## Recommendation: what to pilot first

Same discipline as `roadmap.md` — metrics, not dates; mid-size studio;
one-directional gates.

1. **Now:** unchanged — T1 (engine adapters + sample project) then C0/C1, the
   character-provenance wedge and its three pilot metrics.
2. **Add cheaply during C0/C1:** the items layer per
   `rfc/RFC-009-item-issuance.md` (drafted). Because verified issuance reuses
   the NFT + verifier + settlement layers, an item pilot can ride the *same*
   studio integration as the character pilot at marginal cost — one studio,
   two provenance products, one verifier. That strengthens the C1 evidence
   base without new regulatory surface.
3. **After C1:** 3b (non-cashable arena) as written — it doubles as the
   live testbed for the verifiable-RNG work that 3d will require.
4. **Deferred until their gates exist:** 3d (licensed partner signed) and D
   (counterparty-category question answered by counsel). No engineering
   spend on either before that.

## What this document does not change

The scope boundaries in `business-model.md` ("What PoPLY never becomes") apply
to all four axes. No protocol token, no operator-of-record position, no
unlicensed IP depiction, nothing on the critical path of a game action —
regardless of which axis is being built.
