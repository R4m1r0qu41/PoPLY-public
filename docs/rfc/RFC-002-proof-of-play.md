# RFC-002: Proof-of-Play and achievement attestations

- Status: Implemented for MVP
- Version: 0.1.0

## Objective

Record durable, publisher-authoritative progression without publishing gameplay
state or making gameplay wait for a chain transaction.

## Messages

`Checkpoint` and `Achievement` use the EIP-712 domain `PoPLY State Registry`,
version `1`, current chain ID, and deployed State Registry address. Exact fields
and integer widths are defined in `StateRegistry.sol`, `sdk/src/typed-data.ts`,
and the JSON schemas. A breaking field or type change requires a new registry
version.

Checkpoint state is canonicalized and hashed off-chain. A checkpoint sequence
starts at one and increments exactly once. Cumulative play time, PoPL, and
occurrence time cannot decrease. An achievement ID may be accepted once per
character.

## Verification

Any relayer may submit a message. Authority comes only from a canonical
secp256k1 signature recovered to an active verifier. High-`s`, invalid-`v`,
expired, future-dated, zero-commitment, wrong-game, and unknown-character
messages fail.

Revocation prevents new acceptance immediately. A verifier compromise does not
grant character transfer authority, but it can create false publisher facts;
publishers must rotate and revoke keys through an incident procedure.

## Privacy

Do not place player identifiers, raw evidence, chat, IP address, location, or
behavior profiles in state snapshots. A hash can remain personal data when its
input is guessable or linkable. Sensitive commitments need appropriate entropy
and an off-chain retention policy.
