# PoPLY — Proof-of-Play Asset Layer

PoPLY is publisher-oriented infrastructure for persistent, verifiable, and
licensable game assets. It provides protocol definitions, smart contracts,
services, and SDKs that studios can integrate without moving gameplay on-chain.

This repository contains a runnable MVP reference implementation. It is not
audited or approved for production deployment.

## Documentation map

- [`docs/whitepaper-v0.3.md`](docs/whitepaper-v0.3.md) — the protocol model:
  architecture, Proof-of-Play/Proof-of-Achievement, licensing, marketplace,
  security and privacy model.
- [`docs/business-model.md`](docs/business-model.md) — the staged commercial
  model: the single-studio wedge, the studio-cohort standard, and the
  compliance-walled tiers (seasonal guests, arena, wagering).
- [`docs/roadmap.md`](docs/roadmap.md) — parallel technical (T) and
  commercial (C) tracks with one-directional gates between them.
- [`docs/product-directions.md`](docs/product-directions.md) — how the four
  product axes (character provenance, item anti-duplication, chance-weighted
  arena, spectator prediction markets) share infrastructure, stage against
  the business model, and where the open design/regulatory questions are.
- [`SECURITY.md`](SECURITY.md) — read before operating or extending any
  contract or signing service.

- [`docs/game-pilot-relic-harbor.md`](docs/game-pilot-relic-harbor.md) — proposed
  original co-op exploration game and expedition-cosmetic asset class.

## Product directions

The character-provenance system documented in the whitepaper is the anchor
product and the reference implementation in this repo. Three further axes
share its infrastructure (asset identity, publisher-signed commitments,
publisher-scoped verifier trust, settlement rails) and unlock behind the
staged gates in `docs/business-model.md`:

- **Item provenance / anti-duplication** — high-value in-game items with
  verified issuance, closing dupe fraud; same compliance profile as the
  character wedge.
- **Arena** — a chance-weighted contest where verified progression grants
  more dice but randomness lets underdogs upset; non-cashable first, wagering
  only ever behind a licensed-operator wall.
- **Spectator prediction markets** — deferred until its regulatory
  counterparty category is resolved.

See `docs/product-directions.md` for the full reconciliation.

## Run it

