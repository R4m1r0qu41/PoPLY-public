# PoPLY: Proof-of-Play Asset Layer

Whitepaper v0.3 — 2026-10-08. Supersedes [v0.2](whitepaper-v0.2.md).
Unaudited reference implementation; not a production release or investment offering.

## Abstract

PoPLY gives game publishers a narrow ownership, provenance, licensing and
settlement layer while gameplay stays in their existing systems. A publisher
signs assertions about character progression, achievements and item events;
contracts verify its scoped authority and enforce ordering, ownership and
settlement rules. A signature proves attribution, not honest gameplay.

This revision follows the [October code review](reviews/2026-10-07/codebase-review.md)
and [upgrade roadmap](reviews/2026-10-07/upgrade-roadmap.md). It incorporates
ordered item transformations, authenticated metadata pointers, equipment
exclusivity and durable checkpoint response recovery. It distinguishes those
local capabilities from unimplemented production finality tracking, hosted
operations, wallet recovery and independent audit. The proposed first market
is one publisher, one game and one cosmetic asset class.

## 1. Motivation

A publisher database can track an asset efficiently, but outsiders usually
cannot inspect who asserted its history or how its ownership settled. PoPLY
makes selected assertions and ownership transitions inspectable without
putting combat, inventory computation, matchmaking or anti-cheat on-chain.

The useful question is whether this provenance solves a measurable publisher
problem. A second studio or universal marketplace is unnecessary to test that
question. Ownership history may survive a server shutdown; playable content,
IP permission, metadata and access do not survive automatically.

## 2. Design commitments

1. No gameplay action waits for a transaction or chain finality.
2. Gameplay, balancing, moderation and anti-cheat remain publisher authority.
3. Economic participation is optional; token ownership grants no combat power.
4. No protocol token, passive yield or promise of appreciation is required.
5. State and evidence remain off-chain, with minimal integrity commitments.
6. Cryptographic ownership does not grant intellectual-property rights.
7. An issued signature is distinct from submitted or confirmed chain state.
8. Every signed protocol message has a scoped, versioned replay boundary.

Sponsored transactions and deferred wallet exposure are intended UX options,
not implemented account-abstraction or identity-recovery products.

## 3. Architecture

**Game runtime:** executes the experience and sends server-authoritative facts.
The thin Unity, Unreal and Godot transports must never expose verifier
credentials in a player build. Godot has a runnable local integration;
Unity/Unreal target-engine builds remain unverified.

**Publisher services:** authenticate users, validate events, enforce inventory
mapping and session admission, and select a versioned progression policy.

**Verifier:** canonicalizes approved facts, derives eligibility and signs
EIP-712 envelopes. Persistent checkpoint responses allow retries and expiry
renewals. The HTTP service does not submit transactions.

**Settlement chain:** verifies scoped signers and maintains ownership,
checkpoint sequences, achievements, item lineage, licenses and settlement.
The reference operates on one EVM deployment at a time; no bridge is defined.

A production relayer must distinguish issued, submitted, included and confirmed
statements, reconcile reorgs and report lag. That service is not implemented.

## 4. Character identity

A character is `(characterContract, tokenId)`. Its NFT records game identity,
initial metadata commitment/URI, ownership and royalties, with a permanently
configured license manager. Dynamic progression belongs in publisher state
and signed checkpoints rather than the NFT itself.

Only an active **exclusive** license blocks character transfer. A non-exclusive
license represents a usage right and leaves the character tradeable. Publishers
must still enforce gameplay/session rules off-chain.

## 5. Proof-of-Play and achievements

### Canonical commitments

Object keys sort deterministically; safe integers, strings and bigints have
distinct encodings. Cycles, unsupported values, sparse arrays and non-plain
objects are rejected. The encoder bounds depth at 32 and visited values at
10,000. HTTP bodies also have a 256 KiB cap. These generic limits do not
replace publisher-specific schemas or evidence acceptance rules.

### Checkpoints

A checkpoint binds character/game identity, the next sequence, state hash,
cumulative play time, PoPL, policy hash, occurrence time and deadline.
Contracts require next-sequence ordering, non-decreasing counters/timestamps,
and per-checkpoint ceilings of 24 hours of play and 32 PoPL. The SDK mirrors
these bounds and refuses expired output before and after asynchronous signing.
Existing near-integer-limit contract behavior is not relaxed by this revision.

The verifier validates the outgoing checkpoint before committing progress.
It atomically retains progress and an outbox entry containing the original
signed response, digest and request hash. An optional idempotency key makes
an identical retry return that exact original response; changing the request
under the same key conflicts. Recovering a response does not establish that
it was accepted on-chain, and the original may already be expired.

