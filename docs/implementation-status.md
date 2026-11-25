# Implementation status against Design Specification v1.0

Status date: 2026-07-04

## MVP requirements

| Requirement | Status | Evidence |
| --- | --- | --- |
| Arena demo | Implemented | `reference-game/`; production Vite build and reference-flow test |
| Character NFT | Implemented | `CharacterNFT.sol`; ownership and transfer tests |
| Proof-of-Achievement | Implemented | `StateRegistry.sol`; signed, duplicate, and revocation tests |
| Proof-of-Play | Implemented | `StateRegistry.sol`; sequence, regression, and signature tests |
| Proof-of-Play Level | Implemented | SDK policy plus State Registry state and licensing gate |
| Marketplace | Implemented | Fixed-price ETH settlement, ERC-2981 royalty, pull payments |
| Licensing lock | Implemented | Eligibility, exclusivity, transfer lock, automatic expiry |
| No protocol token | Satisfied | No token contract or token-denominated protocol path |
| Single chain | Satisfied for MVP | One local EVM deployment exercised on Anvil |

## Design principles

| Principle | Evidence |
| --- | --- |
| Gameplay first | Arena simulation and rules are independent from chain clients; no gameplay call waits for a transaction |
| Invisible Web3 | Arena emits publisher proof candidates without wallet UI or player gas |
| Optional participation | Core arena runs without marketplace, license, or wallet interaction |
| Publisher gameplay authority | Verifier signs publisher facts; protocol does not calculate combat or progression |
| Ownership separated from gameplay | Character NFT owns identity/transfer; publisher owns admission and balance |
| No pay-to-win | PoPL gates optional licensing and does not modify combat state |
| Usage-based monetization | Licensing requires verified PoPL and an exclusive character lock |
| Off-chain execution, on-chain verification | State is canonicalized and hashed; contracts store commitments and settlement only |

## Architecture and named components

| Named component | Status | Evidence |
| --- | --- | --- |
| Game-engine layer | Implemented reference | Phaser arena plus Unity, Unreal, and Godot transports |
| Publisher-service layer | Implemented reference | Authenticated verifier API, state persistence, PoPL policy |
| PoPLY-service layer | Implemented reference | SDK modules, schemas, signing, metadata commitments |
| Blockchain layer | Implemented reference | Ownership, proofs, eligibility, locks, royalties, settlement |
| Character NFT | Implemented | `CharacterNFT.sol` |
| State Registry | Implemented | `StateRegistry.sol` |
| Verifier Registry | Implemented | `VerifierRegistry.sol` |
| Licensing Contract | Implemented | `Licensing.sol` |
| Marketplace Interface/contract | Implemented | `IMarketplace` and `Marketplace.sol` |
| Royalty Contract | Implemented | Immutable `RoyaltyRegistry.sol`, delegated through ERC-2981 |
| Governance | Deferred as specified | Future roadmap; no governance token introduced |

## In-scope capabilities

| Capability | Status | Notes |
| --- | --- | --- |
| Character ownership | Implemented | ERC-721-compatible collection |
| Achievement verification | Implemented | Active publisher verifier signatures |
| Proof-of-Play | Implemented | EIP-712 checkpoint commitments |
| Licensing | Implemented | Six modes and terms commitment |
| Secondary markets | Implemented | Fixed-price reference market |
| Publisher SDK | Partial | Tested TypeScript core plus source-level Unity, Unreal, and Godot transports; target-engine compilation remains Phase 3 |
| APIs | Implemented for reference | Authenticated endpoints, atomic local persistence, and per-character issuance serialization; transactional database and chain reconciliation remain production work |
| Smart contracts | Implemented for reference | Not audited or production-hardened |
| Provenance | Implemented | Immutable events and checkpoint/achievement digests |
| Phygital integrations | Specified | RFC-008 and binding schema; secure-element product integration remains future work |
| AI-ready asset model | Specified | AI licensing mode, RFC-007, and behavior profile schema; runtime remains publisher-owned future work |

## Immediate deliverables

| Deliverable | Status |
| --- | --- |
| Whitepaper v0.1 | Implemented in `docs/whitepaper-v0.1.md` |
| Solidity interface definitions | Implemented in `contracts/src/interfaces/IPoPLY.sol` |
| SDK specification | Implemented in `docs/sdk-specification.md` |
| API specification | Implemented in `docs/openapi.yaml` |
| Marketplace schema | Implemented in `schemas/marketplace-listing.schema.json` |
| Character metadata schema | Implemented in `schemas/character-metadata.schema.json` |
| Legal architecture memorandum | Implemented as an issue map in `legal/legal-architecture-memorandum-v0.1.md`; launch counsel still required |
| Publisher pitch deck | Implemented as a 12-slide editable [Figma Slides deck](https://www.figma.com/slides/toLrixz7c7vft0QaZB5k2X) |
| Reference implementation | Implemented and exercised by `npm run e2e:local` |

## Verification evidence

- `npm run check`: contract formatting/build, TypeScript type check, production
  arena build, 10 Solidity tests, and 15 SDK/API/schema/integration tests.
- `npm run e2e:local`: six-contract deployment and the full mint, attestation,
  licensing, expiry, marketplace, and ownership lifecycle on an isolated chain.
- Live HTTP checks confirmed the arena entry document and TypeScript module are
  served. Visual browser playtesting remains unverified because the in-app
  browser was unavailable in the implementation environment.

## Production gates

The MVP is not production-ready until at least a third-party contract audit,
publisher-specific threat-model review, production-grade verifier database/reconciliation, managed signing keys, multisig/timelock
administration, incident response, metadata availability policy, chain choice,
load testing, legal review, and engine pilot are complete.

These production gates and roadmap phases are not reclassified as completed by
the passing reference tests. An indie pilot, AAA outreach, target-engine CI, a
production-chain selection, and jurisdiction-specific counsel require external
organizations or toolchains beyond the local implementation.