Prerequisites: Node.js 22.18 or later and Foundry (`forge`, `anvil`, and
`cast` — install via [foundryup](https://getfoundry.sh) and ensure they are on
your `PATH`; the SDK-only Node tests run without them, but `npm run check` and
`npm run e2e:local` need the full toolchain).

```bash
npm install
npm run check
npm run e2e:local
```

Run the off-chain reference arena at the URL printed by Vite:

```bash
npm run dev:arena
```

Run the publisher verifier API after copying `.env.example` and providing a
local State Registry address, verifier key, and publisher API key:

```bash
node --env-file=.env backend/src/server.ts
```

The `e2e:local` command starts an isolated Anvil chain, deploys the contract
suite, registers a verifier, mints a character, submits signed PoP and PoA data,
activates and expires a license, and completes a marketplace purchase.

## Implemented MVP components

- ERC-721 character ownership with immutable game and metadata commitments;
- ERC-2981 creator royalties and fixed-price marketplace settlement;
- verifier registration and revocation;
- EIP-712 PoP checkpoints and PoA attestations;
- monotonic checkpoint sequence, play time, PoPL, and event time;
- deterministic SDK state canonicalization and signing;
- reference PoPL policy and on-chain licensing eligibility gate;
- exclusive time-bounded licensing locks with pull-payment settlement;
- authenticated publisher verifier HTTP API;
- atomic verifier restart state and per-character issuance serialization;
- Verified-Issuance item layer (RFC-009): ERC-721 item collection where
  uniqueness is the anti-duplication guarantee, with verifier-signed
  issuance, terminal destruction, and transformation attestations;
- optional character–item interlock: verifier-attested binding that stops a
  bound item from transferring separately from its character;
- source-level Unity and Unreal dedicated-server transports;
- Godot transport with a runnable headless sample integration
  (`npm run e2e:godot`);
- responsive Phaser reference arena with rules isolated from rendering; and
- contract, SDK, API, simulation, and local-chain lifecycle tests.

## Product boundary

PoPLY owns:

- character ownership and provenance;
- signed Proof-of-Play (PoP) checkpoints;
- permanent Proof-of-Achievement (PoA) attestations;
- Proof-of-Play Level (PoPL) eligibility;
- character licensing and exclusive-use locks;
- marketplace settlement interfaces; and
- publisher-facing APIs and SDKs.

Publishers continue to own gameplay, progression, matchmaking, anti-cheat, and
all real-time decisions. Gameplay state remains off-chain. PoPLY commits only
the minimum hashes and settlement state needed for durable verification.

PoPLY does not introduce a protocol token, passive yield, pay-to-win mechanics,
or unlicensed cross-IP portability.

## Architecture

| Layer | Responsibility |
| --- | --- |
| Game engines | Unity, Unreal, Godot, and proprietary clients |
| Publisher services | Gameplay, progression, matchmaking, and anti-cheat |
| PoPLY services | Verification, metadata, licensing, APIs, and marketplace integration |
| Blockchain | Ownership, checkpoint commitments, locks, and settlement |

The integration path is asynchronous: publishers sign authoritative state,
PoPLY validates and records a durable commitment, and games remain operational
without waiting for chain finality.

Chain portability is a config value, not a redeploy of integrations: every
signed message is domain-separated by EIP-712, and the SDK constructs the
domain from `(chainId, registryAddress)` (`stateRegistryDomain`,
`itemRegistryDomain`, `bindingDomain`). Pointing a publisher verifier at a
different network means changing `POPLY_CHAIN_ID` and the registry address —
the type definitions are guarded byte-for-byte against the Solidity typehashes
by the SDK's digest-drift tests.

## Core model

### Character NFT (CNFT)

A persistent identity and ownership record. Mutable gameplay data is represented
by versioned metadata and checkpoint hashes rather than being stored directly
on-chain.

### Proof-of-Achievement (PoA)

A publisher-signed, non-duplicable attestation for a meaningful milestone. Its
schema must identify the character, achievement definition, issuer, game,
timestamp, and evidence commitment.

### Proof-of-Play (PoP)

A periodic, publisher-signed checkpoint over canonical character progression.
The checkpoint format must be deterministic and replay-resistant.

### Proof-of-Play Level (PoPL)

A derived eligibility tier based on verified play and achievements. PoPL grants
access to licensing or marketplace tiers; ownership by itself never produces
revenue.

### Licensing lock

A character under an active license cannot transfer or accept another license.
Locks expire automatically by time and may be explicitly settled afterward.
Publishers must query the lock at game-session admission to enforce the matching
off-chain gameplay restriction.

## MVP

The first release targets one arena demo and one EVM-compatible chain. A usable
MVP must demonstrate this complete lifecycle:

1. A publisher registers as an authorized verifier.
2. A player receives a character without needing to understand wallets or gas.
3. The arena emits signed PoP checkpoints and PoA attestations.
4. Verified activity updates the character's PoPL eligibility.
5. The owner lists or licenses an eligible character.
6. Licensing locks the character against concurrent play.
7. Expiry or settlement releases the lock predictably.
8. Provenance remains independently inspectable.

No gameplay action may block on a blockchain transaction.

## Repository layout

```text
PoPLY/
├── docs/             # ADRs, RFCs, and OpenAPI specification
├── contracts/        # Solidity interfaces and implementations
├── sdk/              # Engine-neutral TypeScript protocol SDK
├── backend/          # Publisher verifier API
├── reference-game/   # Off-chain Phaser arena integration
├── schemas/          # Versioned metadata and marketplace schemas
└── scripts/          # Reproducible local-chain lifecycle
```

## Delivery sequence

### Phase 1 — protocol definition

- RFC-001: core protocol and terminology
- ADR-001: hybrid architecture and trust boundaries
- ADR-002: checkpoint canonicalization and signing model
- character metadata JSON Schema
- PoP and PoA envelope schemas
- licensing state machine and invariants
- Solidity interfaces only

Exit criterion: two independent implementations can produce and validate the
same signed checkpoint fixtures.

### Phase 2 — reference implementation

- local-chain contract implementation;
- verifier and metadata services;
- engine-neutral TypeScript SDK;
- deterministic test fixtures;
- minimal arena lifecycle demo; and
- end-to-end tests for mint, checkpoint, achievement, licensing lock, expiry,
  and transfer restrictions.

Exit criterion: the full MVP lifecycle runs locally and failure recovery is
covered by automated tests.

### Phase 3 — publisher SDK

- Unity, Unreal, and Godot adapters;
- custodial and external-wallet identity adapters;
- observability and integration diagnostics;
- versioned API compatibility policy; and
- integration documentation and sample projects.

Exit criterion: a studio can integrate a sample game without contract knowledge.

## Decisions required before production

The reference implementation makes reversible local-MVP choices. Production
deployment still requires explicit RFCs or ADRs for:

- target chain and account-abstraction strategy;
- publisher verifier registration and revocation authority;
- identity recovery and custodial-to-self-custody migration;
- PoPL calculation, versioning, and dispute handling;
- licensing exclusivity enforcement at the publisher boundary;
- transfer behavior during active licenses;
- metadata availability guarantees; and
- upgrade, pause, and emergency recovery authority.

## Engineering principles

- Gameplay performance takes precedence over chain interaction.
- Web3 participation is optional and invisible by default.
- Protocol, publisher business logic, and game logic remain separate.
- On-chain storage is limited to durable ownership, commitments, locks, and
  settlement.
- Every signed payload is domain-separated, versioned, and replay-resistant.
- SDK APIs are modular and engine adapters are thin.
- Security properties are expressed as executable invariants where possible.
- Blockchain functionality must provide measurable player or publisher value.

## Source specification

This bootstrap is derived from the PoPLY v1.0 design specification dated
2026-07-03 (maintained privately); `docs/whitepaper-v0.2.md` supersedes it as
the public protocol description.

## License and security

Source code is available under the Apache License 2.0 (see `LICENSE`). The
implementation is unaudited;
read `SECURITY.md` before operating or extending any contract or signing service.