Expiry renewal changes **only deadline**, preserving every other fact and
sequence. Both old and new signatures describe the same statement, and only
one can occupy that sequence. No timeout, rejected transaction or reorg frees
an issued sequence for different facts. Revoked authority or changed deployment
can still require operator reconciliation rather than renewal.

### Achievements

An achievement binds character/game identity, stable achievement ID, evidence
hash, occurrence time and deadline. The chain accepts each ID once per
character. Pre/post-sign expiry checks apply, but durable achievement response
recovery is not yet implemented. Evidence availability remains a publisher duty.

### Trust boundary

Verifiers are authorized per publisher/game. A compromised signer can assert
false facts within its authorized scope until revoked. Ordered acceptance
prevents rewriting already accepted checkpoint slots; it does not make the
underlying facts true or eliminate all duplicate inventory objects.

## 6. Proof-of-Play Level

PoPL is a monotonic participation/eligibility tier, not a universal skill score.
The reference policy uses play time and achievement counts. Publishers identify
other policies by commitment and must respect contract delta bounds. PoPL gates
optional character licensing/listing and must not confer purchased combat power.

## 7. Verified item issuance and lineage

The Item Registry v2 supports issuance, destruction and transformation.
Issuance commits collection/token ID, game, class, origin, owner, timestamps
and `metadataHash`, the Keccak-256 hash of the exact UTF-8 URI supplied at mint.
A relay cannot substitute a different URI while retaining a valid attestation.
This binds the pointer, not mutable content served at that pointer: use
content-addressed manifests, retrieval verification and availability monitoring
when integrity of the content matters.

Each transformation signs the next per-item sequence and expected prior class,
as well as the new class and evidence hash. The contract checks both and
consumes sequence atomically with the class change. Owner transfer does not
reset lineage. Replays, reordered messages and failed-call sequence consumption
are covered by regression tests. Destruction is terminal for that collection/ID.

Uniqueness is scoped to `(collection, tokenId)`. A publisher could issue a second
ID for the same off-chain object. Its admission/inventory service must maintain
a one-to-one mapping; PoPLY does not independently prevent every game dupe.
The reference marketplace settles characters, not a turnkey item marketplace.

## 8. Licensing and equipment

Character license offers bind mode, price, duration, deadline, permitted
licensee, exclusivity and full-terms commitment. Public offers require publisher
opt-in or a collectible price floor. Pull-payment settlement avoids dependence
on recipient callbacks; exclusive locks expire by time.

The optional item binding requires owner-of-both and a scoped verifier
attestation. Bound items cannot independently transfer or be destroyed. Active
exclusive character licensing now also blocks owner unbinding of releasable
items; non-exclusive and expired licenses allow it. This protects the live
bound equipment against stripping, not an immutable equipment snapshot:
new bindings and authorized transformations remain possible. Contractual and
game rules must define their meaning during a license.

A character sale does not atomically transfer its equipment. An orphaned binding
can be cleared permissionlessly after ownership diverges; until then the item
stays locked. Cross-game appearances require explicit IP agreements and
publisher integration, not merely a token or terms hash.

## 9. Marketplace and royalties

The reference character marketplace has fixed-price native-value settlement,
with minimum age, play time and PoPL checked at listing creation. Purchase
rechecks ownership, approval, deadline and lock status. Eligibility/publisher
policy changes are not generally revalidated at purchase; grandfathering versus
current-policy enforcement remains an explicit product decision.

