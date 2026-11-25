# PoPLY: Proof-of-Play Asset Layer

Whitepaper v0.2 — 2026-07-15 (supersedes v0.1, 2026-07-04)

*Changelog v0.1 → v0.2: aligns the licensing, checkpoint, marketplace, and
security-model sections with the reference implementation's security-hardening
pass. Material corrections — exclusive vs. non-exclusive licensing is now
distinguished throughout (only an exclusive license locks the character);
checkpoint values are plausibility-capped, not merely monotonic; verifier trust
is scoped to each verifier's own publisher games; marketplace listing carries an
on-chain eligibility bar; public license offers require publisher opt-in or a
collectible-tier price; and canonical state encodes distinct types distinctly to
prevent commitment collisions.*

## Abstract

PoPLY is publisher-oriented infrastructure for persistent game characters and
assets. It separates the fast, private, mutable requirements of gameplay from
the durable, independently inspectable requirements of ownership, provenance,
licensing, and settlement.

Publishers remain authoritative for gameplay, progression, anti-cheat, and game
balance. They sign compact Proof-of-Play checkpoints and
Proof-of-Achievement attestations. PoPLY verifies those messages and records
only commitments, ownership, eligibility, active licensing locks, and
settlement state on-chain. Participation is optional, no protocol token is
required, and ownership alone does not create passive income.

This paper describes the protocol model implemented by the PoPLY v0.1 reference
system. It is an engineering design, not an investment offering or a promise of
interoperability across intellectual property.

## 1. Motivation

Games already sustain durable identities, progression, cosmetics, achievements,
competitive histories, creator economies, and secondary markets. Those systems
usually remain bounded by one publisher database. Players cannot independently
verify a character's provenance, studios cannot license a character through a
shared settlement rail, and history may disappear when services close.

Putting gameplay on a blockchain does not solve those problems efficiently.
Real-time games need low latency, private state, reversibility, anti-cheat, and
frequent balance changes. A public consensus system is a poor execution engine
for those requirements.

PoPLY therefore targets the smaller set of facts that benefit from durable
consensus:

- who owns a character;
- which publisher attested to a milestone or progression checkpoint;
- whether accepted history was replaced or skipped;
- whether the character is temporarily committed to an exclusive license;
- how a sale or license settled; and
- which immutable terms and metadata were referenced at that time.

## 2. Design commitments

1. **Gameplay first.** No gameplay action waits for chain finality.
2. **Invisible Web3.** Publishers may sponsor transactions and defer wallet
   exposure until a player elects to transfer, sell, or license.
3. **Optional participation.** A game remains playable without trading or
   licensing.
4. **Publisher authority.** Studios control game rules, anti-cheat, progression,
   and admission.
5. **Ownership is not gameplay authority.** Owning a token does not force a
   publisher to make an asset competitive, compatible, or available in every
   mode.
6. **No pay-to-win.** PoPLY eligibility represents verified participation, not
   combat power purchased through the protocol.
7. **No passive yield.** Licensing requires eligible history and an explicit
   temporary commitment of the character.
8. **Minimum on-chain state.** Detailed gameplay, personal information, prompts,
   evidence, and media remain off-chain behind integrity commitments.

## 3. System architecture

PoPLY uses four layers.

### Layer 0: game engines

Unity, Unreal, Godot, proprietary engines, and web runtimes execute the player
experience. Engine adapters emit publisher-defined game facts; they do not hold
protocol signing keys in client builds.

### Layer 1: publisher services

Publisher systems own authentication, matchmaking, progression, anti-cheat,
moderation, and game-session admission. They decide whether an event is valid
and map it to a versioned PoPLY state policy.

### Layer 2: PoPLY services

The publisher verifier canonicalizes state, calculates Proof-of-Play Level,
creates EIP-712 messages, and signs them with a registered verifier. Relayers,
metadata services, indexing, marketplace presentation, and analytics live here.

### Layer 3: settlement chain

Contracts store character ownership, verifier authorization, checkpoint and
achievement commitments, licensing locks, and marketplace settlement. The v0.1
reference targets one EVM chain at a time and does not define a bridge.

## 4. Character identity

A PoPLY character is identified by `(characterContract, tokenId)`. Its Character
NFT records:

- an immutable game identifier;
- an initial metadata commitment and URI;
- owner and transfer approvals;
- creator royalty configuration; and
- a permanently configured licensing-lock authority.

Dynamic game state is not stored in the NFT. Metadata is versioned externally,
and significant progression is committed through Proof-of-Play.

Transfer is prohibited while an *exclusive* license is active. A non-exclusive
license is a usage right that leaves the character tradeable. Blocking transfer
under an exclusive lock makes the licensed party's time-bounded exclusive right
legible and prevents a sale from silently invalidating it.

