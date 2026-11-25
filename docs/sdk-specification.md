# PoPLY Publisher SDK specification v0.1

## Purpose

The SDK converts publisher-authoritative game facts into deterministic,
versioned protocol messages. It does not place gameplay in a smart contract and
does not give a game client access to publisher signing keys.

## Trust placement

The engine integration emits game events to publisher infrastructure. A trusted
publisher verifier validates anti-cheat and progression results, canonicalizes
state, calculates PoPL under an identified policy, and signs EIP-712 messages.
Relayers may submit the result without gaining authority to alter it.

Signing keys must remain in server-side key management. Unity, Unreal, Godot,
browser, and mobile clients must never embed a verifier private key or publisher
API key.

## Modules

| Module | MVP implementation | Responsibility |
| --- | --- | --- |
| Canonical state | `sdk/src/canonical-state.ts` | Stable JSON encoding and Keccak commitment |
| State signing | `sdk/src/typed-data.ts` | EIP-712 types, digest, sign, and verify |
| PoPL policy | `sdk/src/popl-policy.ts` | Versioned activity thresholds and policy ID |
| Publisher verifier | `sdk/src/publisher-verifier.ts` | Monotonic validation and signed envelopes |
| Identity | `sdk/src/identity.ts` | Public account mapping and one-way migration contract; no key storage |
| Character registry | `sdk/src/character-registry.ts` | Typed reads and authorized mint transaction construction |
| Licensing | `sdk/src/licensing-client.ts` | Lock reads and license offer/accept transaction construction |
| Marketplace | `sdk/src/marketplace-client.ts` | Listing, cancellation, and purchase transaction construction |
| Analytics | `sdk/src/analytics.ts` | Data-minimized protocol telemetry sink |
| Publisher API | `backend/src/server.ts` | Authenticated HTTP boundary for game services |
| Engine adapters | `sdk/engines/` | Source-level Unity, Unreal, and Godot server transports; engine CI pending |

## Numeric and binary encoding

- JSON representations of unsigned integers use base-10 strings unless the
  schema explicitly defines a bounded JSON integer.
- Addresses use 20-byte `0x`-prefixed hexadecimal strings.
- Hashes use 32-byte `0x`-prefixed hexadecimal strings.
- Solidity signatures use 65-byte `r || s || v` hexadecimal strings.
- Timestamps are Unix seconds in UTC.
- Canonical state accepts null, booleans, strings, safe integers, big integers,
  arrays, and objects. Object keys sort lexicographically. Big integers encode as
  decimal strings. Cycles and unsafe numbers are rejected.

## Checkpoint issuance

1. Authenticate the publisher service request.
2. Confirm the character and game identity.
3. Validate anti-cheat and progression in publisher infrastructure.
4. Load the last accepted or pending character sequence.
5. Require exactly `previousSequence + 1`.
6. Require non-decreasing play time and PoPL.
7. Canonicalize and hash the progression snapshot.
8. Calculate PoPL and bind the policy ID.
9. Add occurrence and expiry times.
10. Sign the EIP-712 checkpoint and return it to a relayer.

The reference API persists issued sequence state in an atomically replaced local
JSON file and serializes concurrent issuance per character. This makes local
restart behavior deterministic. A production service must replace the file with
durable, transactionally consistent storage, distinguish issued/pending/accepted
states, and reconcile chain reorganizations and abandoned submissions.

## Achievement issuance

Achievement identifiers are stable uppercase names hashed with Keccak-256.
Evidence is canonicalized and committed by hash. The publisher retains or
content-addresses detailed evidence according to its privacy and retention
policy. The contract rejects duplicate achievement IDs per character.

## Compatibility

The EIP-712 domain version, JSON schema version, PoPL policy ID, and API version
are independent compatibility axes. Consumers must not infer one from another.
Breaking typed-data changes require a new State Registry version or contract.