PoPLY settlement allocates seller proceeds, royalties and fees to withdrawal
credits. [ERC-2981](https://eips.ethereum.org/EIPS/eip-2981) reports royalties;
it does not force all external markets or direct transfers to pay them.
Arbitrary ERC-20 payments, an item market and guaranteed liquidity are not
implemented capabilities.

## 10. Persistence, operations and migration

The file adapter supports one writer and writes the replacement before
publishing live state. A post-rename directory-sync failure is ambiguous and
forces restart. SQLite is optional: progress/outbox updates are transactional,
with revision comparisons preventing two local writers returning conflicting
statements for the same sequence. Online backup covers WAL state; copying the
main database file alone is insufficient. This is not multi-host HA.

HTTP credentials share an explicit allowed-game scope per API instance,
a process-local quota, request IDs and redacted internal errors. Controlled
API-key overlap is available programmatically. Tenant-specific credentials,
distributed quotas, structured operational logs, managed signer custody and
rotation/revocation drills still need implementation and validation.

Item EIP-712 domain version changes from 1 to 2. Non-upgradeable contracts need
a fresh deployment and coordinated SDK/ABI update; even unchanged destruction
structs use the new domain. StateRegistry/Binding domains stay version 1.
Legacy progress without deployment/game context fails closed; do not invent
lost signatures or reset sequences. See [ADR-007](adr/ADR-007-item-v2-and-checkpoint-recovery.md)
for the reference migration and recovery policy. No real deployment migration
is authorized by this paper.

## 11. Security and privacy

Local tests cover scoped authorization, message ordering, replay, metadata
substitution, failure rollback, exclusive/non-exclusive equipment behavior,
restart/backup recovery and SDK-versus-deployed-contract digests. CI is added
for local checks and integration, but a configured workflow is not evidence
that hosted CI or branch protection has run.

Independent audit, incident response, managed keys, admin controls, load tests,
chain reconciliation and availability runbooks remain release gates.

Public ownership, play time, PoPL, achievement records and wallet relationships
are observable. Hashing does not anonymize low-entropy state. Sensitive evidence
needs access control and an appropriate salted or privacy-preserving commitment
scheme. Never publish raw identities or client-held signing credentials.

## 12. Player and publisher experience

Players play normally; server validation and chain submission run asynchronously.
Economic participation is opt-in. A provenance viewer should distinguish
publisher attribution, pending statements, confirmation and evidence availability
without presenting a signature as an independent honesty verdict.

The publisher integrates its authoritative server, operates durable issuance,
enforces inventory/session rules and defines recovery, moderation and shutdown
obligations. The local Godot sample and Anvil runner are sandbox building blocks;
a hosted verifier, production wallet UX and provenance viewer are proposed work.

## 13. Economics

The Apache-2.0 protocol core remains open. Commercial hypotheses are paid
integration/support, optional managed verifier operations and negotiated fees
where a publisher chooses PoPLY settlement. SDK licensing should not be
presented as a mandatory charge for the existing open core.

Measure engineering hours, issuance/recovery failures, confirmation lag,
support burden and realized fees on eligible settlement. Predeclare any
retention analysis; test counts and token volume are not adoption evidence.
No asset carries promised yield, appreciation, liquidity or cross-IP rights.

## 14. First pilot: expedition cosmetics

Proposed original game: **Relic Harbor** (working title), a small co-op
exploration/building game with short expeditions and a shared social hub.
The first asset class is an expedition relic: a decorative cosmetic whose
publisher-attested origin and visual lineage matter, with no statistical
advantage. Build one server/engine integration and test synthetic assets first.

This takes inspiration from sandbox creativity and social games rather than
assuming permission to tokenize another platform's inventory. Minecraft's
[usage guidelines](https://www.minecraft.net/en-us/usage-guidelines) restrict
out-of-game entitlement checks affecting gameplay. Roblox's
[advertising rules](https://en.help.roblox.com/hc/en-us/articles/13722260778260-Advertising-Standards)
prohibit NFT promotion; Fortnite's [developer rules](https://legal.epicgames.com/fortnite/developer-rules?lang=en-US)
restrict external links and off-Fortnite calls to action, and exclude blockchain
products from Sponsored Row content. These are
reasons to prefer a publisher-controlled original game for this pilot, not a
claim that every possible integration is prohibited. See the
[pilot brief](game-pilot-relic-harbor.md) for alternatives and scope.

## 15. Extensions

AI behavior and phygital verification remain separate product extensions.
Token ownership grants no rights in voices, models, training data or physical
property by itself. Wagering, prediction markets, cashable randomness and
cross-chain bridges are outside this pilot.

## 16. Roadmap and release gates

1. **Local hardening:** R1–R5 regression fixes, durable checkpoint response
   recovery, documented migration and reproducible local checks.
2. **Publisher sandbox:** choose one engine and asset mapping; exercise restart,
   expiry, backup, admission and evidence retrieval with synthetic assets.
3. **Operational completion:** relayer/confirmation/reorg tracking, managed keys,
   distributed authorization/quotas, bounded outbox retention, monitoring and
   content availability; compile partner engine packages.
4. **Real-asset release:** external audit, publisher threat model, scoped legal
   review, wallet/settlement decisions and explicit operator authorization.
5. **Expansion:** a second studio after repeatable integration and measured
   benefit; cross-IP only with actual rights agreements.

The companion [implementation report](reviews/2026-10-07/implementation-follow-up.md)
and STATUS.md distinguish completed local work from remaining roadmap gates.

## 17. Change record from v0.2

This revision adds item v2 ordering/URI authority, live equipment exclusivity,
durable exact-response checkpoint recovery and deadline-only renewal. It
corrects broader claims about honest gameplay, universal anti-dupe guarantees,
royalty enforcement, privacy, engine verification and post-sunset usability.
It introduces a measured single-game cosmetic pilot and treats production
operations, wallets, hosted services and independent audit as future gates.