## 5. Proof-of-Play and Proof-of-Achievement

### 5.1 Canonical state

Publisher state is encoded deterministically before hashing. Object keys sort
lexicographically, integers have bounded representations, values of distinct
types are encoded distinctly — a bigint and its equivalent numeric string do not
produce the same commitment — and unsafe or cyclic values are rejected. The full
snapshot stays off-chain; its Keccak-256 commitment enters the signed message.

### 5.2 Checkpoints

A Proof-of-Play checkpoint binds:

- character contract and token ID;
- game ID;
- per-character sequence;
- state commitment;
- cumulative verified play time;
- Proof-of-Play Level;
- policy ID;
- occurrence time; and
- signature expiry.

The State Registry accepts only the next sequence. Play time, PoPL, and event
time cannot decrease, and each is additionally bounded by a per-checkpoint
plausibility ceiling (reference values: 24 hours of play time, 32 PoPL) so that a
single implausible value cannot permanently freeze a character's chain.
Occurrence time is validated as non-future and monotonic before local sequence
state advances, so that a rejected checkpoint cannot desynchronize a character.
EIP-712 domain separation prevents a signature from being replayed on a different
chain or registry deployment.

### 5.3 Achievements

A Proof-of-Achievement binds the same character and game identity to a stable
achievement ID, evidence commitment, occurrence time, and expiry. Each
achievement ID may be recorded once per character. Evidence may remain in a
publisher audit system or content-addressed store according to privacy policy.

### 5.4 Publisher trust

PoPLY proves which registered verifier signed a game fact and that accepted
history was not silently rewritten. It does not prove that the publisher's game
server was honest. A registered verifier is authorized only for the games owned
by its own publisher, so a compromised verifier cannot forge state for another
publisher's games. A compromised verifier can create false attestations for its
own publisher's games until revoked, but cannot directly transfer a player's
character.

## 6. Proof-of-Play Level

PoPL is an eligibility tier derived from publisher-verified participation. The
reference policy uses cumulative play time and achievement counts; publishers
may define other monotonic policies and identify them by content hash.

PoPL is not a universal skill score and must not directly increase in-game
power. Its protocol purpose is to gate optional economic actions such as
licensing or marketplace premium tiers. The reference Licensing contract
rejects a character below the configured minimum, so ownership alone cannot
create licensing revenue.

## 7. Licensing

An eligible owner may offer a character under one of six modes: NPC,
tournament, seasonal boss, story campaign, promotional appearance, or AI agent.
Exclusivity is orthogonal to mode: an offer carries an explicit `exclusive`
flag, and binds price, permitted licensee, duration, deadline, mode, and a hash
of the complete legal and operational terms.

Acceptance of an *exclusive* offer immediately creates a lock: the character
cannot transfer or accept another license until expiry. A non-exclusive license
is a usage right that does not lock the character, which remains tradeable. A
public offer — one with no named licensee — is acceptable only if the owning
publisher has enabled open licensing or the price clears a collectible-tier
threshold; this closes a griefing vector in which an unsolicited public offer
could otherwise immobilize a character. Settlement credits the licensor and
protocol through pull payments, preventing a recipient callback from blocking
the transaction. An exclusive lock expires by time even if no party sends a
cleanup transaction.

The chain cannot stop an uncooperative game server from using a licensed
character. Publishers must enforce lock status during session admission and
contractually bind licensees to the terms commitment.

## 8. Marketplace and royalties

The reference marketplace provides fixed-price, non-custodial listings. Creating
a listing requires the character to clear on-chain eligibility bars read from the
State Registry and Character NFT — minimum age, cumulative play time, and
Proof-of-Play Level (reference values: 30 days, 30 hours, level 3) — so that only
genuinely-played characters are listable; this also incidentally starves the
"list a spoofed ERC-721" scam, since a fabricated contract has no registry
history. A listing does not lock the character and becomes invalid if ownership
changes. A purchase rechecks ownership, approval, deadline, and license status,
then transfers the character and allocates seller proceeds, ERC-2981 royalty, and
protocol fee to withdrawal balances.

This contract is a reference settlement path rather than a claim that every
publisher should operate a marketplace. PoPLY interfaces may be integrated into
external markets subject to equivalent lock and settlement checks.

## 9. Player and publisher experience

The intended player flow is:

1. create or receive a game account;
2. receive a character through a sponsored mint;
3. play normally without chain interaction;
4. let the publisher batch and relay accepted proofs;
5. optionally claim wallet control when using ownership features; and
6. explicitly list or license an eligible character.

The intended publisher flow is:

1. integrate a thin engine adapter;
2. validate game events in existing authoritative infrastructure;
3. operate a managed verifier key and durable sequence store;
4. relay proofs asynchronously;
5. enforce chain locks at game admission; and
6. expose marketplace and licensing controls through the publisher experience.

