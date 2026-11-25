# RFC-009: Item issuance and anti-duplication layer

- Status: Implemented for MVP (`ItemNFT.sol`, `ItemRegistry.sol`), including the
  character–item interlock as an optional layer (`CharacterItemBinding.sol`,
  opt-out via `NullItemLock`)
- Version: 0.3.0

## Objective

Give high-value in-game items durable, independently verifiable provenance so
each collection/token ID has independently inspectable issuance and lineage, reusing PoPLY's existing
identity, verifier, and settlement layers — without forcing item events
through the character checkpoint model they do not fit.

## The dual-concept split

PoPLY now carries two distinct proof concepts on one substrate:

| Concept | Asset | Proof shape | Registry |
| --- | --- | --- | --- |
| **Proof-of-Play** | Character | Periodic, sequence-ordered checkpoints over cumulative progression (monotonic, plausibility-capped) | `StateRegistry` |
| **Verified Issuance** | Item | Point-in-time attestations at supply-changing events only: issuance, destruction, transformation | `ItemRegistry` (new) |

Character progression is low-frequency, cumulative, and per-character; the
checkpoint sequence model expresses it exactly. Item integrity is a *supply*
invariant — "exactly one of item X exists" — which no per-character sequence
can express. Forcing item events through checkpoints would either flood the
registry with high-frequency commitments or leave supply unverified between
snapshots. The layers therefore diverge above the shared substrate.

## What is shared (unchanged)

- **Verifier trust scoping** — an item attestation is signed by a registered
  verifier valid only for its own publisher's games
  (`VerifierRegistry.isVerifierForGame`). No new trust root.
- **EIP-712 domain separation, canonical state encoding, signature rules** —
  the same `SignatureChecker`, canonicalization, and replay boundaries.
- **Settlement rails** — `CreditEscrow` pull payments, ERC-2981 royalties,
  and marketplace patterns apply to items as to characters.
- **The product boundary** — no gameplay action blocks on a transaction; the
  publisher stays authoritative for drop rates, trade rules, and anti-cheat.

## Item identity

Each protocol-tracked item is an ERC-721 token: `(itemContract, tokenId)` with
an immutable game ID, an item-class identifier (the publisher's stable item
definition, e.g. `sword-of-ages-v2`), an issuance attestation digest, and a
`mintedAt` timestamp. **ERC-721 uniqueness is the anti-dupe guarantee**: the
publisher's verifier signs an issuance attestation exactly once per item
instance, minting is gated on that signature, and any in-game copy without a
corresponding token is detectable as counterfeit by anyone who can read the
chain.

Only the high-value tier is tracked. Commodity/stackable items stay entirely
off-chain in publisher inventory; a fungible-tier design (ERC-1155 with signed
supply attestations) is explicitly out of scope for v0.1 of this layer.

## Attestation types

An `ItemRegistry` accepts three verifier-signed messages, each bound to
`(itemContract, tokenId, gameId)` with occurrence time and expiry, mirroring
the achievement envelope:

1. **Issuance** — created once per token, before or at mint; carries the item
   class, an origin commitment (how it entered the world: drop, craft, reward),
   and is non-repeatable per token, like an achievement ID per character.
2. **Destruction** — the item left the game world (consumed, burned,
   dismantled). Burns the token or marks it terminally inactive; a destroyed
   item can never be re-attested.
3. **Transformation** — the item changed class (upgraded, reforged). Commits
   the predecessor and successor classes so lineage stays inspectable.

Ownership transfer needs no attestation — it is native ERC-721 transfer,
subject to the same marketplace/settlement rules as characters.

## Character–item interlock (optional extension — implemented)

A character NFT and an item NFT may reference each other — "this sword is
bound to this character" — for soulbound-style equipment, provenance premiums
("the actual sword used in the championship"), or licensing a character
*with* its iconic gear.

Implemented in `CharacterItemBinding.sol` as a strictly additive layer —
neither the StateRegistry nor the ItemRegistry knows it exists, and a
deployment opts out by pointing `ItemNFT`'s immutable binding manager at
`NullItemLock`:

- A `Binding` records the character, the owner of the pair at bind time, a
  `releasable` flag, and the bind timestamp. Binding requires the caller to
  own both tokens in the same game **and** a verifier-signed attestation
  (EIP-712 domain `PoPLY Character Item Binding`) — binding is a game action,
  so the game decides whether the pairing is legal.
- While bound, the item cannot transfer separately and cannot be destroyed
  out from under the binding (`ItemNFT` consults `isItemLocked`). The
  exclusive-license inheritance is implicit: the character cannot transfer
  under an exclusive lock and the item cannot transfer while bound to it.
- A `releasable` binding is released by the pair's owner with no signature;
  a non-releasable (soulbound) binding is permanent for the item's lifetime
  in v0.1.
- Binding attestations are **consumed on use** (`usedBindingDigests`):
  re-binding after an unbind always requires a fresh verifier signature,
  even inside the original attestation's deadline window — binding is a
  game-approved action, so approval cannot be replayed.
- The "does a bound pair transfer atomically" question is answered: it does
  not — a character sale severs the binding. Anyone may call
  `settleOrphanedBinding` once the character has left the bound owner, so a
  stale binding can never lock an item to a character its owner lost.
- **Severance is evaluated lazily, by design.** The binding registry installs
  no transfer hook on the character contract — a character sold on *any*
  venue, including external marketplaces (OpenSea, Blur), becomes severable
  the moment ownership diverges from the recorded `boundOwner`, and the next
  `settleOrphanedBinding` call (permissionless, ~35k gas) clears it. Between
  the sale and that call the item remains locked; this window is the accepted
  cost of staying decoupled from every marketplace implementation and of
  keeping `CharacterNFT` entirely unaware of the interlock. Publishers that
  want eager clearing can submit the settlement transaction from their own
  indexer when they observe the transfer event.

Still open: how binding should interact with future item-marketplace
eligibility bars, and whether soulbound bindings need a publisher-gated
release path.

## Invariants

- An item token exists iff exactly one verifier-signed issuance attestation
  was accepted for it.
- Issuance is non-repeatable per token; destruction is terminal.
- Only verifiers scoped to the item's game may attest.
- No attestation sits on the critical path of a game action — dropping,
  trading, or consuming an item in-game never waits for the chain; the
  publisher relays attestations asynchronously, exactly like checkpoints.

## Commercial placement

Per `docs/product-directions.md`: same compliance profile as the character
wedge (no wagering, no cross-IP, single publisher), so an item pilot can ride
the same studio integration as the Stage 0/1 character pilot at marginal
cost — one studio, two provenance products, one verifier. The pitch is
"verified issuance," not "proof-of-play."

## October 2026 message upgrade

[ADR-007](../adr/ADR-007-item-v2-and-checkpoint-recovery.md) defines Item Registry
EIP-712 domain version 2, URI commitments, next-sequence/prior-class checks,
and migration. Active exclusive licenses prohibit releasable owner unbinding;
non-exclusive/expired licenses permit it. Transfer does not reset item sequence.
URI authentication does not guarantee content immutability or availability.
Token uniqueness does not prevent a publisher minting another ID for the same
off-chain object: inventory admission must enforce one-to-one mapping.