## 10. Security model

The reference implementation defends the following invariants:

- only an authorized minter creates characters;
- only active verifier signatures — scoped to the signing verifier's own
  publisher games — create accepted PoP or PoA state;
- checkpoint history cannot skip, repeat, or regress, and no single checkpoint
  can advance play time or PoPL past its plausibility ceiling;
- achievements cannot duplicate per character;
- only eligible owners create license offers, and public offers require publisher
  opt-in or a collectible-tier price;
- at most one active *exclusive* license exists per character;
- an active *exclusive* license blocks every character transfer (a non-exclusive
  license does not);
- marketplace listing requires on-chain age, play-time, and level eligibility;
- marketplace settlement cannot bypass an exclusive lock;
- stale listings fail after ownership changes; and
- external payment recipients cannot reenter settlement.

Production deployments additionally require managed signing keys, multisig and
timelocked administration, external contract audit, monitoring, rate limits,
incident response, chain reorganization policy, metadata availability, and
tested recovery procedures.

## 11. Privacy and data minimization

Public addresses, ownership history, and marketplace events may be linkable to a
person. PoPLY therefore stores no player names, emails, precise location,
behavior profiles, detailed evidence, AI prompts, or NFC scan histories on-chain.
Publishers should use scoped identifiers and retain off-chain evidence only as
long as necessary.

Hashing does not automatically anonymize personal data. If a commitment can be
matched against a small or known input set, it may still reveal information.
Sensitive inputs require high-entropy salts, access controls, or a different
proof design.

## 12. AI and phygital extensions

AI behavior executes off-chain under publisher control. A behavior manifest may
bind an active AI-mode license to declared capabilities and a safety policy, but
ownership does not confer rights in models, prompts, voices, or training data.

Phygital assets use secure-element challenge-response and issuer attestations.
Static NFC identifiers are not sufficient for valuable claims. Physical
possession, digital ownership, entitlement, loss, resale, and revocation remain
separate states that product terms must define.

## 13. Economics

PoPLY does not require a protocol token. Potential protocol revenue consists of
SDK licensing, publisher integration, enterprise support, and disclosed
marketplace or licensing fees. Publishers may use premium drops, tournaments,
and licensed appearances. Players may opt into resale or licensing where local
law and publisher policy permit.

Scarcity, provenance, competitive history, creator association, and narrative
significance may affect market value. PoPLY does not guarantee liquidity,
appreciation, compatibility, or revenue.

## 14. Governance and upgrades

The reference contracts are non-upgradeable and administrated by one local
account for reproducibility. A production deployment should separate verifier,
minter, fee, pause, and upgrade authority; place sensitive actions behind a
multisig and delay; publish changes; and preserve an exit path for owners.

Cross-chain operation is deferred. Canonical ownership, replay boundaries,
bridge risk, and conflicting licenses must be resolved before any multi-chain
deployment.

## 15. Reference implementation

The repository includes Solidity contracts, a TypeScript SDK, an authenticated
publisher verifier API with durable local state, Unity/Unreal/Godot transport
adapters (Godot with a runnable headless sample integration), JSON schemas, a
Phaser arena, and a local Anvil lifecycle. Since v0.2 the implementation also
carries the RFC-009 Verified-Issuance item layer — per-item ERC-721 uniqueness
as the anti-duplication guarantee, with verifier-signed issuance, terminal
destruction, and transformation attestations — and an optional
character–item interlock that binds an item to a character so it cannot
transfer separately. Automated
tests exercise signatures, regressions, revocation, eligibility, locks,
royalties, marketplace transfer, API authentication, restart state, concurrency,
and arena-to-proof integration.

The implementation is intentionally an auditable MVP, not production software.

## 16. Roadmap

1. **Protocol specification:** complete threat model, remaining RFCs, and legal
   classification per launch market.
2. **Reference hardening:** the invariant-level security pass is complete in the
   reference system; what remains is independent external audit, a persistent
   database adapter replacing the file store, chain indexing, observability, and
   operational runbooks.
3. **Publisher SDK:** compile and test target-engine packages, identity recovery,
   sponsored account abstraction, and sample integrations.
4. **Indie pilot:** integrate one live game with controlled marketplace and
   licensing cohorts.
5. **Publisher expansion:** prove integration cost, player safety, and commercial
   value before broader outreach.

## 17. Conclusion

Persistent game assets do not require persistent on-chain gameplay. They require
a narrow, credible boundary between publisher-authoritative facts and durable
ownership and settlement. PoPLY implements that boundary through signed proofs,
minimal commitments, explicit eligibility, and exclusive licensing locks while
keeping the game itself where it belongs: off-chain.
